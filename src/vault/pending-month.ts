import { monthOf, previousMonth } from "../bujo/journal-date.js";
import { hasSummary } from "../bujo/monthly-note.js";
import { FORMAT_VERSION, findFrontmatterEnd, readVersion, splitLines } from "../bujo/note.js";
import type { VaultConfig } from "../config.js";
import { readIfExists } from "./daily.js";
import { dailyNoteDatesIn, monthlyNotePath } from "./paths.js";

/**
 * The past month, when it has at least one daily note and no monthly summary yet.
 * It lists one folder and reads at most one note. It never throws: a monthly note it
 * can't read counts as not pending, so `task review` keeps working.
 *
 * This lives apart from `month.ts` so that `tasks.ts` can use it without an import cycle
 * (`month.ts` imports from `tasks.ts`).
 */
export function pendingMonth(
  config: VaultConfig,
  today: string,
): { month: string; path: string } | null {
  try {
    const month = previousMonth(monthOf(today));
    if (dailyNoteDatesIn(config, month).length === 0) return null;
    const path = monthlyNotePath(config, month);
    const content = readIfExists(path);
    if (content !== null && (!isReadable(content) || hasSummary(content))) return null;
    return { month, path };
  } catch {
    return null;
  }
}

/** The `dibujo` format version in a note's frontmatter. `null` when it is invalid. */
export function versionOf(content: string): number | null {
  const lines = splitLines(content).lines;
  return readVersion(lines, findFrontmatterEnd(lines));
}

/** True when this dibujo supports the note's format version. */
export function isReadable(content: string): boolean {
  const version = versionOf(content);
  return version !== null && version <= FORMAT_VERSION;
}
