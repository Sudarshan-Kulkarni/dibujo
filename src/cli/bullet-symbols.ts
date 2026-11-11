import type { Bullet } from "../bujo/types.js";

const TASK_SYMBOLS: Readonly<Record<NonNullable<Bullet["state"]>, string>> = {
  open: "•",
  completed: "×",
  migrated: ">",
  scheduled: "<",
  cancelled: "~",
};

const SIGNIFIER_SYMBOLS = { priority: "*", inspiration: "!" } as const;

/**
 * Bullet Journal style: signifiers in the left margin, then the bullet symbol and
 * text, then where a task came from (`↩`), when it's scheduled (`⏳`), and when an
 * event happens (`📅`).
 */
export function humanBullet(bullet: Bullet, extraIndent = 0): string {
  const margin = bullet.signifiers
    .map((s) => SIGNIFIER_SYMBOLS[s])
    .join("")
    .padEnd(2);
  const symbol =
    bullet.type === "task"
      ? TASK_SYMBOLS[bullet.state ?? "open"]
      : bullet.type === "event"
        ? "○"
        : "–";
  const suffixes = [
    bullet.origin ? `↩ ${"date" in bullet.origin ? bullet.origin.date : "future log"}` : "",
    bullet.scheduled ? `⏳ ${bullet.scheduled}` : "",
    bullet.eventDate ? `📅 ${bullet.eventDate}` : "",
    bullet.state === "cancelled" ? "(cancelled)" : "",
  ].filter((s) => s.length > 0);
  const suffix = suffixes.length > 0 ? `  ${suffixes.join("  ")}` : "";
  return `${margin}${"  ".repeat(bullet.depth + extraIndent)}${symbol} ${bullet.text}${suffix}`;
}

/** An entry as the future log commands report it, with one `date` for `⏳` (tasks) or `📅` (events). */
export interface DatedEntry {
  type: Bullet["type"];
  state?: NonNullable<Bullet["state"]>;
  signifiers: Bullet["signifiers"];
  text: string;
  depth?: number;
  date?: string;
  origin?: NonNullable<Bullet["origin"]>;
}

/** Like `humanBullet`, for an entry that has a `date` instead of `scheduled` or `eventDate`. */
export function humanEntry(entry: DatedEntry, extraIndent = 0): string {
  const { date, depth, ...rest } = entry;
  const bullet: Bullet = { ...rest, depth: depth ?? 0 };
  if (date !== undefined) {
    if (entry.type === "task") bullet.scheduled = date;
    else if (entry.type === "event") bullet.eventDate = date;
  }
  return humanBullet(bullet, extraIndent);
}
