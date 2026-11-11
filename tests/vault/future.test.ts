import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFutureAdd } from "../../src/bujo/future-input.js";
import type { VaultConfig } from "../../src/config.js";
import { DibujoError } from "../../src/errors.js";
import {
  addEntries,
  dueFor,
  importOldNotes,
  legacyNotesToImport,
  migrateEntry,
  rescheduleEntry,
  showFuture,
} from "../../src/vault/future.js";
import { dailyNotePath, futureNotePath, resolveInVault } from "../../src/vault/paths.js";
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
  const futurePath = futureNotePath(config);
  const legacyPath = (year: string) => resolveInVault(config, "Future", `${year}.md`);
  const put = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  /** Writes the future log. `body` is the lines after the frontmatter. */
  const writeFuture = (...body: string[]) =>
    put(futurePath, ["---", "dibujo: 1", "type: future", "---", "", ...body, ""].join("\n"));
  /** Writes an old year note, as the earlier year-based version wrote them. */
  const writeLegacy = (year: string, ...body: string[]) =>
    put(
      legacyPath(year),
      ["---", "dibujo: 1", "type: future", `year: ${year}`, "---", "", ...body, ""].join("\n"),
    );
  const readFuture = () => readFileSync(futurePath, "utf8");
  const readDaily = (date: string) => readFileSync(dailyNotePath(config, date), "utf8");
  /** A file's content, or null when it doesn't exist. */
  const readOrNull = (file: string): string | null => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };
  /** The ref of the first entry whose text is `text`. */
  const ref = (text: string) => {
    const found = showFuture(config).entries.find((e) => e.text === text);
    if (!found) throw new Error(`no entry "${text}"`);
    return found.ref;
  };
  return {
    config,
    futurePath,
    legacyPath,
    writeFuture,
    writeLegacy,
    readFuture,
    readDaily,
    readOrNull,
    ref,
  };
}

function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? `gen${i}`;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DibujoError ? error.code : `not a DibujoError: ${String(error)}`;
  }
  return undefined;
}

/** Throws after the write at `index`, like a crash between two writes. */
const crashAfter = (index: number) => ({
  afterWrite: (i: number) => {
    if (i === index) throw new Error("crash");
  },
});

function entries(...list: object[]) {
  return parseFutureAdd(JSON.stringify({ entries: list }));
}

describe("addEntries", () => {
  it("creates the note, appends in order, and adds nothing the second time", () => {
    const v = vault();
    const first = entries(
      { type: "event", text: "dentist at 3pm", date: "2026-12-12" },
      { type: "task", text: "learn Rust" },
      { type: "note", text: "check out the zine fair" },
    );
    const result = addEntries(v.config, first, { now });
    expect(result).toMatchObject({ status: "created", path: v.futurePath, skipped: 0 });
    expect(result.added.map((e) => [e.type, e.text, e.date])).toEqual([
      ["event", "dentist at 3pm", "2026-12-12"],
      ["task", "learn Rust", undefined],
      ["note", "check out the zine fair", undefined],
    ]);
    expect(v.readFuture()).toBe(
      [
        "---",
        "dibujo: 1",
        "type: future",
        "---",
        "",
        "* dentist at 3pm 📅 2026-12-12",
        "- [ ] learn Rust",
        "- check out the zine fair",
        "",
      ].join("\n"),
    );

    const later = entries({ type: "task", text: "book flights", date: "2026-12-20" });
    addEntries(v.config, later, { now });
    expect(v.readFuture()).toMatch(
      /- check out the zine fair\n- \[ \] book flights ⏳ 2026-12-20\n$/,
    );

    const before = v.readFuture();
    const again = addEntries(v.config, [...first, ...later], { now });
    expect(again).toMatchObject({ status: "unchanged", added: [], skipped: 4 });
    expect(v.readFuture()).toBe(before);
  });

  it("returns refs that work with the other commands", () => {
    const v = vault();
    v.writeFuture("- [ ] learn Rust");
    const result = addEntries(v.config, entries({ type: "task", text: "call Ana" }), { now });
    expect(result.added[0]?.ref).toBe(v.ref("call Ana"));
  });

  it("writes nothing for a past date or an unsupported note version", () => {
    const v = vault();
    const past = entries({ type: "task", text: "late", date: "2026-11-09" });
    expect(codeOf(() => addEntries(v.config, past, { now }))).toBe("INVALID_DATE");
    expect(v.readOrNull(v.futurePath)).toBeNull();

    v.writeFuture("- [ ] a");
    writeFileSync(v.futurePath, "---\ndibujo: 9\n---\n- [ ] a\n");
    expect(codeOf(() => addEntries(v.config, entries({ type: "note", text: "b" }), { now }))).toBe(
      "NOTE_VERSION_UNSUPPORTED",
    );
    expect(v.readFuture()).toBe("---\ndibujo: 9\n---\n- [ ] a\n");
  });
});

