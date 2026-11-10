import { fingerprint, formatBullet } from "../bujo/bullet.js";
import { addBlockId, applyLineEdits, setCheckbox, setScheduled } from "../bujo/edit.js";
import { findLive, monthOf } from "../bujo/future.js";
import { addDays, journalDate, parseDateArg } from "../bujo/journal-date.js";
import { planMigration } from "../bujo/migrate.js";
import {
  appendLogLines,
  newNoteTemplate,
  type ParsedBullet,
  type ParsedNote,
  parseDailyNote,
  splitLines,
} from "../bujo/note.js";
import { formatRef, parseRef } from "../bujo/ref.js";
import type { Bullet, Signifier, TaskState } from "../bujo/types.js";
import type { VaultConfig } from "../config.js";
import { DibujoError, isDibujoError } from "../errors.js";
import { replaceIfUnchanged, type WriteHooks, writeNew } from "./atomic-write.js";
import { freshBlockId, randomBlockId, usedBlockIds } from "./block-id.js";
import { assertSupported, readIfExists } from "./daily.js";
import { loadFutureNotes, locateEntries, planAppend, planReschedule } from "./future.js";
import { assertLinkSafeFolder, dailyNotePath } from "./paths.js";
import {
  type CommitOptions,
  commitWrites,
  type PlannedWrite,
  type WriteStatus,
  writeStatus,
} from "./write-plan.js";

export { randomBlockId };

/** A task found on disk from a ref. */
export interface ResolvedTask {
  path: string;
  date: string;
  /** The note's full content, as read. Writes compare against it. */
  content: string;
  bullet: ParsedBullet;
  /** The task's line exactly as it is in the file. */
  rawLine: string;
  /** The task's current ref. The line number differs from the input if the line moved. */
  ref: string;
}

/**
 * Finds the task a ref points to. Uses the ref's line when its fingerprint still
 * matches; otherwise looks for the one bullet in the Log with that fingerprint, so
 * lines added or removed above the task don't break the ref.
 */
export function resolveRef(config: VaultConfig, refValue: string): ResolvedTask {
  const ref = parseRef(refValue);
  const path = dailyNotePath(config, ref.date);
  const content = readIfExists(path);
  if (content === null) throw notFound(refValue, `There is no note for ${ref.date}.`);
  const parsed = parseDailyNote(content);
  assertSupported(parsed, path);

  const matches = (b: ParsedBullet) => fingerprint(b) === ref.fingerprint;
  let bullet = parsed.bullets.find((b) => b.line === ref.line && matches(b));
  if (!bullet) {
    const candidates = parsed.bullets.filter(matches);
    if (candidates.length !== 1) {
      throw notFound(
        refValue,
        candidates.length === 0
          ? `No bullet in ${path} matches the task ref ${refValue}.`
          : `More than one bullet in ${path} matches the task ref ${refValue}.`,
      );
    }
    bullet = candidates[0];
  }
  if (!bullet) throw notFound(refValue, `No bullet matches the task ref ${refValue}.`);
  if (bullet.type !== "task") {
    throw new DibujoError(
      "NOT_A_TASK",
      `The ref ${refValue} points to ${bullet.type === "event" ? "an event" : "a note"}, not a task.`,
      "Only tasks have a state. Use a task's ref.",
    );
  }
  const rawLine = splitLines(content).lines[bullet.line - 1] ?? "";
  return {
    path,
    date: ref.date,
    content,
    bullet,
    rawLine,
    ref: formatRef(ref.date, bullet.line, ref.fingerprint),
  };
}

export interface EditOptions {
  dryRun?: boolean;
  hooks?: WriteHooks;
}

export interface TaskEditResult {
  status: "updated" | "unchanged";
  ref: string;
  path: string;
  date: string;
  state: TaskState;
  scheduled?: string;
  dryRun: boolean;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
}

/** Changes only the task's checkbox character. */
export function setTaskState(
  config: VaultConfig,
  ref: string,
  state: TaskState,
  options: EditOptions = {},
): TaskEditResult {
  const task = resolveRef(config, ref);
  const after = task.bullet.state === state ? task.rawLine : setCheckbox(task.rawLine, state);
  return writeEdit(task, after, state, options);
}

export interface ScheduleOptions {
  dryRun?: boolean;
  /** Test hooks for the writes, in write order: the daily note, then the future log. */
  hooks?: CommitOptions;
  /** Block id generator. Random by default. */
  newId?: () => string;
}

