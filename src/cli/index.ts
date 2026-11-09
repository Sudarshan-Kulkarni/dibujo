#!/usr/bin/env node
import { processCtx } from "./context.js";
import { runCli } from "./program.js";
import { registers } from "./registers.js";

process.exitCode = await runCli(process.argv.slice(2), processCtx(), registers);
