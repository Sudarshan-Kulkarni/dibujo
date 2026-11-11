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
    .description("Mark a task scheduled [<] and add it to the future log, with a date or without")
    .argument("<ref>", "the task's ref, from `task review` or `log show --json`")
    .argument("[date]", "the date it's scheduled for, YYYY-MM-DD, after the note's date (optional)")
    .option("--dry-run", "print both resulting notes without writing them")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nAlso writes a waiting entry into the future log (Future.md). With a date, the task gets a\n⏳ date and `dibujo future due` lists the entry when the date arrives. Without one, the task\nis moved to the future log undated. Scheduling a task again with another date changes both\ndates in place.\nIf a run is interrupted, run the same command again to finish it.",
    )
    .action((ref: string, date: string | undefined, options: TaskScheduleOptions) =>
      runTaskSchedule(ctx, ref, date, options),
    );
};

export function runTaskSchedule(
  ctx: Ctx,
  ref: string,
  date: string | undefined,
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
  const on = result.scheduled === undefined ? "" : ` for ${result.scheduled}`;
  const futureLine = {
    added: `Future log: added an entry in ${result.future.path} (${result.future.status}).`,
    rescheduled: `Future log: changed the date of the entry in ${result.future.path}.`,
    unchanged: `The future log already has it (${result.future.path}).`,
  }[result.future.action];
  out.success(result, [
    result.status === "updated"
      ? `Task scheduled${on} in ${result.path}.`
      : `The task is already scheduled${on}.`,
    futureLine,
  ]);
}
