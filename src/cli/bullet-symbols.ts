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
 * text, then where a task came from (`↩`) and when it's scheduled (`⏳`).
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
    bullet.origin
      ? `↩ ${"date" in bullet.origin ? bullet.origin.date : `future log ${bullet.origin.year}`}`
      : "",
    bullet.scheduled ? `⏳ ${bullet.scheduled}` : "",
    bullet.state === "cancelled" ? "(cancelled)" : "",
  ].filter((s) => s.length > 0);
  const suffix = suffixes.length > 0 ? `  ${suffixes.join("  ")}` : "";
  return `${margin}${"  ".repeat(bullet.depth + extraIndent)}${symbol} ${bullet.text}${suffix}`;
}
