import { replaceIfUnchanged, type WriteHooks, writeNew } from "./atomic-write.js";

/** One note to write. `original` is what the caller read, or `null` when the note doesn't exist yet. */
export interface PlannedWrite {
  path: string;
  original: string | null;
  content: string;
  hooks?: WriteHooks;
}

export type WriteStatus = "created" | "updated" | "unchanged";

export interface CommitOptions {
  /**
   * Test hook. Called with the index of each write after it was handled, so a test
   * can throw to simulate a crash between two writes.
   */
  afterWrite?: (index: number) => void;
  /** Test hooks for each write, by index. A write's own `hooks` take priority. */
  writeHooks?: readonly (WriteHooks | undefined)[];
}

/** What `commitWrites` would report for a write, without writing anything. */
export function writeStatus(write: PlannedWrite): WriteStatus {
  if (write.original === null) return "created";
  return write.content === write.original ? "unchanged" : "updated";
}

/**
 * Writes the notes in order and returns each one's status. A new note goes through
 * `writeNew`, a changed one through `replaceIfUnchanged`, and an unchanged one is
 * skipped. If a write fails, the later ones are not attempted, and the notes written
 * so far stay as they are.
 */
export function commitWrites(
  writes: readonly PlannedWrite[],
  options: CommitOptions = {},
): WriteStatus[] {
  return writes.map((write, index) => {
    const status = writeStatus(write);
    const hooks = write.hooks ?? options.writeHooks?.[index];
    if (status === "created") writeNew(write.path, write.content, hooks);
    else if (status === "updated" && write.original !== null) {
      replaceIfUnchanged(write.path, write.original, write.content, hooks);
    }
    options.afterWrite?.(index);
    return status;
  });
}
