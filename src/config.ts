import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { z } from "zod";
import { DibujoError } from "./errors.js";

export const DEFAULT_FOLDER = "Bujo";
export const DEFAULT_DAY_START_HOUR = 0;
export const DEFAULT_MIGRATION_FLAG_DAYS = 3;
export const CONFIG_VERSION = 1;

export type ValueSource = "default" | "file" | "env";

export interface SourcedValue<T> {
  value: T;
  source: ValueSource;
}

export interface LoadedConfig {
  path: string;
  fileExists: boolean;
  vaultPath: SourcedValue<string | null>;
  folder: SourcedValue<string>;
  dayStartHour: SourcedValue<number>;
  migrationFlagDays: SourcedValue<number>;
}

/** Config with a vault that exists. Commands that touch the vault receive this. */
export interface VaultConfig {
  vaultPath: string;
  folder: string;
  dayStartHour: number;
  /** Flag a task once it has been migrated this many days in a row. */
  migrationFlagDays: number;
}

export interface ConfigFile {
  version: typeof CONFIG_VERSION;
  vaultPath: string;
  folder: string;
  dayStartHour: number;
  migrationFlagDays: number;
}

export const FolderSchema = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .refine((f) => !isAbsolute(f), "must be a path inside the vault, not an absolute path")
  .refine((f) => !f.split(/[\\/]+/).includes(".."), 'must not contain ".." segments')
  .transform((f) => normalize(f).replace(/[\\/]+$/, ""))
  .refine((f) => f !== ".", "must name a folder inside the vault");

export const DayStartHourSchema = z.number().int().min(0).max(23);

export const MigrationFlagDaysSchema = z
  .number()
  .int("must be a whole number of days")
  .min(2, "must be at least 2 days")
  .max(365, "must be at most 365 days");

export const VaultPathSchema = z
  .string()
  .min(1)
  .refine((p) => isAbsolute(p), "must be an absolute path");

const ConfigFileSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  vaultPath: VaultPathSchema,
  folder: FolderSchema.default(DEFAULT_FOLDER),
  dayStartHour: DayStartHourSchema.default(DEFAULT_DAY_START_HOUR),
  migrationFlagDays: MigrationFlagDaysSchema.default(DEFAULT_MIGRATION_FLAG_DAYS),
});

interface Env {
  readonly [key: string]: string | undefined;
}

/** `$XDG_CONFIG_HOME/dibujo/config.json`, or `~/.config/dibujo/config.json`. */
export function configPath(env: Env, home: string): string {
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, ".config");
  return join(base, "dibujo", "config.json");
}

/** Reads the config file and applies env overrides. Throws `CONFIG_INVALID` for a bad file. */
export function loadConfig(env: Env, home: string): LoadedConfig {
  const path = configPath(env, home);
  const file = readConfigFile(path);

  const loaded: LoadedConfig = {
    path,
    fileExists: file !== null,
    vaultPath: file
      ? { value: file.vaultPath, source: "file" }
      : { value: null, source: "default" },
    folder: file
      ? { value: file.folder, source: "file" }
      : { value: DEFAULT_FOLDER, source: "default" },
    dayStartHour: file
      ? { value: file.dayStartHour, source: "file" }
      : { value: DEFAULT_DAY_START_HOUR, source: "default" },
    migrationFlagDays: file?.hasFlagDays
      ? { value: file.migrationFlagDays, source: "file" }
      : { value: DEFAULT_MIGRATION_FLAG_DAYS, source: "default" },
  };

  const envVault = env.DIBUJO_VAULT_PATH;
  if (envVault !== undefined && envVault !== "") {
    if (!isAbsolute(envVault)) {
      throw new DibujoError(
        "CONFIG_INVALID",
        "DIBUJO_VAULT_PATH must be an absolute path.",
        "Set it to the full path of your vault, or unset it to use the config file.",
      );
    }
    loaded.vaultPath = { value: envVault, source: "env" };
  }
  return loaded;
}

/** Returns the config for commands that need the vault, or explains how to fix it. */
export function requireVault(config: LoadedConfig): VaultConfig {
  const vaultPath = config.vaultPath.value;
  if (vaultPath === null) {
    throw new DibujoError(
      "CONFIG_MISSING",
      "No vault is configured.",
      "Run `dibujo init` to choose your Obsidian vault.",
    );
  }
  if (!isDirectory(vaultPath)) {
    const where = config.vaultPath.source === "env" ? "DIBUJO_VAULT_PATH" : config.path;
    throw new DibujoError(
      "VAULT_NOT_FOUND",
      `The vault folder ${vaultPath} does not exist or is not a folder (set in ${where}).`,
      "Run `dibujo init --force` to choose another vault.",
    );
  }
  return {
    vaultPath,
    folder: config.folder.value,
    dayStartHour: config.dayStartHour.value,
    migrationFlagDays: config.migrationFlagDays.value,
  };
}

/** Writes the config atomically. The folder is created with mode 0700 and the file with 0600. */
export function saveConfig(path: string, config: ConfigFile): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `.config.json.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeSync(fd, `${JSON.stringify(config, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    // openSync's mode is filtered by the umask, so set it explicitly.
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readConfigFile(path: string): (ConfigFile & { hasFlagDays: boolean }) | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new DibujoError("CONFIG_INVALID", `Could not read the config file ${path}.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw invalidFile(path, "it is not valid JSON");
  }
  const result = ConfigFileSchema.safeParse(json);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
      .join("; ");
    throw invalidFile(path, details);
  }
  // Report the threshold as a default when the file predates it.
  const hasFlagDays = typeof json === "object" && json !== null && "migrationFlagDays" in json;
  return { ...result.data, hasFlagDays };
}

function invalidFile(path: string, details: string): DibujoError {
  return new DibujoError(
    "CONFIG_INVALID",
    `The config file ${path} is invalid: ${details}.`,
    "Run `dibujo init --force` to write a new one.",
  );
}
