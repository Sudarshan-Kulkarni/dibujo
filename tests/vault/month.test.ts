import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSummaryInput } from "../../src/bujo/monthly-note.js";
import type { VaultConfig } from "../../src/config.js";
import { DibujoError } from "../../src/errors.js";
import { pendingMonth, readMonth, writeSummary } from "../../src/vault/month.js";
import { dailyNotePath, monthlyNotePath } from "../../src/vault/paths.js";
import { tempDir } from "../helpers/ctx.js";

function vault() {
  const config: VaultConfig = {
    vaultPath: tempDir("dibujo-vault-"),
    folder: "Bujo",
    dayStartHour: 0,
    migrationFlagDays: 3,
  };
  const put = (path: string, content: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  const day = (date: string, ...log: string[]) =>
    put(
      dailyNotePath(config, date),
      [
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
      ].join("\n"),
    );
  const monthly = (month: string, content: string) => put(monthlyNotePath(config, month), content);
  const readMonthly = (month: string) => readFileSync(monthlyNotePath(config, month), "utf8");
  return { config, day, monthly, readMonthly };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DibujoError ? error.code : `not a DibujoError: ${String(error)}`;
  }
  return undefined;
}

const today = "2026-11-02";
const input = parseSummaryInput('{"highlights":["a good month"],"intentions":["sleep more"]}');

describe("readMonth", () => {
  it("lists leftovers oldest first with their children, and skips an unreadable note", () => {
    const { config, day } = vault();
    day("2026-10-03", "- [ ] call the bank", "\t- [ ] find the number", "- [x] done thing");
    day("2026-10-09", "- [ ] renew passport", "* a dentist visit");
    // The third note has a version this dibujo can't read.
    day("2026-10-12", "- [ ] hidden task");
    const unreadable = dailyNotePath(config, "2026-10-12");
    writeFileSync(unreadable, readFileSync(unreadable, "utf8").replace("dibujo: 1", "dibujo: 99"));

    const view = readMonth(config, "2026-10", today);
    expect(view.notes.map((n) => n.date)).toEqual(["2026-10-03", "2026-10-09"]);
    expect(view.skipped).toEqual([unreadable]);
    expect(view.leftovers.map((t) => [t.date, t.text])).toEqual([
      ["2026-10-03", "call the bank"],
      ["2026-10-09", "renew passport"],
    ]);
    expect(view.leftovers[0]?.children.map((c) => c.text)).toEqual(["find the number"]);
    expect(view.leftovers[0]?.path).toBe(dailyNotePath(config, "2026-10-03"));
    // The skipped note is left out of the counts too.
    expect(view.counts).toEqual({ completed: 1, cancelled: 0, migrated: 0, scheduled: 0, open: 3 });
    expect(view.summary).toEqual({
      path: monthlyNotePath(config, "2026-10"),
      exists: false,
      hasSummary: false,
    });
  });

  it("returns empty lists for a month with no notes", () => {
    const { config } = vault();
    const view = readMonth(config, "2026-09", today);
    expect(view.notes).toEqual([]);
    expect(view.leftovers).toEqual([]);
    expect(view.counts.completed).toBe(0);
  });

  it("refuses the month of today and later months", () => {
    const { config } = vault();
    expect(codeOf(() => readMonth(config, "2026-11", today))).toBe("INVALID_DATE");
    expect(codeOf(() => readMonth(config, "2027-01", today))).toBe("INVALID_DATE");
  });
});

