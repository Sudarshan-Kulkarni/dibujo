import { checkboxFor, fingerprint, parseBulletLine } from "./bullet.js";
import { splitLines } from "./note.js";
import type { TaskState } from "./types.js";

/** One line to replace. `line` is 1-based, and `before` must match the note exactly. */
export interface LineEdit {
  line: number;
  before: string;
  after: string;
}

const CHECKBOX = /^(\s*[-*+] \[)(.)(\] )/;
const SCHEDULED_FIELD = /⏳\uFE0F?\s*\d{4}-\d{2}-\d{2}/g;
const ENDS_WITH_BLOCK_ID = /\s+\^[A-Za-z0-9-]+\s*$/;

/** Replaces only the character between `[` and `]`. Everything else stays byte for byte. */
export function setCheckbox(line: string, state: TaskState): string {
  if (!CHECKBOX.test(line) || parseBulletLine(line)?.type !== "task") {
    throw new Error("setCheckbox needs a task line");
  }
  return line.replace(CHECKBOX, (_m, head: string, _box: string, tail: string) => {
    return `${head}${checkboxFor(state)}${tail}`;
  });
}

/**
 * Sets the `⏳` date on a task line. Replaces the date of an existing scheduled
 * field, or inserts ` ⏳ <date>` before a trailing block id, or at the end.
 */
export function setScheduled(line: string, date: string): string {
  const bullet = parseBulletLine(line);
  if (bullet?.type !== "task") throw new Error("setScheduled needs a task line");

  if (bullet.scheduled !== undefined) {
    // The parsed field is the last ⏳ on the line, since fields come after the text.
    const matches = [...line.matchAll(SCHEDULED_FIELD)];
    const last = matches[matches.length - 1];
    if (last?.index === undefined) throw new Error("scheduled field not found");
    const end = last.index + last[0].length;
    return `${line.slice(0, end - 10)}${date}${line.slice(end)}`;
  }

  const trimmed = line.trimEnd();
  const blockId = bullet.blockId !== undefined ? ENDS_WITH_BLOCK_ID.exec(trimmed) : null;
  if (blockId) {
    return `${trimmed.slice(0, blockId.index)} ⏳ ${date}${trimmed.slice(blockId.index)}`;
  }
  return `${trimmed} ⏳ ${date}`;
}

/** Appends ` ^<id>` unless the line already has a block id. */
export function addBlockId(line: string, id: string): string {
  const bullet = parseBulletLine(line);
  if (!bullet) throw new Error("addBlockId needs a bullet line");
  if (bullet.blockId !== undefined) return line;
  return `${line.trimEnd()} ^${id}`;
}

/**
 * Replaces the given lines and nothing else. Throws, without returning content,
 * unless each `before` still matches, the line count is unchanged, and each new
 * line is the same bullet as before (same fingerprint). So an edit can change a
 * line's state, scheduled date, or block id, but never what the user wrote.
 */
export function applyLineEdits(original: string, edits: readonly LineEdit[]): string {
  const { lines, eol } = splitLines(original);
  const result = [...lines];
  const seen = new Set<number>();

  for (const edit of edits) {
    const index = edit.line - 1;
    if (seen.has(index)) throw new Error(`line ${edit.line} is edited twice`);
    seen.add(index);
    if (lines[index] !== edit.before) throw new Error(`line ${edit.line} doesn't match`);
    if (/[\r\n]/.test(edit.after)) throw new Error("an edit must stay on one line");
    const before = parseBulletLine(edit.before);
    const after = parseBulletLine(edit.after);
    if (!before || !after || fingerprint(before) !== fingerprint(after)) {
      throw new Error(`the edit to line ${edit.line} changes more than state, date, or block id`);
    }
    result[index] = edit.after;
  }

  const endsWithEol = original.endsWith("\n");
  return `${result.join(eol)}${endsWithEol ? eol : ""}`;
}
