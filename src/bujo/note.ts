import { parse as parseYaml } from "yaml";
import { formatBullet, parseBulletLine } from "./bullet.js";
import { CALLOUT_HEADER } from "./capture.js";
import type { Bullet } from "./types.js";

/** Highest note format version this code reads and writes. */
export const FORMAT_VERSION = 1;

const LOG_HEADING = "## Log";
const CAPTURES_HEADING = "## Captures";
const H2 = /^##\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

export interface ParsedBullet extends Bullet {
  /** 1-based line number in the note. */
  line: number;
}

export interface UnrecognizedLine {
  line: number;
  text: string;
}

export interface ParsedNote {
  /**
   * Format version from the `dibujo` frontmatter field. A missing field counts as 1.
   * `null` means the field is there but isn't a positive integer.
   */
  version: number | null;
  bullets: ParsedBullet[];
  unrecognized: UnrecognizedLine[];
  captureIds: string[];
}

export function newNoteTemplate(date: string): string {
  return [
    "---",
    `dibujo: ${FORMAT_VERSION}`,
    "type: daily",
    `date: ${date}`,
    "---",
    "",
    LOG_HEADING,
    "",
    CAPTURES_HEADING,
    "",
  ].join("\n");
}

export function parseDailyNote(content: string): ParsedNote {
  const lines = splitLines(content).lines;
  const layout = scan(lines);
  const bullets: ParsedBullet[] = [];
  const unrecognized: UnrecognizedLine[] = [];

  if (layout.log) {
    for (let i = layout.log.start + 1; i < layout.log.end; i++) {
      const text = lines[i] ?? "";
      if (text.trim().length === 0) continue;
      const bullet = parseBulletLine(text);
      if (bullet) bullets.push({ ...bullet, line: i + 1 });
      else unrecognized.push({ line: i + 1, text });
    }
  }

  const captureIds: string[] = [];
  for (let i = layout.bodyStart; i < lines.length; i++) {
    const match = CALLOUT_HEADER.exec(lines[i] ?? "");
    if (match?.[1]) captureIds.push(match[1].toLowerCase());
  }

  return { version: readVersion(lines, layout), bullets, unrecognized, captureIds };
}

/**
 * Adds bullets to the end of the Log section and the callout to the end of the
 * Captures section, creating either section if it's missing. Every original line
 * is kept, in order; if that ever fails, this throws instead of returning content.
 */
export function appendCapture(
  original: string,
  bullets: readonly Bullet[],
  callout: readonly string[],
): string {
  const { lines: originalLines, eol } = splitLines(original);
  let lines = [...originalLines];

  lines = appendToSection(
    lines,
    "log",
    LOG_HEADING,
    bullets.map((b) => formatBullet(b)),
    "captures",
  );
  lines = appendToSection(lines, "captures", CAPTURES_HEADING, [...callout], null, true);

  if (!isSubsequence(originalLines, lines)) {
    throw new Error("appendCapture would have removed or reordered existing lines");
  }
  return `${lines.join(eol)}${eol}`;
}

/**
 * Adds already-formatted lines to the end of the Log section, creating the section
 * if it's missing. Writes no capture callout. Every original line is kept, in order.
 */
export function appendLogLines(original: string, addition: readonly string[]): string {
  const { lines: originalLines, eol } = splitLines(original);
  const lines = appendToSection([...originalLines], "log", LOG_HEADING, [...addition], "captures");
  if (!isSubsequence(originalLines, lines)) {
    throw new Error("appendLogLines would have removed or reordered existing lines");
  }
  return `${lines.join(eol)}${eol}`;
}

interface Range {
  /** Index of the heading line. */
  start: number;
  /** Index of the next H2 heading, or the line count. */
  end: number;
}

interface Layout {
  /** Index of the first line after the frontmatter. */
  bodyStart: number;
  frontmatterEnd: number | null;
  log: Range | null;
  captures: Range | null;
}

function scan(lines: readonly string[]): Layout {
  const frontmatterEnd = findFrontmatterEnd(lines);
  const bodyStart = frontmatterEnd === null ? 0 : frontmatterEnd + 1;
  const headings: { index: number; name: string }[] = [];
  let inFence = false;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = H2.exec(line);
    if (match?.[1]) headings.push({ index: i, name: match[1].trim().toLowerCase() });
  }

  const rangeOf = (name: string): Range | null => {
    const at = headings.findIndex((h) => h.name === name);
    const heading = headings[at];
    if (!heading) return null;
    return { start: heading.index, end: headings[at + 1]?.index ?? lines.length };
  };

  return { bodyStart, frontmatterEnd, log: rangeOf("log"), captures: rangeOf("captures") };
}

/** Index of the closing `---` of a frontmatter block at the top of the file, if any. */
function findFrontmatterEnd(lines: readonly string[]): number | null {
  if (lines[0]?.trimEnd() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trimEnd();
    if (line === "---" || line === "...") return i;
  }
  return null;
}

function readVersion(lines: readonly string[], layout: Layout): number | null {
  if (layout.frontmatterEnd === null) return FORMAT_VERSION;
  let data: unknown;
  try {
    data = parseYaml(lines.slice(1, layout.frontmatterEnd).join("\n"));
  } catch {
    // Frontmatter we can't parse belongs to the user. Leave it alone and assume v1.
    return FORMAT_VERSION;
  }
  if (typeof data !== "object" || data === null) return FORMAT_VERSION;
  const value = (data as Record<string, unknown>).dibujo;
  if (value === undefined) return FORMAT_VERSION;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Inserts `addition` after the last non-blank line of a section. Creates the
 * section if it's missing: before `beforeSection` when that exists, otherwise at
 * the end. With `separate`, a blank line goes between existing content and the
 * addition, which callouts need so they don't merge.
 */
function appendToSection(
  lines: string[],
  section: "log" | "captures",
  heading: string,
  addition: string[],
  beforeSection: "log" | "captures" | null,
  separate = false,
): string[] {
  const layout = scan(lines);
  const range = layout[section];

  if (range) {
    let last = range.start;
    for (let i = range.end - 1; i > range.start; i--) {
      if ((lines[i] ?? "").trim().length > 0) {
        last = i;
        break;
      }
    }
    const block = last === range.start || separate ? ["", ...addition] : addition;
    const next = lines[last + 1];
    const needsTrailingBlank = next !== undefined && next.trim().length > 0;
    return [
      ...lines.slice(0, last + 1),
      ...block,
      ...(needsTrailingBlank ? [""] : []),
      ...lines.slice(last + 1),
    ];
  }

  const block = [heading, "", ...addition];
  const before = beforeSection ? layout[beforeSection] : null;
  if (before) {
    return [...lines.slice(0, before.start), ...block, "", ...lines.slice(before.start)];
  }

  const trimmedEnd = lastNonBlank(lines);
  const head = lines.slice(0, trimmedEnd + 1);
  const tail = lines.slice(trimmedEnd + 1);
  return [...head, ...(head.length > 0 ? [""] : []), ...block, ...tail];
}

function lastNonBlank(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if ((lines[i] ?? "").trim().length > 0) return i;
  }
  return -1;
}

/** Splits content into lines, dropping the final empty line and remembering the line ending. */
export function splitLines(content: string): { lines: string[]; eol: string } {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  if (content.length === 0) return { lines: [], eol };
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return { lines, eol };
}

function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let j = 0;
  for (const line of haystack) {
    if (j < needle.length && line === needle[j]) j++;
  }
  return j === needle.length;
}
