import type { Register } from "./program.js";
import { registerTaskMigrate } from "./task-migrate.js";
import { registerTaskReview } from "./task-review.js";
import { registerTaskSchedule } from "./task-schedule.js";
import { registerTaskSet } from "./task-set.js";

/** The `dibujo task` command group. */
export const registerTask: Register = (program, ctx) => {
  const task = program
    .command("task")
    .description("Review tasks and change their state (migrate, schedule, complete, cancel)");
  registerTaskReview(task, ctx);
  registerTaskSet(task, ctx);
  registerTaskSchedule(task, ctx);
  registerTaskMigrate(task, ctx);
};
