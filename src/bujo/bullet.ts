import { createHash } from "node:crypto";
import type { Bullet, BulletType, Origin, Signifier, TaskState } from "./types.js";

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
const TRAILING_EVENT_DATE = /\s+📅\uFE0F?\s*(\d{4}-\d{2}-\d{2})$/;
/** Captures the whole link target. `originFrom` decides whether it points at a daily or future note. */
const TRAILING_ORIGIN = /\s+\[\[([^[\]|#]+)#\^([A-Za-z0-9-]+)(?:\|[^[\]]*)?\]\]$/;
const DAILY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_KEY = /^\d{4}$/;

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
 * in a fixed order: text, origin link, signifier tags, date (`⏳` on a task, `📅` on
 * an event), block id.
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
  const eventDate = bullet.type === "event" && bullet.eventDate ? ` 📅 ${bullet.eventDate}` : "";
  const blockId = bullet.blockId ? ` ^${bullet.blockId}` : "";
  return `${indent}${marker}${bullet.text}${origin}${tags}${scheduled}${eventDate}${blockId}`;
}

/**
 * `[[<folder>/Daily/<date>#^<id>|from <date>]]` for a daily origin and
 * `[[<folder>/Future#^<id>|from future log]]` for a future one. Without a folder,
 * only the note's file name is used. A future link never has a year, even when the
 * origin was read from an old-form link.
 */
export function formatOriginLink(origin: Origin, folder?: string): string {
  const root = folder ? `${folder.replace(/\\/g, "/").replace(/\/+$/, "")}/` : "";
  if ("date" in origin) {
    return `[[${root}${folder ? "Daily/" : ""}${origin.date}#^${origin.blockId}|from ${origin.date}]]`;
  }
  return `[[${root}Future#^${origin.blockId}|from future log]]`;
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
    origin: bullet.origin ? identityOf(bullet.origin) : null,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 8);
}

/**
 * The origin fields that count towards a fingerprint. A daily origin keeps its original
 * shape. A future origin counts only its block id, so an old-form link (with a year)
 * and a new-form link to the same entry give the same fingerprint.
 */
function identityOf(origin: Origin): Origin {
  return "date" in origin
    ? { date: origin.date, blockId: origin.blockId }
    : { blockId: origin.blockId };
}

function build(
  type: Bullet["type"],
  indent: string,
  rest: string,
  state?: TaskState,
): Bullet | null {
  const fields = splitFields(rest, type);
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
  if (fields.eventDate) bullet.eventDate = fields.eventDate;
  if (fields.blockId) bullet.blockId = fields.blockId;
  return bullet;
}

interface Fields {
  text: string;
  signifiers: Signifier[];
  origin?: Origin;
  scheduled?: string;
  eventDate?: string;
  blockId?: string;
}

/**
 * Removes fields from the end of the text, in any order: signifier tags and block id
 * on any bullet, the scheduled date and origin link on tasks only, and the event date
 * on events only. On other types those stay in the text. Stops at the first token that
 * isn't a field. A second block id, date, or link stays in the text.
 */
function splitFields(rest: string, type: BulletType): Fields {
  const isTask = type === "task";
  const isEvent = type === "event";
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
    const eventDate =
      isEvent && fields.eventDate === undefined ? TRAILING_EVENT_DATE.exec(text) : null;
    if (eventDate?.[1]) {
      fields.eventDate = eventDate[1];
      text = text.slice(0, eventDate.index).trimEnd();
      continue;
    }
    const origin = isTask && fields.origin === undefined ? TRAILING_ORIGIN.exec(text) : null;
    const parsedOrigin = origin ? originFrom(origin[1] ?? "", origin[2] ?? "") : null;
    if (origin && parsedOrigin) {
      fields.origin = parsedOrigin;
      text = text.slice(0, origin.index).trimEnd();
      continue;
    }
    break;
  }

  const signifiers = found.filter((value, index) => found.indexOf(value) === index);
  return { text: text.trim(), signifiers, ...fields };
}

/**
 * Decides what an origin link target points at, or `null` when it points at neither
 * a daily note nor the future log (the link then stays in the text). The last part of
 * the target is the note name, and the part before it must agree with the kind of note:
 *
 * | Target | Result |
 * | --- | --- |
 * | `YYYY-MM-DD`, or `<path>/Daily/YYYY-MM-DD` | daily origin |
 * | `Future`, or `<path>/Future` | future origin, no year |
 * | `YYYY`, or `<path>/Future/YYYY` (old form) | future origin with that year |
 *
 * So `Books/2026#^abc`, `Bujo/Daily/2026#^abc`, and `Bujo/Future/2026-11-08#^abc` are
 * not origins. A target can't say which folder is the dibujo folder, so `<path>` in
 * the table is any path.
 */
export function originFrom(target: string, blockId: string): Origin | null {
  if (blockId === "") return null;
  const parts = target.split("/");
  const name = parts[parts.length - 1] ?? "";
  const parent = parts.length > 1 ? parts[parts.length - 2] : undefined;

  if (DAILY_KEY.test(name)) {
    return parent === undefined || parent === "Daily" ? { date: name, blockId } : null;
  }
  if (name === "Future") return { blockId };
  if (YEAR_KEY.test(name)) {
    return parent === undefined || parent === "Future" ? { blockId, year: name } : null;
  }
  return null;
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
