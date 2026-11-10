import { DibujoError } from "../errors.js";
import { formatBullet } from "./bullet.js";
import { addBlockId, type LineEdit, setCheckbox } from "./edit.js";
import { type ParsedBullet, parseDailyNote, splitLines } from "./note.js";
import { type Bullet, MAX_WRITE_DEPTH } from "./types.js";

export interface MigrationOptions {
  /** Returns a new random block id. Called again if the id is already used in the note. */
  newId: () => string;
  /** Add the priority signifier to the root task's copy. */
  priority?: boolean;
  /** The dibujo folder, used for full-path origin links. */
  folder?: string;
}

export interface MigrationPlan {
  /** Edits to the source note: `[>]` and `^id` on each migrated task. */
  sourceEdits: LineEdit[];
  /** Formatted lines to append to the target note's Log, root first. */
  targetLines: string[];
  /** The root task's block id, which its copy links to. */
  rootBlockId: string;
  /** Tasks marked `[>]` by the source edits. */
  migrated: number;
}

const MAX_ID_ATTEMPTS = 100;

/**
 * Plans the migration of the task at `rootLine` and everything nested under it.
 *
 * - Open tasks get `[>]` and a block id, and are copied as open tasks that link back.
 * - Tasks already `[>]` with a block id (from an interrupted run) are copied again.
 * - Events and notes are copied as they are.
 * - Any other task stays behind, and so does everything nested under it.
 */
export function planMigration(
  source: string,
  sourceDate: string,
  rootLine: number,
  options: MigrationOptions,
): MigrationPlan {
  const { lines } = splitLines(source);
  const bullets = parseDailyNote(source).bullets;
  const rootIndex = bullets.findIndex((b) => b.line === rootLine);
  const root = bullets[rootIndex];
  if (root?.type !== "task") throw new Error("planMigration needs a task line");
  // A root that's already `[>]` with a block id means an earlier run wrote the
  // source note but not the target. Only then are `[>]` children copied again.
  const resuming = root.state === "migrated" && root.blockId !== undefined;
  const movesForward = (b: Bullet): boolean =>
    b.state === "open" || (resuming && b.state === "migrated" && b.blockId !== undefined);
  if (!movesForward(root)) {
    throw new DibujoError(
      "TASK_NOT_OPEN",
      `The task on line ${rootLine} is ${root.state ?? "open"}, so it can't be migrated.`,
      "Only open tasks can be migrated.",
    );
  }

  const used = new Set(bullets.flatMap((b) => (b.blockId ? [b.blockId] : [])));
  const idFor = (b: ParsedBullet): string => {
    if (b.blockId) return b.blockId;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const id = options.newId();
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error("could not generate an unused block id");
  };

  const sourceEdits: LineEdit[] = [];
  const targetLines: string[] = [];
  let rootBlockId = "";
  let migrated = 0;
  let previousDepth = -1;
  let skipBelow: number | null = null;

  for (let i = rootIndex; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b) break;
    if (i > rootIndex && b.depth <= root.depth) break;
    if (skipBelow !== null) {
      if (b.depth > skipBelow) continue;
      skipBelow = null;
    }

    let copy: Bullet;
    if (b.type === "task") {
      if (!movesForward(b)) {
        skipBelow = b.depth;
        continue;
      }
      const id = idFor(b);
      if (i === rootIndex) rootBlockId = id;
      if (b.state === "open") {
        const before = lines[b.line - 1] ?? "";
        sourceEdits.push({
          line: b.line,
          before,
          after: addBlockId(setCheckbox(before, "migrated"), id),
        });
        migrated++;
      }
      copy = {
        type: "task",
        state: "open",
        signifiers: [...b.signifiers],
        text: b.text,
        depth: 0,
        origin: { date: sourceDate, blockId: id },
      };
      if (i === rootIndex && options.priority && !copy.signifiers.includes("priority")) {
        copy.signifiers.push("priority");
      }
    } else {
      copy = { type: b.type, signifiers: [...b.signifiers], text: b.text, depth: 0 };
    }

    // Re-base on the root, never jump more than one level, and cap at the writable depth.
    copy.depth = Math.min(b.depth - root.depth, previousDepth + 1, MAX_WRITE_DEPTH);
    previousDepth = copy.depth;
    targetLines.push(
      formatBullet(copy, options.folder === undefined ? {} : { folder: options.folder }),
    );
  }

  return { sourceEdits, targetLines, rootBlockId, migrated };
}
