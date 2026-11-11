import { describe, expect, it } from "vitest";
import { appendFutureEntries, newFutureTemplate, parseFutureNote } from "../../src/bujo/future.js";
import { type OldNote, planImport } from "../../src/bujo/future-import.js";

const FOLDER = { folder: "Bujo" };
const DAILY = "[[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]]";

const oldNote = (year: string, ...lines: string[]): OldNote => ({
  year,
  path: `Future/${year}.md`,
  content: ["---", "dibujo: 1", "type: future", `year: ${year}`, "---", "", ...lines, ""].join(
    "\n",
  ),
});

const emptyNote = () => parseFutureNote(newFutureTemplate());
const noteWith = (...lines: string[]) =>
  parseFutureNote(["---", "dibujo: 1", "---", "", ...lines].join("\n"));

describe("planImport: what is copied", () => {
  it("copies open tasks, events, and notes byte for byte, and skips other states", () => {
    const note = oldNote(
      "2026",
      "## 2026-12 December",
      "",
      "- [ ] book flights ⏳ 2026-12-20",
      "* dentist at 3pm   📅 2026-12-12",
      "- check out the zine fair #inspiration",
      "- [x] done thing",
      "\t- [ ] child of a done thing",
      "\t\t- grandchild of a done thing",
      "- [>] brought in ^b1",
      "- [-] cancelled",
      "- [<] rescheduled ^s1",
      "- [ ] after the skipped ones",
      "    - [ ] nested, copied with its parent",
    );
    expect(planImport([note], emptyNote())).toEqual({
      lines: [
        "- [ ] book flights ⏳ 2026-12-20",
        "* dentist at 3pm   📅 2026-12-12",
        "- check out the zine fair #inspiration",
        "- [ ] after the skipped ones",
        "    - [ ] nested, copied with its parent",
      ],
      copied: [{ path: "Future/2026.md", count: 5 }],
      unreadable: [],
    });
  });

  it("handles the oldest year first, and leaves out notes that add nothing", () => {
    const plan = planImport(
      [
        oldNote("2027", "- [ ] second"),
        oldNote("2025", "- [x] done"),
        oldNote("2026", "- [ ] first"),
      ],
      emptyNote(),
    );
    expect(plan.lines).toEqual(["- [ ] first", "- [ ] second"]);
    expect(plan.copied).toEqual([
      { path: "Future/2026.md", count: 1 },
      { path: "Future/2027.md", count: 1 },
    ]);
  });

  it("finds entries under a heading the old parser didn't know, like ## December", () => {
    const note = oldNote(
      "2026",
      "## December",
      "- [ ] buy a gift ⏳ 2026-12-01",
      "",
      "# Ideas",
      "- learn to juggle",
    );
    expect(planImport([note], emptyNote()).lines).toEqual([
      "- [ ] buy a gift ⏳ 2026-12-01",
      "- learn to juggle",
    ]);
  });

  it("lists lines it can't read instead of copying them", () => {
    const note = oldNote("2026", "- [ ] fine", "some words", "- [?] odd checkbox", "- [ ]");
    const plan = planImport([note], emptyNote());
    expect(plan.lines).toEqual(["- [ ] fine"]);
    expect(plan.unreadable.map((u) => [u.path, u.text])).toEqual([
      ["Future/2026.md", "some words"],
      ["Future/2026.md", "- [?] odd checkbox"],
      ["Future/2026.md", "- [ ]"],
    ]);
    expect(plan.unreadable[0]?.line).toBe(8);
  });
});

describe("planImport: origins", () => {
  it("flattens a two-step chain to its daily origin, across year notes", () => {
    const first = oldNote(
      "2026",
      "## 2026-11 November",
      `- [<] renew passport ${DAILY} ⏳ 2026-11-12 ^a1`,
      "## 2026-12 December",
      "- [<] renew passport [[Bujo/Future/2026#^a1|from future log 2026]] ⏳ 2026-12-01 ^a2",
    );
    const second = oldNote(
      "2027",
      "- [ ] renew passport [[Bujo/Future/2026#^a2|from future log 2026]] ⏳ 2027-01-15 #priority",
    );
    expect(planImport([first, second], emptyNote(), FOLDER).lines).toEqual([
      `- [ ] renew passport ${DAILY} #priority ⏳ 2027-01-15`,
    ]);
  });

  it("keeps the link when the chain is broken: a missing entry, no origin, or a loop", () => {
    const missing = "- [ ] a [[Bujo/Future/2026#^gone|from future log 2026]]";
    const noOrigin = "- [ ] b [[Bujo/Future/2026#^bare|from future log 2026]]";
    const looped = "- [ ] c [[Bujo/Future/2026#^l1|from future log 2026]]";
    const note = oldNote(
      "2026",
      missing,
      "- [<] bare entry ^bare",
      noOrigin,
      "- [<] loop one [[Bujo/Future/2026#^l2|x]] ^l1",
      "- [<] loop two [[Bujo/Future/2026#^l1|x]] ^l2",
      looped,
    );
    expect(planImport([note], emptyNote(), FOLDER).lines).toEqual([missing, noOrigin, looped]);
  });

  it("copies a task that already links to a daily note unchanged", () => {
    const line = `- [ ] file taxes ${DAILY} ⏳ 2026-12-01`;
    expect(planImport([oldNote("2026", line)], emptyNote(), FOLDER).lines).toEqual([line]);
  });
});

describe("planImport: block ids", () => {
  it("drops a block id that Future.md or an earlier copy already uses, and keeps the others", () => {
    const current = noteWith("- [x] something else ^dup1");
    const note = oldNote(
      "2026",
      "- [ ] one ^dup1",
      "- [ ] two ^fresh",
      "- [ ] three ^fresh",
      "* four ^dup1",
    );
    expect(planImport([note], current, FOLDER).lines).toEqual([
      "- [ ] one",
      "- [ ] two ^fresh",
      "- [ ] three",
      "* four",
    ]);
  });
});

describe("planImport: running again", () => {
  const notes = [
    oldNote(
      "2026",
      `- [<] renew passport ${DAILY} ⏳ 2026-11-12 ^a1`,
      "- [ ] renew passport [[Bujo/Future/2026#^a1|from future log 2026]] ⏳ 2026-12-01",
      "- [ ] book flights ^f1",
      "* dentist at 3pm 📅 2026-12-12",
      "- check out the zine fair",
    ),
  ];

  it("adds nothing when run against its own output", () => {
    const first = planImport(notes, emptyNote(), FOLDER);
    expect(first.lines).toHaveLength(4);
    const written = parseFutureNote(appendFutureEntries(newFutureTemplate(), first.lines));
    expect(planImport(notes, written, FOLDER)).toEqual({ lines: [], copied: [], unreadable: [] });
  });

  it("adds nothing even when an imported entry was brought in, cancelled, or given a new date", () => {
    const first = planImport(notes, emptyNote(), FOLDER);
    const changed = first.lines.map((line) => {
      if (line.includes("renew passport"))
        return line.replace("- [ ]", "- [>]").replace("2026-12-01", "2026-12-09");
      if (line.includes("book flights")) return line.replace("- [ ]", "- [-]");
      return line;
    });
    const written = parseFutureNote(appendFutureEntries(newFutureTemplate(), changed));
    expect(written.entries.map((e) => e.state)).toContain("migrated");
    expect(planImport(notes, written, FOLDER).lines).toEqual([]);
  });
});
