import { describe, expect, it } from "vitest";
import { formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
import type { Bullet } from "../../src/bujo/types.js";

const task = (state: Bullet["state"], text: string, extra: Partial<Bullet> = {}): Bullet => ({
  type: "task",
  state,
  signifiers: [],
  text,
  depth: 0,
  ...extra,
});
const event = (text: string, extra: Partial<Bullet> = {}): Bullet => ({
  type: "event",
  signifiers: [],
  text,
  depth: 0,
  ...extra,
});
const note = (text: string, extra: Partial<Bullet> = {}): Bullet => ({
  type: "note",
  signifiers: [],
  text,
  depth: 0,
  ...extra,
});

describe("parseBulletLine", () => {
  it.each<[string, Bullet]>([
    ["- [ ] call the bank", task("open", "call the bank")],
    ["- [x] send invoice", task("completed", "send invoice")],
    ["- [X] send invoice", task("completed", "send invoice")],
    ["- [>] book flights", task("migrated", "book flights")],
    ["- [<] renew passport", task("scheduled", "renew passport")],
    ["- [-] old plan", task("cancelled", "old plan")],
    ["* [ ] typed by hand", task("open", "typed by hand")],
    ["+ [x] plus marker", task("completed", "plus marker")],
    ["* dentist at 3pm", event("dentist at 3pm")],
    ["- slept badly", note("slept badly")],
    ["+ plus note", note("plus note")],
  ])("parses %j", (line, expected) => {
    expect(parseBulletLine(line)).toEqual(expected);
  });

  it("pulls trailing signifier tags out of the text, in order", () => {
    expect(parseBulletLine("- [ ] call the bank #priority")).toEqual(
      task("open", "call the bank", { signifiers: ["priority"] }),
    );
    expect(parseBulletLine("- weekly review idea #inspiration #priority")).toEqual(
      note("weekly review idea", { signifiers: ["inspiration", "priority"] }),
    );
    expect(parseBulletLine("* launch #Priority")).toEqual(
      event("launch", { signifiers: ["priority"] }),
    );
  });

  it("removes duplicate signifiers", () => {
    expect(parseBulletLine("- x #priority #priority")?.signifiers).toEqual(["priority"]);
  });

  it("leaves tags in the middle of the text alone", () => {
    expect(parseBulletLine("- the #priority list is long")).toEqual(
      note("the #priority list is long"),
    );
  });

  it("leaves other tags alone", () => {
    expect(parseBulletLine("- [ ] email Ana #work")).toEqual(task("open", "email Ana #work"));
  });

  it.each<[string, number]>([
    ["\t- nested", 1],
    ["\t\t- nested", 2],
    ["    - nested", 1],
    ["        - nested", 2],
    ["  - nested", 1],
    ["\t    - mixed", 2],
  ])("reads the depth of %j as %i", (line, depth) => {
    expect(parseBulletLine(line)?.depth).toBe(depth);
  });

  it.each([
    "",
    "   ",
    "just a paragraph",
    "## Heading",
    "- [?] unknown checkbox",
    "- [ ]",
    "- [ ] ",
    "-",
    "- ",
    "-no space",
    "*bold*",
    "1. ordered item",
    "> quote",
  ])("returns null for %j", (line) => {
    expect(parseBulletLine(line)).toBeNull();
  });

  it("keeps a lone tag as text, since there is no space before it", () => {
    expect(parseBulletLine("- #priority")).toEqual(note("#priority"));
  });
});

describe("formatBullet", () => {
  it.each<[Bullet, string]>([
    [task("open", "call the bank"), "- [ ] call the bank"],
    [task("completed", "send invoice"), "- [x] send invoice"],
    [task("migrated", "book flights"), "- [>] book flights"],
    [task("scheduled", "renew passport"), "- [<] renew passport"],
    [task("cancelled", "old plan"), "- [-] old plan"],
    [event("dentist at 3pm"), "* dentist at 3pm"],
    [note("slept badly"), "- slept badly"],
    [task("open", "call", { signifiers: ["priority"] }), "- [ ] call #priority"],
    [note("idea", { signifiers: ["inspiration", "priority"] }), "- idea #inspiration #priority"],
    [task("open", "child", { depth: 2 }), "\t\t- [ ] child"],
  ])("formats %j", (bullet, expected) => {
    expect(formatBullet(bullet)).toBe(expected);
  });

  it("writes an open checkbox for a task without a state", () => {
    expect(formatBullet({ type: "task", signifiers: [], text: "t", depth: 0 })).toBe("- [ ] t");
  });

  it("round-trips every bullet shape", () => {
    const bullets: Bullet[] = [
      task("open", "a"),
      task("completed", "b", { signifiers: ["priority"] }),
      task("migrated", "c", { depth: 1 }),
      task("scheduled", "d", { signifiers: ["inspiration", "priority"], depth: 3 }),
      task("cancelled", "e"),
      event("f", { signifiers: ["inspiration"] }),
      event("g", { depth: 2 }),
      note("h"),
      note("i with #work tag", { signifiers: ["priority"] }),
    ];
    for (const bullet of bullets) {
      expect(parseBulletLine(formatBullet(bullet))).toEqual(bullet);
    }
  });
});
