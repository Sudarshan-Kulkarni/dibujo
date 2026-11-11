import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
import { parseCapture } from "../../src/bujo/capture.js";
import { parseFutureNote } from "../../src/bujo/future.js";
import { parseFutureAdd } from "../../src/bujo/future-input.js";
import { parseDailyNote } from "../../src/bujo/note.js";

const doc = readFileSync(
  fileURLToPath(new URL("../../docs/vault-format.md", import.meta.url)),
  "utf8",
);

/** Returns the body of the first fenced block with the given language after a heading. */
function blockAfter(heading: string, language: string): string {
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, `heading ${heading} not found`).toBeGreaterThanOrEqual(0);
  const fence = `\`\`\`${language}\n`;
  const open = doc.indexOf(fence, start);
  const close = doc.indexOf("\n```", open + fence.length);
  return doc.slice(open + fence.length, close + 1);
}

describe("docs/vault-format.md", () => {
  it("has an example note that parses to the documented bullets", () => {
    const parsed = parseDailyNote(blockAfter("## Example", "markdown"));
    expect(parsed.version).toBe(1);
    expect(parsed.unrecognized).toEqual([]);
    expect(parsed.captureIds).toEqual(["3f9a1b2c", "9c04e7d1"]);
    expect(parsed.bullets.map(({ line: _line, ...b }) => b)).toEqual([
      {
        type: "task",
        state: "open",
        signifiers: ["priority"],
        text: "call the bank about the card",
        depth: 0,
      },
      { type: "task", state: "completed", signifiers: [], text: "send invoice to Ana", depth: 0 },
      {
        type: "task",
        state: "open",
        signifiers: [],
        text: "renew passport",
        depth: 0,
        origin: { date: "2026-11-08", blockId: "k3f9a1" },
      },
      {
        type: "task",
        state: "scheduled",
        signifiers: [],
        text: "book flights",
        depth: 0,
        scheduled: "2026-11-20",
      },
      { type: "event", signifiers: [], text: "dentist at 3pm", depth: 0 },
      {
        type: "note",
        signifiers: [],
        text: "sleep was bad, too much screen time before bed",
        depth: 0,
      },
      {
        type: "note",
        signifiers: ["inspiration"],
        text: "weekly review on sunday evenings",
        depth: 0,
      },
      { type: "task", state: "open", signifiers: [], text: "block 30 min in calendar", depth: 1 },
    ]);
  });

  it("documents a bullet table that matches the parser", () => {
    const rows: [string, Record<string, unknown>][] = [
      ["- [ ] text", { type: "task", state: "open" }],
      ["- [x] text", { type: "task", state: "completed" }],
      ["- [>] text", { type: "task", state: "migrated" }],
      ["- [<] text", { type: "task", state: "scheduled" }],
      ["- [-] text", { type: "task", state: "cancelled" }],
      ["* text", { type: "event" }],
      ["- text", { type: "note" }],
    ];
    for (const [markdown, expected] of rows) {
      expect(doc).toContain(`\`${markdown}\``);
      expect(parseBulletLine(markdown)).toMatchObject(expected);
    }
  });

  it("has a nesting example that parses with increasing depth", () => {
    const lines = blockAfter("### Nesting", "markdown").trimEnd().split("\n");
    expect(lines.map((l) => parseBulletLine(l)?.depth)).toEqual([0, 1, 2]);
  });

  it("has a capture input example that passes validation", () => {
    expect(() => parseCapture(blockAfter("## Capture input", "json"))).not.toThrow();
  });

  it("has a task fields example that parses every field and formats back the same", () => {
    const line = blockAfter("### Task fields", "markdown").trimEnd();
    const bullet = parseBulletLine(line);
    expect(bullet).toEqual({
      type: "task",
      state: "scheduled",
      signifiers: ["priority"],
      text: "call the bank",
      depth: 0,
      origin: { date: "2026-11-08", blockId: "k3f9a1" },
      scheduled: "2026-11-20",
      blockId: "p07c2e",
    });
    expect(bullet && formatBullet(bullet, { folder: "Bujo" })).toBe(line);
  });

  it("has a migration example where the copy links to the original", () => {
    const [before, after] = blockAfter("## Migration", "markdown")
      .trimEnd()
      .split("\n")
      .map((l) => parseBulletLine(l.replace(/^\d{4}-\d{2}-\d{2}:\s+/, "")));
    expect(before).toMatchObject({ state: "migrated", blockId: "r1a2b3" });
    expect(after).toMatchObject({
      state: "open",
      text: before?.text,
      signifiers: before?.signifiers,
      origin: { date: "2026-11-09", blockId: "r1a2b3" },
    });
  });

  it("has a future log example that parses as a flat note, with links that point at each other", () => {
    const parsed = parseFutureNote(blockAfter("## Future log", "markdown"));
    expect(parsed.version).toBe(1);
    expect(parsed.unrecognized).toEqual([]);
    expect(
      parsed.entries.map((e) => [e.type, e.state, e.text, e.scheduled ?? e.eventDate]),
    ).toEqual([
      ["task", "open", "learn Rust", undefined],
      ["task", "open", "book flights", "2026-12-20"],
      ["task", "migrated", "renew passport", "2026-11-12"],
      ["event", undefined, "dentist at 3pm", "2026-12-12"],
      ["note", undefined, "check out the zine fair in spring", undefined],
    ]);

    const [daily, entry, copy] = blockAfter("### Scheduling and coming back", "markdown")
      .trimEnd()
      .split("\n")
      .map((l) => parseBulletLine(l.replace(/^[^:]+:\s+/, "")));
    const documented = parsed.entries.find((e) => e.blockId === "m4n5p6");
    expect(documented).toMatchObject({ text: entry?.text, origin: entry?.origin });
    // The entry links to the daily task's block id, and the daily copy links back to the
    // entry's, in the future form that has no year.
    expect(entry?.origin).toEqual({ date: "2026-11-09", blockId: daily?.blockId });
    expect(copy?.origin).toEqual({ blockId: entry?.blockId });
  });

  it("has a future log input example that passes validation", () => {
    expect(parseFutureAdd(blockAfter("### Adding to the future log", "json"))).toHaveLength(3);
  });
});
