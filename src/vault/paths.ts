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

export function futureNotePath(config: VaultConfig, year: string): string {
  return resolveInVault(config, "Future", `${year}.md`);
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
