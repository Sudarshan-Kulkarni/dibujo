import { z } from "zod";
import { DibujoError } from "../errors.js";
import { BulletText, formatIssues } from "./capture.js";
import { monthName } from "./journal-date.js";
import type { MovingTask } from "./month.js";
import { FORMAT_VERSION, isSubsequence, lastNonBlank, listHeadings, splitLines } from "./note.js";

const MAX_ITEMS = 10;

const Items = z
  .array(BulletText)
  .max(MAX_ITEMS, `must have at most ${MAX_ITEMS} items`)
  .default([]);

export const SummaryInput = z
  .object({
    highlights: Items,
    themes: Items,
    intentions: Items,
  })
  .strict();

export type SummaryInput = z.output<typeof SummaryInput>;

/** The section headings that mark a note as having a summary, in the order they are written. */
const SECTION_NAMES = [
  "highlights",
  "tasks done",
  "tasks that kept moving",
  "themes and intentions",
] as const;

/** Parses and validates `month summary` JSON from stdin. Throws `INVALID_INPUT` with field paths. */
export function parseSummaryInput(json: string): SummaryInput {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new DibujoError(
      "INVALID_INPUT",
      "Summary input is not valid JSON.",
      'Pipe a JSON object like {"highlights": ["..."], "themes": ["..."], "intentions": ["..."]} on stdin.',
    );
  }
  const result = SummaryInput.safeParse(value);
  if (!result.success) {
    throw new DibujoError(
      "INVALID_INPUT",
      `Summary input is invalid: ${formatIssues(result.error)}`,
      `Use only highlights, themes, and intentions: each a list of up to ${MAX_ITEMS} single-line texts.`,
    );
  }
  return result.data;
}

/** A new monthly note: just the frontmatter. The summary is appended to it. */
export function newMonthlyTemplate(month: string): string {
  return ["---", `dibujo: ${FORMAT_VERSION}`, "type: monthly", `month: ${month}`, "---", ""].join(
    "\n",
  );
}

/**
 * The summary as lines, from the title to the end of the last section. Tasks done and
 * the moving tasks come from the notes, not from the input.
 */
export function renderSummary(
  month: string,
  input: SummaryInput,
  done: number,
  moving: readonly MovingTask[],
  threshold: number,
): string[] {
  const list = (items: readonly string[], none: string): string[] =>
    items.length > 0 ? items.map((item) => `- ${item}`) : [none];
  const movingLines = moving.map(
    (m) => `- ${m.text} (moved ${m.moves} ${m.moves === 1 ? "time" : "times"})`,
  );
  return [
    `# ${monthName(month)} summary`,
    "",
    "## Highlights",
    "",
    ...list(input.highlights, "Nothing this month."),
    "",
    "## Tasks done",
    "",
    String(done),
    "",
    "## Tasks that kept moving",
    "",
    ...(movingLines.length > 0 ? movingLines : [`No task moved ${threshold} or more times.`]),
    "",
    "## Themes and intentions",
    "",
    "### Themes",
    "",
    ...list(input.themes, "None."),
    "",
    "### Intentions",
    "",
    ...list(input.intentions, "None."),
  ];
}

/**
 * True when the note has any of the four section headings as an H2, in any case and
 * outside code fences. The title and the text are not checked, so the user can edit both.
 */
export function hasSummary(content: string): boolean {
  const names: readonly string[] = SECTION_NAMES;
  return listHeadings(splitLines(content).lines).some((h) => names.includes(h.name.toLowerCase()));
}

/**
 * Adds the summary after the last non-blank line, with one blank line before it, keeping
 * the note's line ending style. Every original line is kept, in order; if that ever
 * fails, this throws instead of returning content.
 */
export function appendSummary(original: string, lines: readonly string[]): string {
  const { lines: originalLines, eol } = splitLines(original);
  const at = lastNonBlank(originalLines) + 1;
  const block = at > 0 ? ["", ...lines] : [...lines];
  const result = [...originalLines.slice(0, at), ...block, ...originalLines.slice(at)];
  if (!isSubsequence(originalLines, result)) {
    throw new Error("appendSummary would have removed or reordered existing lines");
  }
  return `${result.join(eol)}${eol}`;
}

/** True when the lines appear in the note in order, one right after another. */
export function containsBlock(content: string, lines: readonly string[]): boolean {
  if (lines.length === 0) return true;
  const have = splitLines(content).lines.map((l) => l.trimEnd());
  const want = lines.map((l) => l.trimEnd());
  for (let start = 0; start + want.length <= have.length; start++) {
    if (want.every((line, i) => have[start + i] === line)) return true;
  }
  return false;
}
