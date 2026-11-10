import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

const MORNING = new Date("2026-11-10T08:00:00");

interface Json {
  ok: boolean;
  data: Record<string, unknown>;
  error?: { code: string };
}

type Entries = Record<string, unknown>[];

/** A configured vault, and a helper that runs a command with --json at a chosen time. */
function world() {
  const vault = tempDir("dibujo-vault-");
  mkdirSync(join(vault, ".obsidian"));
  const home = tempDir("dibujo-home-");
  const writeDaily = (date: string, ...log: string[]) => {
    const path = join(vault, "Bujo", "Daily", `${date}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\ndibujo: 1\n---\n\n## Log\n\n${log.join("\n")}\n`);
  };
  const read = (...parts: string[]) => readFileSync(join(vault, "Bujo", ...parts), "utf8");
  const run = async (now: Date, ...args: string[]): Promise<{ code: number; json: Json }> => {
    const ctx = fakeCtx({ homedir: home, now });
    const code = await runCli([...args, "--json"], ctx, registers);
    return { code, json: parseJsonOut(ctx.out()) as Json };
  };
  const init = async () => {
    const ctx = fakeCtx({ homedir: home, now: MORNING });
    expect(await runCli(["init", "--vault", vault], ctx, registers)).toBe(0);
  };
  return { vault, writeDaily, read, run, init };
}

describe("dibujo future", () => {
  it("runs a whole cycle: schedule, wait, list what is due, then migrate, reschedule, cancel", async () => {
    const w = world();
    await w.init();
    w.writeDaily(
      "2026-11-09",
      "- [ ] renew passport #priority",
      "- [ ] book flights",
      "- [ ] old plan",
    );

    const review = await w.run(MORNING, "task", "review");
    const tasks = (review.json.data.tasks ?? []) as Entries;
    const taskRef = (text: string) => String(tasks.find((t) => t.text === text)?.ref);
    const dates: [string, string][] = [
      ["renew passport", "2026-12-01"],
      ["book flights", "2026-12-02"],
      ["old plan", "2027-01-05"],
    ];
    for (const [text, date] of dates) {
      const scheduled = await w.run(MORNING, "task", "schedule", taskRef(text), date);
      expect(scheduled.code).toBe(0);
      expect(scheduled.json.data).toMatchObject({
        scheduled: date,
        future: { action: "added", year: date.slice(0, 4) },
      });
    }

    // Before the first date, nothing is due.
    expect((await w.run(MORNING, "future", "due")).json.data.entries).toEqual([]);

    // Past all three dates: they are listed in date order, one of them from the other year's note.
    const later = new Date("2027-01-06T08:00:00");
    const due = await w.run(later, "future", "due");
    expect(due.code).toBe(0);
    const entries = due.json.data.entries as Entries;
    expect(entries.map((e) => [e.text, e.scheduled, e.daysOverdue, e.scheduledFrom])).toEqual([
      ["renew passport", "2026-12-01", 36, "2026-11-09"],
      ["book flights", "2026-12-02", 35, "2026-11-09"],
      ["old plan", "2027-01-05", 1, "2026-11-09"],
    ]);
    const ref = (text: string) => String(entries.find((e) => e.text === text)?.ref);

    expect((await w.run(later, "future", "migrate", ref("renew passport"))).json).toMatchObject({
      ok: true,
      data: { status: "migrated", target: { date: "2027-01-06", status: "created" } },
    });
    expect(
      (await w.run(later, "future", "reschedule", ref("book flights"), "2027-02-01")).json,
    ).toMatchObject({
      ok: true,
      data: { status: "rescheduled", to: { year: "2027", date: "2027-02-01" } },
    });
    expect((await w.run(later, "future", "cancel", ref("old plan"))).json).toMatchObject({
      ok: true,
      data: { status: "updated", state: "cancelled" },
    });

    // Everything was handled, so only the rescheduled entry is left, and it is not due yet.
    expect((await w.run(later, "future", "due")).json.data.entries).toEqual([]);

    const states = async (year: string) => {
      const shown = await w.run(later, "future", "show", "--year", year);
      expect(shown.code).toBe(0);
      const months = shown.json.data.months as { entries: Entries }[];
      return months.flatMap((m) => m.entries).map((e) => [e.text, e.state, e.scheduled]);
    };
    expect(await states("2026")).toEqual([
      ["renew passport", "migrated", "2026-12-01"],
      ["book flights", "scheduled", "2026-12-02"],
    ]);
    expect(await states("2027")).toEqual([
      ["old plan", "cancelled", "2027-01-05"],
      ["book flights", "open", "2027-02-01"],
    ]);

    const today = await w.run(later, "log", "show");
    expect(today.json.data.bullets).toMatchObject([
      {
        text: "renew passport",
        state: "open",
        signifiers: ["priority"],
        origin: { year: "2026", blockId: expect.stringMatching(/^[0-9a-z]{6}$/) },
      },
    ]);
  });

  it("exits with code 2 when a daily ref is given to a future command", async () => {
    const w = world();
    await w.init();
    const result = await w.run(MORNING, "future", "cancel", "2026-11-09:7:00000000");
    expect(result.code).toBe(2);
    expect(result.json).toMatchObject({ ok: false, error: { code: "INVALID_REF" } });
  });
});
