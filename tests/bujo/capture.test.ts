import { describe, expect, it } from "vitest";
import { formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
import {
  CALLOUT_HEADER,
  captureId,
  formatCallout,
  normalizeRaw,
  parseCapture,
} from "../../src/bujo/capture.js";
import { DibujoError } from "../../src/errors.js";

const valid = {
  raw: "need to call the bank, the big one. dentist at 3.",
  bullets: [
    { type: "task", text: "call the bank", signifiers: ["priority"] },
    { type: "event", text: "dentist at 3pm" },
  ],
};

function invalidMessage(input: unknown): string {
  try {
    parseCapture(typeof input === "string" ? input : JSON.stringify(input));
  } catch (error) {
    expect(error).toBeInstanceOf(DibujoError);
    expect((error as DibujoError).code).toBe("INVALID_INPUT");
    return (error as DibujoError).message;
  }
  throw new Error("expected parseCapture to throw");
}

describe("parseCapture", () => {
  it("parses a valid capture and fills in defaults", () => {
    expect(parseCapture(JSON.stringify(valid))).toEqual({
      raw: valid.raw,
      bullets: [
        { type: "task", state: "open", text: "call the bank", signifiers: ["priority"], depth: 0 },
        { type: "event", text: "dentist at 3pm", signifiers: [], depth: 0 },
      ],
    });
  });

  it("keeps an explicit task state", () => {
    const capture = parseCapture(
      JSON.stringify({ raw: "r", bullets: [{ type: "task", text: "t", state: "completed" }] }),
    );
    expect(capture.bullets[0]?.state).toBe("completed");
  });

  it("trims bullet text and removes duplicate signifiers", () => {
    const capture = parseCapture(
      JSON.stringify({
        raw: "r",
        bullets: [{ type: "note", text: "  spaced  ", signifiers: ["priority", "priority"] }],
      }),
    );
    expect(capture.bullets[0]).toMatchObject({ text: "spaced", signifiers: ["priority"] });
  });

  it("rejects input that isn't JSON", () => {
    expect(invalidMessage("not json")).toContain("not valid JSON");
  });

  it.each<[string, unknown, string]>([
    ["a missing raw", { bullets: valid.bullets }, "raw"],
    ["empty raw", { raw: "   ", bullets: valid.bullets }, "raw"],
    ["no bullets", { raw: "r", bullets: [] }, "bullets"],
    ["an unknown type", { raw: "r", bullets: [{ type: "idea", text: "x" }] }, "bullets.0.type"],
    ["empty text", { raw: "r", bullets: [{ type: "note", text: " " }] }, "bullets.0.text"],
    ["multi-line text", { raw: "r", bullets: [{ type: "note", text: "a\nb" }] }, "single line"],
    [
      "a Unicode line separator",
      { raw: "r", bullets: [{ type: "note", text: "a\u2028b" }] },
      "single line",
    ],
    ["a leading checkbox", { raw: "r", bullets: [{ type: "note", text: "[x] a" }] }, "checkbox"],
    [
      "a leading checkbox without a space",
      { raw: "r", bullets: [{ type: "note", text: "[]]!" }] },
      "checkbox",
    ],
    [
      "a reserved tag in text",
      { raw: "r", bullets: [{ type: "note", text: "a #priority" }] },
      "signifiers",
    ],
    [
      "a state on a note",
      { raw: "r", bullets: [{ type: "note", text: "a", state: "open" }] },
      "bullets.0.state",
    ],
    [
      "an unknown signifier",
      { raw: "r", bullets: [{ type: "note", text: "a", signifiers: ["urgent"] }] },
      "bullets.0.signifiers.0",
    ],
    [
      "a first bullet with depth 1",
      { raw: "r", bullets: [{ type: "note", text: "a", depth: 1 }] },
      "bullets.0.depth",
    ],
    [
      "a depth jump of two levels",
      {
        raw: "r",
        bullets: [
          { type: "note", text: "a" },
          { type: "note", text: "b", depth: 2 },
        ],
      },
      "bullets.1.depth",
    ],
    [
      "depth above the maximum",
      { raw: "r", bullets: [{ type: "note", text: "a", depth: 4 }] },
      "depth",
    ],
    ["unknown keys", { raw: "r", bullets: valid.bullets, extra: true }, "extra"],
    [
      "a scheduled date in text",
      { raw: "r", bullets: [{ type: "task", text: "pay rent ⏳ 2026-12-01" }] },
      "⏳",
    ],
    [
      "a trailing block id",
      { raw: "r", bullets: [{ type: "task", text: "pay rent ^abc123" }] },
      "block id",
    ],
    [
      "a trailing block link",
      { raw: "r", bullets: [{ type: "task", text: "pay rent [[2026-11-08#^abc]]" }] },
      "block link",
    ],
    [
      "a trailing aliased block link",
      { raw: "r", bullets: [{ type: "note", text: "see [[Bujo/Daily/2026-11-08#^a1|from]]" }] },
      "block link",
    ],
  ])("rejects %s", (_name, input, expected) => {
    expect(invalidMessage(input)).toContain(expected);
  });

  it("never puts input values in the error message", () => {
    const message = invalidMessage({
      raw: "very private thought",
      bullets: [{ type: "idea", text: "another private thought" }],
    });
    expect(message).not.toContain("private");
  });

  it("produces bullets that format and parse back unchanged", () => {
    const capture = parseCapture(
      JSON.stringify({
        raw: "r",
        bullets: [
          { type: "task", text: "a", state: "migrated", signifiers: ["inspiration", "priority"] },
          { type: "note", text: "b with #work", depth: 1 },
          { type: "event", text: "c", depth: 2 },
          { type: "task", text: "d", state: "cancelled", depth: 3 },
        ],
      }),
    );
    for (const bullet of capture.bullets) {
      expect(parseBulletLine(formatBullet(bullet))).toEqual(bullet);
    }
  });
});

describe("captureId", () => {
  const capture = parseCapture(JSON.stringify(valid));

  it("is 8 lowercase hex characters", () => {
    expect(captureId(capture)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is the same for the same capture", () => {
    expect(captureId(parseCapture(JSON.stringify(valid)))).toBe(captureId(capture));
  });

  it("ignores line endings and trailing whitespace in the raw text", () => {
    const a = { ...capture, raw: "line one\nline two" };
    const b = { ...capture, raw: "line one  \r\nline two\r\n" };
    expect(captureId(a)).toBe(captureId(b));
  });

  it("changes when the bullets change", () => {
    const other = parseCapture(
      JSON.stringify({ ...valid, bullets: [{ type: "task", text: "call the bank" }] }),
    );
    expect(captureId(other)).not.toBe(captureId(capture));
  });
});

describe("normalizeRaw", () => {
  it("normalizes line endings and trims blank lines at the edges", () => {
    expect(normalizeRaw("\n\na\r\nb  \rc\n\n")).toBe("a\nb\nc");
  });
});

describe("formatCallout", () => {
  it("prefixes every line so raw text can't create headings", () => {
    expect(formatCallout("08:42", "3f9a1b2c", "first\n\n## not a heading")).toEqual([
      "> [!capture]- 08:42 · 3f9a1b2c",
      "> first",
      ">",
      "> ## not a heading",
    ]);
  });

  it("produces a header that CALLOUT_HEADER recognizes", () => {
    const [header = ""] = formatCallout("21:10", "9c04e7d1", "x");
    expect(CALLOUT_HEADER.exec(header)?.[1]).toBe("9c04e7d1");
  });
});
