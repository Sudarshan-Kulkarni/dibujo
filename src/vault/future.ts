import { readdirSync } from "node:fs";
import { fingerprint, formatBullet } from "../bujo/bullet.js";
import { addBlockId, applyLineEdits, setCheckbox } from "../bujo/edit.js";
import {
  appendFutureEntries,
  dueEntries,
  type FutureBullet,
  type LocatedEntry,
  monthOf,
  newFutureTemplate,
  type ParsedFutureNote,
  parseFutureNote,
} from "../bujo/future.js";
import { daysBetween, journalDate, parseDateArg } from "../bujo/journal-date.js";
import {
  appendLogLines,
  newNoteTemplate,
  parseDailyNote,
  splitLines,
  type UnrecognizedLine,
} from "../bujo/note.js";
import { formatFutureRef, parseFutureRef } from "../bujo/ref.js";
import type { Bullet, Origin, Signifier, TaskState } from "../bujo/types.js";
import type { VaultConfig } from "../config.js";
import { DibujoError } from "../errors.js";
import { freshBlockId, randomBlockId, usedBlockIds } from "./block-id.js";
import { assertSupported, readIfExists } from "./daily.js";
import { assertLinkSafeFolder, dailyNotePath, futureNotePath, resolveInVault } from "./paths.js";
import {
  type CommitOptions,
  commitWrites,
  type PlannedWrite,
  type WriteStatus,
  writeStatus,
} from "./write-plan.js";

/** A future log note read from disk. */
export interface LoadedFutureNote {
  year: string;
  path: string;
  /** The note's full content, as read. Writes compare against it. */
  content: string;
  parsed: ParsedFutureNote;
}

export interface LoadOptions {
  /** Skip notes for years after this one. */
  throughYear?: string;
}

const FUTURE_FILE = /^(\d{4})\.md$/;

/**
 * Reads every `Future/YYYY.md` note, oldest year first, and checks each one's format
 * version. A missing folder gives an empty list. A note with an unsupported version
 * throws, naming the note, instead of being skipped: a skipped note would hide
 * entries that are meant to keep coming back.
 */
export function loadFutureNotes(
  config: VaultConfig,
  options: LoadOptions = {},
): LoadedFutureNote[] {
  const folder = resolveInVault(config, "Future");
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const notes: LoadedFutureNote[] = [];
  const years = names
    .flatMap((name) => FUTURE_FILE.exec(name)?.[1] ?? [])
    .filter((year) => options.throughYear === undefined || year <= options.throughYear)
    .sort();
  for (const year of years) {
    const note = loadFutureNote(config, year);
    if (note) notes.push(note);
  }
  return notes;
}

/** Reads one year's note and checks its format version. `null` when it doesn't exist. */
export function loadFutureNote(config: VaultConfig, year: string): LoadedFutureNote | null {
  const path = futureNotePath(config, year);
  const content = readIfExists(path);
  if (content === null) return null;
  const parsed = parseFutureNote(content);
  assertSupported(parsed, path);
  return { year, path, content, parsed };
}

/** Every entry in the loaded notes, with the year of its note, in note order. */
export function locateEntries(notes: readonly LoadedFutureNote[]): LocatedEntry[] {
  return notes.flatMap((note) => note.parsed.entries.map((e) => ({ ...e, year: note.year })));
}

export function entryRef(entry: LocatedEntry): string {
  return formatFutureRef(entry.year, entry.line, fingerprint(entry));
}

export interface FutureEntryView {
  ref: string;
  line: number;
  type: Bullet["type"];
  state?: TaskState;
  text: string;
  signifiers: Signifier[];
  depth: number;
  scheduled?: string;
  origin?: Origin;
}

export interface FutureNoteView {
  exists: boolean;
  path: string;
  year: string;
  /** The months that have entries, in calendar order. */
  months: { month: string; entries: FutureEntryView[] }[];
  unrecognized: UnrecognizedLine[];
}

/** Reads one year's note for `future show`. */
export function readFutureNote(config: VaultConfig, year: string): FutureNoteView {
  const path = futureNotePath(config, year);
  const content = readIfExists(path);
  if (content === null) return { exists: false, path, year, months: [], unrecognized: [] };
  const parsed = parseFutureNote(content);
  assertSupported(parsed, path);

  const byMonth = new Map<string, FutureEntryView[]>();
  for (const entry of parsed.entries) {
    const list = byMonth.get(entry.month) ?? [];
    list.push(viewOf(entry, year));
    byMonth.set(entry.month, list);
  }
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entries]) => ({ month, entries }));
  return { exists: true, path, year, months, unrecognized: parsed.unrecognized };
}

