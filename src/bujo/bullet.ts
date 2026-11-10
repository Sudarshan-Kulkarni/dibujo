import { createHash } from "node:crypto";
import type { Bullet, Origin, Signifier, TaskState } from "./types.js";

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

// Fields at the end of a line. Each needs whitespace before it, so a field can
// never be the whole text.
const TRAILING_SIGNIFIER = /\s+#(priority|inspiration)$/i;
const TRAILING_BLOCK_ID = /\s+\^([A-Za-z0-9-]+)$/;
const TRAILING_SCHEDULED = /\s+⏳\uFE0F?\s*(\d{4}-\d{2}-\d{2})$/;
const TRAILING_ORIGIN =
  /\s+\[\[([^[\]|#]*?)(\d{4}-\d{2}-\d{2})#\^([A-Za-z0-9-]+)(?:\|[^[\]]*)?\]\]$/;

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

export interface FormatOptions {
  /**
   * The dibujo folder inside the vault. When set, origin links use the full path
   * (`<folder>/Daily/<date>`); otherwise they use the note's file name only.
   */
  folder?: string;
}

/**
 * Formats a bullet as one Markdown line, using a tab per nesting level. Fields go
 * in a fixed order: text, origin link, signifier tags, scheduled date, block id.
 */
export function formatBullet(bullet: Bullet, options: FormatOptions = {}): string {
  const indent = "\t".repeat(bullet.depth);
  const marker =
    bullet.type === "task"
      ? `- [${STATE_TO_CHECKBOX[bullet.state ?? "open"]}] `
      : bullet.type === "event"
        ? "* "
        : "- ";
  const origin = bullet.origin ? ` ${formatOriginLink(bullet.origin, options.folder)}` : "";
  const tags = bullet.signifiers.map((s) => ` #${s}`).join("");
  const scheduled = bullet.scheduled ? ` ⏳ ${bullet.scheduled}` : "";
  const blockId = bullet.blockId ? ` ^${bullet.blockId}` : "";
  return `${indent}${marker}${bullet.text}${origin}${tags}${scheduled}${blockId}`;
}

/** `[[<folder>/Daily/<date>#^<id>|from <date>]]`, or without the folder path. */
export function formatOriginLink(origin: Origin, folder?: string): string {
  const prefix = folder ? `${folder.replace(/\\/g, "/").replace(/\/+$/, "")}/Daily/` : "";
  return `[[${prefix}${origin.date}#^${origin.blockId}|from ${origin.date}]]`;
}

/** The checkbox character written for a task state. */
export function checkboxFor(state: TaskState): string {
  return STATE_TO_CHECKBOX[state];
}

/**
 * Identifies a bullet by what the user wrote: type, depth, text, signifiers, and
 * origin. State, scheduled date, and block id are left out, so the fingerprint
 * survives every change dibujo makes to a line.
 */
export function fingerprint(bullet: Bullet): string {
  const identity = {
    type: bullet.type,
    depth: bullet.depth,
    text: bullet.text,
    signifiers: [...bullet.signifiers],
    origin: bullet.origin ? { date: bullet.origin.date, blockId: bullet.origin.blockId } : null,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 8);
}

function build(
  type: Bullet["type"],
  indent: string,
  rest: string,
  state?: TaskState,
): Bullet | null {
  const fields = splitFields(rest, type === "task");
  if (fields.text.length === 0) return null;
  const bullet: Bullet = {
    type,
    signifiers: fields.signifiers,
    text: fields.text,
    depth: depthOf(indent),
  };
  if (state) bullet.state = state;
  if (fields.origin) bullet.origin = fields.origin;
  if (fields.scheduled) bullet.scheduled = fields.scheduled;
  if (fields.blockId) bullet.blockId = fields.blockId;
  return bullet;
}

interface Fields {
  text: string;
  signifiers: Signifier[];
  origin?: Origin;
  scheduled?: string;
  blockId?: string;
}

/**
 * Removes fields from the end of the text, in any order: signifier tags, block id,
 * and, on tasks, the scheduled date and origin link. Stops at the first token that
 * isn't a field. A second block id, date, or link stays in the text.
 */
function splitFields(rest: string, isTask: boolean): Fields {
  let text = rest.trimEnd();
  const found: Signifier[] = [];
  const fields: Omit<Fields, "text" | "signifiers"> = {};

  for (;;) {
    const signifier = TRAILING_SIGNIFIER.exec(text);
    if (signifier) {
      found.unshift((signifier[1] ?? "").toLowerCase() as Signifier);
      text = text.slice(0, signifier.index).trimEnd();
      continue;
    }
    const blockId = fields.blockId === undefined ? TRAILING_BLOCK_ID.exec(text) : null;
    if (blockId?.[1]) {
      fields.blockId = blockId[1];
      text = text.slice(0, blockId.index).trimEnd();
      continue;
    }
    const scheduled =
      isTask && fields.scheduled === undefined ? TRAILING_SCHEDULED.exec(text) : null;
    if (scheduled?.[1]) {
      fields.scheduled = scheduled[1];
      text = text.slice(0, scheduled.index).trimEnd();
      continue;
    }
    const origin = isTask && fields.origin === undefined ? TRAILING_ORIGIN.exec(text) : null;
    if (origin?.[2] && origin[3] && isDailyPath(origin[1] ?? "")) {
      fields.origin = { date: origin[2], blockId: origin[3] };
      text = text.slice(0, origin.index).trimEnd();
      continue;
    }
    break;
  }

  const signifiers = found.filter((value, index) => found.indexOf(value) === index);
  return { text: text.trim(), signifiers, ...fields };
}

/** An origin link's path is either empty (file name only) or ends in `Daily/`. */
function isDailyPath(prefix: string): boolean {
  return prefix === "" || prefix.endsWith("Daily/");
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
