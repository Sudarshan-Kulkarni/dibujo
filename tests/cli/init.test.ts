import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { configPath } from "../../src/config.js";
import { fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

function vault(withObsidian = true): string {
  const dir = tempDir("dibujo-vault-");
  if (withObsidian) mkdirSync(join(dir, ".obsidian"));
  return dir;
}

function savedConfig(home: string): unknown {
  return JSON.parse(readFileSync(configPath({}, home), "utf8"));
}

describe("dibujo init", () => {
  it("saves the config from flags without prompting", async () => {
    const ctx = fakeCtx();
    const v = vault();
    const code = await runCli(
      ["init", "--vault", v, "--folder", "Journal/Bujo", "--day-start", "4"],
      ctx,
      registers,
    );
    expect(code).toBe(0);
    expect(savedConfig(ctx.homedir)).toEqual({
      version: 1,
      vaultPath: v,
      folder: "Journal/Bujo",
      dayStartHour: 4,
      migrationFlagDays: 3,
    });
    expect(statSync(configPath({}, ctx.homedir)).mode & 0o777).toBe(0o600);
    expect(ctx.out()).toContain("Saved config");
  });

  it("uses defaults for folder and day start", async () => {
    const ctx = fakeCtx();
    const v = vault();
    expect(await runCli(["init", "--vault", v], ctx, registers)).toBe(0);
    expect(savedConfig(ctx.homedir)).toMatchObject({ folder: "Bujo", dayStartHour: 0 });
  });

  it("expands ~ and resolves relative paths", async () => {
    const home = tempDir("dibujo-home-");
    mkdirSync(join(home, "Vault"));
    const ctx = fakeCtx({ homedir: home });
    expect(await runCli(["init", "--vault", "~/Vault"], ctx, registers)).toBe(0);
    expect(savedConfig(home)).toMatchObject({ vaultPath: join(home, "Vault") });

    const ctx2 = fakeCtx({ homedir: tempDir(), cwd: home });
    expect(await runCli(["init", "--vault", "Vault"], ctx2, registers)).toBe(0);
    expect(savedConfig(ctx2.homedir)).toMatchObject({ vaultPath: join(home, "Vault") });
  });

  it("prompts for missing values in a terminal", async () => {
    const v = vault();
    const ctx = fakeCtx({ interactive: true, answers: [v, "", "5"] });
    expect(await runCli(["init"], ctx, registers)).toBe(0);
    expect(ctx.questions).toHaveLength(3);
    expect(ctx.questions[1]).toContain("[Bujo]");
    expect(savedConfig(ctx.homedir)).toMatchObject({
      vaultPath: v,
      folder: "Bujo",
      dayStartHour: 5,
    });
  });

  it("exits 2 without --vault when there is no terminal", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["init"], ctx, registers)).toBe(2);
    expect(ctx.err()).toContain("Missing --vault");
    expect(existsSync(configPath({}, ctx.homedir))).toBe(false);
  });

  it("never prompts in --json mode, even in a terminal", async () => {
    const ctx = fakeCtx({ interactive: true });
    expect(await runCli(["init", "--json"], ctx, registers)).toBe(2);
    expect(ctx.questions).toEqual([]);
    expect(parseJsonOut(ctx.out())).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });

  it("rejects a vault that doesn't exist and saves nothing", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["init", "--vault", "/no/such/vault"], ctx, registers)).toBe(1);
    expect(ctx.err()).toContain("does not exist");
    expect(existsSync(configPath({}, ctx.homedir))).toBe(false);
  });

  it("rejects a vault path that is a file", async () => {
    const ctx = fakeCtx();
    const file = join(tempDir(), "file.md");
    writeFileSync(file, "x");
    expect(await runCli(["init", "--vault", file], ctx, registers)).toBe(1);
  });

  it.each(["../escape", "/etc", ".", "a/../../b"])("rejects the folder %j", async (folder) => {
    const ctx = fakeCtx();
    expect(await runCli(["init", "--vault", vault(), "--folder", folder], ctx, registers)).toBe(2);
    expect(existsSync(configPath({}, ctx.homedir))).toBe(false);
  });

  it.each(["24", "-1", "4.5", "four", ""])("rejects the day-start hour %j", async (hour) => {
    const ctx = fakeCtx();
    expect(await runCli(["init", "--vault", vault(), "--day-start", hour], ctx, registers)).toBe(2);
  });

  it("sets the migration flag threshold without prompting, and keeps it on --force", async () => {
    const ctx = fakeCtx({ interactive: true, answers: ["", ""] });
    const v = vault();
    expect(await runCli(["init", "--vault", v, "--flag-after-days", "5"], ctx, registers)).toBe(0);
    expect(ctx.questions).toHaveLength(2);
    expect(savedConfig(ctx.homedir)).toMatchObject({ migrationFlagDays: 5 });

    const again = fakeCtx({ homedir: ctx.homedir });
    expect(await runCli(["init", "--vault", v, "--force"], again, registers)).toBe(0);
    expect(savedConfig(ctx.homedir)).toMatchObject({ migrationFlagDays: 5 });
  });

  it.each(["1", "366", "2.5", "three", "", "-3"])("rejects the flag threshold %j", async (days) => {
    const ctx = fakeCtx();
    const args = ["init", "--vault", vault(), "--flag-after-days", days, "--json"];
    expect(await runCli(args, ctx, registers)).toBe(2);
    expect(parseJsonOut(ctx.out())).toMatchObject({ error: { code: "USAGE" } });
    expect(existsSync(configPath({}, ctx.homedir))).toBe(false);
  });

  it("warns, but continues, when the folder has no .obsidian", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["init", "--vault", vault(false)], ctx, registers)).toBe(0);
    expect(ctx.err()).toContain("no .obsidian folder");
  });

  it("refuses to replace a config without --force when there is no terminal", async () => {
    const ctx = fakeCtx();
    const first = vault();
    await runCli(["init", "--vault", first], ctx, registers);
    const again = fakeCtx({ homedir: ctx.homedir });
    expect(await runCli(["init", "--vault", vault()], again, registers)).toBe(1);
    expect(again.err()).toContain("--force");
    expect(savedConfig(ctx.homedir)).toMatchObject({ vaultPath: first });
  });

  it("replaces a config with --force", async () => {
    const ctx = fakeCtx();
    await runCli(["init", "--vault", vault()], ctx, registers);
    const second = vault();
    const again = fakeCtx({ homedir: ctx.homedir });
    expect(await runCli(["init", "--vault", second, "--force", "--json"], again, registers)).toBe(
      0,
    );
    expect(parseJsonOut(again.out())).toMatchObject({ ok: true, data: { replaced: true } });
    expect(savedConfig(ctx.homedir)).toMatchObject({ vaultPath: second });
  });

  it("shows the current config and asks before replacing it in a terminal", async () => {
    const ctx = fakeCtx();
    const first = vault();
    await runCli(["init", "--vault", first], ctx, registers);

    const keep = fakeCtx({ homedir: ctx.homedir, interactive: true, answers: ["n"] });
    expect(await runCli(["init", "--vault", vault()], keep, registers)).toBe(0);
    expect(keep.out()).toContain(first);
    expect(keep.out()).toContain("Kept the existing config.");
    expect(savedConfig(ctx.homedir)).toMatchObject({ vaultPath: first });

    const second = vault();
    const replace = fakeCtx({ homedir: ctx.homedir, interactive: true, answers: ["y", "", ""] });
    expect(await runCli(["init", "--vault", second], replace, registers)).toBe(0);
    // After confirming, it still asks for the values that weren't passed as flags.
    expect(replace.questions).toHaveLength(3);
    expect(savedConfig(ctx.homedir)).toMatchObject({ vaultPath: second });
  });

  it("treats an invalid config file as existing", async () => {
    const ctx = fakeCtx();
    const path = configPath({}, ctx.homedir);
    mkdirSync(join(ctx.homedir, ".config", "dibujo"), { recursive: true });
    writeFileSync(path, "{broken");
    expect(await runCli(["init", "--vault", vault()], ctx, registers)).toBe(1);
    expect(readFileSync(path, "utf8")).toBe("{broken");
    expect(
      await runCli(
        ["init", "--vault", vault(), "--force"],
        fakeCtx({ homedir: ctx.homedir }),
        registers,
      ),
    ).toBe(0);
  });
});

