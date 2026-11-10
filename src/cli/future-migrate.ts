import { loadConfig, requireVault } from "../config.js";
import { migrateEntry } from "../vault/future.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface FutureMigrateOptions {
  to?: string;
  priority?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export const registerFutureMigrate: Register = (future, ctx) => {
  future
    .command("migrate")
    .description("Bring a waiting future log entry into a daily note")
    .argument("<ref>", "the entry's ref, from `future show` or `future due`")
    .option("--to <YYYY-MM-DD>", "the day to bring it into (default: the current journal day)")
    .option("--priority", "mark the new task as a priority")
    .option("--dry-run", "print both resulting notes without writing them")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nThe entry is marked [>] and copied as an open task that links back to it.\nIf a run is interrupted, run the same command again to finish it.",
    )
    .action((ref: string, options: FutureMigrateOptions) => runFutureMigrate(ctx, ref, options));
};

export function runFutureMigrate(ctx: Ctx, ref: string, options: FutureMigrateOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = migrateEntry(config, ref, {
    now: ctx.now(),
    priority: options.priority === true,
    dryRun: options.dryRun === true,
    ...(options.to === undefined ? {} : { to: options.to }),
  });

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun) {
    out.info("Dry run: nothing was written.");
    ctx.stdout.write(`--- ${result.source.path} (${result.source.status})\n`);
    ctx.stdout.write(result.sourceContent ?? "");
    ctx.stdout.write(`--- ${result.target.path} (${result.target.status})\n`);
    ctx.stdout.write(result.targetContent ?? "");
    return;
  }
  out.success(
    result,
    result.status === "unchanged"
      ? `Already brought into ${result.target.date}. Nothing changed.`
      : [
          `Brought into ${result.target.date}.`,
          `  from ${result.source.path} (${result.source.status})`,
          `  to   ${result.target.path} (${result.target.status})`,
        ],
  );
}