function viewOf(entry: FutureBullet, year: string): FutureEntryView {
  const view: FutureEntryView = {
    ref: formatFutureRef(year, entry.line, fingerprint(entry)),
    line: entry.line,
    type: entry.type,
    text: entry.text,
    signifiers: entry.signifiers,
    depth: entry.depth,
  };
  if (entry.state) view.state = entry.state;
  if (entry.scheduled) view.scheduled = entry.scheduled;
  if (entry.origin) view.origin = entry.origin;
  return view;
}

export interface DueEntry {
  ref: string;
  text: string;
  signifiers: Signifier[];
  scheduled: string;
  /** Calendar days from the entry's date to today. 0 on the day itself. */
  daysOverdue: number;
  /** The date of the daily note the entry started from, or `null` when the chain can't be followed. */
  scheduledFrom: string | null;
  path: string;
}

export interface DueResult {
  today: string;
  entries: DueEntry[];
}

/**
 * Lists the due entries in the notes for today's year and every earlier year. A
 * waiting entry stays waiting until it is handled, so it is listed again each day.
 */
export function dueEntriesFor(config: VaultConfig, today: string): DueResult {
  const notes = loadFutureNotes(config, { throughYear: today.slice(0, 4) });
  const located = locateEntries(notes);
  const pathOf = new Map(notes.map((n) => [n.year, n.path]));

  const entries = dueEntries(located, today).map((e): DueEntry => {
    const scheduled = e.scheduled ?? today;
    return {
      ref: entryRef(e),
      text: e.text,
      signifiers: e.signifiers,
      scheduled,
      daysOverdue: Math.max(0, daysBetween(scheduled, today)),
      scheduledFrom: scheduledFrom(located, e),
      path: pathOf.get(e.year) ?? futureNotePath(config, e.year),
    };
  });
  return { today, entries };
}

/**
 * Follows future origins across the notes until a daily origin gives the date of the
 * daily note the task started in. Returns `null` when the chain breaks or loops.
 */
