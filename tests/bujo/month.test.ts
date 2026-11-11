import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseFutureNote } from "../../src/bujo/future.js";
import { countTasks, type MonthNote, movingTasks } from "../../src/bujo/month.js";
import { parseDailyNote } from "../../src/bujo/note.js";

/** A daily note of the month from its Log lines. */
function day(date: string, ...log: string[]): MonthNote {
  const content = [
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
  ];
  return { date, bullets: parseDailyNote(content.join("\n")).bullets };
}

function futureLog(...lines: string[]) {
  return parseFutureNote(["---", "dibujo: 1", "type: future", "---", "", ...lines, ""].join("\n"))
    .entries;
}

const from = (date: string, id: string) => `[[${date}#^${id}]]`;

describe("countTasks", () => {
  it("counts every task by state, nested ones too", () => {
    const counts = countTasks([
      day(
        "2026-10-01",
        "- [ ] a",
        "\t- [x] b",
        "\t\t- [-] c",
        "- [>] d ^d1",
        "- [<] e ^e1",
        "* an event",
        "- a note",
      ),
    ]);
    expect(counts).toEqual({ completed: 1, cancelled: 1, migrated: 1, scheduled: 1, open: 1 });
  });

  it("counts a task migrated twice and then completed once as completed", () => {
    const counts = countTasks([
      day("2026-10-01", "- [>] call ^a1"),
      day("2026-10-02", `- [>] call ^b1 ${from("2026-10-01", "a1")}`),
      day("2026-10-03", `- [x] call ${from("2026-10-02", "b1")}`),
    ]);
    expect(counts.completed).toBe(1);
    expect(counts.migrated).toBe(2);
  });
});

