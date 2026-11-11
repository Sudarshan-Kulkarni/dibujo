import { loadConfig, requireVault } from "../config.js";
import { rescheduleEntry } from "../vault/future.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface FutureRescheduleOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerFutureReschedule: Register = (future, ctx) => {
  future
    .command("reschedule")
    .description("Set or change the date of a waiting future log task, in place")
    .argument("<ref>", "the entry's ref, from `future show` or `future due`")
    .argument("<date>", "the date, YYYY-MM-DD, after today")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nThe ⏳ date on the entry is set or changed where it is. The entry stays waiting, and no second\nentry is added. This works on entries that have no date yet.",
    )
    .action((ref: string, date: string, options: FutureRescheduleOptions) =>
      runFutureReschedule(ctx, ref, date, options),
    );
};

export function runFutureReschedule(
  ctx: Ctx,
  ref: string,
  date: string,
  options: FutureRescheduleOptions,
): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = rescheduleEntry(config, ref, date, {
    now: ctx.now(),
    dryRun: options.dryRun === true,
  });

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun && result.content !== undefined) {
    out.info(`Dry run: the entry would be ${result.status}. Nothing was written.`);
    ctx.stdout.write(result.content);
    return;
  }
  out.success(
    result,
    result.status === "unchanged"
      ? `The entry is already dated ${result.scheduled}. Nothing changed.`
      : `Entry dated ${result.scheduled} in ${result.path}.`,
  );
}