function scheduledFrom(entries: readonly LocatedEntry[], start: LocatedEntry): string | null {
  const visited = new Set<string>();
  let current: LocatedEntry = start;
  for (;;) {
    const origin = current.origin;
    if (!origin) return null;
    if ("date" in origin) return origin.date;
    const key = `${origin.year}:${origin.blockId}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const next = entries.find((e) => e.year === origin.year && e.blockId === origin.blockId);
    if (!next) return null;
    current = next;
  }
}

/** An entry found on disk from a ref. */
export interface ResolvedEntry {
  note: LoadedFutureNote;
  entry: LocatedEntry;
  /** The entry's line exactly as it is in the file. */
  rawLine: string;
  /** The entry's current ref. The line number differs from the input if the line moved. */
  ref: string;
}

/**
 * Finds the entry a ref points to in the given notes. Uses the ref's line when its
 * fingerprint still matches; otherwise looks for the one entry in that year's note
 * with that fingerprint, so lines added or removed above it don't break the ref.
 */
export function resolveEntry(notes: readonly LoadedFutureNote[], refValue: string): ResolvedEntry {
  const ref = parseFutureRef(refValue);
  const note = notes.find((n) => n.year === ref.year);
  if (!note) throw notFound(refValue, `There is no future log note for ${ref.year}.`);

  const entries = note.parsed.entries;
  const matches = (e: FutureBullet) => fingerprint(e) === ref.fingerprint;
  let found = entries.find((e) => e.line === ref.line && matches(e));
  if (!found) {
    const candidates = entries.filter(matches);
    if (candidates.length !== 1) {
      throw notFound(
        refValue,
        candidates.length === 0
          ? `No entry in ${note.path} matches the ref ${refValue}.`
          : `More than one entry in ${note.path} matches the ref ${refValue}.`,
      );
    }
    found = candidates[0];
  }
  if (!found) throw notFound(refValue, `No entry matches the ref ${refValue}.`);
  if (found.type !== "task") {
    throw new DibujoError(
      "NOT_A_TASK",
      `The ref ${refValue} points to ${found.type === "event" ? "an event" : "a note"}, not a task.`,
      "Only tasks can be brought in, rescheduled, or cancelled. Use a task's ref.",
    );
  }
  return {
    note,
    entry: { ...found, year: note.year },
    rawLine: splitLines(note.content).lines[found.line - 1] ?? "",
    ref: formatFutureRef(note.year, found.line, ref.fingerprint),
  };
}

/** Like `resolveEntry`, reading only the note for the ref's year. */
export function resolveEntryRef(config: VaultConfig, refValue: string): ResolvedEntry {
  const { year } = parseFutureRef(refValue);
  const note = loadFutureNote(config, year);
  return resolveEntry(note ? [note] : [], refValue);
}

export interface EntryOptions {
  dryRun?: boolean;
  /** Test hooks for the writes, in the order the notes are written. */
  hooks?: CommitOptions;
}

export interface MigrateEntryOptions extends EntryOptions {
  /** Target daily note. Defaults to today's journal date, and can't be earlier. */
  to?: string;
  priority?: boolean;
  now: Date;
  /** Block id generator. Random by default. */
  newId?: () => string;
}

export interface MigrateEntryResult {
  status: "migrated" | "unchanged";
  source: { path: string; year: string; status: "updated" | "unchanged" };
  target: { path: string; date: string; status: WriteStatus };
  dryRun: boolean;
  sourceContent?: string;
  targetContent?: string;
}

/**
 * Brings a waiting entry into a daily note. The future log is written first (the
 * entry becomes `[>]` and gets a block id) and the daily note second, so running
 * the same command again after an interruption finishes the job without a second copy.
 */
export function migrateEntry(
  config: VaultConfig,
  refValue: string,
  options: MigrateEntryOptions,
): MigrateEntryResult {
  assertLinkSafeFolder(config);
  const { note, entry, rawLine } = resolveEntryRef(config, refValue);
  const resuming = entry.state === "migrated" && entry.blockId !== undefined;
  if (entry.state !== "open" && !resuming) {
    throw new DibujoError(
      "TASK_NOT_OPEN",
      `The entry is ${entry.state ?? "open"}, so it can't be brought in.`,
      "Only waiting entries can be brought in.",
    );
  }

  const today = journalDate(options.now, config.dayStartHour);
  const to = options.to === undefined ? today : parseDateArg(options.to);
  if (to < today) {
    throw new DibujoError(
      "INVALID_DATE",
      `An entry can only be brought into today (${today}) or a later day, not ${to}.`,
      "Pass a --to date that is today or later.",
    );
  }

  // Read and check the daily note before writing anything.
  const targetPath = dailyNotePath(config, to);
  const targetOriginal = readIfExists(targetPath);
  const targetBase = targetOriginal ?? newNoteTemplate(to);
  const targetParsed = parseDailyNote(targetBase);
  assertSupported(targetParsed, targetPath);

  const id =
    entry.blockId ?? freshBlockId(usedBlockIds(note.content), options.newId ?? randomBlockId);
  const sourceLine = addBlockId(
    entry.state === "open" ? setCheckbox(rawLine, "migrated") : rawLine,
    id,
  );
  const sourceContent =
    sourceLine === rawLine
      ? note.content
      : applyLineEdits(note.content, [{ line: entry.line, before: rawLine, after: sourceLine }]);

  const alreadyCopied = targetParsed.bullets.some(
    (b) => b.origin !== undefined && "year" in b.origin && matchesEntry(b.origin, note.year, id),
  );
  const signifiers = [...entry.signifiers];
  if (options.priority === true && !signifiers.includes("priority")) signifiers.push("priority");
  const copy = formatBullet(
    {
      type: "task",
      state: "open",
      signifiers,
      text: entry.text,
      depth: 0,
      origin: { year: note.year, blockId: id },
    },
    { folder: config.folder },
  );
  const targetContent = alreadyCopied ? targetBase : appendLogLines(targetBase, [copy]);

  const writes: PlannedWrite[] = [
    { path: note.path, original: note.content, content: sourceContent },
    { path: targetPath, original: targetOriginal, content: targetContent },
  ];
  const dryRun = options.dryRun === true;
  const [sourceStatus, targetStatus] = dryRun
    ? writes.map(writeStatus)
    : commitWrites(writes, options.hooks);
  const source = sourceStatus === "unchanged" ? "unchanged" : "updated";
  const result: MigrateEntryResult = {
    status: source === "unchanged" && targetStatus === "unchanged" ? "unchanged" : "migrated",
    source: { path: note.path, year: note.year, status: source },
    target: { path: targetPath, date: to, status: targetStatus ?? "unchanged" },
    dryRun,
  };
  return dryRun ? { ...result, sourceContent, targetContent } : result;
}

