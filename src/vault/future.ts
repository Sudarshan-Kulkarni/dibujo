import { basename } from "node:path";
import { fingerprint, formatBullet } from "../bujo/bullet.js";
import { addBlockId, applyLineEdits, setCheckbox, setScheduled } from "../bujo/edit.js";
import {
  appendFutureEntries,
  dueEntries,
  eventsOn,
  type FutureBullet,
  newFutureTemplate,
  otherWaiting,
  type ParsedFutureNote,
  parseFutureNote,
} from "../bujo/future.js";
import { type OldNote, planImport } from "../bujo/future-import.js";
import { type FutureEntryInput, planAdd } from "../bujo/future-input.js";
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
import { DibujoError, isDibujoError } from "../errors.js";
import { freshBlockId, randomBlockId, usedBlockIds } from "./block-id.js";
import { assertSupported, readIfExists } from "./daily.js";
import {
  assertLinkSafeFolder,
  dailyNotePath,
  futureNotePath,
  legacyFutureNotePaths,
} from "./paths.js";
import {
  type CommitOptions,
  commitWrites,
  type PlannedWrite,
  type WriteStatus,
  writeStatus,
} from "./write-plan.js";

/** The future log note read from disk. */
export interface LoadedFutureNote {
  path: string;
  /** The note's full content, as read. Writes compare against it. */
  content: string;
  parsed: ParsedFutureNote;
}

/**
 * Reads `Future.md` and checks its format version. `null` when the note doesn't
 * exist, which commands that only read treat as an empty future log.
 */
export function loadFutureNote(config: VaultConfig): LoadedFutureNote | null {
  const path = futureNotePath(config);
  const content = readIfExists(path);
  if (content === null) return null;
  const parsed = parseFutureNote(content);
  assertSupported(parsed, path);
  return { path, content, parsed };
}

function refOf(entry: FutureBullet): string {
  return formatFutureRef(entry.line, fingerprint(entry));
}

/** The date on an entry: `⏳` on a task, `📅` on an event. */
function dateOf(entry: Bullet): string | undefined {
  return entry.type === "task" ? entry.scheduled : entry.eventDate;
}

export interface FutureEntryView {
  ref: string;
  line: number;
  type: Bullet["type"];
  state?: TaskState;
  text: string;
  signifiers: Signifier[];
  depth: number;
  date?: string;
  origin?: Origin;
}

export interface FutureShowView {
  exists: boolean;
  path: string;
  /** Every entry, in the order they are in the note. */
  entries: FutureEntryView[];
  unrecognized: UnrecognizedLine[];
  /** Old year notes that `dibujo future import` would still copy something from. */
  legacyNotes: string[];
}

function viewOf(entry: FutureBullet): FutureEntryView {
  const view: FutureEntryView = {
    ref: refOf(entry),
    line: entry.line,
    type: entry.type,
    text: entry.text,
    signifiers: entry.signifiers,
    depth: entry.depth,
  };
  if (entry.state) view.state = entry.state;
  const date = dateOf(entry);
  if (date) view.date = date;
  if (entry.origin) view.origin = entry.origin;
  return view;
}

/** Reads the future log for `future show`. */
export function showFuture(config: VaultConfig): FutureShowView {
  const note = loadFutureNote(config);
  const legacyNotes = legacyNotesToImport(config);
  if (!note) {
    return {
      exists: false,
      path: futureNotePath(config),
      entries: [],
      unrecognized: [],
      legacyNotes,
    };
  }
  return {
    exists: true,
    path: note.path,
    entries: note.parsed.entries.map(viewOf),
    unrecognized: note.parsed.unrecognized,
    legacyNotes,
  };
}

export interface DueEntry {
  ref: string;
  text: string;
  signifiers: Signifier[];
  scheduled: string;
  /** Calendar days from the entry's date to today. 0 on the day itself. */
  daysOverdue: number;
  /** The date of the daily note the entry was scheduled from, or `null` when that isn't known. */
  scheduledFrom: string | null;
  path: string;
}

export interface TodayEvent {
  text: string;
  signifiers: Signifier[];
  date: string;
}

export interface WaitingTask {
  ref: string;
  text: string;
  signifiers: Signifier[];
  date?: string;
}

export interface DueResult {
  today: string;
  /** Waiting tasks dated today or earlier, by date and then note order. */
  entries: DueEntry[];
  /** Events dated today, for information. */
  events: TodayEvent[];
  /** The other waiting tasks (undated, or dated after today), in note order. */
  waiting: WaitingTask[];
  legacyNotes: string[];
}

/**
 * Lists what `future due` reports for `today`. A waiting entry stays waiting until
 * it is handled, so a due entry is listed again each day.
 */
