import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatBullet } from "../../src/bujo/bullet.js";
import {
  appendFutureEntries,
  dueEntries,
  type FutureBullet,
  findLive,
  type LocatedEntry,
  monthHeading,
  newFutureTemplate,
  parseFutureNote,
} from "../../src/bujo/future.js";
import { isSubsequence, listHeadings, splitLines } from "../../src/bujo/note.js";
import { bullet, isoDate } from "../helpers/arbitraries.js";

const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

/** The month keys of a note's headings, in the order they appear. */
function monthKeys(content: string): string[] {
  return listHeadings(splitLines(content).lines).flatMap((h) => {
    const match = /^(\d{4}-\d{2})\b/.exec(h.name);
    return match?.[1] ? [match[1]] : [];
  });
}

describe("newFutureTemplate", () => {
  it("has the 12 months in order and parses as an empty note", () => {
    const content = newFutureTemplate("2026");
    expect(content.startsWith("---\ndibujo: 1\ntype: future\nyear: 2026\n---\n")).toBe(true);
    expect(monthKeys(content)).toEqual(MONTHS);
    expect(content).toContain("## 2026-01 January\n");
    expect(content).toContain("## 2026-12 December\n");
    expect(parseFutureNote(content)).toEqual({ version: 1, entries: [], unrecognized: [] });
  });
});

describe("parseFutureNote", () => {
  it("reads entries per month and reports lines that aren't bullets", () => {
    const content = [
      "---",
      "dibujo: 1",
      "---",
      "",
      "A paragraph at the top.",
      "- [ ] not an entry, outside the months",
      "",
      "## 2026-11 November",
      "",
      "- [>] renew passport ⏳ 2026-11-12 ^m4n5p6",
      "just some words",
      "",
      "## Notes",
      "- [ ] also outside the months",
      "",
      "## 2026-12 December",
      "- [ ] book flights ⏳ 2026-12-20",
      "\t* dentist",
      "",
    ].join("\n");

    const parsed = parseFutureNote(content);
    expect(parsed.version).toBe(1);
    expect(parsed.entries.map((e) => [e.month, e.line, e.state, e.text])).toEqual([
      ["2026-11", 10, "migrated", "renew passport"],
      ["2026-12", 17, "open", "book flights"],
      ["2026-12", 18, undefined, "dentist"],
    ]);
    expect(parsed.unrecognized).toEqual([{ line: 11, text: "just some words" }]);
  });
});

describe("appendFutureEntries", () => {
  const entry = "- [ ] book flights ⏳ 2026-12-20";

  it("inserts a missing month in calendar order", () => {
    const base = ["---", "dibujo: 1", "---", "", "## 2026-03 March", "", "## 2026-09 September"];
    const withLine = (month: string, content: string) =>
      appendFutureEntries(content, month, [entry]);

    // Before a later month.
    const middle = withLine("2026-05", `${base.join("\n")}\n`);
    expect(monthKeys(middle)).toEqual(["2026-03", "2026-05", "2026-09"]);
    expect(middle).toContain(`## 2026-05 May\n\n${entry}\n\n## 2026-09 September`);

    // Before the first month.
    expect(monthKeys(withLine("2026-01", `${base.join("\n")}\n`))).toEqual([
      "2026-01",
      "2026-03",
      "2026-09",
    ]);

    // After the last month section, ahead of an unrelated heading.
    const withNotes = `${[...base, "- [ ] x", "", "## Notes", "text"].join("\n")}\n`;
    const last = withLine("2026-11", withNotes);
    expect(monthKeys(last)).toEqual(["2026-03", "2026-09", "2026-11"]);
    expect(last.indexOf("## 2026-11 November")).toBeLessThan(last.indexOf("## Notes"));

    // In a note with no month sections at all.
    const empty = withLine("2026-02", "---\ndibujo: 1\n---\n\nSome notes.\n");
    expect(empty).toBe(`---\ndibujo: 1\n---\n\nSome notes.\n\n## 2026-02 February\n\n${entry}\n`);
  });

  it("keeps every original line in order and the months in calendar order", () => {
    const monthSet = fc.subarray(MONTHS).chain((months) =>
      fc.tuple(
        fc.constant(months),
        fc.array(fc.array(bullet, { maxLength: 3 }), {
          minLength: months.length,
          maxLength: months.length,
        }),
        fc.boolean(),
      ),
    );
    const note = monthSet.map(([months, entries, notes]) => {
      const lines = ["---", "dibujo: 1", "type: future", "year: 2026", "---", ""];
      months.forEach((month, i) => {
        lines.push(monthHeading(month), "");
        for (const b of entries[i] ?? []) lines.push(formatBullet(b));
        lines.push("", ...(i === months.length - 1 && notes ? ["## Notes", "words", ""] : []));
      });
      return `${lines.join("\n")}\n`;
    });

    fc.assert(
      fc.property(note, fc.constantFrom(...MONTHS), (original, month) => {
        const added = ["- [ ] new one ⏳ 2026-06-01", "- [ ] new two"];
        const result = appendFutureEntries(original, month, added);

        expect(isSubsequence(splitLines(original).lines, splitLines(result).lines)).toBe(true);
        const keys = monthKeys(result);
        expect(keys).toEqual([...keys].sort());
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toContain(month);
        const inMonth = parseFutureNote(result).entries.filter(
          (e) => e.text === "new one" || e.text === "new two",
        );
        expect(inMonth.map((e) => e.month)).toEqual([month, month]);
      }),
      { numRuns: 300 },
    );
  });
});

