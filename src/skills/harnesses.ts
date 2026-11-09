import { join } from "node:path";

/** An agent tool that loads Agent Skills from a folder. */
export interface Harness {
  name: string;
  label: string;
  /** The harness's global skills folder. */
  skillsDir(home: string): string;
}

/** Supported harnesses. Adding one is a new entry here; the installer needs no changes. */
export const HARNESSES: readonly Harness[] = [
  { name: "kiro", label: "Kiro", skillsDir: (home) => join(home, ".kiro", "skills") },
  // Planned. Antigravity's docs disagree on the global folder; this is the one all
  // three Antigravity apps were found to load. Check it before enabling.
  // { name: "agy", label: "Antigravity", skillsDir: (home) => join(home, ".gemini", "config", "skills") },
];

export const DEFAULT_HARNESS = "kiro";

export function findHarness(name: string): Harness | undefined {
  return HARNESSES.find((h) => h.name === name);
}