/** What `scheduleTask` did in the future log. */
export interface ScheduleFutureInfo {
  /** The note that now holds the waiting entry. */
  path: string;
  year: string;
  /**
   * `added`: a new waiting entry. `rescheduled`: the entry moved to the new date.
   * `unchanged`: a waiting entry for this date was already there.
   */
  action: "added" | "rescheduled" | "unchanged";
  /** The status of the note that holds the waiting entry. */
  status: WriteStatus;
}

export interface ScheduleResult extends TaskEditResult {
  future: ScheduleFutureInfo;
  /** The resulting future log note holding the waiting entry. Only set for dry runs. */
  futureContent?: string;
}

/**
 * Marks a task scheduled (`[<]`), sets its `⏳` date and a block id, and writes a
 * waiting entry for the date into the future log. Works on open or scheduled tasks.
 *
 * The daily note is written first and the future log second, so running the same
 * command again after an interruption adds the missing entry and nothing else.
 */
export function scheduleTask(
  config: VaultConfig,
  ref: string,
  date: string,
  options: ScheduleOptions = {},
): ScheduleResult {
  const on = parseDateArg(date);
  const task = resolveRef(config, ref);
  const state = task.bullet.state ?? "open";
  if (state !== "open" && state !== "scheduled") {
    throw new DibujoError(
      "TASK_NOT_OPEN",
      `The task is ${state}, so it can't be scheduled.`,
      "Only open or already scheduled tasks can be scheduled.",
    );
  }
  if (on <= task.date) {
    throw new DibujoError(
      "INVALID_DATE",
      `A task in the note for ${task.date} can only be scheduled for a later date, not ${on}.`,
      "Pick a date after the note's date.",
    );
  }
  assertLinkSafeFolder(config);

  // Read and check every future log note before writing anything.
  const notes = loadFutureNotes(config);
  const newId = options.newId ?? randomBlockId;
  const id = task.bullet.blockId ?? freshBlockId(usedBlockIds(task.content), newId);

  const after = addBlockId(setScheduled(setCheckbox(task.rawLine, "scheduled"), on), id);
  const dailyContent =
    after === task.rawLine
      ? task.content
      : applyLineEdits(task.content, [{ line: task.bullet.line, before: task.rawLine, after }]);
  const dailyWrite: PlannedWrite = {
    path: task.path,
    original: task.content,
    content: dailyContent,
  };

  const live = findLive(locateEntries(notes), { date: task.date, blockId: id });
  let futureWrites: PlannedWrite[];
  let action: ScheduleFutureInfo["action"];
  let where: { path: string; year: string };
  if (live?.kind === "waiting" && live.entry.scheduled === on) {
    const note = notes.find((n) => n.year === live.entry.year);
    futureWrites = note ? [{ path: note.path, original: note.content, content: note.content }] : [];
    action = "unchanged";
    where = { path: note?.path ?? "", year: live.entry.year };
  } else if (live) {
    const plan = planReschedule(config, notes, live.entry, on, newId);
    futureWrites = plan.writes;
    action = plan.status === "unchanged" ? "unchanged" : "rescheduled";
    where = plan.to;
  } else {
    const entry = formatBullet(
      {
        type: "task",
        state: "open",
        signifiers: [...task.bullet.signifiers],
        text: task.bullet.text,
        depth: 0,
        origin: { date: task.date, blockId: id },
        scheduled: on,
      },
      { folder: config.folder },
    );
    const write = planAppend(config, notes, on.slice(0, 4), monthOf(on), [entry]);
    futureWrites = [write];
    action = "added";
    where = { path: write.path, year: on.slice(0, 4) };
  }

  const writes = [dailyWrite, ...futureWrites];
  const dryRun = options.dryRun === true;
  const statuses = dryRun ? writes.map(writeStatus) : commitWrites(writes, options.hooks);
  const dailyStatus = statuses[0] === "unchanged" ? "unchanged" : "updated";
  const holder = futureWrites[futureWrites.length - 1];
  const result: ScheduleResult = {
    status: dailyStatus,
    ref: task.ref,
    path: task.path,
    date: task.date,
    state: "scheduled",
    scheduled: on,
    dryRun,
    future: { ...where, action, status: statuses[statuses.length - 1] ?? "unchanged" },
  };
  if (dryRun) {
    result.content = dailyContent;
    if (holder) result.futureContent = holder.content;
  }
  return result;
}

function writeEdit(
  task: ResolvedTask,
  after: string,
  state: TaskState,
  options: EditOptions,
): TaskEditResult {
  const dryRun = options.dryRun === true;
  const base = { ref: task.ref, path: task.path, date: task.date, state, dryRun };
  if (after === task.rawLine) {
    return { status: "unchanged", ...base, ...(dryRun ? { content: task.content } : {}) };
  }
  const content = applyLineEdits(task.content, [
    { line: task.bullet.line, before: task.rawLine, after },
  ]);
  if (dryRun) return { status: "updated", ...base, content };
  replaceIfUnchanged(task.path, task.content, content, options.hooks);
  return { status: "updated", ...base };
}

