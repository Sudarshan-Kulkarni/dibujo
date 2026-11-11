import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatBullet } from "../../src/bujo/bullet.js";
import {
  appendFutureEntries,
  dueEntries,
  eventsOn,
  type FutureBullet,
  newFutureTemplate,
  otherWaiting,
  parseFutureNote,
} from "../../src/bujo/future.js";
import { isSubsequence, splitLines } from "../../src/bujo/note.js";
import { bullet } from "../helpers/arbitraries.js";

describe("newFutureTemplate", () => {
  it("is just the frontmatter and parses as an empty note", () => {
    const content = newFutureTemplate();
    expect(content).toBe("---\ndibujo: 1\ntype: future\n---\n");
    expect(parseFutureNote(content)).toEqual({ version: 1, entries: [], unrecognized: [] });
  });
});

describe("parseFutureNote", () => {
  it("reads every bullet wherever it is, skips headings, and reports other lines", () => {
    const content = [
      "---",
      "dibujo: 1",
      "type: future",
      "---",
      "",
      "# Future log",
      "- [ ] learn Rust",
      "",
      "## December",
      "",
      "- [>] renew passport [[Bujo/Daily/2026-11-09#^k3f9a1|from 2026-11-09]] ⏳ 2026-11-12 ^m4n5p6",
      "\t- [ ] bring the old one",
      "just some words",
      "### Later",
      "* dentist at 3pm 📅 2026-12-12",
      "- check out the zine fair",
      "",
    ].join("\n");

    const parsed = parseFutureNote(content);
    expect(parsed.version).toBe(1);
    expect(parsed.entries.map((e) => [e.line, e.type, e.state, e.depth, e.text])).toEqual([
      [7, "task", "open", 0, "learn Rust"],
      [11, "task", "migrated", 0, "renew passport"],
      [12, "task", "open", 1, "bring the old one"],
      [15, "event", undefined, 0, "dentist at 3pm"],
      [16, "note", undefined, 0, "check out the zine fair"],
    ]);
    expect(parsed.entries[3]?.eventDate).toBe("2026-12-12");
    expect(parsed.entries[1]?.origin).toEqual({ date: "2026-11-09", blockId: "k3f9a1" });
    expect(parsed.unrecognized).toEqual([{ line: 13, text: "just some words" }]);
  });

  it("does not treat a tag or a frontmatter line as a heading or an entry", () => {
    const parsed = parseFutureNote("---\ndibujo: 1\n---\n#priority is not a heading\n- [ ] x\n");
    expect(parsed.entries.map((e) => e.text)).toEqual(["x"]);
    expect(parsed.unrecognized).toEqual([{ line: 4, text: "#priority is not a heading" }]);
  });

  it("reads a note without frontmatter, and reports a bad version", () => {
    expect(parseFutureNote("- [ ] x\n")).toMatchObject({ version: 1 });
    expect(parseFutureNote("---\ndibujo: 2\n---\n- [ ] x\n").version).toBe(2);
    expect(parseFutureNote("---\ndibujo: nope\n---\n").version).toBeNull();
  });
});

