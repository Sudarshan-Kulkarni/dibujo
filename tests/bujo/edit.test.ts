import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fingerprint, formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
import { addBlockId, applyLineEdits, setCheckbox, setScheduled } from "../../src/bujo/edit.js";
import { TASK_STATES } from "../../src/bujo/types.js";
import { blockId, bullet, isoDate } from "../helpers/arbitraries.js";

describe("setCheckbox", () => {
  it.each<[string, (typeof TASK_STATES)[number], string]>([
    ["- [ ] call the bank", "completed", "- [x] call the bank"],
    ["* [ ] typed by hand", "migrated", "* [>] typed by hand"],
    ["+ [x] plus marker", "open", "+ [ ] plus marker"],
    ["  - [ ] two-space indent", "cancelled", "  - [-] two-space indent"],
    ["\t\t- [ ] tabs", "scheduled", "\t\t- [<] tabs"],
    ["- [X] upper", "migrated", "- [>] upper"],
    [
      "- [ ]  extra  spaces #priority ⏳ 2026-11-20 ^abc  ",
      "scheduled",
      "- [<]  extra  spaces #priority ⏳ 2026-11-20 ^abc  ",
    ],
  ])("changes only the checkbox of %j", (line, state, expected) => {
    expect(setCheckbox(line, state)).toBe(expected);
  });

  it.each(["* dentist", "- a note", "- [?] odd", "paragraph"])("refuses %j", (line) => {
    expect(() => setCheckbox(line, "completed")).toThrow();
  });
});

describe("setScheduled", () => {
  it.each<[string, string]>([
    ["- [<] renew passport", "- [<] renew passport ⏳ 2026-12-01"],
    ["- [<] renew passport #priority", "- [<] renew passport #priority ⏳ 2026-12-01"],
    ["- [<] renew passport ^abc", "- [<] renew passport ⏳ 2026-12-01 ^abc"],
    ["- [<] renew passport #priority ^abc  ", "- [<] renew passport #priority ⏳ 2026-12-01 ^abc"],
    ["- [<] renew passport ⏳ 2026-11-20", "- [<] renew passport ⏳ 2026-12-01"],
    ["- [<] renew passport ⏳ 2026-11-20 ^abc", "- [<] renew passport ⏳ 2026-12-01 ^abc"],
    ["- [<] renew ⏳️2026-11-20 #priority", "- [<] renew ⏳️2026-12-01 #priority"],
    ["- [<] pay ⏳ 2026-11-01 now ⏳ 2026-11-20", "- [<] pay ⏳ 2026-11-01 now ⏳ 2026-12-01"],
  ])("sets the date on %j", (line, expected) => {
    expect(setScheduled(line, "2026-12-01")).toBe(expected);
  });

  it("refuses non-tasks", () => {
    expect(() => setScheduled("- a note", "2026-12-01")).toThrow();
  });
});

describe("addBlockId", () => {
  it("appends a block id", () => {
    expect(addBlockId("- [ ] call the bank #priority ", "k3f9a1")).toBe(
      "- [ ] call the bank #priority ^k3f9a1",
    );
  });

  it("leaves a line with a block id unchanged", () => {
    expect(addBlockId("- [ ] call ^old", "new")).toBe("- [ ] call ^old");
  });
});

describe("applyLineEdits", () => {
  const note = "## Log\n\n- [ ] call the bank #priority\n* dentist\n";

  it("replaces only the edited line", () => {
    const after = "- [x] call the bank #priority";
    expect(
      applyLineEdits(note, [{ line: 3, before: "- [ ] call the bank #priority", after }]),
    ).toBe(`## Log\n\n${after}\n* dentist\n`);
  });

  it("keeps CRLF line endings and a missing final newline", () => {
    const crlf = note.replace(/\n/g, "\r\n");
    expect(applyLineEdits(crlf, [{ line: 4, before: "* dentist", after: "* dentist ^ev1" }])).toBe(
      "## Log\r\n\r\n- [ ] call the bank #priority\r\n* dentist ^ev1\r\n",
    );
    expect(applyLineEdits("- [ ] a", [{ line: 1, before: "- [ ] a", after: "- [x] a" }])).toBe(
      "- [x] a",
    );
  });

  it.each<[string, { line: number; before: string; after: string }]>([
    [
      "a changed text",
      { line: 3, before: "- [ ] call the bank #priority", after: "- [ ] call mum #priority" },
    ],
    [
      "a removed signifier",
      { line: 3, before: "- [ ] call the bank #priority", after: "- [ ] call the bank" },
    ],
    [
      "a changed indent",
      {
        line: 3,
        before: "- [ ] call the bank #priority",
        after: "\t- [ ] call the bank #priority",
      },
    ],
    [
      "an added origin",
      {
        line: 3,
        before: "- [ ] call the bank #priority",
        after: "- [ ] call the bank [[2026-11-08#^a]] #priority",
      },
    ],
    ["a changed type", { line: 4, before: "* dentist", after: "- dentist" }],
    ["a stale before", { line: 3, before: "- [ ] call the bank", after: "- [x] call the bank" }],
    ["a non-bullet after", { line: 4, before: "* dentist", after: "dentist" }],
    ["a multi-line after", { line: 4, before: "* dentist", after: "* dentist\n## Log" }],
    ["a line past the end", { line: 9, before: "* dentist", after: "* dentist ^a" }],
  ])("rejects %s", (_name, edit) => {
    expect(() => applyLineEdits(note, [edit])).toThrow();
  });

  it("rejects two edits to one line", () => {
    const edit = { line: 4, before: "* dentist", after: "* dentist ^a" };
    expect(() => applyLineEdits(note, [edit, edit])).toThrow();
  });
});

describe("edit properties", () => {
  const extraLine = fc.oneof(
    bullet.map((b) => formatBullet(b)),
    fc.constantFrom("", "## Log", "a paragraph", "- [?] odd", "> [!capture]- 08:00 · aaaaaaaa"),
  );
  const task = bullet.filter((b) => b.type === "task");

  it("keeps every other line and the fingerprint for any dibujo edit", () => {
    fc.assert(
      fc.property(
        fc.array(extraLine, { maxLength: 8 }),
        task,
        fc.array(extraLine, { maxLength: 8 }),
        fc.constantFrom(...TASK_STATES),
        isoDate,
        blockId,
        fc.constantFrom("\n", "\r\n"),
        (head, t, tail, state, date, id, eol) => {
          const target = formatBullet(t);
          const lines = [...head, target, ...tail];
          const original = `${lines.join(eol)}${eol}`;
          const after = addBlockId(setScheduled(setCheckbox(target, state), date), id);
          expect(fingerprint(parseBulletLine(after) ?? t)).toBe(fingerprint(t));
          const result = applyLineEdits(original, [
            { line: head.length + 1, before: target, after },
          ]);
          const resultLines = result.split(eol);
          resultLines.pop();
          expect(resultLines).toEqual([...head, after, ...tail]);
        },
      ),
    );
  });

  it("rejects any replacement that is a different bullet", () => {
    fc.assert(
      fc.property(bullet, bullet, (a, b) => {
        fc.pre(fingerprint(a) !== fingerprint(b));
        const before = formatBullet(a);
        expect(() =>
          applyLineEdits(`${before}\n`, [{ line: 1, before, after: formatBullet(b) }]),
        ).toThrow();
      }),
    );
  });
});
