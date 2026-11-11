import { monthOf, parseMonthArg, previousMonth } from "../bujo/journal-date.js";
import { parseSummaryInput } from "../bujo/monthly-note.js";
import { DibujoError } from "../errors.js";
import { writeSummary } from "../vault/month.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface MonthSummaryOptions {
  date?: string;
  dryRun?: boolean;
  json?: boolean;
}

export const registerMonthSummary: Register = (month, ctx) => {
  month
    .command("summary")
    .description("Write the summary of a past month (JSON on stdin) to its monthly note")
    .argument("[month]", "the month as YYYY-MM (default: the month before today's)")
    .option("--date <YYYY-MM-DD>", "the day to treat as today (default: the current journal day)")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      '\nExample:\n  echo \'{"highlights":["moved into the new flat"],"themes":["settling in"],"intentions":["go to bed by 11"]}\' | dibujo month summary 2026-10\n\nTasks done and the tasks that kept moving are counted from the notes. A note that already has a summary is never changed.\nSee docs/vault-format.md for the format.',
    )
    .action((value: string | undefined, options: MonthSummaryOptions) =>
      runMonthSummary(ctx, value, options),
    );
};

export async function runMonthSummary(
  ctx: Ctx,
  value: string | undefined,
  options: MonthSummaryOptions,
): Promise<void> {
  const out = new Output(ctx, options.json === true);

  // Check this first, so an accidental run in a terminal doesn't sit waiting for input.
  if (ctx.stdinIsTTY) {
    throw new DibujoError(
      "USAGE",
      "dibujo month summary reads the summary as JSON on stdin, but stdin is a terminal.",
      'Pipe the JSON in, for example: echo \'{"highlights":["..."]}\' | dibujo month summary',
    );
  }

  const { config, date } = vaultAndDate(ctx, options.date);
  const month = value === undefined ? previousMonth(monthOf(date)) : parseMonthArg(value);
  const input = parseSummaryInput(await ctx.readStdin());
  const result = writeSummary(config, month, date, input, { dryRun: options.dryRun === true });

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun && result.content !== undefined) {
    out.info(`Dry run: ${result.path} would be ${result.status}. Nothing was written.`);
    ctx.stdout.write(result.content);
    return;
  }
  out.success(
    result,
    result.status === "unchanged"
      ? `The summary is already in ${result.path}. Nothing changed.`
      : `${result.status === "created" ? "Created" : "Added the summary to"} ${result.path}.`,
  );
}
