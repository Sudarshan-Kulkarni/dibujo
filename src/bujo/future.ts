import { parseBulletLine } from "./bullet.js";
import {
  FORMAT_VERSION,
  findFrontmatterEnd,
  type Heading,
  insertIntoRange,
  isSubsequence,
  lastNonBlank,
  listHeadings,
  type ParsedBullet,
  readVersion,
  splitLines,
  type UnrecognizedLine,
} from "./note.js";
import type { Origin } from "./types.js";

/** English month names, fixed in code so a note doesn't depend on the computer's locale. */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** A month heading starts with `YYYY-MM`. The month name after it is for people. */
const MONTH_HEADING = /^(\d{4}-(?:0[1-9]|1[0-2]))(?:\s|$)/;

/** An entry in a future log note: a bullet under a month heading. */
export interface FutureBullet extends ParsedBullet {
  /** The month of the section it is in, as `YYYY-MM`. */
  month: string;
}

export interface ParsedFutureNote {
  /** Format version, read like a daily note's. */
  version: number | null;
  entries: FutureBullet[];
  /** Non-blank lines in a month section that aren't bullets. */
  unrecognized: UnrecognizedLine[];
}

/** An entry together with the year of the note it was read from. */
export interface LocatedEntry extends FutureBullet {
  year: string;
}

/** The result of `findLive`. */
export interface LiveEntry {
  /**
   * `waiting`: the entry is waiting for its date.
   * `resume`: a reschedule was interrupted. The entry is `[<]` with a block id and has no copy yet.
   */
  kind: "waiting" | "resume";
  entry: LocatedEntry;
}

/** The month of a `YYYY-MM-DD` date, as `YYYY-MM`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** `## 2026-12 December` for `"2026-12"`. */
export function monthHeading(month: string): string {
  const match = MONTH_KEY.exec(month);
  if (!match) throw new Error(`not a month: ${month}`);
  return `## ${month} ${MONTH_NAMES[Number(match[2]) - 1]}`;
}

/** A new note for `year`: the frontmatter and one empty section for each of the 12 months. */
export function newFutureTemplate(year: string): string {
  const lines = ["---", `dibujo: ${FORMAT_VERSION}`, "type: future", `year: ${year}`, "---", ""];
  for (let month = 1; month <= 12; month++) {
    lines.push(monthHeading(`${year}-${String(month).padStart(2, "0")}`), "");
  }
  return lines.join("\n");
}

export function parseFutureNote(content: string): ParsedFutureNote {
  const lines = splitLines(content).lines;
  const entries: FutureBullet[] = [];
  const unrecognized: UnrecognizedLine[] = [];

  for (const section of monthSections(lines)) {
    for (let i = section.start + 1; i < section.end; i++) {
      const text = lines[i] ?? "";
      if (text.trim().length === 0) continue;
      const bullet = parseBulletLine(text);
      if (bullet) entries.push({ ...bullet, line: i + 1, month: section.month });
      else unrecognized.push({ line: i + 1, text });
    }
  }
  return { version: readVersion(lines, findFrontmatterEnd(lines)), entries, unrecognized };
}

/**
 * Adds already-formatted lines to the end of a month's section. When the note has no
 * heading for that month, adds one in calendar order: before the first later month,
 * otherwise after the last month section, otherwise at the end of the note. Every
 * original line is kept, in order; if that ever fails, this throws.
 */
export function appendFutureEntries(
  original: string,
  month: string,
  addition: readonly string[],
): string {
  const heading = monthHeading(month);
  const { lines: originalLines, eol } = splitLines(original);
  const sections = monthSections(originalLines);

  const existing = sections.find((s) => s.month === month);
  let lines: string[];
  if (existing) {
    lines = insertIntoRange(originalLines, existing, addition);
  } else {
    const block = [heading, "", ...addition];
    const later = sections.find((s) => s.month > month);
    const last = sections[sections.length - 1];
    const after = later
      ? later.start - 1
      : last
        ? lastNonBlankIn(originalLines, last)
        : lastNonBlank(originalLines);
    lines = insertBlockAfter(originalLines, after, block);
  }

  if (!isSubsequence(originalLines, lines)) {
    throw new Error("appendFutureEntries would have removed or reordered existing lines");
  }
  return `${lines.join(eol)}${eol}`;
}

