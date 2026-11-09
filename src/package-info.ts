import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "digi-bujo";

export interface PackageInfo {
  root: string;
  name: string;
  version: string;
}

/**
 * Finds the digi-bujo package root by walking up from this module.
 * Works from both `src/` (tsx) and `dist/` (published build).
 */
export function findPackage(fromUrl: string = import.meta.url): PackageInfo {
  let dir = dirname(fileURLToPath(fromUrl));
  while (true) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const parsed: unknown = JSON.parse(readFileSync(candidate, "utf8"));
      if (isPackageJson(parsed) && parsed.name === PACKAGE_NAME) {
        return { root: dir, name: parsed.name, version: parsed.version };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find the ${PACKAGE_NAME} package.json above ${fromUrl}`);
    }
    dir = parent;
  }
}

function isPackageJson(value: unknown): value is { name: string; version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).name === "string" &&
    typeof (value as Record<string, unknown>).version === "string"
  );
}