describe("dueFor", () => {
  it("returns due entries, today's events, and the other waiting tasks", () => {
    const v = vault();
    v.writeFuture(
      "- [ ] file taxes [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] ⏳ 2026-11-05",
      "- [ ] renew passport ⏳ 2026-11-10",
      "- [>] brought in already ⏳ 2026-11-01 ^h1",
      "- [-] cancelled one ⏳ 2026-11-01",
      "* dentist at 3pm #priority 📅 2026-11-10",
      "* flight 📅 2026-11-11",
      "* undated event",
      "- a note",
      "- [ ] learn Rust",
      "",
      "## December",
      "",
      "- [ ] book flights ⏳ 2026-12-20",
    );
    const result = dueFor(v.config, "2026-11-10");
    expect(result.today).toBe("2026-11-10");
    expect(
      result.entries.map((e) => [e.text, e.scheduled, e.daysOverdue, e.scheduledFrom]),
    ).toEqual([
      ["file taxes", "2026-11-05", 5, "2026-11-02"],
      ["renew passport", "2026-11-10", 0, null],
    ]);
    expect(result.entries[0]).toMatchObject({
      ref: expect.stringMatching(/^\d+:[0-9a-f]{8}$/),
      path: v.futurePath,
    });
    expect(result.events).toEqual([
      { text: "dentist at 3pm", signifiers: ["priority"], date: "2026-11-10" },
    ]);
    expect(result.waiting.map((w) => [w.text, w.date])).toEqual([
      ["learn Rust", undefined],
      ["book flights", "2026-12-20"],
    ]);
    expect(result.waiting[0]?.ref).toBe(v.ref("learn Rust"));
    expect(result.legacyNotes).toEqual([]);
  });

  it("returns empty lists when the note doesn't exist", () => {
    const v = vault();
    expect(dueFor(v.config, "2026-11-10")).toEqual({
      today: "2026-11-10",
      entries: [],
      events: [],
      waiting: [],
      legacyNotes: [],
    });
  });
});

const PASSPORT =
  "- [ ] renew passport [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] #priority ⏳ 2026-11-10";

