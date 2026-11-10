import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatBullet } from "../../src/bujo/bullet.js";
import type { VaultConfig } from "../../src/config.js";
import { DibujoError } from "../../src/errors.js";
import { readDailyNote } from "../../src/vault/daily.js";
import { dailyNotePath } from "../../src/vault/paths.js";
import {
  migrateTask,
  randomBlockId,
  resolveRef,
  reviewTasks,
  scheduleTask,
  setTaskState,
} from "../../src/vault/tasks.js";
import { bullet } from "../helpers/arbitraries.js";
import { tempDir } from "../helpers/ctx.js";

const now = new Date("2026-11-10T08:00:00");

function vault(overrides: Partial<VaultConfig> = {}) {
  const config: VaultConfig = {
    vaultPath: tempDir("dibujo-vault-"),
    folder: "Bujo",
    dayStartHour: 0,
    migrationFlagDays: 3,
    ...overrides,
  };
  const path = (date: string) => dailyNotePath(config, date);
  const write = (date: string, ...log: string[]) => {
    mkdirSync(dirname(path(date)), { recursive: true });
    writeFileSync(path(date), note(date, ...log));
  };
  const read = (date: string) => readFileSync(path(date), "utf8");
  /** The ref of the first bullet on a day whose text is `text`. */
  const ref = (date: string, text: string) => {
    const found = readDailyNote(config, date).bullets.find((b) => b.text === text);
    if (!found) throw new Error(`no bullet "${text}" on ${date}`);
    return found.ref;
  };
  return { config, path, write, read, ref };
}

function note(date: string, ...log: string[]): string {
  return [
    "---",
    "dibujo: 1",
    "type: daily",
    `date: ${date}`,
    "---",
    "",
    "## Log",
    "",
    ...log,
    "",
    "## Captures",
    "",
  ].join("\n");
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DibujoError ? error.code : `not a DibujoError: ${String(error)}`;
  }
  return undefined;
}

function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? `gen${i}`;
}

function noTempFiles(path: string): boolean {
  return readdirSync(dirname(path)).every((name) => !name.endsWith(".tmp"));
}

describe("resolveRef", () => {
  it("finds the task at the ref's line", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] call the bank #priority", "* dentist");
    const task = resolveRef(v.config, v.ref("2026-11-09", "call the bank"));
    expect(task.rawLine).toBe("- [ ] call the bank #priority");
    expect(task.bullet.line).toBe(9);
  });

  it("finds the task after lines were added above it, and returns the new ref", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] call the bank");
    const ref = v.ref("2026-11-09", "call the bank");
    v.write("2026-11-09", "- a new note", "* an event", "- [ ] call the bank");
    const task = resolveRef(v.config, ref);
    expect(task.bullet.line).toBe(11);
    expect(task.ref).toBe(ref.replace(":9:", ":11:"));
  });

  it("refuses an ambiguous or missing match", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] call the bank");
    const ref = v.ref("2026-11-09", "call the bank");
    v.write("2026-11-09", "- x", "- [ ] call the bank", "- [ ] call the bank");
    expect(codeOf(() => resolveRef(v.config, ref))).toBe("TASK_NOT_FOUND");
    v.write("2026-11-09", "- [ ] call mum");
    expect(codeOf(() => resolveRef(v.config, ref))).toBe("TASK_NOT_FOUND");
    expect(codeOf(() => resolveRef(v.config, ref.replace("2026-11-09", "2026-11-01")))).toBe(
      "TASK_NOT_FOUND",
    );
  });

  it("refuses events and notes, and malformed refs", () => {
    const v = vault();
    v.write("2026-11-09", "* dentist", "- slept badly");
    expect(codeOf(() => resolveRef(v.config, v.ref("2026-11-09", "dentist")))).toBe("NOT_A_TASK");
    expect(codeOf(() => resolveRef(v.config, v.ref("2026-11-09", "slept badly")))).toBe(
      "NOT_A_TASK",
    );
    expect(codeOf(() => resolveRef(v.config, "nope"))).toBe("INVALID_REF");
  });
});

