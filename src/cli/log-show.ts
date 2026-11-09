import type { Bullet } from "../bujo/types.js";
import { readDailyNote } from "../vault/daily.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface LogShowOptions {
  date?: string;
  json?: boolean;
}

export const registerLogShow: Register = (log, ctx) => {
  log
    .command("show")
    .description("Show the bullets in a daily note")
    .option("--date <YYYY-MM-DD>", "the day to show (default: the current journal day)")
    .option("--json", "print the result as JSON")
    .action((options: LogShowOptions) => runLogShow(ctx, options));
};

export function runLogShow(ctx: Ctx, options: LogShowOptions): void {
  const out = new Output(ctx, options.json === true);
  const { config, date } = vaultAndDate(ctx, options.date);
  const note = readDailyNote(config, date);

  if (!note.exists) {
    out.success(note, `No note for ${date} yet (${note.path}).`);
    return;
  }

  const lines = [`${date}  ${note.path}`, ""];
  if (note.bullets.length === 0) lines.push("(no bullets yet)");
  for (const bullet of note.bullets) lines.push(humanBullet(bullet));
  if (note.unrecognized.length > 0) {
    lines.push("", `Lines in the Log that aren't bullets (kept as they are):`);
    for (const u of note.unrecognized) lines.push(`  line ${u.line}: ${u.text.trim()}`);
  }
  out.success(note, lines);
}

const TASK_SYMBOLS: Readonly<Record<NonNullable<Bullet["state"]>, string>> = {
  open: "•",
  completed: "×",
  migrated: ">",
  scheduled: "<",
  cancelled: "~",
};

const SIGNIFIER_SYMBOLS = { priority: "*", inspiration: "!" } as const;

/** Bullet Journal style: signifiers in the left margin, then the bullet symbol and text. */
function humanBullet(bullet: Bullet): string {
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
  const suffix = bullet.state === "cancelled" ? "  (cancelled)" : "";
  return `${margin}${"  ".repeat(bullet.depth)}${symbol} ${bullet.text}${suffix}`;
}
