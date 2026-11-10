import { describe, expect, it } from "vitest";
import { fingerprint, formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
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

describe("parseBulletLine: trailing fields", () => {
  const origin = { date: "2026-11-08", blockId: "k3f9a1" };

  it.each<[string, string, Bullet]>([
    [
      "a block id",
      "- [>] call the bank ^k3f9a1",
      task("migrated", "call the bank", { blockId: "k3f9a1" }),
    ],
    [
      "a scheduled date",
      "- [<] renew passport ⏳ 2026-11-20",
      task("scheduled", "renew passport", { scheduled: "2026-11-20" }),
    ],
    [
      "a scheduled date with a variation selector",
      "- [<] renew passport ⏳\uFE0F 2026-11-20",
      task("scheduled", "renew passport", { scheduled: "2026-11-20" }),
    ],
    [
      "a full-path origin link",
      "- [ ] call the bank [[Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]]",
      task("open", "call the bank", { origin }),
    ],
    [
      "a nested-folder origin link",
      "- [ ] call the bank [[Journal/Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]]",
      task("open", "call the bank", { origin }),
    ],
    [
      "a basename origin link without alias",
      "- [ ] call the bank [[2026-11-08#^k3f9a1]]",
      task("open", "call the bank", { origin }),
    ],
    [
      "all fields in canonical order",
      "- [<] call the bank [[Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]] #priority ⏳ 2026-11-20 ^p07c2e",
      task("scheduled", "call the bank", {
        origin,
        signifiers: ["priority"],
        scheduled: "2026-11-20",
        blockId: "p07c2e",
      }),
    ],
    [
      "fields in a hand-edited order",
      "- [<] call the bank ^p07c2e #priority [[2026-11-08#^k3f9a1|x]] ⏳ 2026-11-20",
      task("scheduled", "call the bank", {
        origin,
        signifiers: ["priority"],
        scheduled: "2026-11-20",
        blockId: "p07c2e",
      }),
    ],
    [
      "a block id on an event",
      "* dentist at 3pm ^ev1",
      event("dentist at 3pm", { blockId: "ev1" }),
    ],
    [
      "a block id on a note, after a tag",
      "- slept badly #inspiration ^Ab-12",
      note("slept badly", { signifiers: ["inspiration"], blockId: "Ab-12" }),
    ],
  ])("parses %s", (_name, line, expected) => {
    expect(parseBulletLine(line)).toEqual(expected);
  });

  it.each<[string, string, string]>([
    ["a block id in the middle", "- [ ] read ^abc then sleep", "read ^abc then sleep"],
    ["a date in the middle", "- [ ] pay ⏳ 2026-11-20 rent", "pay ⏳ 2026-11-20 rent"],
    ["a block id without a space", "- [ ] pay rent^abc", "pay rent^abc"],
    [
      "a link to a non-daily note",
      "- [ ] read [[Books/2026-11-08#^abc]]",
      "read [[Books/2026-11-08#^abc]]",
    ],
    [
      "a link without a block",
      "- [ ] read [[Bujo/Daily/2026-11-08]]",
      "read [[Bujo/Daily/2026-11-08]]",
    ],
    ["a malformed date", "- [<] pay ⏳ 2026-1-2", "pay ⏳ 2026-1-2"],
  ])("leaves %s in the text", (_name, line, text) => {
    expect(parseBulletLine(line)?.text).toBe(text);
  });

  it("keeps the field nearest the end when one appears twice", () => {
    expect(parseBulletLine("- [ ] pay ^one ^two")).toEqual(
      task("open", "pay ^one", { blockId: "two" }),
    );
    expect(parseBulletLine("- [<] pay ⏳ 2026-11-01 ⏳ 2026-11-20")).toEqual(
      task("scheduled", "pay ⏳ 2026-11-01", { scheduled: "2026-11-20" }),
    );
  });

  it("reads scheduled dates and origin links on tasks only", () => {
    expect(parseBulletLine("- see you ⏳ 2026-11-20")).toEqual(note("see you ⏳ 2026-11-20"));
    expect(parseBulletLine("- see [[2026-11-08#^abc]]")).toEqual(note("see [[2026-11-08#^abc]]"));
  });

  it("returns null when only fields are left", () => {
    expect(parseBulletLine("- [ ] x ^abc")?.text).toBe("x");
    expect(parseBulletLine("- [ ]  ^abc")).toBeNull();
    expect(parseBulletLine("- [ ] ^abc")).toEqual(task("open", "^abc"));
  });
});

describe("formatBullet: trailing fields", () => {
  const origin = { date: "2026-11-08", blockId: "k3f9a1" };

  it("writes fields in canonical order", () => {
    const bullet = task("scheduled", "call the bank", {
      origin,
      signifiers: ["priority"],
      scheduled: "2026-11-20",
      blockId: "p07c2e",
    });
    expect(formatBullet(bullet, { folder: "Bujo" })).toBe(
      "- [<] call the bank [[Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]] #priority ⏳ 2026-11-20 ^p07c2e",
    );
  });

  it("writes basename-only links without a folder", () => {
    expect(formatBullet(task("open", "call", { origin }))).toBe(
      "- [ ] call [[2026-11-08#^k3f9a1|from 2026-11-08]]",
    );
  });

  it("normalizes folder separators", () => {
    expect(formatBullet(task("open", "call", { origin }), { folder: "Journal\\Bujo/" })).toBe(
      "- [ ] call [[Journal/Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]]",
    );
  });
});

describe("fingerprint", () => {
  const base = task("open", "call the bank", { signifiers: ["priority"] });

  it("ignores state, scheduled date, and block id", () => {
    const id = fingerprint(base);
    expect(fingerprint({ ...base, state: "migrated", blockId: "abc" })).toBe(id);
    expect(fingerprint({ ...base, state: "scheduled", scheduled: "2026-11-20" })).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes with text, signifiers, depth, type, or origin", () => {
    const id = fingerprint(base);
    expect(fingerprint({ ...base, text: "call the bank!" })).not.toBe(id);
    expect(fingerprint({ ...base, signifiers: [] })).not.toBe(id);
    expect(fingerprint({ ...base, depth: 1 })).not.toBe(id);
    expect(fingerprint({ ...base, type: "note", state: undefined })).not.toBe(id);
    expect(fingerprint({ ...base, origin: { date: "2026-11-08", blockId: "x" } })).not.toBe(id);
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
