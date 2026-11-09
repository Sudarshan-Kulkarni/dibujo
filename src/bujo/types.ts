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
}

/** Highest nesting level the CLI writes. Deeper levels are still read. */
export const MAX_WRITE_DEPTH = 3;
