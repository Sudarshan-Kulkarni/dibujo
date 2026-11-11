import type { FutureBullet } from "./future.js";
import type { ParsedBullet } from "./note.js";
import type { TaskState } from "./types.js";

/** One daily note of the month, parsed. */
export interface MonthNote {
  date: string;
  bullets: readonly ParsedBullet[];
}

/** The number of tasks in each state. */
export interface TaskCounts {
  completed: number;
  cancelled: number;
  migrated: number;
  scheduled: number;
  open: number;
}

/** A task that was migrated or scheduled many times during the month. */
export interface MovingTask {
  /** The text of the last copy in the month. */
  text: string;
  /** How many times the task was migrated or scheduled out of a note in the month. */
  moves: number;
  /** The date of the earliest copy in the month. */
  firstDate: string;
  /** The date of the last copy in the month. */
  lastDate: string;
  /** The state of the last copy in the month. */
  state: TaskState;
}

/**
 * Counts every task in the notes by state, nested tasks included. A task that was
 * migrated several times and then completed has one completed copy, so it counts once there.
 */
export function countTasks(notes: readonly MonthNote[]): TaskCounts {
  const counts: TaskCounts = { completed: 0, cancelled: 0, migrated: 0, scheduled: 0, open: 0 };
  for (const note of notes) {
    for (const bullet of note.bullets) {
      if (bullet.type === "task") counts[bullet.state ?? "open"]++;
    }
  }
  return counts;
}

interface Node {
  date: string;
  bullet: ParsedBullet;
  /** True when some bullet above it, at a lower depth, is a task. */
  nested: boolean;
}

/**
 * Finds the tasks that moved at least `threshold` times during the month, following
 * origin links between the month's notes. Only moves out of a note in the month count,
 * and the days don't need to be in a row. A trip through the future log joins the chain
 * and counts as one move. A broken link ends a chain without an error.
 */
export function movingTasks(
  notes: readonly MonthNote[],
  future: readonly FutureBullet[],
  threshold: number,
): MovingTask[] {
  const nodes: Node[] = [];
  const byId = new Map<string, Node>();
  for (const note of notes) {
    note.bullets.forEach((bullet, index) => {
      if (bullet.type !== "task") return;
      const node: Node = { date: note.date, bullet, nested: hasTaskAncestor(note.bullets, index) };
      nodes.push(node);
      if (bullet.blockId !== undefined) {
        const key = dailyKey(note.date, bullet.blockId);
        if (!byId.has(key)) byId.set(key, node);
      }
    });
  }

  const futureById = new Map<string, FutureBullet>();
  for (const entry of future) {
    if (entry.type === "task" && entry.blockId !== undefined && !futureById.has(entry.blockId)) {
      futureById.set(entry.blockId, entry);
    }
  }

  const predecessorOf = (node: Node): Node | undefined => {
    const origin = node.bullet.origin;
    if (!origin) return undefined;
    if ("date" in origin) {
      const from = byId.get(dailyKey(origin.date, origin.blockId));
      return from?.bullet.state === "migrated" ? from : undefined;
    }
    // An old-form link (with a year) points at an old year note, not at Future.md.
    if (origin.year !== undefined) return undefined;
    const entry = futureById.get(origin.blockId);
    if (entry?.state !== "migrated" || !entry.origin || !("date" in entry.origin)) return undefined;
    const from = byId.get(dailyKey(entry.origin.date, entry.origin.blockId));
    return from?.bullet.state === "scheduled" ? from : undefined;
  };

  const predecessors = new Map<Node, Node>();
  const hasSuccessor = new Set<Node>();
  for (const node of nodes) {
    const from = predecessorOf(node);
    if (!from) continue;
    predecessors.set(node, from);
    hasSuccessor.add(from);
  }

  const result: MovingTask[] = [];
  for (const head of nodes) {
    if (hasSuccessor.has(head) || head.nested) continue;
    const visited = new Set<Node>();
    let moves = 0;
    let firstDate = head.date;
    for (
      let node: Node | undefined = head;
      node && !visited.has(node);
      node = predecessors.get(node)
    ) {
      visited.add(node);
      if (node.bullet.state === "migrated" || node.bullet.state === "scheduled") moves++;
      if (node.date < firstDate) firstDate = node.date;
    }
    if (moves < threshold) continue;
    result.push({
      text: head.bullet.text,
      moves,
      firstDate,
      lastDate: head.date,
      state: head.bullet.state ?? "open",
    });
  }

  return result.sort(
    (a, b) =>
      b.moves - a.moves || a.firstDate.localeCompare(b.firstDate) || a.text.localeCompare(b.text),
  );
}

function dailyKey(date: string, blockId: string): string {
  return `${date}#${blockId}`;
}

/** True when walking up from the bullet at `index` reaches a task. */
function hasTaskAncestor(bullets: readonly ParsedBullet[], index: number): boolean {
  let depth = bullets[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    const b = bullets[i];
    if (!b || b.depth >= depth) continue;
    depth = b.depth;
    if (b.type === "task") return true;
  }
  return false;
}
