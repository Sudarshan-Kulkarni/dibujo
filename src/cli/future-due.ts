import { dueEntriesFor } from "../vault/future.js";
import { humanBullet } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface FutureDueOptions {
  date?: string;
  json?: boolean;
}

export const registerFutureDue: Register = (future, ctx) => {
  future
    .command("due")
    .description("List waiting future log entries whose ⏳ date is today or earlier")
    .option("--date <YYYY-MM-DD>", "the day to treat as today (default: the current journal day)")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nAn entry stays in this list every day until it is brought in, rescheduled, or cancelled.",
    )
    .action((options: FutureDueOptions) => runFutureDue(ctx, options));
};

export function runFutureDue(ctx: Ctx, options: FutureDueOptions): void {
  const out = new Output(ctx, options.json === true);
  const { config, date } = vaultAndDate(ctx, options.date);
  const due = dueEntriesFor(config, date);

  if (due.entries.length === 0) {
    out.success(due, "Nothing is due in the future log.");
    return;
  }
  const lines = [`Due in the future log on ${date}:`, ""];
  for (const e of due.entries) {
    const overdue =
      e.daysOverdue > 0 ? `  (${e.daysOverdue} day${e.daysOverdue === 1 ? "" : "s"} overdue)` : "";
    const origin = e.scheduledFrom ? { origin: { date: e.scheduledFrom, blockId: "" } } : {};
    const bullet = humanBullet({
      type: "task",
      state: "open",
      signifiers: e.signifiers,
      text: e.text,
      depth: 0,
      scheduled: e.scheduled,
      ...origin,
    });
    lines.push(`${bullet}${overdue}`, `     ref ${e.ref}`);
  }
  out.success(due, lines);
}