describe("pendingMonth", () => {
  it("is null when the past month has no notes", () => {
    const { config, day } = vault();
    day("2026-09-30", "- [ ] older");
    expect(pendingMonth(config, today)).toBeNull();
  });

  it("is the past month when it has notes and no monthly note", () => {
    const { config, day } = vault();
    day("2026-10-05", "- [ ] a");
    expect(pendingMonth(config, today)).toEqual({
      month: "2026-10",
      path: monthlyNotePath(config, "2026-10"),
    });
  });

  it("is null once the monthly note has a summary", () => {
    const { config, day, monthly } = vault();
    day("2026-10-05", "- [ ] a");
    monthly("2026-10", "---\ndibujo: 1\n---\n\n## Reading\n");
    expect(pendingMonth(config, today)?.month).toBe("2026-10");
    monthly("2026-10", "---\ndibujo: 1\n---\n\n## Highlights\n\n- x\n");
    expect(pendingMonth(config, today)).toBeNull();
  });

  it("is null, without throwing, when the monthly note has an unsupported version", () => {
    const { config, day, monthly } = vault();
    day("2026-10-05", "- [ ] a");
    monthly("2026-10", "---\ndibujo: 99\n---\n");
    expect(pendingMonth(config, today)).toBeNull();
  });
});

describe("writeSummary", () => {
  it("creates the note, with tasks done counted from disk", () => {
    const { config, day, readMonthly } = vault();
    day("2026-10-03", "- [x] one", "- [x] two", "- [ ] three");
    day("2026-10-04", "- [x] four");

    const result = writeSummary(config, "2026-10", today, input);
    expect(result.status).toBe("created");
    expect(result.done).toBe(3);

    const content = readMonthly("2026-10");
    expect(content.startsWith("---\ndibujo: 1\ntype: monthly\nmonth: 2026-10\n---\n")).toBe(true);
    expect(content).toContain("## Tasks done\n\n3\n");
    expect(content).toContain("- a good month");
    expect(content).toContain("- sleep more");
  });

  it("appends to a hand-made note and keeps its lines", () => {
    const { config, day, monthly, readMonthly } = vault();
    day("2026-10-03", "- [x] one");
    const mine = "# My October\n\n## Reading\n\n- a book\n";
    monthly("2026-10", mine);

    expect(writeSummary(config, "2026-10", today, input).status).toBe("updated");
    const content = readMonthly("2026-10");
    expect(content.startsWith(mine)).toBe(true);
    expect(content).toContain("## Highlights");
  });

  it("reports unchanged for the same input, and leaves the file byte for byte the same", () => {
    const { config, day, readMonthly } = vault();
    day("2026-10-03", "- [x] one");
    writeSummary(config, "2026-10", today, input);
    const before = readMonthly("2026-10");

    expect(writeSummary(config, "2026-10", today, input).status).toBe("unchanged");
    expect(readMonthly("2026-10")).toBe(before);
  });

  it("refuses a different input with SUMMARY_EXISTS and leaves the file alone", () => {
    const { config, day, readMonthly } = vault();
    day("2026-10-03", "- [x] one");
    writeSummary(config, "2026-10", today, input);
    const before = readMonthly("2026-10");

    const other = parseSummaryInput('{"highlights":["something else"]}');
    expect(codeOf(() => writeSummary(config, "2026-10", today, other))).toBe("SUMMARY_EXISTS");
    expect(readMonthly("2026-10")).toBe(before);
  });

  it("writes nothing on a dry run", () => {
    const { config, day } = vault();
    day("2026-10-03", "- [x] one");
    const result = writeSummary(config, "2026-10", today, input, { dryRun: true });
    expect(result.status).toBe("created");
    expect(result.content).toContain("## Highlights");
    expect(existsSync(monthlyNotePath(config, "2026-10"))).toBe(false);
    expect(pendingMonth(config, today)?.month).toBe("2026-10");
  });

  it("refuses the month of today with INVALID_DATE", () => {
    const { config } = vault();
    expect(codeOf(() => writeSummary(config, "2026-11", today, input))).toBe("INVALID_DATE");
  });

  it("refuses an existing note with an unsupported version", () => {
    const { config, day, monthly } = vault();
    day("2026-10-03", "- [x] one");
    monthly("2026-10", "---\ndibujo: 99\n---\n");
    expect(codeOf(() => writeSummary(config, "2026-10", today, input))).toBe(
      "NOTE_VERSION_UNSUPPORTED",
    );
  });
});