export interface MigrateOptions {
  /** Target date. Defaults to today's journal date. */
  to?: string;
  priority?: boolean;
  dryRun?: boolean;
  now: Date;
  hooks?: { source?: WriteHooks; target?: WriteHooks; afterSource?: () => void };
  /** Block id generator. Random by default. */
  newId?: () => string;
}

export interface MigrateResult {
  status: "migrated" | "unchanged";
  source: { path: string; date: string; status: "updated" | "unchanged" };
  target: { path: string; date: string; status: "created" | "updated" | "unchanged" };
  /** Tasks marked `[>]` in this run. */
  migrated: number;
  /** Bullets added to the target note. */
  copied: number;
  dryRun: boolean;
  sourceContent?: string;
  targetContent?: string;
}

/**
 * Migrates a task and what's nested under it to another daily note. The source
 * note is written first and the target second, so running the same command
 * again after an interruption finishes the job without duplicating anything.
 */
export function migrateTask(
  config: VaultConfig,
  ref: string,
  options: MigrateOptions,
): MigrateResult {
  assertLinkSafeFolder(config);
  const task = resolveRef(config, ref);
  const to =
    options.to === undefined
      ? journalDate(options.now, config.dayStartHour)
      : parseDateArg(options.to);
  if (to <= task.date) {
    throw new DibujoError(
      "INVALID_DATE",
      `A task in the note for ${task.date} can only be migrated to a later date, not ${to}.`,
      "Migrate to today, or pass a later --to date.",
    );
  }

  const plan = planMigration(task.content, task.date, task.bullet.line, {
    newId: options.newId ?? randomBlockId,
    priority: options.priority === true,
    folder: config.folder,
  });

  // Read and check the target before writing anything, so an unsupported target
  // note can't leave a half-finished migration.
  const targetPath = dailyNotePath(config, to);
  const targetOriginal = readIfExists(targetPath);
  const targetBase = targetOriginal ?? newNoteTemplate(to);
  const targetParsed = parseDailyNote(targetBase);
  assertSupported(targetParsed, targetPath);
  const alreadyCopied = targetParsed.bullets.some(
    (b) =>
      b.origin !== undefined &&
      "date" in b.origin &&
      b.origin.date === task.date &&
      b.origin.blockId === plan.rootBlockId,
  );

  // Once the target has the copy, the migration is finished: change nothing. A
  // rerun can't tell this run's `[>]` children from older ones, so it must not plan again.
  const sourceContent =
    plan.sourceEdits.length > 0 && !alreadyCopied
      ? applyLineEdits(task.content, plan.sourceEdits)
      : task.content;
  const targetContent = alreadyCopied ? targetBase : appendLogLines(targetBase, plan.targetLines);
  const sourceStatus = sourceContent === task.content ? "unchanged" : "updated";
  const targetStatus = alreadyCopied
    ? "unchanged"
    : targetOriginal === null
      ? "created"
      : "updated";

  const dryRun = options.dryRun === true;
  const result: MigrateResult = {
    status: sourceStatus === "unchanged" && targetStatus === "unchanged" ? "unchanged" : "migrated",
    source: { path: task.path, date: task.date, status: sourceStatus },
    target: { path: targetPath, date: to, status: targetStatus },
    migrated: alreadyCopied ? 0 : plan.migrated,
    copied: alreadyCopied ? 0 : plan.targetLines.length,
    dryRun,
  };
  if (dryRun) return { ...result, sourceContent, targetContent };

  if (sourceStatus === "updated") {
    replaceIfUnchanged(task.path, task.content, sourceContent, options.hooks?.source);
  }
  options.hooks?.afterSource?.();
  if (targetStatus === "created") writeNew(targetPath, targetContent, options.hooks?.target);
  else if (targetStatus === "updated" && targetOriginal !== null) {
    replaceIfUnchanged(targetPath, targetOriginal, targetContent, options.hooks?.target);
  }
  return result;
}

export interface ReviewChild {
  ref: string;
  type: Bullet["type"];
  state?: TaskState;
  text: string;
  signifiers: Signifier[];
  depth: number;
}

export interface ReviewTask {
  ref: string;
  line: number;
  text: string;
  signifiers: Signifier[];
  depth: number;
  /** Days in a row this task has been migrated, ending with the move into yesterday. */
  streak: number;
  /** The date of the earliest note in the streak, or null when the streak is 0. */
  since: string | null;
  flagged: boolean;
  /** Bullets that would move with the task, in note order. */
  children: ReviewChild[];
}

