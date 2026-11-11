export const BULLET_TYPES = ["task", "event", "note"] as const;
export const TASK_STATES = ["open", "completed", "migrated", "scheduled", "cancelled"] as const;
export const SIGNIFIERS = ["priority", "inspiration"] as const;

export type BulletType = (typeof BULLET_TYPES)[number];
export type TaskState = (typeof TASK_STATES)[number];
export type Signifier = (typeof SIGNIFIERS)[number];

/** One Bullet Journal entry. `state` is set for tasks and absent for events and notes. */
export interface Bullet {
  type: BulletType;
  state?: TaskState;
  signifiers: Signifier[];
  text: string;
  /** Nesting level. 0 is top level. */
  depth: number;
  /** Tasks only: the task this one was migrated from. */
  origin?: Origin;
  /** Tasks only: Tasks-plugin scheduled date (`⏳ YYYY-MM-DD`). */
  scheduled?: string;
  /** Events only: the date the event happens on (`📅 YYYY-MM-DD`). */
  eventDate?: string;
  /** Obsidian block id (`^id`) at the end of the line, without the caret. */
  blockId?: string;
}

/** Points at a task in a daily note: the note's date and the task's block id. */
export interface DailyOrigin {
  date: string;
  blockId: string;
}

/**
 * Points at an entry in the future log note by its block id. `year` is set only when
 * the link is in the old form that pointed at a year note (`Future/2026`). dibujo
 * reads that form and never writes it.
 */
export interface FutureOrigin {
  blockId: string;
  year?: string;
}

/** Where a task came from. Narrow with `"date" in origin`. */
export type Origin = DailyOrigin | FutureOrigin;

/** Highest nesting level the CLI writes. Deeper levels are still read. */
export const MAX_WRITE_DEPTH = 3;
