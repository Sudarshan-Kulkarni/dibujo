import { registerMonthShow } from "./month-show.js";
import { registerMonthSummary } from "./month-summary.js";
import type { Register } from "./program.js";

/** The `dibujo month` command group. */
export const registerMonth: Register = (program, ctx) => {
  const month = program.command("month").description("Read a past month and write its summary");
  registerMonthShow(month, ctx);
  registerMonthSummary(month, ctx);
};
