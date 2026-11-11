import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

const NOW = new Date("2026-11-02T08:00:00");

interface Json {
  ok: boolean;
  data: Record<string, unknown>;
  error?: { code: string };
}

function world() {
  const vault = tempDir("dibujo-vault-");
  mkdirSync(join(vault, ".obsidian"));
  const home = tempDir("dibujo-home-");
  const notePath = (date: string) => join(vault, "Bujo", "Daily", `${date}.md`);
  const write = (date: string, ...log: string[]) => {
    mkdirSync(dirname(notePath(date)), { recursive: true });
    writeFileSync(notePath(date), `---\ndibujo: 1\n---\n\n## Log\n\n${log.join("\n")}\n`);
  };
  const run = async (stdin: string | undefined, ...args: string[]) => {
    const ctx = fakeCtx({
      homedir: home,
      now: NOW,
      ...(stdin === undefined ? {} : { stdin }),
    });
    const code = await runCli([...args, "--json"], ctx, registers);
    return { code, json: parseJsonOut(ctx.out()) as Json };
  };
  return { vault, home, notePath, write, run };
}

describe("dibujo month", () => {
  it("runs one cycle: review, show, migrate a leftover, summarize, review again", async () => {
    const w = world();
    const init = fakeCtx({ homedir: w.home, now: NOW });
    expect(await runCli(["init", "--vault", w.vault], init, registers)).toBe(0);
    w.write("2026-10-20", "- [ ] call the bank", "- [x] pay rent");

    const first = await w.run(undefined, "task", "review");
    expect(first.code).toBe(0);
    expect(first.json.data.pendingMonth).toMatchObject({ month: "2026-10" });

    const show = await w.run(undefined, "month", "show");
    expect(show.code).toBe(0);
    const leftovers = show.json.data.leftovers as { ref: string; text: string; date: string }[];
    expect(leftovers.map((t) => [t.date, t.text])).toEqual([["2026-10-20", "call the bank"]]);
    expect(show.json.data.summary).toMatchObject({ exists: false, hasSummary: false });

    const migrate = await w.run(undefined, "task", "migrate", String(leftovers[0]?.ref));
    expect(migrate.code).toBe(0);

    const dry = await w.run('{"highlights":["paid rent"]}', "month", "summary", "--dry-run");
    expect(dry.code).toBe(0);
    expect(existsSync(join(w.vault, "Bujo", "Monthly", "2026-10.md"))).toBe(false);

    const summary = await w.run('{"highlights":["paid rent"]}', "month", "summary");
    expect(summary.code).toBe(0);
    expect(summary.json.data).toMatchObject({ status: "created", month: "2026-10", done: 1 });
    const note = readFileSync(join(w.vault, "Bujo", "Monthly", "2026-10.md"), "utf8");
    expect(note).toContain("- paid rent");

    const again = await w.run('{"highlights":["paid rent"]}', "month", "summary");
    expect(again.json.data).toMatchObject({ status: "unchanged" });

    const last = await w.run(undefined, "task", "review");
    expect(last.json.data.pendingMonth).toBeNull();
  });

  it("refuses the month of today with exit code 2", async () => {
    const w = world();
    expect(
      await runCli(["init", "--vault", w.vault], fakeCtx({ homedir: w.home }), registers),
    ).toBe(0);
    const result = await w.run(undefined, "month", "show", "2026-11");
    expect(result.code).toBe(2);
    expect(result.json.error?.code).toBe("INVALID_DATE");
  });
});