describe("appendFutureEntries", () => {
  const entry = "- [ ] book flights ⏳ 2026-12-20";

  it("puts a blank line between the frontmatter and the first entry of a new note", () => {
    expect(appendFutureEntries(newFutureTemplate(), [entry, "- a note"])).toBe(
      `---\ndibujo: 1\ntype: future\n---\n\n${entry}\n- a note\n`,
    );
  });

  it("adds no extra blank line when one is already there", () => {
    expect(appendFutureEntries("---\ndibujo: 1\n---\n\n", [entry])).toBe(
      `---\ndibujo: 1\n---\n\n${entry}\n`,
    );
  });

  it("adds after the last non-blank line, with no blank line, and keeps what follows", () => {
    const original = "---\ndibujo: 1\n---\n\n- [ ] first\n\n## Notes\nwords\n\n\n";
    expect(appendFutureEntries(original, [entry])).toBe(
      `---\ndibujo: 1\n---\n\n- [ ] first\n\n## Notes\nwords\n${entry}\n\n\n`,
    );
  });

  it("keeps CRLF line endings", () => {
    const original = "---\r\ndibujo: 1\r\n---\r\n\r\n- [ ] first\r\n";
    expect(appendFutureEntries(original, [entry])).toBe(
      `---\r\ndibujo: 1\r\n---\r\n\r\n- [ ] first\r\n${entry}\r\n`,
    );
  });

  it("starts a note that is empty or has no frontmatter", () => {
    expect(appendFutureEntries("", [entry])).toBe(`${entry}\n`);
    expect(appendFutureEntries("Some words\n", [entry])).toBe(`Some words\n${entry}\n`);
  });

  it("keeps every original line in order, and reads back what it added", () => {
    const line = fc.oneof(
      bullet.map((b) => formatBullet(b)),
      fc.constantFrom("", "", "## December", "# Future", "just some words", "\t- nested", "---"),
    );
    const frontmatter = fc.constantFrom(
      [],
      ["---", "dibujo: 1", "type: future", "---"],
      ["---", "dibujo: 1", "---", ""],
    );
    const note = fc
      .tuple(
        frontmatter,
        fc.array(line, { maxLength: 12 }),
        fc.constantFrom("\n", "\r\n"),
        fc.boolean(),
      )
      .map(([head, body, eol, trailing]) => {
        const text = [...head, ...body].join(eol);
        return trailing ? `${text}${eol}` : text;
      });
    const added = ["- [ ] new one ⏳ 2026-06-01", "* new two 📅 2026-06-02", "- new three"];

    fc.assert(
      fc.property(note, (original) => {
        const result = appendFutureEntries(original, added);
        const before = splitLines(original).lines;
        const after = splitLines(result).lines;

        expect(isSubsequence(before, after)).toBe(true);
        // Nothing is added in front of the last non-blank original line.
        const lastOriginal = before.findLastIndex((l) => l.trim().length > 0);
        const firstAdded = after.indexOf(added[0] ?? "");
        expect(firstAdded).toBeGreaterThan(lastOriginal);
        expect(after.slice(firstAdded, firstAdded + 3)).toEqual(added);
        expect(result).toContain(original.includes("\r\n") ? "\r\n" : "\n");
      }),
      { numRuns: 500 },
    );
  });
});

describe("dueEntries, eventsOn, and otherWaiting", () => {
  const entries: FutureBullet[] = parseFutureNote(
    [
      "- [ ] a: late task ⏳ 2026-11-01",
      "- [ ] b: due today ⏳ 2026-11-10",
      "- [ ] c: later task ⏳ 2026-12-20",
      "- [ ] d: undated task",
      "- [>] e: brought in ⏳ 2026-11-01 ^e1",
      "- [-] f: cancelled ⏳ 2026-11-02",
      "- [x] g: done, undated",
      "- [ ] h: earlier and in note order after a ⏳ 2026-11-01",
      "* i: event today 📅 2026-11-10",
      "* j: event another day 📅 2026-11-11",
      "* k: undated event",
      "- l: a note",
    ].join("\n"),
  ).entries;
  const texts = (list: readonly FutureBullet[]) => list.map((e) => e.text.slice(0, 1));

  it("lists waiting tasks dated today or earlier, by date and then note order", () => {
    expect(texts(dueEntries(entries, "2026-11-10"))).toEqual(["a", "h", "b"]);
    expect(texts(dueEntries(entries, "2026-10-31"))).toEqual([]);
  });

  it("lists the events dated on the day, in note order", () => {
    expect(texts(eventsOn(entries, "2026-11-10"))).toEqual(["i"]);
    expect(texts(eventsOn(entries, "2026-11-11"))).toEqual(["j"]);
    expect(texts(eventsOn(entries, "2026-11-12"))).toEqual([]);
  });

  it("lists the waiting tasks that are not due, in note order", () => {
    expect(texts(otherWaiting(entries, "2026-11-10"))).toEqual(["c", "d"]);
    expect(texts(otherWaiting(entries, "2026-12-20"))).toEqual(["d"]);
  });

  it("splits every waiting task into due or other, never both", () => {
    const waiting = entries.filter((e) => e.type === "task" && e.state === "open");
    const due = dueEntries(entries, "2026-11-10");
    const rest = otherWaiting(entries, "2026-11-10");
    expect(due.length + rest.length).toBe(waiting.length);
    expect(due.some((e) => rest.includes(e))).toBe(false);
  });
});
