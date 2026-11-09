import { describe, expect, it } from "vitest";
import { formatCallout } from "../../src/bujo/capture.js";
import { appendCapture, newNoteTemplate, parseDailyNote } from "../../src/bujo/note.js";
import type { Bullet } from "../../src/bujo/types.js";

const bullets: Bullet[] = [
  { type: "task", state: "open", signifiers: ["priority"], text: "call the bank", depth: 0 },
  { type: "event", signifiers: [], text: "dentist at 3pm", depth: 0 },
];
const callout = formatCallout("08:42", "3f9a1b2c", "call the bank. dentist at 3.");

function originalLinesKept(original: string, result: string): boolean {
  const want = original.split("\n").filter((l, i, all) => !(i === all.length - 1 && l === ""));
  const have = result.split("\n");
  let j = 0;
  for (const line of have) if (j < want.length && line === want[j]) j++;
  return j === want.length;
}

describe("newNoteTemplate", () => {
  it("creates frontmatter and both sections", () => {
    expect(newNoteTemplate("2026-11-09")).toBe(
      "---\ndibujo: 1\ntype: daily\ndate: 2026-11-09\n---\n\n## Log\n\n## Captures\n",
    );
  });

  it("parses as an empty v1 note", () => {
    expect(parseDailyNote(newNoteTemplate("2026-11-09"))).toEqual({
      version: 1,
      bullets: [],
      unrecognized: [],
      captureIds: [],
    });
  });
});

