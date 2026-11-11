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
      "an event date",
      "* dentist at 3pm 📅 2026-12-12",
      event("dentist at 3pm", { eventDate: "2026-12-12" }),
    ],
    [
      "an event date with a variation selector",
      "* dentist at 3pm 📅\uFE0F 2026-12-12",
      event("dentist at 3pm", { eventDate: "2026-12-12" }),
    ],
    [
      "an event date after a tag and before a block id",
      "* dentist at 3pm #priority 📅 2026-12-12 ^ev1",
      event("dentist at 3pm", {
        signifiers: ["priority"],
        eventDate: "2026-12-12",
        blockId: "ev1",
      }),
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

  it("reads 📅 on events only, and leaves it in the text of a task or a note", () => {
    expect(parseBulletLine("- [ ] pay rent 📅 2026-12-12")).toEqual(
      task("open", "pay rent 📅 2026-12-12"),
    );
    expect(parseBulletLine("- slept badly 📅 2026-12-12")).toEqual(
      note("slept badly 📅 2026-12-12"),
    );
    // And an event keeps ⏳ in its text, since that field belongs to tasks.
    expect(parseBulletLine("* dentist ⏳ 2026-12-12")).toEqual(event("dentist ⏳ 2026-12-12"));
  });

  it("keeps the 📅 field nearest the end when an event has two", () => {
    expect(parseBulletLine("* trip 📅 2026-12-01 📅 2026-12-12")).toEqual(
      event("trip 📅 2026-12-01", { eventDate: "2026-12-12" }),
    );
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

  it("writes an event date in the slot of ⏳: after the tags, before the block id", () => {
    const bullet = event("dentist at 3pm", {
      signifiers: ["priority"],
      eventDate: "2026-12-12",
      blockId: "ev1",
    });
    expect(formatBullet(bullet)).toBe("* dentist at 3pm #priority 📅 2026-12-12 ^ev1");
  });

  it("writes a future origin without a year, even when it was read from an old link", () => {
    const old = parseBulletLine("- [ ] call [[Bujo/Future/2026#^m4n5p6|from future log 2026]]");
    expect(old?.origin).toEqual({ blockId: "m4n5p6", year: "2026" });
    if (!old) throw new Error("expected a bullet");
    expect(formatBullet(old, { folder: "Bujo" })).toBe(
      "- [ ] call [[Bujo/Future#^m4n5p6|from future log]]",
    );
    expect(formatBullet(old)).toBe("- [ ] call [[Future#^m4n5p6|from future log]]");
  });

  it("normalizes folder separators", () => {
    expect(formatBullet(task("open", "call", { origin }), { folder: "Journal\\Bujo/" })).toBe(
      "- [ ] call [[Journal/Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]]",
    );
  });
});

describe("origin links", () => {
  const daily = { date: "2026-11-08", blockId: "k3f9a1" };
  const future = { blockId: "m4n5p6" };
  const oldFuture = { blockId: "m4n5p6", year: "2026" };

  it.each<[string, string, Bullet["origin"], string | undefined]>([
    ["daily, full path, alias", "[[Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]]", daily, "Bujo"],
    ["daily, basename, alias", "[[2026-11-08#^k3f9a1|from 2026-11-08]]", daily, undefined],
    ["daily, basename, no alias", "[[2026-11-08#^k3f9a1]]", daily, undefined],
    ["daily, full path, no alias", "[[Bujo/Daily/2026-11-08#^k3f9a1]]", daily, "Bujo"],
    ["future, full path, alias", "[[Bujo/Future#^m4n5p6|from future log]]", future, "Bujo"],
    [
      "future, nested folder",
      "[[Journal/Bujo/Future#^m4n5p6|from future log]]",
      future,
      "Journal/Bujo",
    ],
    ["future, basename, alias", "[[Future#^m4n5p6|from future log]]", future, undefined],
    ["future, basename, no alias", "[[Future#^m4n5p6]]", future, undefined],
    ["future, full path, no alias", "[[Bujo/Future#^m4n5p6]]", future, "Bujo"],
  ])("reads and writes %s", (_name, link, origin, folder) => {
    expect(parseBulletLine(`- [ ] call ${link}`)).toEqual(task("open", "call", { origin }));
    // Writing uses the canonical alias, so only linked forms with an alias match exactly.
    if (link.includes("|") && origin) {
      expect(formatBullet(task("open", "call", { origin }), folder ? { folder } : {})).toBe(
        `- [ ] call ${link}`,
      );
    }
  });

  it.each<[string, string]>([
    ["full path, alias", "[[Bujo/Future/2026#^m4n5p6|from future log 2026]]"],
    ["basename, alias", "[[2026#^m4n5p6|from future log 2026]]"],
    ["basename, no alias", "[[2026#^m4n5p6]]"],
    ["full path, no alias", "[[Bujo/Future/2026#^m4n5p6]]"],
  ])("reads the old year form (%s) as a future origin with the year", (_name, link) => {
    expect(parseBulletLine(`- [ ] call ${link}`)).toEqual(
      task("open", "call", { origin: oldFuture }),
    );
  });

  it.each([
    "[[Books/2026#^abc]]",
    "[[Bujo/Daily/2026#^abc]]",
    "[[Bujo/Future/2026-11-08#^abc]]",
    "[[Books/2026-11-08#^abc]]",
    "[[Bujo/Future/Archive#^abc]]",
  ])("keeps %s in the text", (link) => {
    expect(parseBulletLine(`- [ ] read ${link}`)).toEqual(task("open", `read ${link}`));
  });
});

describe("fingerprint", () => {
  it("gives a task with a daily origin the same value as before future origins existed", () => {
    // Computed with the code before this change. Changing it would break every saved ref.
    const pinned = task("open", "call the bank", {
      signifiers: ["priority"],
      origin: { date: "2026-11-08", blockId: "k3f9a1" },
    });
    expect(fingerprint(pinned)).toBe("bf760f4f");
    expect(fingerprint({ ...pinned, origin: { year: "2026", blockId: "k3f9a1" } })).not.toBe(
      "bf760f4f",
    );
  });

  const base = task("open", "call the bank", { signifiers: ["priority"] });

  it("gives an old-form and a new-form link to the same entry the same value", () => {
    const fromOld = parseBulletLine("- [ ] call [[Bujo/Future/2026#^m4n5p6|from future log 2026]]");
    const fromNew = parseBulletLine("- [ ] call [[Bujo/Future#^m4n5p6|from future log]]");
    if (!fromOld || !fromNew) throw new Error("expected bullets");
    expect(fromOld.origin).not.toEqual(fromNew.origin);
    expect(fingerprint(fromOld)).toBe(fingerprint(fromNew));
    expect(fingerprint(fromNew)).not.toBe(
      fingerprint({ ...fromNew, origin: { blockId: "other1" } }),
    );
  });

  it("ignores the event date", () => {
    const dentist = event("dentist at 3pm", { eventDate: "2026-12-12" });
    expect(fingerprint(dentist)).toBe(fingerprint({ ...dentist, eventDate: "2026-12-20" }));
    expect(fingerprint(dentist)).toBe(fingerprint(event("dentist at 3pm")));
  });

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
      event("j", { eventDate: "2026-12-12" }),
      event("k", { signifiers: ["priority"], eventDate: "2026-12-12", blockId: "ev1" }),
      task("open", "l", { origin: { blockId: "m4n5p6" } }),
      task("migrated", "m", { origin: { date: "2026-11-08", blockId: "k3f9a1" } }),
    ];
    for (const bullet of bullets) {
      expect(parseBulletLine(formatBullet(bullet))).toEqual(bullet);
    }
  });
});
