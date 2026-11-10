import { loadConfig, requireVault } from "../config.js";
import { scheduleTask } from "../vault/tasks.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { printEdit } from "./task-set.js";

interface TaskScheduleOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerTaskSchedule: Register = (task, ctx) => {
  task
    .command("schedule")
    .description("Mark a task scheduled [<] and set its ⏳ date")
    .argument("<ref>", "the task's ref, from `task review` or `log show --json`")
    .argument("<date>", "the date it's scheduled for, YYYY-MM-DD, after the note's date")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .action((ref: string, date: string, options: TaskScheduleOptions) =>
      runTaskSchedule(ctx, ref, date, options),
    );
};

export function runTaskSchedule(
  ctx: Ctx,
  ref: string,
  date: string,
  options: TaskScheduleOptions,
): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = scheduleTask(config, ref, date, { dryRun: options.dryRun === true });
  printEdit(ctx, out, result, `scheduled for ${result.scheduled ?? date}`);
}