describe("appendCapture", () => {
  it("fills a new note", () => {
    const result = appendCapture(newNoteTemplate("2026-11-09"), bullets, callout);
    expect(result).toBe(
      [
        "---",
        "dibujo: 1",
        "type: daily",
        "date: 2026-11-09",
        "---",
        "",
        "## Log",
        "",
        "- [ ] call the bank #priority",
        "* dentist at 3pm",
        "",
        "## Captures",
        "",
        "> [!capture]- 08:42 · 3f9a1b2c",
        "> call the bank. dentist at 3.",
        "",
      ].join("\n"),
    );
  });

  it("appends after existing content and separates callouts with a blank line", () => {
    const first = appendCapture(newNoteTemplate("2026-11-09"), bullets, callout);
    const second = appendCapture(
      first,
      [{ type: "note", signifiers: [], text: "slept badly", depth: 0 }],
      formatCallout("21:10", "9c04e7d1", "slept badly"),
    );
    expect(second).toContain(
      "* dentist at 3pm\n- slept badly\n\n## Captures\n\n> [!capture]- 08:42 · 3f9a1b2c\n> call the bank. dentist at 3.\n\n> [!capture]- 21:10 · 9c04e7d1\n> slept badly\n",
    );
    expect(parseDailyNote(second).captureIds).toEqual(["3f9a1b2c", "9c04e7d1"]);
    expect(originalLinesKept(first, second)).toBe(true);
  });

  it("adds both sections to a note that has neither", () => {
    const original = "Some thoughts I wrote in Obsidian.\n";
    const result = appendCapture(original, bullets, callout);
    expect(result).toBe(
      [
        "Some thoughts I wrote in Obsidian.",
        "",
        "## Log",
        "",
        "- [ ] call the bank #priority",
        "* dentist at 3pm",
        "",
        "## Captures",
        "",
        "> [!capture]- 08:42 · 3f9a1b2c",
        "> call the bank. dentist at 3.",
        "",
      ].join("\n"),
    );
  });

  it("adds a missing Log section before Captures", () => {
    const original = "## Captures\n\n> [!capture]- 07:00 · aaaaaaaa\n> earlier\n";
    const result = appendCapture(original, bullets, callout);
    expect(result.indexOf("## Log")).toBeLessThan(result.indexOf("## Captures"));
    expect(parseDailyNote(result).bullets).toHaveLength(2);
    expect(originalLinesKept(original, result)).toBe(true);
  });

  it("leaves sections the user added untouched and in place", () => {
    const original = [
      "---",
      "tags: [journal]",
      "---",
      "# Monday",
      "",
      "## Log",
      "- [x] done earlier",
      "",
      "## Gratitude",
      "- coffee",
      "",
      "## Captures",
      "",
      "## Notes from therapy",
      "private stuff",
      "",
    ].join("\n");
    const result = appendCapture(original, bullets, callout);
    expect(originalLinesKept(original, result)).toBe(true);
    expect(result).toContain(
      "- [x] done earlier\n- [ ] call the bank #priority\n* dentist at 3pm\n\n## Gratitude",
    );
    expect(result).toContain(
      "## Captures\n\n> [!capture]- 08:42 · 3f9a1b2c\n> call the bank. dentist at 3.\n\n## Notes from therapy",
    );
    // "- coffee" belongs to Gratitude, not to the Log.
    expect(parseDailyNote(result).bullets.map((b) => b.text)).toEqual([
      "done earlier",
      "call the bank",
      "dentist at 3pm",
    ]);
  });

  it("keeps Windows line endings", () => {
    const original = newNoteTemplate("2026-11-09").replace(/\n/g, "\r\n");
    const result = appendCapture(original, bullets, callout);
    expect(result).not.toMatch(/[^\r]\n/);
    expect(parseDailyNote(result).bullets).toHaveLength(2);
  });

  it("keeps raw text containing a heading inside the callout", () => {
    const tricky = formatCallout("09:00", "bbbbbbbb", "## Log\n- [ ] fake task");
    const result = appendCapture(newNoteTemplate("2026-11-09"), bullets, tricky);
    const parsed = parseDailyNote(result);
    expect(parsed.bullets.map((b) => b.text)).toEqual(["call the bank", "dentist at 3pm"]);
    expect(parsed.unrecognized).toEqual([]);
  });

  it("ignores headings inside code fences", () => {
    const original = "## Log\n\n```\n## Captures\n```\n";
    const result = appendCapture(original, bullets, callout);
    expect(originalLinesKept(original, result)).toBe(true);
    expect(result.match(/^## Captures$/gm)).toHaveLength(2);
  });

  it("works on an empty file", () => {
    const result = appendCapture("", bullets, callout);
    expect(result.startsWith("## Log\n\n- [ ] call the bank")).toBe(true);
  });
});

describe("parseDailyNote", () => {
  it("reports bullets with line numbers and keeps unrecognized lines", () => {
    const content = [
      "---",
      "dibujo: 1",
      "---",
      "## log",
      "- [ ] task one",
      "",
      "a stray paragraph",
      "- [?] odd checkbox",
      "\t- nested note",
      "## Captures",
    ].join("\n");
    const parsed = parseDailyNote(content);
    expect(parsed.bullets).toEqual([
      { type: "task", state: "open", signifiers: [], text: "task one", depth: 0, line: 5 },
      { type: "note", signifiers: [], text: "nested note", depth: 1, line: 9 },
    ]);
    expect(parsed.unrecognized).toEqual([
      { line: 7, text: "a stray paragraph" },
      { line: 8, text: "- [?] odd checkbox" },
    ]);
  });

  it.each<[string, number | null]>([
    ["no frontmatter\n## Log\n", 1],
    ["---\ntags: [a]\n---\n## Log\n", 1],
    ["---\ndibujo: 1\n---\n", 1],
    ["---\ndibujo: 2\n---\n", 2],
    ["---\ndibujo: one\n---\n", null],
    ["---\ndibujo: 1.5\n---\n", null],
    ["---\n: : bad yaml [\n---\n", 1],
  ])("reads the version of %j as %j", (content, version) => {
    expect(parseDailyNote(content).version).toBe(version);
  });

  it("does not run code in ---js frontmatter", () => {
    const content = "---js\n{ dibujo: (globalThis.__pwned = 1) }\n---\n## Log\n";
    parseDailyNote(content);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
});
