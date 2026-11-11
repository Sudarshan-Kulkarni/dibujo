import type { FutureBullet } from "../bujo/future.js";
import { monthOf, parseMonthArg, previousMonth } from "../bujo/journal-date.js";
import {
  countTasks,
  type MonthNote,
  type MovingTask,
  movingTasks,
  type TaskCounts,
} from "../bujo/month.js";
import {
  appendSummary,
  containsBlock,
  hasSummary,
  newMonthlyTemplate,
  renderSummary,
  type SummaryInput,
} from "../bujo/monthly-note.js";
import {
  FORMAT_VERSION,
  findFrontmatterEnd,
  type ParsedNote,
  parseDailyNote,
  readVersion,
  splitLines,
} from "../bujo/note.js";
import type { VaultConfig } from "../config.js";
import { DibujoError, isDibujoError } from "../errors.js";
import { replaceIfUnchanged, type WriteHooks, writeNew } from "./atomic-write.js";
import { assertSupported, type NoteBullet, readIfExists, withRefs } from "./daily.js";
import { loadFutureNote } from "./future.js";
import { dailyNoteDatesIn, dailyNotePath, monthlyNotePath } from "./paths.js";
import { loadQuietly, openTasksIn, type ReviewTask } from "./tasks.js";

export interface MonthView {
  month: string;
  today: string;
  flagAfterDays: number;
  /** The daily notes of the month that could be read, oldest first. */
  notes: { date: string; path: string; bullets: NoteBullet[] }[];
  /** Paths of daily notes left out because their format version is unsupported. */
  skipped: string[];
  /** The tasks still open, oldest note first, then in note order. */
  leftovers: (ReviewTask & { date: string; path: string })[];
  counts: TaskCounts;
  moving: MovingTask[];
  summary: { path: string; exists: boolean; hasSummary: boolean };
}

/** What `readMonth` and `writeSummary` both work from. */
interface LoadedMonth {
  notes: { date: string; path: string; parsed: ParsedNote }[];
  skipped: string[];
  counts: TaskCounts;
  moving: MovingTask[];
}

/** Refuses the month of today and any later month, because the month isn't over. */
function assertMonthIsOver(month: string, today: string): void {
  if (month < monthOf(today)) return;
  throw new DibujoError(
    "INVALID_DATE",
    `The month ${month} isn't over yet (today is ${today}).`,
    "Pick a month before the current one, or wait until the month ends.",
  );
}

function loadMonth(config: VaultConfig, month: string): LoadedMonth {
  const notes: LoadedMonth["notes"] = [];
  const skipped: string[] = [];
  for (const date of dailyNoteDatesIn(config, month)) {
    const path = dailyNotePath(config, date);
    const content = readIfExists(path);
    if (content === null) continue;
    const parsed = parseDailyNote(content);
    try {
      assertSupported(parsed, path);
    } catch (error) {
      if (!isDibujoError(error)) throw error;
      skipped.push(path);
      continue;
    }
    notes.push({ date, path, parsed });
  }

  const monthNotes: MonthNote[] = notes.map((n) => ({ date: n.date, bullets: n.parsed.bullets }));
  // A future log this dibujo can't read just ends the chains that pass through it.
  let future: readonly FutureBullet[] = [];
  try {
    future = loadFutureNote(config)?.parsed.entries ?? [];
  } catch (error) {
    if (!isDibujoError(error) || error.code !== "NOTE_VERSION_UNSUPPORTED") throw error;
  }
  return {
    notes,
    skipped,
    counts: countTasks(monthNotes),
    moving: movingTasks(monthNotes, future, config.migrationFlagDays),
  };
}

/** Reads the monthly note, checking the version of an existing one. */
function readMonthly(config: VaultConfig, month: string): { path: string; content: string | null } {
  const path = monthlyNotePath(config, month);
  const content = readIfExists(path);
  if (content !== null) assertSupported({ version: versionOf(content) }, path);
  return { path, content };
}

function versionOf(content: string): number | null {
  const lines = splitLines(content).lines;
  return readVersion(lines, findFrontmatterEnd(lines));
}

