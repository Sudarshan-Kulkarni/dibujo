import { loadConfig } from "../config.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface ConfigShowOptions {
  json?: boolean;
}

export const registerConfigShow: Register = (program, ctx) => {
  program
    .command("config")
    .description("Show the active config and where each value comes from")
    .option("--json", "print the result as JSON")
    .action((options: ConfigShowOptions) => runConfigShow(ctx, options));
};

export function runConfigShow(ctx: Ctx, options: ConfigShowOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = loadConfig(ctx.env, ctx.homedir);

  const values = {
    vaultPath: config.vaultPath,
    folder: config.folder,
    dayStartHour: config.dayStartHour,
  };

  out.success({ configPath: config.path, fileExists: config.fileExists, values }, [
    `Config file: ${config.path}${config.fileExists ? "" : " (not created yet, run `dibujo init`)"}`,
    `  vaultPath     ${config.vaultPath.value ?? "(not set)"}  (${config.vaultPath.source})`,
    `  folder        ${config.folder.value}  (${config.folder.source})`,
    `  dayStartHour  ${config.dayStartHour.value}  (${config.dayStartHour.source})`,
  ]);
}