export function dueFor(config: VaultConfig, today: string): DueResult {
  const note = loadFutureNote(config);
  const path = futureNotePath(config);
  const all = note?.parsed.entries ?? [];

  const entries = dueEntries(all, today).map((e): DueEntry => {
    const scheduled = e.scheduled ?? today;
    return {
      ref: refOf(e),
      text: e.text,
      signifiers: e.signifiers,
      scheduled,
      daysOverdue: Math.max(0, daysBetween(scheduled, today)),
      scheduledFrom: e.origin && "date" in e.origin ? e.origin.date : null,
      path,
    };
  });
  const events = eventsOn(all, today).map(
    (e): TodayEvent => ({ text: e.text, signifiers: e.signifiers, date: today }),
  );
  const waiting = otherWaiting(all, today).map((e): WaitingTask => {
    const task: WaitingTask = { ref: refOf(e), text: e.text, signifiers: e.signifiers };
    if (e.scheduled) task.date = e.scheduled;
    return task;
  });
  return { today, entries, events, waiting, legacyNotes: legacyNotesToImport(config) };
}

/** An entry found on disk from a ref. */
export interface ResolvedEntry {
  note: LoadedFutureNote;
  entry: FutureBullet;
  /** The entry's line exactly as it is in the file. */
  rawLine: string;
  /** The entry's current ref. The line number differs from the input if the line moved. */
  ref: string;
}

/**
 * Finds the task entry a ref points to. Uses the ref's line when its fingerprint
 * still matches; otherwise looks for the one entry with that fingerprint, so lines
 * added or removed above it don't break the ref. `note` is `null` when `Future.md`
 * doesn't exist.
 */
export function resolveEntry(note: LoadedFutureNote | null, refValue: string): ResolvedEntry {
  const ref = parseFutureRef(refValue);
  if (!note) throw notFound(refValue, "There is no future log note yet.");

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
    entry: found,
    rawLine: splitLines(note.content).lines[found.line - 1] ?? "",
    ref: formatFutureRef(found.line, ref.fingerprint),
  };
}

export interface EntryOptions {
  dryRun?: boolean;
  /** Test hooks for the writes, in the order the notes are written. */
  hooks?: CommitOptions;
}

export interface AddEntriesOptions extends EntryOptions {
  now: Date;
}

export interface AddedEntry {
  ref: string;
  type: Bullet["type"];
  text: string;
  signifiers: Signifier[];
  date?: string;
}

export interface AddEntriesResult {
  status: WriteStatus;
  path: string;
  /** The entries written, in input order. */
  added: AddedEntry[];
  /** The number of input entries left out because the note (or the input) already has them. */
  skipped: number;
  dryRun: boolean;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
}

/**
 * Appends entries to the future log, creating the note when it doesn't exist. Nothing
 * is written if any entry is invalid, or if the note has an unsupported version.
 */
export function addEntries(
  config: VaultConfig,
  input: readonly FutureEntryInput[],
  options: AddEntriesOptions,
): AddEntriesResult {
  const today = journalDate(options.now, config.dayStartHour);
  const note = loadFutureNote(config);
  const path = futureNotePath(config);
  const base = note?.content ?? newFutureTemplate();
  const existing = note?.parsed ?? parseFutureNote(base);

  const plan = planAdd(existing.entries, input, today, config.folder);
  const content = plan.lines.length > 0 ? appendFutureEntries(base, plan.lines) : base;

  // The new lines go after everything else, so they are the last entries of the result.
  const written = parseFutureNote(content).entries.slice(existing.entries.length);
  const added = written.map((e): AddedEntry => {
    const entry: AddedEntry = {
      ref: refOf(e),
      type: e.type,
      text: e.text,
      signifiers: e.signifiers,
    };
    const date = dateOf(e);
    if (date) entry.date = date;
    return entry;
  });

  const dryRun = options.dryRun === true;
  const write: PlannedWrite = { path, original: note?.content ?? null, content };
  let status: WriteStatus = plan.lines.length > 0 ? writeStatus(write) : "unchanged";
  if (!dryRun && plan.lines.length > 0) status = commitWrites([write], options.hooks)[0] ?? status;
  const result: AddEntriesResult = { status, path, added, skipped: plan.skipped, dryRun };
  return dryRun ? { ...result, content } : result;
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
  source: { path: string; status: "updated" | "unchanged" };
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
  const { note, entry, rawLine } = resolveEntry(loadFutureNote(config), refValue);
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

  // Only a link to Future.md counts. An old-form link (with a year) points at an old year note.
  const alreadyCopied = targetParsed.bullets.some(
    (b) =>
      b.origin !== undefined &&
      !("date" in b.origin) &&
      b.origin.year === undefined &&
      b.origin.blockId === id,
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
      origin: { blockId: id },
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
    source: { path: note.path, status: source },
    target: { path: targetPath, date: to, status: targetStatus ?? "unchanged" },
    dryRun,
  };
  return dryRun ? { ...result, sourceContent, targetContent } : result;
}

export interface RescheduleEntryResult {
  status: "rescheduled" | "unchanged";
  ref: string;
  path: string;
  scheduled: string;
  dryRun: boolean;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
}

