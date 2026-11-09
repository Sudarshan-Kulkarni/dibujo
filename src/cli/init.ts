import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CONFIG_VERSION,
  type ConfigFile,
  configPath,
  DayStartHourSchema,
  DEFAULT_DAY_START_HOUR,
  DEFAULT_FOLDER,
  FolderSchema,
  isDirectory,
  type LoadedConfig,
  loadConfig,
  saveConfig,
} from "../config.js";
import { DibujoError, isDibujoError } from "../errors.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface InitOptions {
  vault?: string;
  folder?: string;
  dayStart?: string;
  force?: boolean;
  json?: boolean;
}

export const registerInit: Register = (program, ctx) => {
  program
    .command("init")
    .description("Choose your Obsidian vault and save dibujo's config")
    .option("--vault <path>", "path to your Obsidian vault")
    .option(
      "--folder <name>",
      `folder inside the vault for dibujo notes (default: ${DEFAULT_FOLDER})`,
    )
    .option("--day-start <hour>", "hour (0-23) when a new journal day starts (default: 0)")
    .option("--force", "replace an existing config without asking")
    .option("--json", "print the result as JSON")
    .action((options: InitOptions) => runInit(ctx, options));
};

export async function runInit(ctx: Ctx, options: InitOptions): Promise<void> {
  const out = new Output(ctx, options.json === true);
  const interactive = ctx.interactive && options.json !== true;
  const path = configPath(ctx.env, ctx.homedir);

  // An unreadable or invalid file still counts as existing, so it isn't replaced silently.
  let existing: LoadedConfig | null = null;
  let existingInvalid = false;
  try {
    const loaded = loadConfig({ ...ctx.env, DIBUJO_VAULT_PATH: undefined }, ctx.homedir);
    if (loaded.fileExists) existing = loaded;
  } catch (error) {
    if (!isDibujoError(error) || error.code !== "CONFIG_INVALID") throw error;
    existingInvalid = true;
  }

  if ((existing || existingInvalid) && options.force !== true) {
    if (!interactive) {
      throw new DibujoError(
        "CONFIG_EXISTS",
        `A config file already exists at ${path}.`,
        "Pass --force to replace it.",
      );
    }
    ctx.stdout.write(`A config file already exists at ${path}.\n`);
    if (existing) ctx.stdout.write(describe(existing));
    else ctx.stdout.write("It could not be read.\n");
    const answer = (await ctx.ask("Replace it? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      out.success({ configPath: path, replaced: false }, "Kept the existing config.");
      return;
    }
  }

  const vaultInput = await valueOrAsk(ctx, interactive, options.vault, {
    question: "Path to your Obsidian vault",
    fallback: existing?.vaultPath.value ?? undefined,
    flag: "--vault",
  });
  const folderInput = await valueOrAsk(ctx, interactive, options.folder, {
    question: "Folder inside the vault for dibujo notes",
    fallback: existing?.folder.value ?? DEFAULT_FOLDER,
  });
  const dayStartInput = await valueOrAsk(ctx, interactive, options.dayStart, {
    question: "Hour (0-23) when a new journal day starts",
    fallback: String(existing?.dayStartHour.value ?? DEFAULT_DAY_START_HOUR),
  });

  const vaultPath = resolve(ctx.cwd, expandHome(vaultInput, ctx.homedir));
  const folder = parseFolder(folderInput);
  const dayStartHour = parseDayStart(dayStartInput);

  if (!isDirectory(vaultPath)) {
    throw new DibujoError(
      "VAULT_NOT_FOUND",
      `The vault folder ${vaultPath} does not exist or is not a folder.`,
      "Check the path and run `dibujo init` again. Nothing was saved.",
    );
  }
  if (!existsSync(join(vaultPath, ".obsidian"))) {
    out.info(
      `warning: ${vaultPath} has no .obsidian folder. Continuing; open it in Obsidian to use it as a vault.`,
    );
  }

  const config: ConfigFile = { version: CONFIG_VERSION, vaultPath, folder, dayStartHour };
  saveConfig(path, config);

  out.success({ configPath: path, replaced: existing !== null || existingInvalid, config }, [
    `Saved config to ${path}`,
    `  vault:      ${vaultPath}`,
    `  notes:      ${join(vaultPath, folder, "Daily")}`,
    `  day starts: ${String(dayStartHour).padStart(2, "0")}:00`,
  ]);
}

async function valueOrAsk(
  ctx: Ctx,
  interactive: boolean,
  flagValue: string | undefined,
  prompt: { question: string; fallback: string | undefined; flag?: string },
): Promise<string> {
  if (flagValue !== undefined) return flagValue;
  if (!interactive) {
    if (prompt.fallback !== undefined) return prompt.fallback;
    throw new DibujoError(
      "USAGE",
      `Missing ${prompt.flag ?? "a required value"}.`,
      `Pass ${prompt.flag ?? "the value"} when running without a terminal.`,
    );
  }
  const suffix = prompt.fallback !== undefined ? ` [${prompt.fallback}]` : "";
  while (true) {
    const answer = (await ctx.ask(`${prompt.question}${suffix}: `)).trim();
    if (answer.length > 0) return answer;
    if (prompt.fallback !== undefined) return prompt.fallback;
  }
}

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

function parseFolder(value: string): string {
  const result = FolderSchema.safeParse(value);
  if (!result.success) {
    throw new DibujoError(
      "USAGE",
      `Invalid folder "${value}": ${result.error.issues[0]?.message ?? "invalid"}.`,
      "Use a folder name inside the vault, such as Bujo or Journal/Bujo.",
    );
  }
  return result.data;
}

function parseDayStart(value: string): number {
  const number = /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  const result = DayStartHourSchema.safeParse(number);
  if (!result.success) {
    throw new DibujoError(
      "USAGE",
      `Invalid day-start hour "${value}".`,
      "Use a whole hour from 0 to 23, for example 4 for 04:00.",
    );
  }
  return result.data;
}

function describe(config: LoadedConfig): string {
  return [
    `  vault:      ${config.vaultPath.value ?? "(not set)"}`,
    `  folder:     ${config.folder.value}`,
    `  day starts: ${String(config.dayStartHour.value).padStart(2, "0")}:00`,
    "",
  ].join("\n");
}