/** Reads everything about a past month. Writes nothing. */
export function readMonth(config: VaultConfig, month: string, today: string): MonthView {
  parseMonthArg(month);
  assertMonthIsOver(month, today);
  const loaded = loadMonth(config, month);

  const byDate = new Map<string, ParsedNote>(loaded.notes.map((n) => [n.date, n.parsed]));
  const cache = new Map<string, ParsedNote | null>(byDate);
  const loadNote = (date: string): ParsedNote | null => {
    if (!cache.has(date)) cache.set(date, loadQuietly(config, date));
    return cache.get(date) ?? null;
  };

  const leftovers: MonthView["leftovers"] = [];
  for (const note of loaded.notes) {
    for (const task of openTasksIn(note.parsed, note.date, loadNote, config.migrationFlagDays)) {
      leftovers.push({ ...task, date: note.date, path: note.path });
    }
  }

  const monthlyPath = monthlyNotePath(config, month);
  const monthly = readIfExists(monthlyPath);
  // A monthly note this dibujo can't read counts as having a summary, so nothing writes to it.
  const summaryWritten = monthly !== null && (!isReadable(monthly) || hasSummary(monthly));

  return {
    month,
    today,
    flagAfterDays: config.migrationFlagDays,
    notes: loaded.notes.map((n) => ({
      date: n.date,
      path: n.path,
      bullets: withRefs(n.parsed.bullets, n.date),
    })),
    skipped: loaded.skipped,
    leftovers,
    counts: loaded.counts,
    moving: loaded.moving,
    summary: { path: monthlyPath, exists: monthly !== null, hasSummary: summaryWritten },
  };
}

function isReadable(content: string): boolean {
  const version = versionOf(content);
  return version !== null && version <= FORMAT_VERSION;
}

export interface SummaryResult {
  status: "created" | "updated" | "unchanged";
  month: string;
  path: string;
  /** The number of tasks completed in the month. */
  done: number;
  moving: MovingTask[];
  dryRun: boolean;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
}

export interface SummaryOptions {
  dryRun?: boolean;
  hooks?: WriteHooks;
}

/**
 * Writes the summary of a past month into its monthly note. Tasks done and the moving
 * tasks are counted from the notes on disk, never taken as input. A note that already
 * has a summary is never changed: the same input again is `unchanged`, anything else
 * fails with `SUMMARY_EXISTS`.
 */
export function writeSummary(
  config: VaultConfig,
  month: string,
  today: string,
  input: SummaryInput,
  options: SummaryOptions = {},
): SummaryResult {
  parseMonthArg(month);
  assertMonthIsOver(month, today);
  const { path, content: original } = readMonthly(config, month);

  const { counts, moving } = loadMonth(config, month);
  const lines = renderSummary(month, input, counts.completed, moving, config.migrationFlagDays);
  const dryRun = options.dryRun === true;
  const base = { month, path, done: counts.completed, moving, dryRun };

  if (original !== null && hasSummary(original)) {
    if (!containsBlock(original, lines)) {
      throw new DibujoError(
        "SUMMARY_EXISTS",
        `The note ${path} already has a summary, so dibujo did not change it.`,
        `Edit Monthly/${month}.md in Obsidian. Nothing was written.`,
      );
    }
    return { status: "unchanged", ...base, ...(dryRun ? { content: original } : {}) };
  }

  const content = appendSummary(original ?? newMonthlyTemplate(month), lines);
  const status = original === null ? "created" : "updated";
  if (dryRun) return { status, ...base, content };
  if (original === null) writeNew(path, content, options.hooks);
  else replaceIfUnchanged(path, original, content, options.hooks);
  return { status, ...base };
}

/**
 * The past month, when it has at least one daily note and no monthly summary yet.
 * It lists one folder and reads at most one note. It never throws: a monthly note it
 * can't read counts as not pending, so `task review` keeps working.
 */
export function pendingMonth(
  config: VaultConfig,
  today: string,
): { month: string; path: string } | null {
  try {
    const month = previousMonth(monthOf(today));
    if (dailyNoteDatesIn(config, month).length === 0) return null;
    const path = monthlyNotePath(config, month);
    const content = readIfExists(path);
    if (content !== null && (!isReadable(content) || hasSummary(content))) return null;
    return { month, path };
  } catch {
    return null;
  }
}
