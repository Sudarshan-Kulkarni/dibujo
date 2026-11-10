import { Argument } from "commander";
import { TASK_STATES, type TaskState } from "../bujo/types.js";
import { loadConfig, requireVault } from "../config.js";
import { setTaskState, type TaskEditResult } from "../vault/tasks.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface TaskSetOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerTaskSet: Register = (task, ctx) => {
  task
    .command("set")
    .description("Change a task's checkbox, and nothing else on its line")
    .argument("<ref>", "the task's ref, from `task review` or `log show --json`")
    .addArgument(new Argument("<state>", "the new state").choices(TASK_STATES))
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\n`set migrated` only marks the task [>]. Use `dibujo task migrate` to copy it to another day.\n`set scheduled` doesn't add a date. Use `dibujo task schedule` for that.",
    )
    .action((ref: string, state: TaskState, options: TaskSetOptions) =>
      runTaskSet(ctx, ref, state, options),
    );
};

export function runTaskSet(ctx: Ctx, ref: string, state: TaskState, options: TaskSetOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = setTaskState(config, ref, state, { dryRun: options.dryRun === true });
  printEdit(ctx, out, result, `set to ${state}`);
}

/** Shared human output for `task set` and `task schedule`. */
export function printEdit(ctx: Ctx, out: Output, result: TaskEditResult, what: string): void {
  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun && result.content !== undefined) {
    out.info(`Dry run: the task would be ${result.status}. Nothing was written.`);
    ctx.stdout.write(result.content);
    return;
  }
  out.success(
    result,
    result.status === "updated"
      ? `Task ${what} in ${result.path}.`
      : `The task is already ${what.replace(/^set to /, "")}. Nothing changed.`,
  );
}