describe("migrateEntry", () => {
  function passport() {
    const v = vault();
    v.writeFuture("- [ ] learn Rust", PASSPORT);
    return v;
  }

  it("brings an entry into a new daily note with a link back, and does nothing the second time", () => {
    const v = passport();
    const ref = v.ref("renew passport");
    const result = migrateEntry(v.config, ref, { now, newId: ids("k1") });
    expect(result).toEqual({
      status: "migrated",
      source: { path: v.futurePath, status: "updated" },
      target: {
        path: dailyNotePath(v.config, "2026-11-10"),
        date: "2026-11-10",
        status: "created",
      },
      dryRun: false,
    });
    expect(v.readFuture()).toContain(
      "- [>] renew passport [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] #priority ⏳ 2026-11-10 ^k1",
    );
    expect(v.readFuture()).toContain("- [ ] learn Rust\n");
    expect(v.readDaily("2026-11-10")).toContain(
      "## Log\n\n- [ ] renew passport [[Bujo/Future#^k1|from future log]] #priority\n",
    );

    const files = [v.readFuture(), v.readDaily("2026-11-10")];
    const again = migrateEntry(v.config, ref, { now, newId: ids("zz") });
    expect(again).toMatchObject({
      status: "unchanged",
      source: { status: "unchanged" },
      target: { status: "unchanged" },
    });
    expect([v.readFuture(), v.readDaily("2026-11-10")]).toEqual(files);
  });

  it("brings in an undated task, with --priority", () => {
    const v = passport();
    migrateEntry(v.config, v.ref("learn Rust"), { now, priority: true, newId: ids("k2") });
    expect(v.readFuture()).toContain("- [>] learn Rust ^k2");
    expect(v.readDaily("2026-11-10")).toContain(
      "- [ ] learn Rust [[Bujo/Future#^k2|from future log]] #priority\n",
    );
  });

  it("finishes after an interruption with exactly one copy", () => {
    const v = passport();
    const ref = v.ref("renew passport");
    expect(() =>
      migrateEntry(v.config, ref, { now, newId: ids("k1"), hooks: crashAfter(0) }),
    ).toThrow("crash");
    expect(v.readFuture()).toContain("- [>] renew passport");
    expect(v.readOrNull(dailyNotePath(v.config, "2026-11-10"))).toBeNull();

    const result = migrateEntry(v.config, ref, { now, newId: ids("zz") });
    expect(result).toMatchObject({
      status: "migrated",
      source: { status: "unchanged" },
      target: { status: "created" },
    });
    expect(v.readDaily("2026-11-10").match(/renew passport/g)).toHaveLength(1);
    expect(v.readDaily("2026-11-10")).toContain("#^k1|");
  });

  it("refuses events and notes", () => {
    const v = vault();
    v.writeFuture("* dentist at 3pm", "- a note");
    for (const text of ["dentist at 3pm", "a note"]) {
      expect(codeOf(() => migrateEntry(v.config, v.ref(text), { now }))).toBe("NOT_A_TASK");
    }
    expect(codeOf(() => migrateEntry(v.config, "9:00000000", { now }))).toBe("TASK_NOT_FOUND");
  });
});

describe("rescheduleEntry", () => {
  it("changes only the date, on a dated and on an undated entry", () => {
    const v = vault();
    v.writeFuture("- [ ] learn Rust", PASSPORT, "* dentist at 3pm 📅 2026-12-12");
    const passportRef = v.ref("renew passport");
    const rustRef = v.ref("learn Rust");

    expect(rescheduleEntry(v.config, passportRef, "2026-12-15", { now })).toMatchObject({
      status: "rescheduled",
      ref: passportRef,
      path: v.futurePath,
      scheduled: "2026-12-15",
    });
    expect(rescheduleEntry(v.config, rustRef, "2027-01-04", { now }).status).toBe("rescheduled");
    expect(v.readFuture()).toBe(
      [
        "---",
        "dibujo: 1",
        "type: future",
        "---",
        "",
        "- [ ] learn Rust ⏳ 2027-01-04",
        PASSPORT.replace("2026-11-10", "2026-12-15"),
        "* dentist at 3pm 📅 2026-12-12",
        "",
      ].join("\n"),
    );

    // The same date again is a no-op, and the ref still works.
    const before = v.readFuture();
    expect(rescheduleEntry(v.config, passportRef, "2026-12-15", { now }).status).toBe("unchanged");
    expect(v.readFuture()).toBe(before);
  });

  it("refuses an entry that is not open, and a date that is not later than today", () => {
    const v = vault();
    v.writeFuture("- [-] cancelled one ⏳ 2026-11-12", "- [>] brought in ^k1", "- [ ] open one");
    const before = v.readFuture();
    expect(
      codeOf(() => rescheduleEntry(v.config, v.ref("cancelled one"), "2026-12-15", { now })),
    ).toBe("TASK_NOT_OPEN");
    expect(
      codeOf(() => rescheduleEntry(v.config, v.ref("brought in"), "2026-12-15", { now })),
    ).toBe("TASK_NOT_OPEN");
    expect(codeOf(() => rescheduleEntry(v.config, v.ref("open one"), "2026-11-10", { now }))).toBe(
      "INVALID_DATE",
    );
    expect(v.readFuture()).toBe(before);
  });
});

