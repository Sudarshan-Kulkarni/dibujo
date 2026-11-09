import type { Bullet, Signifier, TaskState } from "./types.js";

const CHECKBOX_TO_STATE: Readonly<Record<string, TaskState>> = {
  " ": "open",
  x: "completed",
  X: "completed",
  ">": "migrated",
  "<": "scheduled",
  "-": "cancelled",
};

const STATE_TO_CHECKBOX: Readonly<Record<TaskState, string>> = {
  open: " ",
  completed: "x",
  migrated: ">",
  scheduled: "<",
  cancelled: "-",
};

const TASK_LINE = /^(\s*)[-*+] \[(.)\] (.*)$/;
/** A list item that starts like a checkbox but isn't a valid task line (e.g. `- [ ]` with no text). */
const CHECKBOX_LIKE = /^\s*[-*+] \[.\]/;
const EVENT_LINE = /^(\s*)\* (.*)$/;
const NOTE_LINE = /^(\s*)[-+] (.*)$/;
const TRAILING_SIGNIFIER = /\s+#(priority|inspiration)$/i;

/** Columns per nesting level. A tab counts as one full level. */
const INDENT_WIDTH = 4;

/**
 * Parses one line from the Log section. Returns `null` for anything that isn't a
 * valid bullet: blank lines, paragraphs, unknown checkbox characters, or empty text.
 */
export function parseBulletLine(line: string): Bullet | null {
  const task = TASK_LINE.exec(line);
  if (task) {
    const [, indent = "", box = "", rest = ""] = task;
    const state = CHECKBOX_TO_STATE[box];
    if (!state) return null;
    return build("task", indent, rest, state);
  }
  if (CHECKBOX_LIKE.test(line)) return null;

  const event = EVENT_LINE.exec(line);
  if (event) {
    const [, indent = "", rest = ""] = event;
    return build("event", indent, rest);
  }

  const note = NOTE_LINE.exec(line);
  if (note) {
    const [, indent = "", rest = ""] = note;
    return build("note", indent, rest);
  }

  return null;
}

/** Formats a bullet as one Markdown line, using a tab per nesting level. */
export function formatBullet(bullet: Bullet): string {
  const indent = "\t".repeat(bullet.depth);
  const marker =
    bullet.type === "task"
      ? `- [${STATE_TO_CHECKBOX[bullet.state ?? "open"]}] `
      : bullet.type === "event"
        ? "* "
        : "- ";
  const tags = bullet.signifiers.map((s) => ` #${s}`).join("");
  return `${indent}${marker}${bullet.text}${tags}`;
}

function build(
  type: Bullet["type"],
  indent: string,
  rest: string,
  state?: TaskState,
): Bullet | null {
  const { text, signifiers } = splitSignifiers(rest);
  if (text.length === 0) return null;
  const bullet: Bullet = { type, signifiers, text, depth: depthOf(indent) };
  if (state) bullet.state = state;
  return bullet;
}

/** Removes signifier tags from the end of the text. Tags elsewhere stay in the text. */
function splitSignifiers(rest: string): { text: string; signifiers: Signifier[] } {
  let text = rest.trimEnd();
  const found: Signifier[] = [];
  for (let match = TRAILING_SIGNIFIER.exec(text); match; match = TRAILING_SIGNIFIER.exec(text)) {
    const name = (match[1] ?? "").toLowerCase() as Signifier;
    found.unshift(name);
    text = text.slice(0, match.index).trimEnd();
  }
  const signifiers = found.filter((value, index) => found.indexOf(value) === index);
  return { text: text.trim(), signifiers };
}

/** Tabs are one level each. Spaces count in groups of 4, rounding up, so 2-space indents nest too. */
function depthOf(indent: string): number {
  let tabs = 0;
  let spaces = 0;
  for (const ch of indent) {
    if (ch === "\t") tabs++;
    else spaces++;
  }
  return tabs + Math.ceil(spaces / INDENT_WIDTH);
}