export interface ReviewResult {
  today: string;
  yesterday: string;
  path: string;
  exists: boolean;
  flagAfterDays: number;
  tasks: ReviewTask[];
}

/**
 * Lists the open tasks in yesterday's note that aren't moved along with an open
 * parent, with their migration streaks.
 */
export function reviewTasks(config: VaultConfig, today: string): ReviewResult {
  const yesterday = addDays(today, -1);
  const path = dailyNotePath(config, yesterday);
  const base = {
    today,
    yesterday,
    path,
    flagAfterDays: config.migrationFlagDays,
  };
  const content = readIfExists(path);
  if (content === null) return { ...base, exists: false, tasks: [] };
  const parsed = parseDailyNote(content);
  assertSupported(parsed, path);

  const cache = new Map<string, ParsedNote | null>([[yesterday, parsed]]);
  const loadNote = (date: string): ParsedNote | null => {
    if (!cache.has(date)) cache.set(date, loadQuietly(config, date));
    return cache.get(date) ?? null;
  };

  const bullets = parsed.bullets;
  const tasks: ReviewTask[] = [];
  bullets.forEach((b, index) => {
    if (b.type !== "task" || b.state !== "open" || movesWithAncestor(bullets, index)) return;
    const { streak, since } = migrationStreak(b, yesterday, loadNote);
    tasks.push({
      ref: formatRef(yesterday, b.line, fingerprint(b)),
      line: b.line,
      text: b.text,
      signifiers: b.signifiers,
      depth: b.depth,
      streak,
      since,
      flagged: streak >= config.migrationFlagDays,
      children: movingDescendants(bullets, index).map((c) => {
        const child: ReviewChild = {
          ref: formatRef(yesterday, c.line, fingerprint(c)),
          type: c.type,
          text: c.text,
          signifiers: c.signifiers,
          depth: c.depth,
        };
        if (c.state) child.state = c.state;
        return child;
      }),
    });
  });

  return { ...base, exists: true, tasks };
}

/**
 * Follows origin links back one day at a time. Each link to a migrated task in
 * the previous day's note adds one. A missing note, a deleted line, a link to any
 * other day or to the future log, or a note this dibujo can't read ends the streak
 * without an error.
 */
export function migrationStreak(
  task: Bullet,
  taskDate: string,
  loadNote: (date: string) => ParsedNote | null,
): { streak: number; since: string | null } {
  let streak = 0;
  let since: string | null = null;
  let current: Bullet = task;
  let currentDate = taskDate;

  for (;;) {
    const origin = current.origin;
    // A future origin ends the streak, like a link to any day other than the day before.
    if (!origin || !("date" in origin) || origin.date !== addDays(currentDate, -1)) break;
    const source = loadNote(origin.date)?.bullets.find((b) => b.blockId === origin.blockId);
    if (source?.type !== "task" || source.state !== "migrated") break;
    streak++;
    since = origin.date;
    current = source;
    currentDate = origin.date;
  }
  return { streak, since };
}

function loadQuietly(config: VaultConfig, date: string): ParsedNote | null {
  const path = dailyNotePath(config, date);
  const content = readIfExists(path);
  if (content === null) return null;
  const parsed = parseDailyNote(content);
  try {
    assertSupported(parsed, path);
  } catch (error) {
    if (isDibujoError(error)) return null;
    throw error;
  }
  return parsed;
}

/**
 * True when migrating some open ancestor would move this bullet too: walking up,
 * an open task comes before any task that stays behind.
 */
function movesWithAncestor(bullets: readonly ParsedBullet[], index: number): boolean {
  let depth = bullets[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    const b = bullets[i];
    if (!b || b.depth >= depth) continue;
    depth = b.depth;
    if (b.type === "task") return b.state === "open";
  }
  return false;
}

/** The descendants that move with the task: everything except branches under finished tasks. */
function movingDescendants(bullets: readonly ParsedBullet[], index: number): ParsedBullet[] {
  const root = bullets[index];
  if (!root) return [];
  const result: ParsedBullet[] = [];
  let skipBelow: number | null = null;
  for (let i = index + 1; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b || b.depth <= root.depth) break;
    if (skipBelow !== null) {
      if (b.depth > skipBelow) continue;
      skipBelow = null;
    }
    if (b.type === "task" && b.state !== "open") {
      skipBelow = b.depth;
      continue;
    }
    result.push(b);
  }
  return result;
}

function notFound(ref: string, message: string): DibujoError {
  return new DibujoError(
    "TASK_NOT_FOUND",
    message,
    `The note may have changed. Run \`dibujo task review\` or \`dibujo log show\` again to get a fresh ref (was ${ref}).`,
  );
}
