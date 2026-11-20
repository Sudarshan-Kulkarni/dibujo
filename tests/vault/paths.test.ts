import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VaultConfig } from "../../src/config.js";
import { dailyNoteDates, dailyNoteDatesIn, resolveInVault } from "../../src/vault/paths.js";
import { tempDir } from "../helpers/ctx.js";

function config(): VaultConfig {
  return {
    vaultPath: tempDir("dibujo-vault-"),
    folder: "Bujo",
    dayStartHour: 0,
    migrationFlagDays: 3,
  };
}

function touch(c: VaultConfig, ...names: string[]): void {
  const dir = resolveInVault(c, "Daily");
  mkdirSync(dir, { recursive: true });
  for (const name of names) writeFileSync(join(dir, name), "");
}

describe("dailyNoteDates", () => {
  it("lists every daily note across months and years, oldest first", () => {
    const c = config();
    touch(c, "2026-11-18.md", "2025-12-31.md", "2026-10-02.md");
    expect(dailyNoteDates(c)).toEqual(["2025-12-31", "2026-10-02", "2026-11-18"]);
  });

  it("ignores names that are not real dates", () => {
    const c = config();
    touch(c, "2026-13-45.md", "2026-02-30.md", "notes.md", "2026-11-18.txt", "2026-11-18.md");
    expect(dailyNoteDates(c)).toEqual(["2026-11-18"]);
  });

  it("gives an empty list when Daily/ is missing", () => {
    expect(dailyNoteDates(config())).toEqual([]);
  });
});

describe("dailyNoteDatesIn", () => {
  it("keeps only the dates in the month", () => {
    const c = config();
    touch(c, "2026-10-31.md", "2026-11-01.md", "2026-11-18.md", "2026-12-01.md", "junk.md");
    expect(dailyNoteDatesIn(c, "2026-11")).toEqual(["2026-11-01", "2026-11-18"]);
    expect(dailyNoteDatesIn(c, "2027-01")).toEqual([]);
  });
});