describe("dueEntries", () => {
  it("returns an entry exactly when it is a waiting, dated task on or before today", () => {
    const entries = fc.array(bullet, { maxLength: 12 });
    fc.assert(
      fc.property(entries, isoDate, (all, today) => {
        const list = all.map((e, i): FutureBullet => ({ ...e, line: i + 1, month: "2026-01" }));
        const due = dueEntries(list, today);
        for (const e of list) {
          const expected =
            e.type === "task" &&
            e.state === "open" &&
            e.scheduled !== undefined &&
            e.scheduled <= today;
          expect(due.includes(e)).toBe(expected);
        }
        const dates = due.map((e) => e.scheduled ?? "");
        expect(dates).toEqual([...dates].sort());
        // Entries with the same date stay in note order.
        due.forEach((e, i) => {
          const previous = due[i - 1];
          if (previous && previous.scheduled === e.scheduled) {
            expect(previous.line).toBeLessThan(e.line);
          }
        });
      }),
      { numRuns: 500 },
    );
  });
});

describe("findLive", () => {
  const from = { date: "2026-11-02", blockId: "t1u2v3" };
  const daily = "[[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]]";
  const future = "[[Bujo/Future/2026#^w4x5y6|from future log 2026]]";

  const located = (...lines: string[]): LocatedEntry[] =>
    parseFutureNote(["## 2026-12 December", "", ...lines].join("\n")).entries.map((e) => ({
      ...e,
      year: "2026",
    }));
  const live = (...lines: string[]) => findLive(located(...lines), from);

  it("finds nothing when no entry links to the task", () => {
    expect(live()).toBeNull();
    expect(live("- [ ] something else [[Bujo/Daily/2026-11-03#^zzz|from 2026-11-03]]")).toBeNull();
  });

  it("finds a waiting entry", () => {
    const found = live(`- [ ] file taxes ${daily} ⏳ 2026-12-01`);
    expect(found?.kind).toBe("waiting");
    expect(found?.entry.line).toBe(3);
  });

  it("follows a rescheduled chain to its waiting entry", () => {
    const found = live(
      `- [<] file taxes ${daily} ⏳ 2026-12-01 ^w4x5y6`,
      `- [ ] file taxes ${future} ⏳ 2026-12-15`,
    );
    expect(found?.kind).toBe("waiting");
    expect(found?.entry.scheduled).toBe("2026-12-15");
  });

  it("offers to resume an interrupted reschedule, and treats handled entries as finished", () => {
    const found = live(`- [<] file taxes ${daily} ⏳ 2026-12-01 ^w4x5y6`);
    expect(found?.kind).toBe("resume");
    expect(found?.entry.line).toBe(3);

    expect(live(`- [>] file taxes ${daily} ⏳ 2026-12-01 ^w4x5y6`)).toBeNull();
    expect(
      live(
        `- [<] file taxes ${daily} ⏳ 2026-12-01 ^w4x5y6`,
        `- [-] file taxes ${future} ⏳ 2026-12-15`,
      ),
    ).toBeNull();
  });
});
