import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatBullet } from "../../src/bujo/bullet.js";
import type { Bullet } from "../../src/bujo/types.js";
import type { VaultConfig } from "../../src/config.js";
import {
  dueEntriesFor,
  migrateEntry,
  readFutureNote,
  rescheduleEntry,
} from "../../src/vault/future.js";
import { dailyNotePath, futureNotePath } from "../../src/vault/paths.js";
import { reviewTasks } from "../../src/vault/tasks.js";
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
  const path = (year: string) => futureNotePath(config, year);
  /** Writes a future log note. `body` is the lines after the frontmatter. */
  const writeFuture = (year: string, ...body: string[]) => {
    mkdirSync(dirname(path(year)), { recursive: true });
    writeFileSync(
      path(year),
      ["---", "dibujo: 1", "type: future", `year: ${year}`, "---", "", ...body, ""].join("\n"),
    );
  };
  const readFuture = (year: string) => readFileSync(path(year), "utf8");
  const readDaily = (date: string) => readFileSync(dailyNotePath(config, date), "utf8");
  /** A file's content, or null when it doesn't exist. */
  const readOrNull = (file: string): string | null => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };
  /** The ref of the first entry in a year's note whose text is `text`. */
  const ref = (year: string, text: string) => {
    const found = readFutureNote(config, year)
      .months.flatMap((m) => m.entries)
      .find((e) => e.text === text);
    if (!found) throw new Error(`no entry "${text}" in ${year}`);
    return found.ref;
  };
  return { config, path, writeFuture, readFuture, readDaily, readOrNull, ref };
}

function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? `gen${i}`;
}

/** Throws after the write at `index`, like a crash between two writes. */
const crashAfter = (index: number) => ({
  afterWrite: (i: number) => {
    if (i === index) throw new Error("crash");
  },
});

describe("dueEntriesFor", () => {
  function twoYears() {
    const v = vault();
    v.writeFuture(
      "2025",
      "## 2025-12 December",
      "",
      "- [ ] file taxes [[Bujo/Daily/2025-11-02#^t1u2v3|from 2025-11-02]] ⏳ 2025-12-30",
    );
    v.writeFuture(
      "2026",
      "## 2026-01 January",
      "",
      "- [ ] renew passport [[Bujo/Future/2025#^w4x5y6|from future log 2025]] ⏳ 2026-01-02",
      "- [>] handled already ⏳ 2026-01-01 ^h1",
      "- [ ] no date yet",
      "",
      "## 2026-12 December",
      "",
      "- [ ] book flights ⏳ 2026-12-20",
    );
    return v;
  }

  it("lists overdue entries from this year and earlier years, in date order", () => {
    const v = twoYears();
    const result = dueEntriesFor(v.config, "2026-01-03");
    expect(result.today).toBe("2026-01-03");
    expect(result.entries.map((e) => [e.text, e.scheduled, e.daysOverdue])).toEqual([
      ["file taxes", "2025-12-30", 4],
      ["renew passport", "2026-01-02", 1],
    ]);
    expect(result.entries[0]).toMatchObject({
      ref: expect.stringMatching(/^2025:\d+:[0-9a-f]{8}$/),
      scheduledFrom: "2025-11-02",
      path: v.path("2025"),
    });
    // A link to a future entry that isn't in the notes can't be followed.
    expect(result.entries[1]?.scheduledFrom).toBeNull();
  });

  it("lists the same entries again on a later day, until one is handled in the file", () => {
    const v = twoYears();
    const first = dueEntriesFor(v.config, "2026-01-03").entries.map((e) => e.ref);
    const later = dueEntriesFor(v.config, "2026-01-10");
    expect(later.entries.map((e) => e.ref)).toEqual(first);
    expect(later.entries.map((e) => e.daysOverdue)).toEqual([11, 8]);

    writeFileSync(
      v.path("2025"),
      v.readFuture("2025").replace("- [ ] file taxes", "- [>] file taxes"),
    );
    expect(dueEntriesFor(v.config, "2026-01-10").entries.map((e) => e.text)).toEqual([
      "renew passport",
    ]);
  });
});

const PASSPORT =
  "- [ ] renew passport [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] #priority ⏳ 2026-11-10";

