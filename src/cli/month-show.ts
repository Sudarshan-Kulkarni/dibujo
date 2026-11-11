import { monthName, monthOf, parseMonthArg, previousMonth } from "../bujo/journal-date.js";
import { readMonth } from "../vault/month.js";
import { humanBullet } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface MonthShowOptions {
  date?: string;
  json?: boolean;
}

export const registerMonthShow: Register = (month, ctx) => {
  month
    .command("show")
    .description("Read a past month: its notes, leftover tasks, counts, and moving tasks")
    .argument("[month]", "the month as YYYY-MM (default: the month before today's)")
    .option("--date <YYYY-MM-DD>", "the day to treat as today (default: the current journal day)")
    .option("--json", "print the result as JSON, with every bullet of the month")
    .addHelpText("after", "\nIt writes nothing. A month that isn't over yet is refused.")
    .action((value: string | undefined, options: MonthShowOptions) =>
      runMonthShow(ctx, value, options),
    );
};

export function runMonthShow(ctx: Ctx, value: string | undefined, options: MonthShowOptions): void {
  const out = new Output(ctx, options.json === true);
  const { config, date } = vaultAndDate(ctx, options.date);
  const month = value === undefined ? previousMonth(monthOf(date)) : parseMonthArg(value);
  const view = readMonth(config, month, date);

  const c = view.counts;
  const lines = [
    `${monthName(month)}: ${view.notes.length} daily note${view.notes.length === 1 ? "" : "s"}`,
    `Tasks: ${c.completed} done, ${c.cancelled} cancelled, ${c.migrated} migrated, ${c.scheduled} scheduled, ${c.open} open`,
  ];
  for (const path of view.skipped) lines.push(`Skipped (unsupported format version): ${path}`);

  lines.push("", "Tasks that kept moving:");
  if (view.moving.length === 0) lines.push(`  none (${view.flagAfterDays} or more moves)`);
  for (const m of view.moving) {
    lines.push(`  ${m.text} (moved ${m.moves} time${m.moves === 1 ? "" : "s"})`);
  }

  lines.push("", "Leftover tasks:");
  if (view.leftovers.length === 0) lines.push("  none");
  for (const t of view.leftovers) {
    lines.push(`  ${t.date}`);
    lines.push(humanBullet({ ...t, type: "task", state: "open", depth: 0 }, 1));
    for (const child of t.children) {
      lines.push(humanBullet({ ...child, depth: child.depth - t.depth }, 1));
    }
    lines.push(`       ref ${t.ref}`);
  }

  lines.push(
    "",
    view.summary.hasSummary
      ? `Summary: written (${view.summary.path})`
      : "Summary: not written yet",
  );
  out.success(view, lines);
}
