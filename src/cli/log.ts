import { registerLogAdd } from "./log-add.js";
import { registerLogShow } from "./log-show.js";
import type { Register } from "./program.js";

/** The `dibujo log` command group. */
export const registerLog: Register = (program, ctx) => {
  const log = program.command("log").description("Read and write daily log entries");
  registerLogShow(log, ctx);
  registerLogAdd(log, ctx);
};
