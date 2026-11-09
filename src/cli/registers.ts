import { registerConfigShow } from "./config-show.js";
import { registerInit } from "./init.js";
import type { Register } from "./program.js";

/** Every command the CLI exposes. Add new command modules here. */
export const registers: readonly Register[] = [registerInit, registerConfigShow];
