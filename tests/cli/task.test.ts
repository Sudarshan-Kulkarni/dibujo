import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { type FakeCtxOptions, fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

const NOW = new Date("2026-11-10T08:00:00");

interface Json {
  ok: boolean;
  data: Record<string, unknown> & { tasks?: Record<string, unknown>[] };
  error?: { code: string; message: string; hint?: string };
}

/** A configured vault, a ctx factory, and a helper that runs a command with --json. */
function world() {
  const vault = tempDir("dibujo-vault-");
  mkdirSync(join(vault, ".obsidian"));
  const home = tempDir("dibujo-home-");
  const ctx = (extra: FakeCtxOptions = {}) => fakeCtx({ homedir: home, now: NOW, ...extra });
  const notePath = (date: string) => join(vault, "Bujo", "Daily", `${date}.md`);
  const write = (date: string, ...log: string[]) => {
    mkdirSync(dirname(notePath(date)), { recursive: true });
    writeFileSync(notePath(date), `---\ndibujo: 1\n---\n\n## Log\n\n${log.join("\n")}\n`);
  };
  const read = (date: string) => readFileSync(notePath(date), "utf8");
  const run = async (...args: string[]): Promise<{ code: number; json: Json }> => {
    const c = ctx();
    const code = await runCli([...args, "--json"], c, registers);
    return { code, json: parseJsonOut(c.out()) as Json };
  };
  const init = async () => {
    expect(await runCli(["init", "--vault", vault], ctx(), registers)).toBe(0);
  };
  return { vault, ctx, write, read, run, init };
}

describe("dibujo task", () => {
  it("runs a whole morning: review, set, schedule, migrate", async () => {
    const w = world();
    await w.init();
    w.write(
      "2026-11-09",
      "- [ ] call the bank #priority",
      "\t- [ ] find card number",
      "- [ ] renew passport",
      "- [ ] old plan",
      "- [ ] send invoice",
      "* dentist",
    );

    const review = await w.run("task", "review");
    expect(review.code).toBe(0);
    const tasks = review.json.data.tasks ?? [];
    expect(tasks.map((t) => t.text)).toEqual([
      "call the bank",
      "renew passport",
      "old plan",
      "send invoice",
    ]);
    const ref = (text: string) => String(tasks.find((t) => t.text === text)?.ref);

    expect((await w.run("task", "set", ref("send invoice"), "completed")).json).toMatchObject({
      ok: true,
      data: { status: "updated", state: "completed" },
    });
    expect((await w.run("task", "set", ref("old plan"), "cancelled")).code).toBe(0);
    expect(
      (await w.run("task", "schedule", ref("renew passport"), "2026-12-01")).json,
    ).toMatchObject({ ok: true, data: { status: "updated", scheduled: "2026-12-01" } });
    expect((await w.run("task", "migrate", ref("call the bank"))).json).toMatchObject({
      ok: true,
      data: { status: "migrated", migrated: 2, copied: 2, target: { date: "2026-11-10" } },
    });

    const yesterday = await w.run("log", "show", "--date", "2026-11-09");
    const states = (yesterday.json.data.bullets as Record<string, unknown>[]).map((b) => [
      b.text,
      b.state,
    ]);
    expect(states).toEqual([
      ["call the bank", "migrated"],
      ["find card number", "migrated"],
      ["renew passport", "scheduled"],
      ["old plan", "cancelled"],
      ["send invoice", "completed"],
      ["dentist", undefined],
    ]);

    const today = await w.run("log", "show");
    expect(today.json.data.bullets).toMatchObject([
      {
        text: "call the bank",
        state: "open",
        signifiers: ["priority"],
        origin: { date: "2026-11-09" },
      },
      { text: "find card number", state: "open", depth: 1, origin: { date: "2026-11-09" } },
    ]);

    // Nothing is left to review once the morning is done.
    expect((await w.run("task", "review")).json.data.tasks).toEqual([]);
  });

  it("shows tasks and fields in human output", async () => {
    const w = world();
    await w.init();
    w.write("2026-11-09", "- [ ] call the bank #priority", "- [<] renew ⏳ 2026-12-01");
    const review = w.ctx();
    expect(await runCli(["task", "review"], review, registers)).toBe(0);
    expect(review.out()).toContain("Open tasks from 2026-11-09:");
    expect(review.out()).toContain("* • call the bank");
    expect(review.out()).toContain("ref 2026-11-09:");

    const show = w.ctx();
    expect(await runCli(["log", "show", "--date", "2026-11-09"], show, registers)).toBe(0);
    expect(show.out()).toContain("< renew  ⏳ 2026-12-01");
  });

  it("writes nothing on --dry-run", async () => {
    const w = world();
    await w.init();
    w.write("2026-11-09", "- [ ] a");
    const before = w.read("2026-11-09");
    const ref = String((await w.run("task", "review")).json.data.tasks?.[0]?.ref);

    expect((await w.run("task", "set", ref, "completed", "--dry-run")).json.data).toMatchObject({
      dryRun: true,
      status: "updated",
    });
    expect((await w.run("task", "schedule", ref, "2026-12-01", "--dry-run")).code).toBe(0);
    const migrate = await w.run("task", "migrate", ref, "--dry-run");
    expect(migrate.json.data).toMatchObject({ dryRun: true, status: "migrated" });
    expect(String(migrate.json.data.targetContent)).toContain("from 2026-11-09]]");
    expect(w.read("2026-11-09")).toBe(before);
    expect(() => w.read("2026-11-10")).toThrow();
  });

  it.each<[string, string[], string, number]>([
    ["a malformed ref", ["task", "set", "nope", "completed"], "INVALID_REF", 2],
    ["an unknown state", ["task", "set", "2026-11-09:7:00000000", "done"], "USAGE", 2],
    ["a missing argument", ["task", "schedule", "2026-11-09:7:00000000"], "USAGE", 2],
    ["a ref to a missing note", ["task", "migrate", "2026-11-01:7:00000000"], "TASK_NOT_FOUND", 1],
    ["a bad date", ["task", "review", "--date", "2026-02-30"], "INVALID_DATE", 2],
  ])("reports %s as JSON", async (_name, args, code, exit) => {
    const w = world();
    await w.init();
    const result = await w.run(...args);
    expect(result.code).toBe(exit);
    expect(result.json).toMatchObject({ ok: false, error: { code } });
  });

  it("reports NOT_A_TASK and TASK_NOT_OPEN", async () => {
    const w = world();
    await w.init();
    w.write("2026-11-09", "* dentist", "- [x] done");
    const bullets = (await w.run("log", "show", "--date", "2026-11-09")).json.data
      .bullets as Record<string, unknown>[];
    const event = String(bullets[0]?.ref);
    const done = String(bullets[1]?.ref);

    expect(await w.run("task", "set", event, "completed")).toMatchObject({
      code: 1,
      json: { error: { code: "NOT_A_TASK" } },
    });
    expect(await w.run("task", "migrate", done)).toMatchObject({
      code: 1,
      json: { error: { code: "TASK_NOT_OPEN" } },
    });
    expect(await w.run("task", "schedule", done, "2026-12-01")).toMatchObject({
      code: 1,
      json: { error: { code: "TASK_NOT_OPEN" } },
    });
  });

  it("tells the user to run init when there's no config", async () => {
    const w = world();
    const result = await w.run("task", "review");
    expect(result.code).toBe(1);
    expect(result.json.error?.code).toBe("CONFIG_MISSING");
    expect(result.json.error?.hint).toContain("dibujo init");
  });

  it("returns an empty review when yesterday has no note", async () => {
    const w = world();
    await w.init();
    const review = await w.run("task", "review");
    expect(review).toMatchObject({
      code: 0,
      json: { ok: true, data: { exists: false, tasks: [], yesterday: "2026-11-09" } },
    });
  });
});
