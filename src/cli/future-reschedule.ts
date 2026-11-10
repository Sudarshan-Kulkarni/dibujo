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
    .description("Move a waiting future log entry to a later date")
    .argument("<ref>", "the entry's ref, from `future show` or `future due`")
    .argument("<date>", "the new date, YYYY-MM-DD, after today")
    .option("--dry-run", "print both resulting notes without writing them")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nThe entry is marked [<] and a new waiting entry is added for the new date.\nIf a run is interrupted, run the same command again to finish it.",
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
  if (result.dryRun) {
    out.info("Dry run: nothing was written.");
    ctx.stdout.write(`--- ${result.from.path} (${result.from.status})\n`);
    ctx.stdout.write(result.fromContent ?? "");
    if (result.to.path !== result.from.path) {
      ctx.stdout.write(`--- ${result.to.path} (${result.to.status})\n`);
      ctx.stdout.write(result.toContent ?? "");
    }
    return;
  }
  out.success(
    result,
    result.status === "unchanged"
      ? `Already rescheduled to ${result.to.date}. Nothing changed.`
      : [
          `Rescheduled to ${result.to.date}.`,
          `  from ${result.from.path} (${result.from.status})`,
          `  to   ${result.to.path} (${result.to.status})`,
        ],
  );
}
