import { format, parseISO } from "date-fns";
import { monthName } from "../bujo/journal-date.js";
import { reviewTasks } from "../vault/tasks.js";
import { humanBullet } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface TaskReviewOptions {
  date?: string;
  json?: boolean;
}

export const registerTaskReview: Register = (task, ctx) => {
  task
    .command("review")
    .description(
      "List open tasks from yesterday, or from the last earlier note when yesterday has none, with how many days in a row each was migrated",
    )
    .option("--date <YYYY-MM-DD>", "the day to treat as today (default: the current journal day)")
    .option("--json", "print the result as JSON")
    .action((options: TaskReviewOptions) => runTaskReview(ctx, options));
};

export function runTaskReview(ctx: Ctx, options: TaskReviewOptions): void {
  const out = new Output(ctx, options.json === true);
  const { config, date } = vaultAndDate(ctx, options.date);
  const review = reviewTasks(config, date);
  const pending = review.pendingMonth
    ? [
        `${monthName(review.pendingMonth.month)} has no monthly summary yet. Run the monthly migration.`,
      ]
    : [];

  const { source } = review;
  if (source === null) {
    out.success(review, [`No note for ${review.yesterday}, and no earlier notes.`, ...pending]);
    return;
  }
  const notice = source.isYesterday
    ? []
    : [
        `No note for ${review.yesterday}. Showing open tasks from ${format(parseISO(source.date), "EEEE")} ${source.date} instead (${source.gapDays} ${source.gapDays === 1 ? "day" : "days"} with no notes in between).`,
        "",
      ];

  if (review.tasks.length === 0) {
    out.success(review, [...notice, `No open tasks in ${source.date}'s note.`, ...pending]);
    return;
  }

  const lines = [...notice, `Open tasks from ${source.date}:`, ""];
  for (const t of review.tasks) {
    const streak = t.flagged
      ? `  (migrated ${t.streak} days in a row, since ${t.since})`
      : t.streak > 0
        ? `  (migrated ${t.streak} day${t.streak === 1 ? "" : "s"} in a row)`
        : "";
    lines.push(`${humanBullet({ ...t, type: "task", state: "open", depth: 0 })}${streak}`);
    for (const c of t.children) {
      lines.push(humanBullet({ ...c, depth: c.depth - t.depth }));
    }
    lines.push(`     ref ${t.ref}`);
  }
  if (pending.length > 0) lines.push("", ...pending);
  out.success(review, lines);
}
