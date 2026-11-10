import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPath, loadConfig, requireVault, saveConfig } from "../src/config.js";
import { DibujoError } from "../src/errors.js";
import { tempDir } from "./helpers/ctx.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DibujoError ? error.code : "not a DibujoError";
  }
  return undefined;
}

function writeConfig(home: string, value: unknown): string {
  const path = configPath({}, home);
  mkdirSync(join(home, ".config", "dibujo"), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

describe("configPath", () => {
  it("uses XDG_CONFIG_HOME when it is absolute", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/x/config" }, "/home/me")).toBe(
      "/x/config/dibujo/config.json",
    );
  });

  it("falls back to ~/.config", () => {
    expect(configPath({}, "/home/me")).toBe("/home/me/.config/dibujo/config.json");
    expect(configPath({ XDG_CONFIG_HOME: "relative" }, "/home/me")).toBe(
      "/home/me/.config/dibujo/config.json",
    );
  });
});

describe("loadConfig", () => {
  it("returns defaults when there is no file", () => {
    const home = tempDir();
    const config = loadConfig({}, home);
    expect(config.fileExists).toBe(false);
    expect(config.vaultPath).toEqual({ value: null, source: "default" });
    expect(config.folder).toEqual({ value: "Bujo", source: "default" });
    expect(config.dayStartHour).toEqual({ value: 0, source: "default" });
  });

  it("reads the file and fills in missing optional values", () => {
    const home = tempDir();
    writeConfig(home, { version: 1, vaultPath: "/vault" });
    const config = loadConfig({}, home);
    expect(config.vaultPath).toEqual({ value: "/vault", source: "file" });
    expect(config.folder).toEqual({ value: "Bujo", source: "file" });
  });

  it("lets DIBUJO_VAULT_PATH override the file and reports the source", () => {
    const home = tempDir();
    writeConfig(home, { version: 1, vaultPath: "/vault", folder: "J", dayStartHour: 4 });
    const config = loadConfig({ DIBUJO_VAULT_PATH: "/other" }, home);
    expect(config.vaultPath).toEqual({ value: "/other", source: "env" });
    expect(config.folder).toEqual({ value: "J", source: "file" });
  });

  it("ignores an empty DIBUJO_VAULT_PATH", () => {
    expect(loadConfig({ DIBUJO_VAULT_PATH: "" }, tempDir()).vaultPath.source).toBe("default");
  });

  it("rejects a relative DIBUJO_VAULT_PATH", () => {
    expect(codeOf(() => loadConfig({ DIBUJO_VAULT_PATH: "vault" }, tempDir()))).toBe(
      "CONFIG_INVALID",
    );
  });

  it.each<[string, unknown]>([
    ["invalid JSON", "{not json"],
    ["a missing version", { vaultPath: "/v" }],
    ["a relative vault path", { version: 1, vaultPath: "v" }],
    ["a folder with ..", { version: 1, vaultPath: "/v", folder: "../escape" }],
    ["an absolute folder", { version: 1, vaultPath: "/v", folder: "/etc" }],
    ["an hour out of range", { version: 1, vaultPath: "/v", dayStartHour: 24 }],
  ])("rejects a file with %s", (_name, value) => {
    const home = tempDir();
    writeConfig(home, value);
    expect(codeOf(() => loadConfig({}, home))).toBe("CONFIG_INVALID");
  });
});

describe("requireVault", () => {
  it("throws CONFIG_MISSING without a vault", () => {
    expect(codeOf(() => requireVault(loadConfig({}, tempDir())))).toBe("CONFIG_MISSING");
  });

  it("throws VAULT_NOT_FOUND when the vault folder is gone", () => {
    const config = loadConfig({ DIBUJO_VAULT_PATH: "/does/not/exist" }, tempDir());
    expect(codeOf(() => requireVault(config))).toBe("VAULT_NOT_FOUND");
  });

  it("returns the values when the vault exists", () => {
    const vault = tempDir();
    expect(requireVault(loadConfig({ DIBUJO_VAULT_PATH: vault }, tempDir()))).toEqual({
      vaultPath: vault,
      folder: "Bujo",
      dayStartHour: 0,
      migrationFlagDays: 3,
    });
  });
});

describe("migrationFlagDays", () => {
  it("loads an older config file without the key, using the default", () => {
    const home = tempDir();
    writeConfig(home, { version: 1, vaultPath: "/vault", folder: "Bujo", dayStartHour: 0 });
    expect(loadConfig({}, home).migrationFlagDays).toEqual({ value: 3, source: "default" });
  });

  it("reads the key from the file", () => {
    const home = tempDir();
    writeConfig(home, { version: 1, vaultPath: "/vault", migrationFlagDays: 7 });
    expect(loadConfig({}, home).migrationFlagDays).toEqual({ value: 7, source: "file" });
  });

  it.each([1, 366, 2.5, "3"])("rejects %j and names the key", (value) => {
    const home = tempDir();
    writeConfig(home, { version: 1, vaultPath: "/vault", migrationFlagDays: value });
    try {
      loadConfig({}, home);
      expect.unreachable();
    } catch (error) {
      expect((error as DibujoError).code).toBe("CONFIG_INVALID");
      expect((error as DibujoError).message).toContain("migrationFlagDays");
    }
  });
});

describe("saveConfig", () => {
  it("writes the file with mode 0600 and the folder with mode 0700", () => {
    const home = tempDir();
    const path = configPath({}, home);
    saveConfig(path, {
      version: 1,
      vaultPath: "/v",
      folder: "Bujo",
      dayStartHour: 0,
      migrationFlagDays: 3,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".config", "dibujo")).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      vaultPath: "/v",
      folder: "Bujo",
      dayStartHour: 0,
      migrationFlagDays: 3,
    });
  });

  it("replaces an existing file and keeps mode 0600", () => {
    const home = tempDir();
    const path = writeConfig(home, "{}");
    saveConfig(path, {
      version: 1,
      vaultPath: "/v2",
      folder: "Bujo",
      dayStartHour: 3,
      migrationFlagDays: 3,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(loadConfig({}, home).dayStartHour.value).toBe(3);
  });
});
