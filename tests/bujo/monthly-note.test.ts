import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MovingTask } from "../../src/bujo/month.js";
import {
  appendSummary,
  containsBlock,
  hasSummary,
  newMonthlyTemplate,
  parseSummaryInput,
  renderSummary,
} from "../../src/bujo/monthly-note.js";
import { isSubsequence, splitLines } from "../../src/bujo/note.js";
import { DibujoError } from "../../src/errors.js";

function moving(text: string, moves: number): MovingTask {
  return { text, moves, firstDate: "2026-10-02", lastDate: "2026-10-20", state: "open" };
}

const full = parseSummaryInput(
  JSON.stringify({
    highlights: ["moved into the new flat", "finished the first draft of the zine"],
    themes: ["settling into the new flat", "slept badly most weeks"],
    intentions: ["go to bed by 11", "one zine page a week"],
  }),
);

describe("renderSummary", () => {
  it("writes every section when all are filled", () => {
    const lines = renderSummary(
      "2026-10",
      full,
      23,
      [moving("call the bank", 5), moving("renew passport", 3)],
      3,
    );
    expect(lines.join("\n")).toBe(
      [
        "# October 2026 summary",
        "",
        "## Highlights",
        "",
        "- moved into the new flat",
        "- finished the first draft of the zine",
        "",
        "## Tasks done",
        "",
        "23",
        "",
        "## Tasks that kept moving",
        "",
        "- call the bank (moved 5 times)",
        "- renew passport (moved 3 times)",
        "",
        "## Themes and intentions",
        "",
        "### Themes",
        "",
        "- settling into the new flat",
        "- slept badly most weeks",
        "",
        "### Intentions",
        "",
        "- go to bed by 11",
        "- one zine page a week",
      ].join("\n"),
    );
  });

  it("keeps every heading, with a short line, when every section is empty", () => {
    const lines = renderSummary("2026-10", parseSummaryInput("{}"), 0, [], 3);
    expect(lines.join("\n")).toBe(
      [
        "# October 2026 summary",
        "",
        "## Highlights",
        "",
        "Nothing this month.",
        "",
        "## Tasks done",
        "",
        "0",
        "",
        "## Tasks that kept moving",
        "",
        "No task moved 3 or more times.",
        "",
        "## Themes and intentions",
        "",
        "### Themes",
        "",
        "None.",
        "",
        "### Intentions",
        "",
        "None.",
      ].join("\n"),
    );
  });
});

describe("hasSummary", () => {
  const summary = renderSummary("2026-10", full, 1, [], 3);

  it("is true for a rendered summary, even with a renamed title", () => {
    const content = appendSummary(newMonthlyTemplate("2026-10"), summary);
    expect(hasSummary(content)).toBe(true);
    expect(hasSummary(content.replace("# October 2026 summary", "# My October"))).toBe(true);
  });

  it("is true for a heading in another case", () => {
    expect(hasSummary("---\ndibujo: 1\n---\n\n## HIGHLIGHTS\n\n- x\n")).toBe(true);
  });

  it("is false for a note with only other headings", () => {
    expect(hasSummary(`${newMonthlyTemplate("2026-10")}\n## Reading\n\n- a book\n`)).toBe(false);
    expect(hasSummary(newMonthlyTemplate("2026-10"))).toBe(false);
  });

  it("is false when the headings are in a code fence", () => {
    expect(hasSummary("# Notes\n\n```\n## Highlights\n```\n")).toBe(false);
  });
});

describe("parseSummaryInput", () => {
  const codeOf = (json: string) => {
    try {
      parseSummaryInput(json);
    } catch (error) {
      return error instanceof DibujoError ? error.code : "other";
    }
    return undefined;
  };

  it("rejects an unknown field", () => {
    expect(codeOf('{"highlights":[],"done":5}')).toBe("INVALID_INPUT");
  });

  it("rejects a multi-line item", () => {
    expect(codeOf('{"themes":["one\\ntwo"]}')).toBe("INVALID_INPUT");
  });

  it("rejects more than 10 items", () => {
    const items = Array.from({ length: 11 }, (_, i) => `item ${i}`);
    expect(codeOf(JSON.stringify({ highlights: items }))).toBe("INVALID_INPUT");
    expect(codeOf(JSON.stringify({ highlights: items.slice(0, 10) }))).toBeUndefined();
  });

  it("rejects invalid JSON", () => {
    expect(codeOf("not json")).toBe("INVALID_INPUT");
  });
});

describe("containsBlock", () => {
  it("finds lines that appear one after another, and no other order", () => {
    expect(containsBlock("a\nb\nc\n", ["b", "c"])).toBe(true);
    expect(containsBlock("a\nb\nx\nc\n", ["b", "c"])).toBe(false);
  });
});

describe("appendSummary", () => {
  const line = fc
    .string({ unit: "grapheme-ascii", maxLength: 20 })
    .map((s) => s.replace(/[\r\n]/g, ""));

  it("keeps every original line in order", () => {
    fc.assert(
      fc.property(
        fc.array(line, { maxLength: 12 }),
        fc.constantFrom("\n", "\r\n"),
        fc.boolean(),
        (original, eol, finalEol) => {
          const content = original.join(eol) + (finalEol ? eol : "");
          const summary = renderSummary("2026-10", full, 3, [], 3);
          const result = appendSummary(content, summary);
          const before = splitLines(content).lines;
          const after = splitLines(result).lines;
          expect(isSubsequence(before, after)).toBe(true);
          expect(containsBlock(result, summary)).toBe(true);
          expect(hasSummary(result)).toBe(true);
        },
      ),
    );
  });
});
