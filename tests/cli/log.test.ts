import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { type FakeCtxOptions, fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

const capture = {
  raw: "need to call the bank, the big one. dentist at 3. idea: weekly review",
  bullets: [
    { type: "task", text: "call the bank", signifiers: ["priority"] },
    { type: "event", text: "dentist at 3pm" },
    { type: "note", text: "weekly review on sundays", signifiers: ["inspiration"] },
    { type: "task", text: "block 30 min", depth: 1 },
  ],
};

/** A vault plus a context factory that shares the same home and env. */
function world(options: { dayStartHour?: number } = {}) {
  const vault = tempDir("dibujo-vault-");
  mkdirSync(join(vault, ".obsidian"));
  const home = tempDir("dibujo-home-");
  const ctx = (extra: FakeCtxOptions = {}) => fakeCtx({ homedir: home, ...extra });
  const init = async () => {
    const args = ["init", "--vault", vault];
    if (options.dayStartHour !== undefined) args.push("--day-start", String(options.dayStartHour));
    expect(await runCli(args, ctx(), registers)).toBe(0);
  };
  return { vault, home, ctx, init };
}

describe("dibujo log add", () => {
  it("adds a capture that log show then returns", async () => {
    const w = world();
    await w.init();

    const add = w.ctx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add", "--json"], add, registers)).toBe(0);
    const added = parseJsonOut(add.out());
    expect(added).toMatchObject({
      ok: true,
      data: {
        status: "created",
        date: "2026-11-09",
        added: 4,
        path: join(w.vault, "Bujo", "Daily", "2026-11-09.md"),
      },
    });

    const show = w.ctx();
    expect(await runCli(["log", "show", "--json"], show, registers)).toBe(0);
    const shown = parseJsonOut(show.out()) as {
      data: { exists: boolean; bullets: Record<string, unknown>[]; unrecognized: unknown[] };
    };
    expect(shown.data.exists).toBe(true);
    expect(shown.data.unrecognized).toEqual([]);
    expect(
      shown.data.bullets.every((b) => /^2026-11-09:\d+:[0-9a-f]{8}$/.test(String(b.ref))),
    ).toBe(true);
    expect(shown.data.bullets.map(({ line: _line, ref: _ref, ...b }) => b)).toEqual([
      { type: "task", state: "open", signifiers: ["priority"], text: "call the bank", depth: 0 },
      { type: "event", signifiers: [], text: "dentist at 3pm", depth: 0 },
      {
        type: "note",
        signifiers: ["inspiration"],
        text: "weekly review on sundays",
        depth: 0,
      },
      { type: "task", state: "open", signifiers: [], text: "block 30 min", depth: 1 },
    ]);
  });

  it("reports a duplicate capture as unchanged", async () => {
    const w = world();
    await w.init();
    await runCli(["log", "add"], w.ctx({ stdin: JSON.stringify(capture) }), registers);
    const again = w.ctx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add"], again, registers)).toBe(0);
    expect(again.out()).toContain("Already logged");
  });

  it("prints human messages for created and updated notes", async () => {
    const w = world();
    await w.init();
    const first = w.ctx({ stdin: JSON.stringify(capture) });
    await runCli(["log", "add"], first, registers);
    expect(first.out()).toMatch(/^Created .*2026-11-09\.md with 4 bullets\.\n$/);

    const second = w.ctx({
      stdin: JSON.stringify({ raw: "x", bullets: [{ type: "note", text: "x" }] }),
    });
    await runCli(["log", "add"], second, registers);
    expect(second.out()).toMatch(/^Added 1 bullet to /);
  });

  it("writes to --date instead of today", async () => {
    const w = world();
    await w.init();
    const add = w.ctx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add", "--date", "2026-11-08", "--json"], add, registers)).toBe(0);
    expect(parseJsonOut(add.out())).toMatchObject({ data: { date: "2026-11-08" } });
  });

  it("uses the day-start hour for the default date", async () => {
    const w = world({ dayStartHour: 4 });
    await w.init();
    const add = w.ctx({ stdin: JSON.stringify(capture), now: new Date("2026-11-10T01:30:00") });
    expect(await runCli(["log", "add", "--json"], add, registers)).toBe(0);
    expect(parseJsonOut(add.out())).toMatchObject({ data: { date: "2026-11-09" } });
  });

  it("prints the resulting note on a dry run and writes nothing", async () => {
    const w = world();
    await w.init();
    const dry = w.ctx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add", "--dry-run"], dry, registers)).toBe(0);
    expect(dry.out()).toContain("- [ ] call the bank #priority");
    expect(dry.err()).toContain("Nothing was written");

    const show = w.ctx();
    await runCli(["log", "show", "--json"], show, registers);
    expect(parseJsonOut(show.out())).toMatchObject({ data: { exists: false } });
  });

  it("returns the content in JSON on a dry run", async () => {
    const w = world();
    await w.init();
    const dry = w.ctx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add", "--dry-run", "--json"], dry, registers)).toBe(0);
    const parsed = parseJsonOut(dry.out()) as { data: { dryRun: boolean; content: string } };
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.content).toContain("## Captures");
  });

  it.each([
    ["not JSON", "{oops"],
    ["a schema error", JSON.stringify({ raw: "x", bullets: [{ type: "idea", text: "x" }] })],
    ["empty input", ""],
  ])("exits 2 with INVALID_INPUT for %s", async (_name, stdin) => {
    const w = world();
    await w.init();
    const add = w.ctx({ stdin });
    expect(await runCli(["log", "add", "--json"], add, registers)).toBe(2);
    expect(parseJsonOut(add.out())).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("lists the failing field paths for schema errors", async () => {
    const w = world();
    await w.init();
    const add = w.ctx({
      stdin: JSON.stringify({ raw: "x", bullets: [{ type: "note", text: "x", state: "open" }] }),
    });
    expect(await runCli(["log", "add"], add, registers)).toBe(2);
    expect(add.err()).toContain("bullets.0.state");
  });

  it("exits 2 instead of waiting when stdin is a terminal", async () => {
    const w = world();
    await w.init();
    const add = w.ctx({ stdinIsTTY: true });
    expect(await runCli(["log", "add", "--json"], add, registers)).toBe(2);
    expect(parseJsonOut(add.out())).toMatchObject({ error: { code: "USAGE" } });
  });

  it("exits 2 for an invalid --date", async () => {
    const w = world();
    await w.init();
    const add = w.ctx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add", "--date", "2026-02-30", "--json"], add, registers)).toBe(2);
    expect(parseJsonOut(add.out())).toMatchObject({ error: { code: "INVALID_DATE" } });
  });

  it("tells the user to run init when there is no config", async () => {
    const add = fakeCtx({ stdin: JSON.stringify(capture) });
    expect(await runCli(["log", "add", "--json"], add, registers)).toBe(1);
    expect(parseJsonOut(add.out())).toMatchObject({
      ok: false,
      error: { code: "CONFIG_MISSING", hint: expect.stringContaining("dibujo init") },
    });
  });

  it("uses DIBUJO_VAULT_PATH without a config file", async () => {
    const vault = tempDir("dibujo-vault-");
    const add = fakeCtx({ stdin: JSON.stringify(capture), env: { DIBUJO_VAULT_PATH: vault } });
    expect(await runCli(["log", "add", "--json"], add, registers)).toBe(0);
    expect(parseJsonOut(add.out())).toMatchObject({
      data: { path: join(vault, "Bujo", "Daily", "2026-11-09.md") },
    });
  });

  it("never echoes raw text in error messages", async () => {
    const w = world();
    await w.init();
    const add = w.ctx({
      stdin: JSON.stringify({
        raw: "my private thought",
        bullets: [{ type: "x", text: "secret" }],
      }),
    });
    await runCli(["log", "add"], add, registers);
    expect(add.err()).not.toContain("private");
    expect(add.err()).not.toContain("secret");
  });
});

describe("dibujo log show", () => {
  it("reports a missing note with exit 0", async () => {
    const w = world();
    await w.init();
    const show = w.ctx();
    expect(await runCli(["log", "show"], show, registers)).toBe(0);
    expect(show.out()).toContain("No note for 2026-11-09 yet");

    const json = w.ctx();
    expect(await runCli(["log", "show", "--json"], json, registers)).toBe(0);
    expect(parseJsonOut(json.out())).toMatchObject({
      ok: true,
      data: { exists: false, bullets: [], unrecognized: [] },
    });
  });

  it("prints bullets with Bullet Journal symbols", async () => {
    const w = world();
    await w.init();
    await runCli(["log", "add"], w.ctx({ stdin: JSON.stringify(capture) }), registers);
    const show = w.ctx();
    expect(await runCli(["log", "show"], show, registers)).toBe(0);
    const out = show.out();
    expect(out).toContain("* • call the bank");
    expect(out).toContain("  ○ dentist at 3pm");
    expect(out).toContain("! – weekly review on sundays");
    expect(out).toContain("    • block 30 min");
  });

  it("shows another day with --date", async () => {
    const w = world();
    await w.init();
    await runCli(
      ["log", "add", "--date", "2026-11-01"],
      w.ctx({ stdin: JSON.stringify(capture) }),
      registers,
    );
    const show = w.ctx();
    await runCli(["log", "show", "--date", "2026-11-01", "--json"], show, registers);
    expect(parseJsonOut(show.out())).toMatchObject({ data: { exists: true, date: "2026-11-01" } });
  });

  it("lists log subcommands in help", async () => {
    const help = fakeCtx();
    expect(await runCli(["log", "--help"], help, registers)).toBe(0);
    expect(help.out()).toContain("show");
    expect(help.out()).toContain("add");
  });
});
