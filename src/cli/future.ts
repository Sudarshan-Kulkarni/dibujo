import { registerFutureCancel } from "./future-cancel.js";
import { registerFutureDue } from "./future-due.js";
import { registerFutureMigrate } from "./future-migrate.js";
import { registerFutureReschedule } from "./future-reschedule.js";
import { registerFutureShow } from "./future-show.js";
import type { Register } from "./program.js";

/** The `dibujo future` command group. */
export const registerFuture: Register = (program, ctx) => {
  const future = program
    .command("future")
    .description("Read the future log, list due entries, and bring in, reschedule, or cancel them");
  registerFutureShow(future, ctx);
  registerFutureDue(future, ctx);
  registerFutureMigrate(future, ctx);
  registerFutureReschedule(future, ctx);
  registerFutureCancel(future, ctx);
};
