import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

const MORNING = new Date("2026-11-10T08:00:00");
const LATER = new Date("2026-12-02T08:00:00");

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
  const put = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const writeDaily = (date: string, ...log: string[]) =>
    put(
      join(vault, "Bujo", "Daily", `${date}.md`),
      `---\ndibujo: 1\n---\n\n## Log\n\n${log.join("\n")}\n`,
    );
  const futurePath = join(vault, "Bujo", "Future.md");
  const legacyPath = join(vault, "Bujo", "Future", "2026.md");
  const run = async (
    now: Date,
    args: string[],
    stdin?: string,
  ): Promise<{ code: number; json: Json }> => {
    const ctx = fakeCtx({ homedir: home, now, ...(stdin === undefined ? {} : { stdin }) });
    const code = await runCli([...args, "--json"], ctx, registers);
    return { code, json: parseJsonOut(ctx.out()) as Json };
  };
  const init = async () => {
    const ctx = fakeCtx({ homedir: home, now: MORNING });
    expect(await runCli(["init", "--vault", vault], ctx, registers)).toBe(0);
  };
  return { vault, put, writeDaily, futurePath, legacyPath, run, init };
}

describe("dibujo future", () => {
  it("runs a whole cycle: add, schedule, due, migrate, reschedule, cancel, import", async () => {
    const w = world();
    await w.init();
    w.writeDaily(
      "2026-11-09",
      "- [ ] renew passport #priority",
      "- [ ] book flights",
      "- [ ] old plan",
      "- [ ] call mum",
    );
    const legacy = [
      "---",
      "dibujo: 1",
      "type: future",
      "year: 2026",
      "---",
      "",
      "## 2026-12 December",
      "",
      "- [ ] pay rent ⏳ 2026-12-05",
      "",
    ].join("\n");
    w.put(w.legacyPath, legacy);

    // Nothing in the future log yet, but the old note is reported.
    const empty = await w.run(MORNING, ["future", "show"]);
    expect(empty).toMatchObject({
      code: 0,
      json: { ok: true, data: { exists: false, entries: [], legacyNotes: [w.legacyPath] } },
    });

    // Direct add: a dated event, an undated task, a note, a dated task. Twice adds once.
    const entries = {
      entries: [
        { type: "event", text: "dentist at 3pm", date: "2026-11-10" },
        { type: "task", text: "learn Rust" },
        { type: "note", text: "check out the zine fair" },
        { type: "task", text: "book hotel", date: "2026-11-20" },
      ],
    };
    const added = await w.run(MORNING, ["future", "add"], JSON.stringify(entries));
    expect(added).toMatchObject({
      code: 0,
      json: { ok: true, data: { status: "created", path: w.futurePath, skipped: 0 } },
    });
    expect((added.json.data.added as Entries).map((e) => e.text)).toEqual([
      "dentist at 3pm",
      "learn Rust",
      "check out the zine fair",
      "book hotel",
    ]);
    const again = await w.run(MORNING, ["future", "add"], JSON.stringify(entries));
    expect(again.json.data).toMatchObject({ status: "unchanged", added: [], skipped: 4 });

    // Scheduling from the daily note: with a date, without one, and a date added later.
    const review = await w.run(MORNING, ["task", "review"]);
    const tasks = (review.json.data.tasks ?? []) as Entries;
    const taskRef = (text: string) => String(tasks.find((t) => t.text === text)?.ref);
    const schedule = async (text: string, ...date: string[]) =>
      (await w.run(MORNING, ["task", "schedule", taskRef(text), ...date])).json;
    expect(await schedule("renew passport", "2026-12-01")).toMatchObject({
      ok: true,
      data: { scheduled: "2026-12-01", future: { action: "added", path: w.futurePath } },
    });
    expect(await schedule("book flights", "2026-11-12")).toMatchObject({
      data: { future: { action: "added" } },
    });
    const undated = await schedule("old plan");
    expect(undated).toMatchObject({ ok: true, data: { state: "scheduled" } });
    expect(undated.data).not.toHaveProperty("scheduled");
    expect(await schedule("call mum")).toMatchObject({ data: { future: { action: "added" } } });
    expect(await schedule("call mum", "2026-12-10")).toMatchObject({
      data: { scheduled: "2026-12-10", future: { action: "rescheduled" } },
    });

    // Before the first date: nothing due, today's event, and the rest waiting in note order.
    const morning = await w.run(MORNING, ["future", "due"]);
    expect(morning.json.data).toMatchObject({
      today: "2026-11-10",
      entries: [],
      events: [{ text: "dentist at 3pm", date: "2026-11-10" }],
      legacyNotes: [w.legacyPath],
    });
    expect((morning.json.data.waiting as Entries).map((e) => [e.text, e.date])).toEqual([
      ["learn Rust", undefined],
      ["book hotel", "2026-11-20"],
      ["renew passport", "2026-12-01"],
      ["book flights", "2026-11-12"],
      ["old plan", undefined],
      ["call mum", "2026-12-10"],
    ]);

    // Past three dates: due entries come in date order, with where they were scheduled from.
    const due = await w.run(LATER, ["future", "due"]);
    expect(due.code).toBe(0);
    const dueEntries = due.json.data.entries as Entries;
    expect(dueEntries.map((e) => [e.text, e.scheduled, e.daysOverdue, e.scheduledFrom])).toEqual([
      ["book flights", "2026-11-12", 20, "2026-11-09"],
      ["book hotel", "2026-11-20", 12, null],
      ["renew passport", "2026-12-01", 1, "2026-11-09"],
    ]);
    expect((due.json.data.waiting as Entries).map((e) => e.text)).toEqual([
      "learn Rust",
      "old plan",
      "call mum",
    ]);
    const dueRef = (text: string) => String(dueEntries.find((e) => e.text === text)?.ref);
    const waitingRef = (text: string) =>
      String((due.json.data.waiting as Entries).find((e) => e.text === text)?.ref);

    expect(
      (await w.run(LATER, ["future", "migrate", dueRef("renew passport")])).json,
    ).toMatchObject({
      ok: true,
      data: { status: "migrated", target: { date: "2026-12-02", status: "created" } },
    });
    expect(
      (await w.run(LATER, ["future", "reschedule", dueRef("book hotel"), "2027-01-15"])).json,
    ).toMatchObject({
      ok: true,
      data: { status: "rescheduled", scheduled: "2027-01-15", path: w.futurePath },
    });
    expect(
      (await w.run(LATER, ["future", "reschedule", waitingRef("learn Rust"), "2027-01-04"])).json,
    ).toMatchObject({ ok: true, data: { status: "rescheduled", scheduled: "2027-01-04" } });
    expect((await w.run(LATER, ["future", "cancel", dueRef("book flights")])).json).toMatchObject({
      ok: true,
      data: { status: "updated", state: "cancelled" },
    });

    // Everything due was handled.
    expect((await w.run(LATER, ["future", "due"])).json.data.entries).toEqual([]);

    const shown = await w.run(LATER, ["future", "show"]);
    expect((shown.json.data.entries as Entries).map((e) => [e.text, e.state, e.date])).toEqual([
      ["dentist at 3pm", undefined, "2026-11-10"],
      ["learn Rust", "open", "2027-01-04"],
      ["check out the zine fair", undefined, undefined],
      ["book hotel", "open", "2027-01-15"],
      ["renew passport", "migrated", "2026-12-01"],
      ["book flights", "cancelled", "2026-11-12"],
      ["old plan", "open", undefined],
      ["call mum", "open", "2026-12-10"],
    ]);

    // The copy in today's note is a normal open task that links to the one future log note.
    const today = await w.run(LATER, ["log", "show"]);
    const [copy] = today.json.data.bullets as Entries;
    expect(copy).toMatchObject({ text: "renew passport", state: "open", signifiers: ["priority"] });
    expect(copy?.origin).toEqual({ blockId: expect.stringMatching(/^[0-9a-z]{6}$/) });

    // Import: the old note's waiting entry is copied once, and the old note is untouched.
    expect((await w.run(LATER, ["future", "import"])).json).toMatchObject({
      ok: true,
      data: {
        status: "updated",
        copied: 1,
        sources: [{ path: w.legacyPath, count: 1 }],
        unreadable: [],
      },
    });
    expect((await w.run(LATER, ["future", "import"])).json.data).toMatchObject({
      status: "unchanged",
      copied: 0,
    });
    expect(readFileSync(w.futurePath, "utf8")).toMatch(/- \[ \] pay rent ⏳ 2026-12-05\n$/);
    expect(readFileSync(w.legacyPath, "utf8")).toBe(legacy);
    expect((await w.run(LATER, ["future", "show"])).json.data).toMatchObject({ legacyNotes: [] });
  });

  it("exits with code 2 when a daily ref is given to a future command", async () => {
    const w = world();
    await w.init();
    const result = await w.run(MORNING, ["future", "cancel", "2026-11-09:7:00000000"]);
    expect(result.code).toBe(2);
    expect(result.json).toMatchObject({ ok: false, error: { code: "INVALID_REF" } });
  });
});