describe("migrateEntry", () => {
  function passport() {
    const v = vault();
    v.writeFuture("2026", "## 2026-11 November", "", PASSPORT);
    return v;
  }

  it("brings an entry into a new daily note, and does nothing the second time", () => {
    const v = passport();
    const ref = v.ref("2026", "renew passport");
    const result = migrateEntry(v.config, ref, { now, newId: ids("k1") });
    expect(result).toEqual({
      status: "migrated",
      source: { path: v.path("2026"), year: "2026", status: "updated" },
      target: {
        path: dailyNotePath(v.config, "2026-11-10"),
        date: "2026-11-10",
        status: "created",
      },
      dryRun: false,
    });
    expect(v.readFuture("2026")).toContain(
      "- [>] renew passport [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] #priority ⏳ 2026-11-10 ^k1",
    );
    expect(v.readDaily("2026-11-10")).toContain(
      "## Log\n\n- [ ] renew passport [[Bujo/Future/2026#^k1|from future log 2026]] #priority\n",
    );

    const files = [v.readFuture("2026"), v.readDaily("2026-11-10")];
    const again = migrateEntry(v.config, ref, { now, newId: ids("zz") });
    expect(again).toMatchObject({
      status: "unchanged",
      source: { status: "unchanged" },
      target: { status: "unchanged" },
    });
    expect([v.readFuture("2026"), v.readDaily("2026-11-10")]).toEqual(files);
  });

  it("finishes after an interruption with exactly one copy", () => {
    const v = passport();
    const ref = v.ref("2026", "renew passport");
    expect(() =>
      migrateEntry(v.config, ref, { now, newId: ids("k1"), hooks: crashAfter(0) }),
    ).toThrow("crash");
    expect(v.readFuture("2026")).toContain("- [>] renew passport");
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

  it("gives a returned task a migration streak of 0", () => {
    const v = passport();
    migrateEntry(v.config, v.ref("2026", "renew passport"), { now, newId: ids("k1") });
    const review = reviewTasks(v.config, "2026-11-11");
    expect(review.tasks).toHaveLength(1);
    expect(review.tasks[0]).toMatchObject({ text: "renew passport", streak: 0, since: null });
  });
});

describe("rescheduleEntry", () => {
  function passport() {
    const v = vault();
    v.writeFuture("2026", "## 2026-11 November", "", PASSPORT);
    return v;
  }

  it("moves an entry within the same year in one write, and does nothing the second time", () => {
    const v = passport();
    const ref = v.ref("2026", "renew passport");
    const result = rescheduleEntry(v.config, ref, "2026-12-15", { now, newId: ids("k1") });
    expect(result).toMatchObject({
      status: "rescheduled",
      from: { year: "2026", status: "updated" },
      to: { year: "2026", date: "2026-12-15", status: "updated" },
    });
    const content = v.readFuture("2026");
    expect(content).toContain(
      "- [<] renew passport [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] #priority ⏳ 2026-11-10 ^k1",
    );
    expect(content).toContain(
      "## 2026-12 December\n\n- [ ] renew passport [[Bujo/Future/2026#^k1|from future log 2026]] #priority ⏳ 2026-12-15\n",
    );

    // Even naming another date, because the entry was already moved once.
    const again = rescheduleEntry(v.config, ref, "2026-12-20", { now });
    expect(again).toMatchObject({ status: "unchanged", to: { date: "2026-12-15" } });
    expect(v.readFuture("2026")).toBe(content);
  });

  it("finishes a move to another year after an interruption, adding one entry", () => {
    const v = passport();
    const ref = v.ref("2026", "renew passport");
    expect(() =>
      rescheduleEntry(v.config, ref, "2027-01-15", { now, newId: ids("k1"), hooks: crashAfter(0) }),
    ).toThrow("crash");
    expect(v.readFuture("2026")).toContain("- [<] renew passport");
    expect(v.readOrNull(v.path("2027"))).toBeNull();

    const result = rescheduleEntry(v.config, ref, "2027-01-15", { now, newId: ids("zz") });
    expect(result).toMatchObject({
      status: "rescheduled",
      from: { status: "unchanged" },
      to: { year: "2027", status: "created" },
    });
    const next = v.readFuture("2027");
    expect(next.match(/renew passport/g)).toHaveLength(1);
    expect(next).toContain(
      "## 2027-01 January\n\n- [ ] renew passport [[Bujo/Future/2026#^k1|from future log 2026]] #priority ⏳ 2027-01-15\n",
    );
    expect(rescheduleEntry(v.config, ref, "2027-01-15", { now }).status).toBe("unchanged");
    expect(v.readFuture("2027")).toBe(next);
  });
});

describe("handling an entry twice", () => {
  it("leaves the same files as handling it once", () => {
    // Build the waiting entry directly, instead of filtering random bullets. The
    // prefixes keep the other lines from sharing the entry's ref.
    const waiting = bullet.map((b): Bullet => {
      const { blockId: _id, ...rest } = b;
      return { ...rest, type: "task", state: "open", text: `target ${b.text}` };
    });
    const other = bullet.map((b): Bullet => ({ ...b, text: `other ${b.text}` }));
    const action = fc.constantFrom("migrate", "2026-12-30", "2027-02-01");

    fc.assert(
      fc.property(
        fc.array(other, { maxLength: 5 }),
        waiting,
        fc.array(other, { maxLength: 5 }),
        action,
        (before, entry, after, act) => {
          const v = vault();
          v.writeFuture(
            "2026",
            "## 2026-12 December",
            "",
            ...[...before, entry, ...after].map((b) => formatBullet(b)),
          );
          const ref = v.ref("2026", entry.text);
          const run = () =>
            act === "migrate"
              ? migrateEntry(v.config, ref, { now })
              : rescheduleEntry(v.config, ref, act, { now });
          const files = () => [
            v.readOrNull(v.path("2026")),
            v.readOrNull(v.path("2027")),
            v.readOrNull(dailyNotePath(v.config, "2026-11-10")),
          ];

          run();
          const once = files();
          expect(run().status).toBe("unchanged");
          expect(files()).toEqual(once);
        },
      ),
      { numRuns: 60 },
    );
  });
});