export interface RescheduleEntryOptions extends EntryOptions {
  now: Date;
  /** Block id generator. Random by default. */
  newId?: () => string;
}

/** What `planReschedule` decided: the writes to make, and where the entry is moving. */
export interface ReschedulePlan {
  status: "rescheduled" | "unchanged";
  /** In write order. Both changes are one write when the dates are in the same year. */
  writes: PlannedWrite[];
  from: { path: string; year: string };
  /** Where the new entry is or will be. For an existing copy, the copy's own date. */
  to: { path: string; year: string; date: string };
}

/**
 * Plans moving an entry to a later date: the old entry becomes `[<]` with a block id,
 * and a new waiting entry linking to it goes in the month of the new date.
 *
 * The entry must be waiting, or `[<]` with a block id and no copy (an interrupted run).
 * A `[<]` entry that already has a copy is left alone and reported as unchanged. The
 * caller checks the date. `entry` and `notes` must come from the same `loadFutureNotes`
 * call, and all of the notes are needed to find an existing copy.
 */
export function planReschedule(
  config: VaultConfig,
  notes: readonly LoadedFutureNote[],
  entry: LocatedEntry,
  date: string,
  newId: () => string = randomBlockId,
): ReschedulePlan {
  const note = notes.find((n) => n.year === entry.year);
  if (!note) throw new Error(`planReschedule: no loaded note for ${entry.year}`);
  const resuming = entry.state === "scheduled" && entry.blockId !== undefined;
  if (entry.state !== "open" && !resuming) {
    throw new DibujoError(
      "TASK_NOT_OPEN",
      `The entry is ${entry.state ?? "open"}, so it can't be rescheduled.`,
      "Only waiting entries can be rescheduled.",
    );
  }
  const from = { path: note.path, year: note.year };

  if (resuming) {
    const copy = locateEntries(notes).find(
      (e) =>
        e.origin !== undefined &&
        "year" in e.origin &&
        matchesEntry(e.origin, note.year, entry.blockId),
    );
    if (copy) {
      return {
        status: "unchanged",
        writes: [{ path: note.path, original: note.content, content: note.content }],
        from,
        to: {
          path: pathFor(config, notes, copy.year),
          year: copy.year,
          date: copy.scheduled ?? date,
        },
      };
    }
  }

  const id = entry.blockId ?? freshBlockId(usedBlockIds(note.content), newId);
  const rawLine = splitLines(note.content).lines[entry.line - 1] ?? "";
  const oldLine = addBlockId(
    entry.state === "open" ? setCheckbox(rawLine, "scheduled") : rawLine,
    id,
  );
  const oldContent =
    oldLine === rawLine
      ? note.content
      : applyLineEdits(note.content, [{ line: entry.line, before: rawLine, after: oldLine }]);

  const newYear = date.slice(0, 4);
  const line = formatBullet(
    {
      type: "task",
      state: "open",
      signifiers: [...entry.signifiers],
      text: entry.text,
      depth: 0,
      origin: { year: note.year, blockId: id },
      scheduled: date,
    },
    { folder: config.folder },
  );
  const to = { path: pathFor(config, notes, newYear), year: newYear, date };

  if (newYear === note.year) {
    const edited = notes.map((n) => (n === note ? { ...n, content: oldContent } : n));
    const append = planAppend(config, edited, newYear, monthOf(date), [line]);
    return {
      status: "rescheduled",
      writes: [{ ...append, original: note.content }],
      from,
      to,
    };
  }
  return {
    status: "rescheduled",
    writes: [
      { path: note.path, original: note.content, content: oldContent },
      planAppend(config, notes, newYear, monthOf(date), [line]),
    ],
    from,
    to,
  };
}

/**
 * The write that adds lines to a month of a year's note: to the loaded note, or to a
 * new note from the template when that year has none yet.
 */
