import { describe, expect, it } from "vitest";
import { parseFutureNote } from "../../src/bujo/future.js";
import { type FutureEntryInput, parseFutureAdd, planAdd } from "../../src/bujo/future-input.js";
import { DibujoError } from "../../src/errors.js";

const TODAY = "2026-11-10";

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof DibujoError ? error.code : "NOT_A_DIBUJO_ERROR";
  }
  return undefined;
};

const input = (entries: unknown[]): string => JSON.stringify({ entries });
const parse = (...entries: unknown[]): FutureEntryInput[] => parseFutureAdd(input(entries));
const existing = (...lines: string[]) => parseFutureNote(lines.join("\n")).entries;

describe("parseFutureAdd and planAdd: valid input", () => {
  it("writes a task, an event, and a note, with and without dates and signifiers", () => {
    const entries = parse(
      { type: "event", text: "dentist at 3pm", date: "2026-12-12" },
      { type: "task", text: "learn Rust" },
      { type: "task", text: "book flights", date: TODAY, signifiers: ["priority"] },
      { type: "note", text: "check out the zine fair", signifiers: ["inspiration"] },
    );
    expect(planAdd([], entries, TODAY)).toEqual({
      lines: [
        "* dentist at 3pm 📅 2026-12-12",
        "- [ ] learn Rust",
        "- [ ] book flights #priority ⏳ 2026-11-10",
        "- check out the zine fair #inspiration",
      ],
      skipped: 0,
    });
  });

  it("adds no origin link and no block id, and writes lines the parser reads back", () => {
    const { lines } = planAdd(
      [],
      parse({ type: "task", text: "learn Rust", date: "2026-12-01" }),
      TODAY,
      "Bujo",
    );
    const [entry] = parseFutureNote(lines.join("\n")).entries;
    expect(entry).toMatchObject({ type: "task", state: "open", scheduled: "2026-12-01" });
    expect(entry?.origin).toBeUndefined();
    expect(entry?.blockId).toBeUndefined();
  });
});

describe("parseFutureAdd: invalid input", () => {
  it.each([
    ["JSON that doesn't parse", "not json"],
    ["no entries", input([])],
    ["an unknown field", input([{ type: "task", text: "x", extra: 1 }])],
    ["an unknown type", input([{ type: "idea", text: "x" }])],
    ["a date that isn't YYYY-MM-DD", input([{ type: "task", text: "x", date: "12/12/2026" }])],
    ["a note with a date", input([{ type: "note", text: "x", date: "2026-12-12" }])],
    ["text with a ⏳ date field", input([{ type: "task", text: "x ⏳ 2026-12-12" }])],
    ["text with a 📅 date field", input([{ type: "event", text: "x 📅 2026-12-12" }])],
    ["text on two lines", input([{ type: "task", text: "a\nb" }])],
  ])("rejects %s with INVALID_INPUT", (_name, json) => {
    expect(codeOf(() => parseFutureAdd(json))).toBe("INVALID_INPUT");
  });

  it("names the field of a note with a date, and doesn't repeat the input", () => {
    try {
      parseFutureAdd(input([{ type: "note", text: "secret words", date: "2026-12-12" }]));
      expect.unreachable();
    } catch (error) {
      const message = (error as DibujoError).message;
      expect(message).toContain("entries.0.date");
      expect(message).not.toContain("secret words");
    }
  });
});

describe("planAdd: dates", () => {
  it("rejects a date before today with INVALID_DATE, and writes nothing from the input", () => {
    const entries = parse(
      { type: "task", text: "fine", date: "2026-12-01" },
      { type: "task", text: "too late", date: "2026-11-09" },
    );
    expect(codeOf(() => planAdd([], entries, TODAY))).toBe("INVALID_DATE");
  });

  it("accepts today, and rejects a date that isn't on the calendar", () => {
    expect(planAdd([], parse({ type: "event", text: "x", date: TODAY }), TODAY).lines).toEqual([
      "* x 📅 2026-11-10",
    ]);
    const impossible = parse({ type: "task", text: "x", date: "2026-02-30" });
    expect(codeOf(() => planAdd([], impossible, TODAY))).toBe("INVALID_DATE");
  });
});

describe("planAdd: duplicates", () => {
  it("skips an entry that is already waiting in the note, whatever the order of its signifiers", () => {
    const note = existing(
      "- [ ] learn Rust",
      "* dentist at 3pm 📅 2026-12-12",
      "- check out the zine fair",
      "- [ ] book flights #inspiration #priority ⏳ 2026-12-20",
    );
    const entries = parse(
      { type: "task", text: "learn Rust" },
      { type: "event", text: "dentist at 3pm", date: "2026-12-12" },
      { type: "note", text: "check out the zine fair" },
      {
        type: "task",
        text: "book flights",
        date: "2026-12-20",
        signifiers: ["priority", "inspiration"],
      },
    );
    expect(planAdd(note, entries, TODAY)).toEqual({ lines: [], skipped: 4 });
  });

  it("adds an entry that differs in type, date, or signifiers, or whose twin is no longer waiting", () => {
    const note = existing(
      "- [ ] learn Rust",
      "* dentist at 3pm 📅 2026-12-12",
      "- [>] book flights ^b1",
      "- [-] file taxes",
    );
    const entries = parse(
      { type: "note", text: "learn Rust" },
      { type: "task", text: "learn Rust", date: "2026-12-12" },
      { type: "task", text: "learn Rust", signifiers: ["priority"] },
      { type: "event", text: "dentist at 3pm", date: "2026-12-13" },
      { type: "event", text: "dentist at 3pm" },
      { type: "task", text: "book flights" },
      { type: "task", text: "file taxes" },
    );
    expect(planAdd(note, entries, TODAY).skipped).toBe(0);
    expect(planAdd(note, entries, TODAY).lines).toHaveLength(7);
  });

  it("adds an entry once when the input repeats it", () => {
    const entries = parse(
      { type: "task", text: "learn Rust" },
      { type: "note", text: "idea" },
      { type: "task", text: "learn Rust" },
    );
    expect(planAdd([], entries, TODAY)).toEqual({
      lines: ["- [ ] learn Rust", "- idea"],
      skipped: 1,
    });
  });

  it("adds nothing when the same command runs twice against its own output", () => {
    const entries = parse(
      { type: "event", text: "dentist at 3pm", date: "2026-12-12" },
      { type: "task", text: "learn Rust" },
      { type: "note", text: "idea" },
    );
    const first = planAdd([], entries, TODAY);
    const second = planAdd(parseFutureNote(first.lines.join("\n")).entries, entries, TODAY);
    expect(second).toEqual({ lines: [], skipped: 3 });
  });
});
