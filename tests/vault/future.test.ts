import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import type { VaultConfig } from "../../src/config.js";
import { dueEntriesFor } from "../../src/vault/future.js";
import { futureNotePath } from "../../src/vault/paths.js";
import { tempDir } from "../helpers/ctx.js";

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
  return { config, path, writeFuture, readFuture };
}

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