/**
 * The entries that are due: tasks in state open with a `⏳` date on or before
 * `today`. They are sorted by date. Entries with the same date keep the order they
 * were passed in, so pass them in note order.
 */
export function dueEntries<T extends FutureBullet>(entries: readonly T[], today: string): T[] {
  return entries
    .filter(
      (e) =>
        e.type === "task" &&
        e.state === "open" &&
        e.scheduled !== undefined &&
        e.scheduled <= today,
    )
    .sort((a, b) => (a.scheduled ?? "").localeCompare(b.scheduled ?? ""));
}

/**
 * Finds the live entry for the task that `from` points to, by following the entries
 * that link to it. A waiting entry is live. A `[<]` entry hands over to the entries
 * that link to it, and when none do, it is an interrupted reschedule to resume. Entries
 * that were brought in, cancelled, or completed are finished, and so is a task with no
 * entries. A visited set stops the walk when hand edits make a loop.
 */
export function findLive(entries: readonly LocatedEntry[], from: Origin): LiveEntry | null {
  const visited = new Set<string>();
  const result = walk(entries, from, visited);
  return result === NO_ENTRIES || result === FINISHED ? null : result;
}

const NO_ENTRIES = Symbol("no entries link here");
const FINISHED = Symbol("every entry is finished");

function walk(
  entries: readonly LocatedEntry[],
  origin: Origin,
  visited: Set<string>,
): LiveEntry | typeof NO_ENTRIES | typeof FINISHED {
  const key = originKey(origin);
  if (visited.has(key)) return FINISHED;
  visited.add(key);

  const linked = entries.filter(
    (e) => e.type === "task" && e.origin !== undefined && originKey(e.origin) === key,
  );
  if (linked.length === 0) return NO_ENTRIES;

  const waiting = linked.find((e) => e.state === "open");
  if (waiting) return { kind: "waiting", entry: waiting };

  for (const entry of linked) {
    if (entry.state !== "scheduled" || entry.blockId === undefined) continue;
    const next = walk(entries, { year: entry.year, blockId: entry.blockId }, visited);
    if (next === NO_ENTRIES) return { kind: "resume", entry };
    if (next !== FINISHED) return next;
  }
  return FINISHED;
}

function originKey(origin: Origin): string {
  return "date" in origin
    ? `daily:${origin.date}:${origin.blockId}`
    : `future:${origin.year}:${origin.blockId}`;
}

interface MonthSection {
  month: string;
  /** Index of the heading line. */
  start: number;
  /** Index of the next `## ` heading of any kind, or the line count. */
  end: number;
}

/** The sections under `## YYYY-MM …` headings. Any other `## ` heading ends a section. */
function monthSections(lines: readonly string[]): MonthSection[] {
  const headings: Heading[] = listHeadings(lines);
  const sections: MonthSection[] = [];
  headings.forEach((heading, at) => {
    const month = MONTH_HEADING.exec(heading.name)?.[1];
    if (month) {
      sections.push({ month, start: heading.index, end: headings[at + 1]?.index ?? lines.length });
    }
  });
  return sections;
}

/** The index of the last non-blank line in a section, or its heading when the rest is blank. */
function lastNonBlankIn(lines: readonly string[], section: MonthSection): number {
  for (let i = section.end - 1; i > section.start; i--) {
    if ((lines[i] ?? "").trim().length > 0) return i;
  }
  return section.start;
}

/** Inserts `block` after line `after` (-1 for the top), with a blank line on each side where needed. */
function insertBlockAfter(lines: readonly string[], after: number, block: readonly string[]) {
  const head = lines.slice(0, after + 1);
  const tail = lines.slice(after + 1);
  const needsLead = head.length > 0 && (head[head.length - 1] ?? "").trim().length > 0;
  const needsTrail = tail.length > 0 && (tail[0] ?? "").trim().length > 0;
  return [...head, ...(needsLead ? [""] : []), ...block, ...(needsTrail ? [""] : []), ...tail];
}
