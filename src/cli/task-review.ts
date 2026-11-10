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
    .description("List yesterday's open tasks, with how many days in a row each was migrated")
    .option("--date <YYYY-MM-DD>", "the day to treat as today (default: the current journal day)")
    .option("--json", "print the result as JSON")
    .action((options: TaskReviewOptions) => runTaskReview(ctx, options));
};

export function runTaskReview(ctx: Ctx, options: TaskReviewOptions): void {
  const out = new Output(ctx, options.json === true);
  const { config, date } = vaultAndDate(ctx, options.date);
  const review = reviewTasks(config, date);

  if (review.tasks.length === 0) {
    out.success(
      review,
      review.exists
        ? `No open tasks in ${review.yesterday}'s note.`
        : `No note for ${review.yesterday} (${review.path}).`,
    );
    return;
  }

  const lines = [`Open tasks from ${review.yesterday}:`, ""];
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
  out.success(review, lines);
}