describe("setTaskState", () => {
  it.each<[Parameters<typeof setTaskState>[2], string]>([
    ["completed", "* [x] typed by hand #priority"],
    ["cancelled", "* [-] typed by hand #priority"],
    ["migrated", "* [>] typed by hand #priority"],
    ["scheduled", "* [<] typed by hand #priority"],
  ])("sets %s by changing only the checkbox", (state, expected) => {
    const v = vault();
    v.write("2026-11-09", "* [ ] typed by hand #priority", "- note");
    const result = setTaskState(v.config, v.ref("2026-11-09", "typed by hand"), state);
    expect(result).toMatchObject({ status: "updated", state, dryRun: false });
    expect(v.read("2026-11-09")).toBe(note("2026-11-09", expected, "- note"));
    expect(noTempFiles(v.path("2026-11-09"))).toBe(true);
  });

  it("reports unchanged when the task is already in that state", () => {
    const v = vault();
    v.write("2026-11-09", "- [x] done");
    const before = v.read("2026-11-09");
    expect(setTaskState(v.config, v.ref("2026-11-09", "done"), "completed").status).toBe(
      "unchanged",
    );
    expect(v.read("2026-11-09")).toBe(before);
  });

  it("can reopen a task, keeping its scheduled date", () => {
    const v = vault();
    v.write("2026-11-09", "- [<] renew ⏳ 2026-12-01");
    setTaskState(v.config, v.ref("2026-11-09", "renew"), "open");
    expect(v.read("2026-11-09")).toContain("- [ ] renew ⏳ 2026-12-01");
  });

  it("writes nothing on a dry run", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] a");
    const before = v.read("2026-11-09");
    const result = setTaskState(v.config, v.ref("2026-11-09", "a"), "completed", { dryRun: true });
    expect(result.content).toContain("- [x] a");
    expect(v.read("2026-11-09")).toBe(before);
  });

  it("fails with NOTE_CHANGED and leaves the note alone when it changes mid-write", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] a");
    const ref = v.ref("2026-11-09", "a");
    const edited = note("2026-11-09", "- [ ] a", "- typed in Obsidian");
    const code = codeOf(() =>
      setTaskState(v.config, ref, "completed", {
        hooks: { beforeCommit: () => writeFileSync(v.path("2026-11-09"), edited) },
      }),
    );
    expect(code).toBe("NOTE_CHANGED");
    expect(v.read("2026-11-09")).toBe(edited);
    expect(noTempFiles(v.path("2026-11-09"))).toBe(true);
  });
});

describe("scheduleTask", () => {
  it("marks the task scheduled and adds the date before a block id", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] renew passport #priority ^abc");
    const result = scheduleTask(v.config, v.ref("2026-11-09", "renew passport"), "2026-12-01");
    expect(result).toMatchObject({
      status: "updated",
      state: "scheduled",
      scheduled: "2026-12-01",
    });
    expect(v.read("2026-11-09")).toContain("- [<] renew passport #priority ⏳ 2026-12-01 ^abc");
  });

  it("reschedules by replacing the date", () => {
    const v = vault();
    v.write("2026-11-09", "- [<] renew ⏳ 2026-12-01");
    scheduleTask(v.config, v.ref("2026-11-09", "renew"), "2026-12-15");
    expect(v.read("2026-11-09")).toContain("- [<] renew ⏳ 2026-12-15");
    expect(scheduleTask(v.config, v.ref("2026-11-09", "renew"), "2026-12-15").status).toBe(
      "unchanged",
    );
  });

  it("refuses finished tasks and dates that aren't later than the note", () => {
    const v = vault();
    v.write("2026-11-09", "- [x] done", "- [ ] open");
    expect(codeOf(() => scheduleTask(v.config, v.ref("2026-11-09", "done"), "2026-12-01"))).toBe(
      "TASK_NOT_OPEN",
    );
    const open = v.ref("2026-11-09", "open");
    expect(codeOf(() => scheduleTask(v.config, open, "2026-11-09"))).toBe("INVALID_DATE");
    expect(codeOf(() => scheduleTask(v.config, open, "2026-11-01"))).toBe("INVALID_DATE");
    expect(codeOf(() => scheduleTask(v.config, open, "2026-02-30"))).toBe("INVALID_DATE");
  });
});

