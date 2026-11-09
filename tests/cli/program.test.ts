import { describe, expect, it } from "vitest";
import { type Register, runCli } from "../../src/cli/program.js";
import { DibujoError } from "../../src/errors.js";
import { fakeCtx, parseJsonOut } from "../helpers/ctx.js";

const testCommands: Register = (program) => {
  program
    .command("boom")
    .option("--json")
    .action(() => {
      throw new Error("secret journal text should never be printed");
    });
  program
    .command("fail")
    .option("--json")
    .action(() => {
      throw new DibujoError("CONFIG_MISSING", "No vault configured.", "Run `dibujo init`.");
    });
  program
    .command("ok")
    .option("--json")
    .action(() => {});
};

describe("runCli", () => {
  it("prints the version and exits 0", async () => {
    const ctx = fakeCtx();
    const code = await runCli(["--version"], ctx, []);
    expect(code).toBe(0);
    expect(ctx.out().trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints help and exits 0", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["--help"], ctx, [])).toBe(0);
    expect(ctx.out()).toContain("Usage: dibujo");
  });

  it("exits 2 on an unknown option", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["--nope"], ctx, [])).toBe(2);
    expect(ctx.err()).toContain("unknown option");
  });

  it("exits 2 with a JSON USAGE error on stdout in --json mode", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["ok", "--json", "--nope"], ctx, [testCommands])).toBe(2);
    const parsed = parseJsonOut(ctx.out());
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatchObject({ code: "USAGE" });
  });

  it("exits 1 with a generic message on an internal error", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["boom"], ctx, [testCommands])).toBe(1);
    expect(ctx.err()).toContain("Unexpected internal error.");
    expect(ctx.err()).not.toContain("secret journal text");
  });

  it("prints the stack only with DIBUJO_DEBUG=1", async () => {
    const ctx = fakeCtx({ env: { DIBUJO_DEBUG: "1" } });
    expect(await runCli(["boom"], ctx, [testCommands])).toBe(1);
    expect(ctx.err()).toContain("secret journal text");
  });

  it("returns an internal error as JSON in --json mode", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["boom", "--json"], ctx, [testCommands])).toBe(1);
    expect(parseJsonOut(ctx.out())).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });

  it("maps a DibujoError to its exit code, message, and hint", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["fail"], ctx, [testCommands])).toBe(1);
    expect(ctx.err()).toContain("error: No vault configured.");
    expect(ctx.err()).toContain("hint: Run `dibujo init`.");
  });

  it("returns a DibujoError as one JSON document in --json mode", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["fail", "--json"], ctx, [testCommands])).toBe(1);
    expect(parseJsonOut(ctx.out())).toEqual({
      ok: false,
      error: {
        code: "CONFIG_MISSING",
        message: "No vault configured.",
        hint: "Run `dibujo init`.",
      },
    });
    expect(ctx.err()).toBe("");
  });
});
