import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { DibujoError } from "../errors.js";

/** Test hooks. `beforeCommit` runs after the temp file is written and before it replaces the note. */
export interface WriteHooks {
  beforeCommit?: () => void;
}

/** Errors from `link` on filesystems that don't support hard links. */
const LINK_UNSUPPORTED = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "ENOSYS"]);

/**
 * Creates a new file atomically. Fails with `NOTE_CHANGED` if the file appeared
 * after the caller checked for it, instead of overwriting it.
 */
export function writeNew(path: string, content: string, hooks: WriteHooks = {}): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = writeTemp(path, content);
  try {
    hooks.beforeCommit?.();
    try {
      // link() fails if the target exists, so it never replaces a file.
      linkSync(temp, path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (code === "EEXIST") throw changed(path);
      if (!LINK_UNSUPPORTED.has(code)) throw error;
      // No hard links here (some synced or network drives). Fall back to a checked rename.
      if (existsSync(path)) throw changed(path);
      renameSync(temp, path);
    }
  } finally {
    rmSync(temp, { force: true });
  }
}

/**
 * Replaces a file atomically, but only if it still has the content the caller
 * read. Otherwise fails with `NOTE_CHANGED` and leaves the file untouched.
 */
export function replaceIfUnchanged(
  path: string,
  original: string,
  content: string,
  hooks: WriteHooks = {},
): void {
  const temp = writeTemp(path, content);
  try {
    // Keep the note's existing permissions.
    chmodSync(temp, statSync(path).mode & 0o7777);
    hooks.beforeCommit?.();
    let current: string;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      throw changed(path);
    }
    if (current !== original) throw changed(path);
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Writes a hidden temp file next to `path` and fsyncs it. The leading dot keeps Obsidian from indexing it. */
function writeTemp(path: string, content: string): string {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  const fd = openSync(temp, "wx", 0o644);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temp, { force: true });
    throw error;
  }
  closeSync(fd);
  return temp;
}

function changed(path: string): DibujoError {
  return new DibujoError(
    "NOTE_CHANGED",
    `The note ${path} changed while dibujo was writing it. Nothing was written.`,
    "Read the note again and retry.",
  );
}