describe("dibujo config", () => {
  it("shows defaults before init", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["config", "--json"], ctx, registers)).toBe(0);
    expect(parseJsonOut(ctx.out())).toEqual({
      ok: true,
      data: {
        configPath: configPath({}, ctx.homedir),
        fileExists: false,
        values: {
          vaultPath: { value: null, source: "default" },
          folder: { value: "Bujo", source: "default" },
          dayStartHour: { value: 0, source: "default" },
          migrationFlagDays: { value: 3, source: "default" },
        },
      },
    });
  });

  it("shows where each value comes from", async () => {
    const ctx = fakeCtx();
    await runCli(["init", "--vault", vault(), "--day-start", "4"], ctx, registers);
    const show = fakeCtx({ homedir: ctx.homedir, env: { DIBUJO_VAULT_PATH: "/from/env" } });
    expect(await runCli(["config"], show, registers)).toBe(0);
    expect(show.out()).toContain("/from/env  (env)");
    expect(show.out()).toContain("Bujo  (file)");
    expect(show.out()).toContain("4  (file)");
  });

  it("shows the flag threshold from the file", async () => {
    const ctx = fakeCtx();
    await runCli(["init", "--vault", vault(), "--flag-after-days", "4"], ctx, registers);
    const show = fakeCtx({ homedir: ctx.homedir });
    expect(await runCli(["config"], show, registers)).toBe(0);
    expect(show.out()).toContain("migrationFlagDays  4  (file)");
  });

  it("reports an invalid config file", async () => {
    const ctx = fakeCtx();
    mkdirSync(join(ctx.homedir, ".config", "dibujo"), { recursive: true });
    writeFileSync(configPath({}, ctx.homedir), "[]");
    expect(await runCli(["config", "--json"], ctx, registers)).toBe(1);
    expect(parseJsonOut(ctx.out())).toMatchObject({ error: { code: "CONFIG_INVALID" } });
  });
});
