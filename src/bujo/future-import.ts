import { type FormatOptions, fingerprint, formatBullet } from "./bullet.js";
import { type FutureBullet, type ParsedFutureNote, parseFutureNote } from "./future.js";
import { splitLines } from "./note.js";
import type { Bullet, Origin } from "./types.js";

/** An old year note (`Future/YYYY.md`) as read from disk. */
export interface OldNote {
  year: string;
  path: string;
  content: string;
}

export interface ImportPlan {
  /** Lines to append to `Future.md`, in order. */
  lines: string[];
  /** The number of entries copied from each old note. Notes that add nothing are left out. */
  copied: { path: string; count: number }[];
  /** Lines in the old notes that are not blank, headings, or bullets, so they were not copied. */
  unreadable: { path: string; line: number; text: string }[];
}

/**
 * Plans the copy of old year notes into the future log. `current` is the future log as
 * it is now (an empty note when it doesn't exist yet). `options.folder` is the dibujo
 * folder, so that links written again use the full path.
 *
 * Old notes are handled oldest year first, then in note order, and are read with the
 * flat parser, so entries under any heading are found. The rules:
 *
 * 1. Open tasks, events, and notes are copied. Tasks in any other state are skipped,
 *    and so is everything nested under a skipped entry.
 * 2. A copied task whose origin is a future origin with a year is a rescheduled task.
 *    Its chain of old entries is followed (by year and block id) to a daily origin, and
 *    the copy links to that. If the chain breaks, the copy keeps the link it had.
 * 3. A copy keeps its block id unless `current` or an earlier copy already uses it.
 * 4. A copy is left out when `current` has an entry with the same fingerprint, in any
 *    state. That makes a second run add nothing, even after an imported entry was
 *    brought in or cancelled.
 * 5. An entry that changed (new origin or dropped block id) is formatted again.
 *    Any other entry is copied byte for byte.
 * 6. Lines that can't be read are listed, not copied.
 */
export function planImport(
  old: readonly OldNote[],
  current: ParsedFutureNote,
  options: FormatOptions = {},
): ImportPlan {
  const notes = [...old]
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((note) => ({
      note,
      lines: splitLines(note.content).lines,
      parsed: parseFutureNote(note.content),
    }));

  const byBlock = new Map<string, FutureBullet>();
  for (const { note, parsed } of notes) {
    for (const entry of parsed.entries) {
      const key = entry.blockId === undefined ? null : chainKey(note.year, entry.blockId);
      if (key !== null && !byBlock.has(key)) byBlock.set(key, entry);
    }
  }

  const known = new Set(current.entries.map(fingerprint));
  const usedIds = new Set(current.entries.flatMap((e) => (e.blockId ? [e.blockId] : [])));
  const plan: ImportPlan = { lines: [], copied: [], unreadable: [] };

  for (const { note, lines, parsed } of notes) {
    let count = 0;
    let skipBelow: number | null = null;
    let previousLine = 0;

    for (const entry of parsed.entries) {
      // A heading or an unreadable line between two bullets ends any nesting.
      if (lines.slice(previousLine, entry.line - 1).some((l) => l.trim().length > 0)) {
        skipBelow = null;
      }
      previousLine = entry.line;

      if (skipBelow !== null && entry.depth > skipBelow) continue;
      skipBelow = null;
      if (entry.type === "task" && entry.state !== "open") {
        skipBelow = entry.depth;
        continue;
      }

      const original = lines[entry.line - 1] ?? "";
      const copy = withFlatOrigin(entry, byBlock);
      let changed = copy !== entry;
      let bullet: Bullet = copy;
      if (bullet.blockId !== undefined && usedIds.has(bullet.blockId)) {
        const { blockId: _dropped, ...rest } = bullet;
        bullet = rest;
        changed = true;
      }
      if (known.has(fingerprint(bullet))) continue;

      if (bullet.blockId !== undefined) usedIds.add(bullet.blockId);
      plan.lines.push(changed ? formatBullet(bullet, options) : original);
      count++;
    }

    if (count > 0) plan.copied.push({ path: note.path, count });
    for (const line of parsed.unrecognized) {
      plan.unreadable.push({ path: note.path, line: line.line, text: line.text });
    }
  }
  return plan;
}

function chainKey(year: string, blockId: string): string {
  return `${year}:${blockId}`;
}

/**
 * Follows a task's chain of old entries to a daily origin and returns the task with
 * that origin. Returns the same object when there is nothing to flatten or the chain
 * breaks (an entry that is missing, has no origin, or a loop).
 */
function withFlatOrigin<T extends Bullet>(entry: T, byBlock: ReadonlyMap<string, FutureBullet>): T {
  let origin: Origin | undefined = entry.origin;
  if (entry.type !== "task" || origin === undefined || "date" in origin) return entry;

  const visited = new Set<string>();
  while (origin !== undefined && !("date" in origin) && origin.year !== undefined) {
    const key = chainKey(origin.year, origin.blockId);
    if (visited.has(key)) return entry;
    visited.add(key);
    origin = byBlock.get(key)?.origin;
  }
  return origin !== undefined && "date" in origin ? { ...entry, origin } : entry;
}
