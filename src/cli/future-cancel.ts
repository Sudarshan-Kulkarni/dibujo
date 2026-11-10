import { loadConfig, requireVault } from "../config.js";
import { cancelEntry } from "../vault/future.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface FutureCancelOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerFutureCancel: Register = (future, ctx) => {
  future
    .command("cancel")
    .description("Cancel a waiting future log entry")
    .argument("<ref>", "the entry's ref, from `future show` or `future due`")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .action((ref: string, options: FutureCancelOptions) => runFutureCancel(ctx, ref, options));
};

export function runFutureCancel(ctx: Ctx, ref: string, options: FutureCancelOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = cancelEntry(config, ref, { dryRun: options.dryRun === true });

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
    result.status === "updated"
      ? `Entry cancelled in ${result.path}.`
      : "The entry is already cancelled. Nothing changed.",
  );
}