describe("movingTasks", () => {
  it("follows a chain over days that are not in a row", () => {
    const notes = [
      day("2026-10-02", "- [>] call the bank ^a1"),
      day("2026-10-09", `- [>] call the bank ^b1 ${from("2026-10-02", "a1")}`),
      day("2026-10-20", `- [ ] call the bank ${from("2026-10-09", "b1")}`),
    ];
    expect(movingTasks(notes, [], 2)).toEqual([
      {
        text: "call the bank",
        moves: 2,
        firstDate: "2026-10-02",
        lastDate: "2026-10-20",
        state: "open",
      },
    ]);
  });

  it("keeps a chain exactly at the threshold and drops one below it", () => {
    const notes = [
      day("2026-10-02", "- [>] call ^a1"),
      day("2026-10-03", `- [>] call ^b1 ${from("2026-10-02", "a1")}`),
      day("2026-10-04", `- [ ] call ${from("2026-10-03", "b1")}`),
    ];
    expect(movingTasks(notes, [], 2)).toHaveLength(1);
    expect(movingTasks(notes, [], 3)).toHaveLength(0);
  });

  it("joins a trip through the future log into one chain", () => {
    const notes = [
      day("2026-10-02", "- [>] pay rent ^a1"),
      day("2026-10-03", `- [<] pay rent ^b1 ${from("2026-10-02", "a1")}`),
      day("2026-10-20", "- [ ] pay rent [[Future#^f1]]"),
    ];
    const future = futureLog(`- [>] pay rent ^f1 ${from("2026-10-03", "b1")}`);
    expect(movingTasks(notes, future, 2)).toEqual([
      {
        text: "pay rent",
        moves: 2,
        firstDate: "2026-10-02",
        lastDate: "2026-10-20",
        state: "open",
      },
    ]);
    // Without the future log, the chain ends at the scheduled task.
    expect(movingTasks(notes, [], 1).map((m) => [m.moves, m.state])).toEqual([[2, "scheduled"]]);
  });

  it("does not count a move in from the month before", () => {
    const notes = [
      day("2026-10-01", `- [>] call ^b1 ${from("2026-09-30", "a1")}`),
      day("2026-10-02", `- [ ] call ${from("2026-10-01", "b1")}`),
    ];
    expect(movingTasks(notes, [], 1)[0]?.moves).toBe(1);
    expect(movingTasks(notes, [], 2)).toEqual([]);
  });

  it("counts a head migrated out of the month on its last day", () => {
    const notes = [
      day("2026-10-30", "- [>] call ^a1"),
      day("2026-10-31", `- [>] call ^b1 ${from("2026-10-30", "a1")}`),
    ];
    expect(movingTasks(notes, [], 2)).toEqual([
      {
        text: "call",
        moves: 2,
        firstDate: "2026-10-30",
        lastDate: "2026-10-31",
        state: "migrated",
      },
    ]);
  });

  it("leaves out a nested child task, which moves with its parent", () => {
    const notes = [
      day("2026-10-02", "- [>] plan trip ^p1", "\t- [>] book hotel ^h1"),
      day(
        "2026-10-03",
        `- [ ] plan trip ${from("2026-10-02", "p1")}`,
        `\t- [ ] book hotel ${from("2026-10-02", "h1")}`,
      ),
    ];
    const moving = movingTasks(notes, [], 1);
    expect(moving.map((m) => m.text)).toEqual(["plan trip"]);
  });

  it("ends a chain at a broken link without an error", () => {
    const notes = [
      day("2026-10-02", "- [>] call ^a1"),
      day("2026-10-03", `- [>] call ^b1 ${from("2026-10-02", "zzz")}`),
      day("2026-10-04", `- [ ] call ${from("2026-10-03", "b1")}`),
    ];
    expect(movingTasks(notes, [], 1)[0]?.moves).toBe(1);
  });

  it("does not hang on a hand-made loop", () => {
    const notes = [
      day("2026-10-02", `- [>] loop ^a1 ${from("2026-10-03", "b1")}`),
      day("2026-10-03", `- [>] loop ^b1 ${from("2026-10-02", "a1")}`),
      day("2026-10-04", `- [ ] loop ${from("2026-10-03", "b1")}`),
    ];
    const moving = movingTasks(notes, [], 1);
    expect(moving).toHaveLength(1);
    expect(moving[0]?.moves).toBe(2);
  });

  it("lists each chain once, most moves first", () => {
    const notes = [
      day("2026-10-02", "- [>] a ^a1", "- [>] b ^b1"),
      day(
        "2026-10-03",
        `- [>] a ^a2 ${from("2026-10-02", "a1")}`,
        `- [ ] b ${from("2026-10-02", "b1")}`,
      ),
      day("2026-10-04", `- [ ] a ${from("2026-10-03", "a2")}`),
    ];
    expect(movingTasks(notes, [], 1).map((m) => [m.text, m.moves])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("never reports more moves than there are task lines, and lists each chain once", () => {
    const line = fc.record({
      state: fc.constantFrom(" ", "x", ">", "<", "-"),
      id: fc.integer({ min: 0, max: 3 }),
      origin: fc.option(
        fc.record({ day: fc.integer({ min: 1, max: 5 }), id: fc.integer({ min: 0, max: 3 }) }),
        { nil: undefined },
      ),
      nested: fc.boolean(),
    });
    const month = fc.array(fc.array(line, { maxLength: 4 }), { minLength: 1, maxLength: 5 });
    fc.assert(
      fc.property(month, fc.integer({ min: 1, max: 4 }), (days, threshold) => {
        const notes = days.map((lines, i) =>
          day(
            `2026-10-0${i + 1}`,
            ...lines.map(
              (l, n) =>
                `${l.nested && n > 0 ? "\t" : ""}- [${l.state}] t${n} ^i${l.id}${
                  l.origin ? ` ${from(`2026-10-0${l.origin.day}`, `i${l.origin.id}`)}` : ""
                }`,
            ),
          ),
        );
        const total = notes.reduce((n, note) => n + note.bullets.length, 0);
        const moving = movingTasks(notes, [], threshold);
        for (const m of moving) {
          expect(m.moves).toBeLessThanOrEqual(total);
          expect(m.moves).toBeGreaterThanOrEqual(threshold);
        }
        expect(moving.length).toBeLessThanOrEqual(total);
      }),
    );
  });
});