/**
 * Sets or changes the `⏳` date of a waiting task entry, in place. The entry keeps its
 * state and its line, and no second entry is added. The same date is `unchanged`.
 */
export function rescheduleEntry(
  config: VaultConfig,
  refValue: string,
  dateValue: string,
  options: EntryOptions & { now: Date },
): RescheduleEntryResult {
  const date = parseDateArg(dateValue);
  const today = journalDate(options.now, config.dayStartHour);
  if (date <= today) {
    throw new DibujoError(
      "INVALID_DATE",
      `An entry can only be given a date after today (${today}), not ${date}.`,
      "Pick a later date.",
    );
  }

  const { note, entry, rawLine, ref } = resolveEntry(loadFutureNote(config), refValue);
  if (entry.state !== "open") {
    throw new DibujoError(
      "TASK_NOT_OPEN",
      `The entry is ${entry.state ?? "open"}, so its date can't be changed.`,
      "Only waiting entries can be given a date.",
    );
  }

  const after = setScheduled(rawLine, date);
  const content =
    after === rawLine
      ? note.content
      : applyLineEdits(note.content, [{ line: entry.line, before: rawLine, after }]);
  const write: PlannedWrite = { path: note.path, original: note.content, content };

  const dryRun = options.dryRun === true;
  const status = dryRun
    ? writeStatus(write)
    : (commitWrites([write], options.hooks)[0] ?? "unchanged");
  const result: RescheduleEntryResult = {
    status: status === "unchanged" ? "unchanged" : "rescheduled",
    ref,
    path: note.path,
    scheduled: date,
    dryRun,
  };
  return dryRun ? { ...result, content } : result;
}

export interface CancelEntryResult {
  status: "updated" | "unchanged";
  ref: string;
  path: string;
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
  const { note, entry, rawLine, ref } = resolveEntry(loadFutureNote(config), refValue);
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
    state: "cancelled",
    dryRun,
  };
  return dryRun ? { ...result, content } : result;
}

export interface ImportResult {
  status: WriteStatus;
  /** The future log, `Future.md`. */
  path: string;
  /** The number of entries copied into it. */
  copied: number;
  /** How many entries came from each old note. Notes that add nothing are left out. */
  sources: { path: string; count: number }[];
  /** Lines in the old notes that were not copied because they can't be read as entries. */
  unreadable: { path: string; line: number; text: string }[];
  dryRun: boolean;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
}

/**
 * Copies the entries of the old year notes (`Future/YYYY.md`) into `Future.md`. The old
 * notes are only read. Running it again adds nothing that was already copied. An old
 * note with an unsupported format version stops the import, naming the note.
 */
export function importOldNotes(config: VaultConfig, options: EntryOptions = {}): ImportResult {
  assertLinkSafeFolder(config);
  const old = readLegacyNotes(config, { strict: true });
  const note = loadFutureNote(config);
  const path = futureNotePath(config);
  const base = note?.content ?? newFutureTemplate();
  const current = note?.parsed ?? parseFutureNote(base);

  const plan = planImport(old, current, { folder: config.folder });
  const copied = plan.lines.length;
  const content = copied > 0 ? appendFutureEntries(base, plan.lines) : base;

  const dryRun = options.dryRun === true;
  const write: PlannedWrite = { path, original: note?.content ?? null, content };
  let status: WriteStatus = copied > 0 ? writeStatus(write) : "unchanged";
  if (!dryRun && copied > 0) status = commitWrites([write], options.hooks)[0] ?? status;
  const result: ImportResult = {
    status,
    path,
    copied,
    sources: plan.copied,
    unreadable: plan.unreadable,
    dryRun,
  };
  return dryRun ? { ...result, content } : result;
}

/**
 * The old year notes that `importOldNotes` would still copy something from. Old notes
 * that can't be read (an unsupported version) are ignored, so a bad old note never
 * stops `show` or `due`.
 */
export function legacyNotesToImport(config: VaultConfig): string[] {
  const old = readLegacyNotes(config, { strict: false });
  if (old.length === 0) return [];
  const note = loadFutureNote(config);
  const current = note?.parsed ?? parseFutureNote(newFutureTemplate());
  return planImport(old, current, { folder: config.folder }).copied.map((c) => c.path);
}

/** Reads the old year notes, oldest year first. */
function readLegacyNotes(config: VaultConfig, options: { strict: boolean }): OldNote[] {
  const notes: OldNote[] = [];
  for (const path of legacyFutureNotePaths(config)) {
    const content = readIfExists(path);
    if (content === null) continue;
    try {
      assertSupported(parseFutureNote(content), path);
    } catch (error) {
      if (!options.strict && isDibujoError(error)) continue;
      throw error;
    }
    notes.push({ year: basename(path, ".md"), path, content });
  }
  return notes;
}

function notFound(ref: string, message: string): DibujoError {
  return new DibujoError(
    "TASK_NOT_FOUND",
    message,
    `The note may have changed. Run \`dibujo future show\` or \`dibujo future due\` again to get a fresh ref (was ${ref}).`,
  );
}
