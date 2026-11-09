import { isAbsolute, relative, resolve } from "node:path";
import type { VaultConfig } from "../config.js";

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

function assertInside(root: string, target: string): void {
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new Error(`Refusing to use a path outside ${root}: ${target}`);
}
