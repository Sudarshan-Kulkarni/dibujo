import { parseBulletLine } from "./bullet.js";
import {
  FORMAT_VERSION,
  findFrontmatterEnd,
  isSubsequence,
  lastNonBlank,
  type ParsedBullet,
  readVersion,
  splitLines,
  type UnrecognizedLine,
} from "./note.js";

/** A Markdown heading: 1 to 6 `#` and a space. Headings are allowed anywhere and ignored. */
const HEADING = /^#{1,6}\s/;

/** An entry in the future log: any bullet below the frontmatter, with its line number. */
export type FutureBullet = ParsedBullet;

export interface ParsedFutureNote {
  /** Format version, read like a daily note's. */
  version: number | null;
  entries: FutureBullet[];
  /** Non-blank lines that are neither headings nor bullets. */
  unrecognized: UnrecognizedLine[];
}

/** A new future log note: just the frontmatter, with no sections. */
export function newFutureTemplate(): string {
  return ["---", `dibujo: ${FORMAT_VERSION}`, "type: future", "---", ""].join("\n");
}

/**
 * Reads the future log. Every bullet below the frontmatter is an entry, wherever it is.
 * Blank lines and headings are skipped. Any other line is reported as unrecognized.
 */
export function parseFutureNote(content: string): ParsedFutureNote {
  const lines = splitLines(content).lines;
  const frontmatterEnd = findFrontmatterEnd(lines);
  const entries: FutureBullet[] = [];
  const unrecognized: UnrecognizedLine[] = [];

  for (let i = frontmatterEnd === null ? 0 : frontmatterEnd + 1; i < lines.length; i++) {
    const text = lines[i] ?? "";
    if (text.trim().length === 0 || HEADING.test(text)) continue;
    const bullet = parseBulletLine(text);
    if (bullet) entries.push({ ...bullet, line: i + 1 });
    else unrecognized.push({ line: i + 1, text });
  }
  return { version: readVersion(lines, frontmatterEnd), entries, unrecognized };
}

/**
 * Adds already-formatted lines after the last non-blank line of the note, keeping its
 * line ending style. When that line is the end of the frontmatter, a blank line goes
 * between it and the first entry (unless one is already there). Every original line
 * is kept, in order; if that ever fails, this throws instead of returning content.
 */
export function appendFutureEntries(original: string, addition: readonly string[]): string {
  const { lines: originalLines, eol } = splitLines(original);
  const last = lastNonBlank(originalLines);
  let at = last + 1;
  let block = [...addition];

  if (last >= 0 && last === findFrontmatterEnd(originalLines)) {
    if ((originalLines[at] ?? "x").trim().length === 0) at++;
    else block = ["", ...block];
  }

  const lines = [...originalLines.slice(0, at), ...block, ...originalLines.slice(at)];
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

/** The events whose `📅` date is `date`, in note order. */
export function eventsOn<T extends FutureBullet>(entries: readonly T[], date: string): T[] {
  return entries.filter((e) => e.type === "event" && e.eventDate === date);
}

/** The waiting tasks that aren't due (undated, or dated after `today`), in note order. */
export function otherWaiting<T extends FutureBullet>(entries: readonly T[], today: string): T[] {
  return entries.filter(
    (e) =>
      e.type === "task" && e.state === "open" && (e.scheduled === undefined || e.scheduled > today),
  );
}
