import { registerFutureAdd } from "./future-add.js";
import { registerFutureCancel } from "./future-cancel.js";
import { registerFutureDue } from "./future-due.js";
import { registerFutureImport } from "./future-import.js";
import { registerFutureMigrate } from "./future-migrate.js";
import { registerFutureReschedule } from "./future-reschedule.js";
import { registerFutureShow } from "./future-show.js";
import type { Register } from "./program.js";

/** The `dibujo future` command group. */
export const registerFuture: Register = (program, ctx) => {
  const future = program
    .command("future")
    .description(
      "Add to and read the future log, list due entries, and bring in, date, or cancel them",
    );
  registerFutureAdd(future, ctx);
  registerFutureShow(future, ctx);
  registerFutureDue(future, ctx);
  registerFutureMigrate(future, ctx);
  registerFutureReschedule(future, ctx);
  registerFutureCancel(future, ctx);
  registerFutureImport(future, ctx);
};
