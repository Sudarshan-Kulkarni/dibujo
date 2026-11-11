import { readdirSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { VaultConfig } from "../config.js";
import { DibujoError } from "../errors.js";

/** The dibujo folder inside the vault, for example `<vault>/Bujo`. */
export function dibujoRoot(config: VaultConfig): string {
  const root = resolve(config.vaultPath, config.folder);
  assertInside(resolve(config.vaultPath), root);
  return root;
}

/**
 * Resolves a path inside the dibujo folder. Throws if the result would land
 * outside it, so no caller can write elsewhere in the filesystem.
 */
export function resolveInVault(config: VaultConfig, ...segments: string[]): string {
  const root = dibujoRoot(config);
  const target = resolve(root, ...segments);
  assertInside(root, target);
  return target;
}

export function dailyNotePath(config: VaultConfig, date: string): string {
  return resolveInVault(config, "Daily", `${date}.md`);
}

/** The future log: one note, `Future.md`, in the dibujo folder. */
export function futureNotePath(config: VaultConfig): string {
  return resolveInVault(config, "Future.md");
}

const LEGACY_FUTURE_FILE = /^\d{4}\.md$/;

/**
 * The old year notes (`Future/YYYY.md`) written by the earlier year-based future log,
 * oldest year first. A missing folder gives an empty list.
 */
export function legacyFutureNotePaths(config: VaultConfig): string[] {
  let names: string[];
  try {
    names = readdirSync(resolveInVault(config, "Future"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
  return names
    .filter((name) => LEGACY_FUTURE_FILE.test(name))
    .sort()
    .map((name) => resolveInVault(config, "Future", name));
}

const UNSAFE_LINK_CHARS = /[[\]|#^]/;

/** Refuses a folder name that would break the Obsidian links dibujo writes. Call before any write. */
export function assertLinkSafeFolder(config: VaultConfig): void {
  if (!UNSAFE_LINK_CHARS.test(config.folder)) return;
  throw new DibujoError(
    "CONFIG_INVALID",
    `The dibujo folder "${config.folder}" contains a character that breaks Obsidian links ([ ] | # ^).`,
    "Rename the folder and run `dibujo init --force --folder <name>`. Nothing was written.",
  );
}

function assertInside(root: string, target: string): void {
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new Error(`Refusing to use a path outside ${root}: ${target}`);
}
