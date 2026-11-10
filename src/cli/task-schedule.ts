import { loadConfig, requireVault } from "../config.js";
import { scheduleTask } from "../vault/tasks.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface TaskScheduleOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerTaskSchedule: Register = (task, ctx) => {
  task
    .command("schedule")
    .description("Mark a task scheduled [<], set its ⏳ date, and add it to the future log")
    .argument("<ref>", "the task's ref, from `task review` or `log show --json`")
    .argument("<date>", "the date it's scheduled for, YYYY-MM-DD, after the note's date")
    .option("--dry-run", "print both resulting notes without writing them")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nAlso writes a waiting entry for the date into the future log (Future/<year>.md),\nso `dibujo future due` lists the task when the date arrives.\nIf a run is interrupted, run the same command again to finish it.",
    )
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

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun) {
    out.info("Dry run: nothing was written.");
    ctx.stdout.write(`--- ${result.path} (${result.status})\n`);
    ctx.stdout.write(result.content ?? "");
    ctx.stdout.write(`--- ${result.future.path} (${result.future.status})\n`);
    ctx.stdout.write(result.futureContent ?? "");
    return;
  }
  const scheduled = result.scheduled ?? date;
  out.success(result, [
    result.status === "updated"
      ? `Task scheduled for ${scheduled} in ${result.path}.`
      : `The task is already scheduled for ${scheduled}.`,
    result.future.action === "unchanged"
      ? `The future log already has it (${result.future.path}).`
      : `Future log: ${result.future.action === "added" ? "added an entry" : "moved the entry"} in ${result.future.path} (${result.future.status}).`,
  ]);
}