describe("migrateTask", () => {
  const plan = [
    "- [ ] plan trip #priority",
    "\t- [ ] book flights",
    "\t\t* flights open friday",
    "\t- [x] pick dates",
    "\t- budget about 800",
    "- [ ] unrelated",
  ];

  it("migrates a task with its children into a new note", () => {
    const v = vault();
    v.write("2026-11-09", ...plan);
    const result = migrateTask(v.config, v.ref("2026-11-09", "plan trip"), {
      now,
      newId: ids("r1", "c1"),
    });
    expect(result).toEqual({
      status: "migrated",
      source: { path: v.path("2026-11-09"), date: "2026-11-09", status: "updated" },
      target: { path: v.path("2026-11-10"), date: "2026-11-10", status: "created" },
      migrated: 2,
      copied: 4,
      dryRun: false,
    });
    expect(v.read("2026-11-09")).toBe(
      note(
        "2026-11-09",
        "- [>] plan trip #priority ^r1",
        "\t- [>] book flights ^c1",
        "\t\t* flights open friday",
        "\t- [x] pick dates",
        "\t- budget about 800",
        "- [ ] unrelated",
      ),
    );
    expect(v.read("2026-11-10")).toBe(
      note(
        "2026-11-10",
        "- [ ] plan trip [[Bujo/Daily/2026-11-09#^r1|from 2026-11-09]] #priority",
        "\t- [ ] book flights [[Bujo/Daily/2026-11-09#^c1|from 2026-11-09]]",
        "\t\t* flights open friday",
        "\t- budget about 800",
      ),
    );
  });

  it("appends to an existing note and adds priority with --priority", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] call the bank");
    v.write("2026-11-10", "* dentist at 3pm");
    const result = migrateTask(v.config, v.ref("2026-11-09", "call the bank"), {
      now,
      priority: true,
      newId: ids("k1"),
    });
    expect(result.target.status).toBe("updated");
    expect(v.read("2026-11-10")).toBe(
      note(
        "2026-11-10",
        "* dentist at 3pm",
        "- [ ] call the bank [[Bujo/Daily/2026-11-09#^k1|from 2026-11-09]] #priority",
      ),
    );
  });

  it("reports unchanged on a rerun", () => {
    const v = vault();
    v.write("2026-11-09", ...plan);
    const ref = v.ref("2026-11-09", "plan trip");
    migrateTask(v.config, ref, { now, newId: ids("r1", "c1") });
    const source = v.read("2026-11-09");
    const target = v.read("2026-11-10");
    const again = migrateTask(v.config, ref, { now, newId: ids("zz") });
    expect(again).toMatchObject({
      status: "unchanged",
      source: { status: "unchanged" },
      target: { status: "unchanged" },
      copied: 0,
    });
    expect(v.read("2026-11-09")).toBe(source);
    expect(v.read("2026-11-10")).toBe(target);
  });

  it("changes nothing on a rerun, even with an older migrated child", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] root", "\t- [>] moved earlier ^old", "\t\t- [ ] grandchild");
    const ref = v.ref("2026-11-09", "root");
    migrateTask(v.config, ref, { now, newId: ids("r1") });
    const once = [v.read("2026-11-09"), v.read("2026-11-10")];
    expect(once[0]).toContain("\t\t- [ ] grandchild");
    expect(migrateTask(v.config, ref, { now }).status).toBe("unchanged");
    expect([v.read("2026-11-09"), v.read("2026-11-10")]).toEqual(once);
  });

  it("finishes an interrupted migration on a rerun with the same ref", () => {
    const v = vault();
    v.write("2026-11-09", ...plan);
    const ref = v.ref("2026-11-09", "plan trip");
    const interrupted = codeOf(() =>
      migrateTask(v.config, ref, {
        now,
        newId: ids("r1", "c1"),
        hooks: {
          afterSource: () => {
            throw new Error("crash");
          },
        },
      }),
    );
    expect(interrupted).toContain("crash");
    expect(v.read("2026-11-09")).toContain("- [>] plan trip #priority ^r1");

    const result = migrateTask(v.config, ref, { now, newId: ids("nope") });
    expect(result).toMatchObject({
      status: "migrated",
      source: { status: "unchanged" },
      target: { status: "created" },
      migrated: 0,
      copied: 4,
    });
    const target = v.read("2026-11-10");
    expect(target.match(/plan trip/g)).toHaveLength(1);
    expect(target).toContain("#^r1|");
    expect(target).toContain("#^c1|");
  });

  it("can resume after NOTE_CHANGED on the target", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] a");
    v.write("2026-11-10", "- b");
    const ref = v.ref("2026-11-09", "a");
    const edited = note("2026-11-10", "- b", "- typed in Obsidian");
    const code = codeOf(() =>
      migrateTask(v.config, ref, {
        now,
        newId: ids("a1"),
        hooks: { target: { beforeCommit: () => writeFileSync(v.path("2026-11-10"), edited) } },
      }),
    );
    expect(code).toBe("NOTE_CHANGED");
    expect(v.read("2026-11-10")).toBe(edited);

    migrateTask(v.config, ref, { now });
    expect(v.read("2026-11-10")).toBe(
      note(
        "2026-11-10",
        "- b",
        "- typed in Obsidian",
        "- [ ] a [[Bujo/Daily/2026-11-09#^a1|from 2026-11-09]]",
      ),
    );
    expect(noTempFiles(v.path("2026-11-10"))).toBe(true);
  });

  it("returns both notes and writes nothing on a dry run", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] a");
    const before = v.read("2026-11-09");
    const result = migrateTask(v.config, v.ref("2026-11-09", "a"), {
      now,
      dryRun: true,
      newId: ids("d1"),
    });
    expect(result.sourceContent).toContain("- [>] a ^d1");
    expect(result.targetContent).toContain("- [ ] a [[Bujo/Daily/2026-11-09#^d1|from 2026-11-09]]");
    expect(v.read("2026-11-09")).toBe(before);
    expect(() => v.read("2026-11-10")).toThrow();
  });

  it("migrates to --to and refuses dates that aren't later", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] a");
    const ref = v.ref("2026-11-09", "a");
    expect(codeOf(() => migrateTask(v.config, ref, { now, to: "2026-11-09" }))).toBe(
      "INVALID_DATE",
    );
    migrateTask(v.config, ref, { now, to: "2026-11-12" });
    expect(v.read("2026-11-12")).toContain("from 2026-11-09]]");
  });

  it("refuses tasks that aren't open", () => {
    const v = vault();
    v.write("2026-11-09", "- [x] done");
    expect(codeOf(() => migrateTask(v.config, v.ref("2026-11-09", "done"), { now }))).toBe(
      "TASK_NOT_OPEN",
    );
  });

  it("refuses a folder name that would break the link, before writing", () => {
    const v = vault({ folder: "Bu#jo" });
    v.write("2026-11-09", "- [ ] a");
    const before = v.read("2026-11-09");
    expect(codeOf(() => migrateTask(v.config, v.ref("2026-11-09", "a"), { now }))).toBe(
      "CONFIG_INVALID",
    );
    expect(v.read("2026-11-09")).toBe(before);
  });

  it("refuses a target note with an unsupported version, before writing", () => {
    const v = vault();
    v.write("2026-11-09", "- [ ] a");
    mkdirSync(dirname(v.path("2026-11-10")), { recursive: true });
    writeFileSync(v.path("2026-11-10"), "---\ndibujo: 9\n---\n## Log\n");
    const before = v.read("2026-11-09");
    expect(codeOf(() => migrateTask(v.config, v.ref("2026-11-09", "a"), { now }))).toBe(
      "NOTE_VERSION_UNSUPPORTED",
    );
    expect(v.read("2026-11-09")).toBe(before);
  });

  it("makes random six-character base36 block ids", () => {
    for (let i = 0; i < 50; i++) expect(randomBlockId()).toMatch(/^[0-9a-z]{6}$/);
  });

  it("gives the same files whether it runs once or twice", () => {
    // Build the open task to migrate directly, instead of filtering random bullets,
    // so fast-check never gives up on too many skipped cases.
    const openTask = bullet.map((b): typeof b => {
      const { blockId: _id, ...rest } = b;
      return { ...rest, type: "task", state: "open" };
    });
    fc.assert(
      fc.property(
        fc.array(bullet, { maxLength: 6 }),
        openTask,
        fc.array(bullet, { maxLength: 6 }),
        (before, task, after) => {
          const v = vault();
          v.write("2026-11-09", ...[...before, task, ...after].map((b) => formatBullet(b)));
          const target = readDailyNote(v.config, "2026-11-09").bullets[before.length];
          if (!target) throw new Error("no target");

          migrateTask(v.config, target.ref, { now });
          const once = [v.read("2026-11-09"), v.read("2026-11-10")];
          migrateTask(v.config, target.ref, { now });
          expect([v.read("2026-11-09"), v.read("2026-11-10")]).toEqual(once);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("reviewTasks", () => {
  /** Migrates "call the bank" day by day from `start`, for `days` days. */
  function chain(v: ReturnType<typeof vault>, dates: string[]): void {
    v.write(dates[0] ?? "", "- [ ] call the bank #priority");
    for (let i = 0; i < dates.length - 1; i++) {
      const from = dates[i] ?? "";
      migrateTask(v.config, v.ref(from, "call the bank"), { now, to: dates[i + 1] });
    }
  }

  it.each<[string[], number, string | null, boolean]>([
    [["2026-11-09"], 0, null, false],
    [["2026-11-08", "2026-11-09"], 1, "2026-11-08", false],
    [["2026-11-07", "2026-11-08", "2026-11-09"], 2, "2026-11-07", false],
    [["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"], 3, "2026-11-06", true],
    [["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"], 4, "2026-11-05", true],
  ])("counts a chain of %j as a streak of %i", (dates, streak, since, flagged) => {
    const v = vault();
    chain(v, dates);
    const review = reviewTasks(v.config, "2026-11-10");
    expect(review).toMatchObject({ yesterday: "2026-11-09", exists: true, flagAfterDays: 3 });
    expect(review.tasks).toHaveLength(1);
    expect(review.tasks[0]).toMatchObject({
      text: "call the bank",
      signifiers: ["priority"],
      streak,
      since,
      flagged,
      ref: v.ref("2026-11-09", "call the bank"),
    });
  });

  it("uses the configured threshold", () => {
    const v = vault({ migrationFlagDays: 5 });
    chain(v, ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
    expect(reviewTasks(v.config, "2026-11-10").tasks[0]).toMatchObject({
      streak: 4,
      flagged: false,
    });
    v.write("2026-11-04", "- [>] call the bank #priority ^zz");
    const fifth = v
      .read("2026-11-05")
      .replace("- [>] call the bank #priority", "- [>] call the bank [[2026-11-04#^zz]] #priority");
    writeFileSync(v.path("2026-11-05"), fifth);
    expect(reviewTasks(v.config, "2026-11-10").tasks[0]).toMatchObject({
      streak: 5,
      flagged: true,
    });
  });

  it("ends the streak at a gap day", () => {
    const v = vault();
    chain(v, ["2026-11-05", "2026-11-06"]);
    migrateTask(v.config, v.ref("2026-11-06", "call the bank"), { now, to: "2026-11-08" });
    migrateTask(v.config, v.ref("2026-11-08", "call the bank"), { now, to: "2026-11-09" });
    expect(reviewTasks(v.config, "2026-11-10").tasks[0]).toMatchObject({
      streak: 1,
      since: "2026-11-08",
    });
  });

  it("ends the streak at a deleted line, a missing note, or an unreadable note", () => {
    const v = vault();
    chain(v, ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
    v.write("2026-11-07", "- something else");
    expect(reviewTasks(v.config, "2026-11-10").tasks[0]).toMatchObject({
      streak: 1,
      since: "2026-11-08",
    });

    writeFileSync(v.path("2026-11-08"), "---\ndibujo: 9\n---\n## Log\n- [>] call the bank\n");
    expect(reviewTasks(v.config, "2026-11-10").tasks[0]).toMatchObject({ streak: 0 });
  });

  it("ends the streak at a hand-edited link to another day", () => {
    const v = vault();
    v.write("2026-11-05", "- [>] call the bank ^old");
    v.write("2026-11-09", "- [ ] call the bank [[2026-11-05#^old]]");
    expect(reviewTasks(v.config, "2026-11-10").tasks[0]).toMatchObject({ streak: 0, since: null });
  });

  it("lists open tasks under a note or a finished task as their own items", () => {
    const v = vault();
    v.write(
      "2026-11-09",
      "- [ ] plan trip",
      "\t- [ ] book flights",
      "\t- note about it",
      "\t\t- [ ] under a note",
      "\t- [x] pick dates",
      "\t\t- [ ] ask Ana",
      "- idea: zine",
      "\t- [ ] buy paper",
      "- [x] done",
      "* event",
    );
    const review = reviewTasks(v.config, "2026-11-10");
    expect(review.tasks.map((t) => t.text)).toEqual(["plan trip", "ask Ana", "buy paper"]);
    expect(review.tasks[0]?.children.map((c) => [c.type, c.state, c.text, c.depth])).toEqual([
      ["task", "open", "book flights", 1],
      ["note", undefined, "note about it", 1],
      ["task", "open", "under a note", 2],
    ]);
    expect(review.tasks[0]?.children[0]?.ref).toBe(v.ref("2026-11-09", "book flights"));
  });

  it("returns an empty list for a missing note or one with no open tasks", () => {
    const v = vault();
    expect(reviewTasks(v.config, "2026-11-10")).toMatchObject({ exists: false, tasks: [] });
    v.write("2026-11-09", "- [x] done", "* event");
    expect(reviewTasks(v.config, "2026-11-10")).toMatchObject({ exists: true, tasks: [] });
  });

  it("reviews the calendar day before, across a month boundary", () => {
    const v = vault();
    v.write("2026-10-31", "- [ ] halloween costume");
    expect(reviewTasks(v.config, "2026-11-01").tasks.map((t) => t.text)).toEqual([
      "halloween costume",
    ]);
  });
});
