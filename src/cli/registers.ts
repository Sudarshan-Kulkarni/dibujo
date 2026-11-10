import { registerConfigShow } from "./config-show.js";
import { registerInit } from "./init.js";
import { registerLog } from "./log.js";
import type { Register } from "./program.js";
import { registerSkills } from "./skills-install.js";
import { registerTask } from "./task.js";

/** Every command the CLI exposes. Add new command modules here. */
export const registers: readonly Register[] = [
  registerInit,
  registerConfigShow,
  registerLog,
  registerTask,
  registerSkills,
];
