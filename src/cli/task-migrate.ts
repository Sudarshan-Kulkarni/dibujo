import { loadConfig, requireVault } from "../config.js";
import { migrateTask } from "../vault/tasks.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface TaskMigrateOptions {
  to?: string;
  priority?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export const registerTaskMigrate: Register = (task, ctx) => {
  task
    .command("migrate")
    .description("Migrate a task, and what's nested under it, to another day")
    .argument("<ref>", "the task's ref, from `task review` or `log show --json`")
    .option("--to <YYYY-MM-DD>", "the day to migrate to (default: the current journal day)")
    .option("--priority", "mark the migrated copy as a priority")
    .option("--dry-run", "print both resulting notes without writing them")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nThe task is marked [>] where it was, and copied as an open task that links back to it.\nIf a run is interrupted, run the same command again to finish it.",
    )
    .action((ref: string, options: TaskMigrateOptions) => runTaskMigrate(ctx, ref, options));
};

export function runTaskMigrate(ctx: Ctx, ref: string, options: TaskMigrateOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = migrateTask(config, ref, {
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
    out.info(`Dry run: nothing was written.`);
    ctx.stdout.write(`--- ${result.source.path} (${result.source.status})\n`);
    ctx.stdout.write(result.sourceContent ?? "");
    ctx.stdout.write(`--- ${result.target.path} (${result.target.status})\n`);
    ctx.stdout.write(result.targetContent ?? "");
    return;
  }
  out.success(
    result,
    result.status === "unchanged"
      ? `Already migrated to ${result.target.date}. Nothing changed.`
      : [
          `Migrated to ${result.target.date}: ${result.copied} bullet${result.copied === 1 ? "" : "s"} copied.`,
          `  from ${result.source.path} (${result.source.status})`,
          `  to   ${result.target.path} (${result.target.status})`,
        ],
  );
}
