import { chmodSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCapture } from "../../src/bujo/capture.js";
import type { VaultConfig } from "../../src/config.js";
import { DibujoError } from "../../src/errors.js";
import { addCapture, readDailyNote } from "../../src/vault/daily.js";
import { dailyNotePath, resolveInVault } from "../../src/vault/paths.js";
import { tempDir } from "../helpers/ctx.js";

const now = new Date("2026-11-09T08:42:00");
const date = "2026-11-09";

function setup(): { config: VaultConfig; path: string } {
  const config: VaultConfig = {
    vaultPath: tempDir("dibujo-vault-"),
    folder: "Bujo",
    dayStartHour: 0,
  };
  return { config, path: dailyNotePath(config, date) };
}

const morning = parseCapture(
  JSON.stringify({
    raw: "call the bank, the big one.\ndentist at 3.",
    bullets: [
      { type: "task", text: "call the bank", signifiers: ["priority"] },
      { type: "event", text: "dentist at 3pm" },
    ],
  }),
);
const evening = parseCapture(
  JSON.stringify({
    raw: "slept badly",
    bullets: [{ type: "note", text: "slept badly" }],
  }),
);

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DibujoError ? error.code : String(error);
  }
  return undefined;
}

function noTempFiles(path: string): boolean {
  return readdirSync(dirname(path)).every((name) => !name.endsWith(".tmp"));
}

describe("paths", () => {
  it("builds the daily note path", () => {
    const { config, path } = setup();
    expect(path).toBe(join(config.vaultPath, "Bujo", "Daily", "2026-11-09.md"));
  });

  it("rejects paths that leave the dibujo folder", () => {
    const { config } = setup();
    expect(() => resolveInVault(config, "..", "outside.md")).toThrow(/outside/);
    expect(() => resolveInVault(config, "/etc/passwd")).toThrow(/outside/);
    expect(() => resolveInVault({ ...config, folder: "../escape" }, "x")).toThrow(/outside/);
  });
});

describe("addCapture", () => {
  it("creates a note, then appends to it", () => {
    const { config, path } = setup();

    const first = addCapture(config, date, morning, { now });
    expect(first).toMatchObject({ status: "created", path, date, added: 2, dryRun: false });
    expect(first.captureId).toMatch(/^[0-9a-f]{8}$/);

    const second = addCapture(config, date, evening, { now: new Date("2026-11-09T21:10:00") });
    expect(second).toMatchObject({ status: "updated", added: 1 });

    expect(readFileSync(path, "utf8")).toBe(
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
        "- slept badly",
        "",
        "## Captures",
        "",
        `> [!capture]- 08:42 · ${first.captureId}`,
        "> call the bank, the big one.",
        "> dentist at 3.",
        "",
        `> [!capture]- 21:10 · ${second.captureId}`,
        "> slept badly",
        "",
      ].join("\n"),
    );
    expect(noTempFiles(path)).toBe(true);
  });

  it("returns unchanged for a duplicate capture and leaves the file alone", () => {
    const { config, path } = setup();
    addCapture(config, date, morning, { now });
    const before = readFileSync(path, "utf8");
    const mtime = statSync(path).mtimeMs;

    const again = addCapture(config, date, morning, { now: new Date("2026-11-09T10:00:00") });
    expect(again).toMatchObject({ status: "unchanged", added: 0 });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(statSync(path).mtimeMs).toBe(mtime);
  });

  it("does not write anything on a dry run", () => {
    const { config, path } = setup();
    const result = addCapture(config, date, morning, { now, dryRun: true });
    expect(result).toMatchObject({ status: "created", dryRun: true });
    expect(result.content).toContain("- [ ] call the bank #priority");
    expect(() => statSync(path)).toThrow();
    expect(() => statSync(dirname(path))).toThrow();
  });

  it("fails with NOTE_CHANGED and leaves the file untouched if the note changes mid-write", () => {
    const { config, path } = setup();
    addCapture(config, date, morning, { now });
    const edited = `${readFileSync(path, "utf8")}typed in Obsidian\n`;

    const code = codeOf(() =>
      addCapture(config, date, evening, {
        now,
        hooks: { beforeCommit: () => writeFileSync(path, edited) },
      }),
    );
    expect(code).toBe("NOTE_CHANGED");
    expect(readFileSync(path, "utf8")).toBe(edited);
    expect(noTempFiles(path)).toBe(true);
  });

  it("fails with NOTE_CHANGED if the note is created by someone else mid-write", () => {
    const { config, path } = setup();
    const code = codeOf(() =>
      addCapture(config, date, morning, {
        now,
        hooks: {
          beforeCommit: () => {
            writeFileSync(path, "created in Obsidian\n");
          },
        },
      }),
    );
    expect(code).toBe("NOTE_CHANGED");
    expect(readFileSync(path, "utf8")).toBe("created in Obsidian\n");
    expect(noTempFiles(path)).toBe(true);
  });

  it("keeps user-written frontmatter byte for byte", () => {
    const { config, path } = setup();
    const frontmatter = "---\ntags:   [journal, daily]   # mine\ncreated: 2026-11-09T07:00\n---\n";
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${frontmatter}\nMorning pages.\n`);

    expect(addCapture(config, date, morning, { now }).status).toBe("updated");
    const content = readFileSync(path, "utf8");
    expect(content.startsWith(`${frontmatter}\nMorning pages.\n`)).toBe(true);
    expect(readDailyNote(config, date).bullets).toHaveLength(2);
  });

  it("keeps the note's file permissions", () => {
    const { config, path } = setup();
    addCapture(config, date, morning, { now });
    chmodSync(path, 0o600);
    addCapture(config, date, evening, { now });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("refuses to write a note from a newer format version", () => {
    const { config, path } = setup();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\ndibujo: 2\n---\n## Log\n");
    expect(codeOf(() => addCapture(config, date, morning, { now }))).toBe(
      "NOTE_VERSION_UNSUPPORTED",
    );
    expect(readFileSync(path, "utf8")).toBe("---\ndibujo: 2\n---\n## Log\n");
  });
});

describe("readDailyNote", () => {
  it("reports a missing note without failing", () => {
    const { config, path } = setup();
    expect(readDailyNote(config, date)).toEqual({
      exists: false,
      path,
      date,
      bullets: [],
      unrecognized: [],
    });
  });

  it("reads bullets and unrecognized lines", () => {
    const { config, path } = setup();
    addCapture(config, date, morning, { now });
    const content = readFileSync(path, "utf8").replace("## Log\n", "## Log\nloose thought\n");
    writeFileSync(path, content);

    const note = readDailyNote(config, date);
    expect(note.exists).toBe(true);
    expect(note.bullets.map((b) => [b.type, b.text])).toEqual([
      ["task", "call the bank"],
      ["event", "dentist at 3pm"],
    ]);
    expect(note.unrecognized).toEqual([{ line: 8, text: "loose thought" }]);
  });

  it("rejects a note with an invalid version", () => {
    const { config, path } = setup();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\ndibujo: soon\n---\n");
    expect(codeOf(() => readDailyNote(config, date))).toBe("NOTE_VERSION_UNSUPPORTED");
  });
});