export function planAppend(
  config: VaultConfig,
  notes: readonly LoadedFutureNote[],
  year: string,
  month: string,
  lines: readonly string[],
): PlannedWrite {
  const existing = notes.find((n) => n.year === year);
  const base = existing?.content ?? newFutureTemplate(year);
  return {
    path: existing?.path ?? futureNotePath(config, year),
    original: existing?.content ?? null,
    content: appendFutureEntries(base, month, lines),
  };
}

export interface RescheduleEntryResult {
  status: "rescheduled" | "unchanged";
  from: { path: string; year: string; status: "updated" | "unchanged" };
  to: { path: string; year: string; date: string; status: WriteStatus };
  dryRun: boolean;
  fromContent?: string;
  toContent?: string;
}

/**
 * Moves a waiting entry to a later date. In the same year it is one write. Across
 * years the old note is written first, so running the same command again after an
 * interruption adds the new entry exactly once.
 */
export function rescheduleEntry(
  config: VaultConfig,
  refValue: string,
  dateValue: string,
  options: RescheduleEntryOptions,
): RescheduleEntryResult {
  assertLinkSafeFolder(config);
  const date = parseDateArg(dateValue);
  const today = journalDate(options.now, config.dayStartHour);
  if (date <= today) {
    throw new DibujoError(
      "INVALID_DATE",
      `An entry can only be rescheduled to a day after today (${today}), not ${date}.`,
      "Pick a later date.",
    );
  }

  const notes = loadFutureNotes(config);
  const { entry } = resolveEntry(notes, refValue);
  const plan = planReschedule(config, notes, entry, date, options.newId);

  const dryRun = options.dryRun === true;
  const statuses = dryRun ? plan.writes.map(writeStatus) : commitWrites(plan.writes, options.hooks);
  const first = plan.writes[0];
  const last = plan.writes[plan.writes.length - 1];
  const fromStatus = statuses[0] === "unchanged" ? "unchanged" : "updated";
  const result: RescheduleEntryResult = {
    status:
      plan.status === "unchanged" || statuses.every((s) => s === "unchanged")
        ? "unchanged"
        : "rescheduled",
    from: { ...plan.from, status: fromStatus },
    to: { ...plan.to, status: statuses[statuses.length - 1] ?? "unchanged" },
    dryRun,
  };
  return dryRun && first && last
    ? { ...result, fromContent: first.content, toContent: last.content }
    : result;
}

export interface CancelEntryResult {
  status: "updated" | "unchanged";
  ref: string;
  path: string;
  year: string;
  state: "cancelled";
  dryRun: boolean;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
}

/** Marks a waiting entry cancelled (`[-]`). A cancelled entry is left as it is. */
export function cancelEntry(
  config: VaultConfig,
  refValue: string,
  options: EntryOptions = {},
): CancelEntryResult {
  const { note, entry, rawLine, ref } = resolveEntryRef(config, refValue);
  if (entry.state !== "open" && entry.state !== "cancelled") {
    throw new DibujoError(
      "TASK_NOT_OPEN",
      `The entry is ${entry.state ?? "open"}, so it can't be cancelled.`,
      "Only waiting entries can be cancelled.",
    );
  }
  const after = entry.state === "cancelled" ? rawLine : setCheckbox(rawLine, "cancelled");
  const content =
    after === rawLine
      ? note.content
      : applyLineEdits(note.content, [{ line: entry.line, before: rawLine, after }]);

  const dryRun = options.dryRun === true;
  const write: PlannedWrite = { path: note.path, original: note.content, content };
  const status = dryRun
    ? writeStatus(write)
    : (commitWrites([write], options.hooks)[0] ?? "unchanged");
  const result: CancelEntryResult = {
    status: status === "unchanged" ? "unchanged" : "updated",
    ref,
    path: note.path,
    year: note.year,
    state: "cancelled",
    dryRun,
  };
  return dryRun ? { ...result, content } : result;
}

function matchesEntry(origin: Origin, year: string, blockId: string | undefined): boolean {
  return "year" in origin && origin.year === year && origin.blockId === blockId;
}

function pathFor(config: VaultConfig, notes: readonly LoadedFutureNote[], year: string): string {
  return notes.find((n) => n.year === year)?.path ?? futureNotePath(config, year);
}

function notFound(ref: string, message: string): DibujoError {
  return new DibujoError(
    "TASK_NOT_FOUND",
    message,
    `The note may have changed. Run \`dibujo future show\` or \`dibujo future due\` again to get a fresh ref (was ${ref}).`,
  );
}