describe("importOldNotes", () => {
  function twoOldNotes() {
    const v = vault();
    v.writeLegacy(
      "2025",
      "## 2025-12 December",
      "",
      "- [ ] file taxes [[Bujo/Daily/2025-11-02#^t1u2v3|from 2025-11-02]] ⏳ 2025-12-30",
      "- [<] renew passport [[Bujo/Daily/2025-11-03#^d1|from 2025-11-03]] ⏳ 2026-02-01 ^w4x5y6",
      "- [x] done by hand ⏳ 2025-12-01",
    );
    v.writeLegacy(
      "2026",
      "## 2026-02 February",
      "",
      "- [ ] renew passport [[Bujo/Future/2025#^w4x5y6|from future log 2025]] ⏳ 2026-02-01",
      "",
      "## December",
      "",
      "- [ ] book flights ⏳ 2026-12-20",
      "* dentist at 3pm",
      "some stray paragraph",
    );
    return v;
  }

  it("copies what it should, leaves the old notes alone, and adds nothing the second time", () => {
    const v = twoOldNotes();
    const old = [readFileSync(v.legacyPath("2025")), readFileSync(v.legacyPath("2026"))];
    expect(legacyNotesToImport(v.config)).toEqual([v.legacyPath("2025"), v.legacyPath("2026")]);

    const result = importOldNotes(v.config);
    expect(result).toMatchObject({
      status: "created",
      path: v.futurePath,
      copied: 4,
      sources: [
        { path: v.legacyPath("2025"), count: 1 },
        { path: v.legacyPath("2026"), count: 3 },
      ],
      unreadable: [{ path: v.legacyPath("2026"), line: 15, text: "some stray paragraph" }],
    });
    expect(v.readFuture()).toBe(
      [
        "---",
        "dibujo: 1",
        "type: future",
        "---",
        "",
        "- [ ] file taxes [[Bujo/Daily/2025-11-02#^t1u2v3|from 2025-11-02]] ⏳ 2025-12-30",
        // Copied from a [<] entry's chain: the link points at the daily task it came from.
        "- [ ] renew passport [[Bujo/Daily/2025-11-03#^d1|from 2025-11-03]] ⏳ 2026-02-01",
        "- [ ] book flights ⏳ 2026-12-20",
        "* dentist at 3pm",
        "",
      ].join("\n"),
    );
    expect([readFileSync(v.legacyPath("2025")), readFileSync(v.legacyPath("2026"))]).toEqual(old);
    expect(legacyNotesToImport(v.config)).toEqual([]);
  });

  it("adds nothing on a second run, even after an imported entry was handled", () => {
    const v = twoOldNotes();
    importOldNotes(v.config);
    migrateEntry(v.config, v.ref("book flights"), { now, newId: ids("k1") });
    const before = v.readFuture();
    expect(importOldNotes(v.config)).toMatchObject({ status: "unchanged", copied: 0 });
    expect(v.readFuture()).toBe(before);
  });

  it("stops, naming the note, when an old note has an unsupported version", () => {
    const v = twoOldNotes();
    writeFileSync(v.legacyPath("2026"), "---\ndibujo: 9\n---\n- [ ] x\n");
    expect(codeOf(() => importOldNotes(v.config))).toBe("NOTE_VERSION_UNSUPPORTED");
    expect(v.readOrNull(v.futurePath)).toBeNull();
    // `show` and `due` ignore it.
    expect(legacyNotesToImport(v.config)).toEqual([v.legacyPath("2025")]);
  });
});
