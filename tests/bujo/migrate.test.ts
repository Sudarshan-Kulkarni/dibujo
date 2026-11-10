import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
import { applyLineEdits } from "../../src/bujo/edit.js";
import { planMigration } from "../../src/bujo/migrate.js";
import { DibujoError } from "../../src/errors.js";
import { bullet } from "../helpers/arbitraries.js";

const DATE = "2026-11-09";

function note(...log: string[]): string {
  return ["---", "dibujo: 1", "---", "", "## Log", "", ...log, "", "## Captures", ""].join("\n");
}
/** Line number of the nth Log line (0-based) in `note()`. */
const line = (n: number) => 7 + n;

function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? `gen${i}`;
}

describe("planMigration", () => {
  it("migrates a single open task", () => {
    const plan = planMigration(note("- [ ] call the bank #priority"), DATE, line(0), {
      newId: ids("k3f9a1"),
      folder: "Bujo",
    });
    expect(plan).toEqual({
      sourceEdits: [
        {
          line: line(0),
          before: "- [ ] call the bank #priority",
          after: "- [>] call the bank #priority ^k3f9a1",
        },
      ],
      targetLines: [
        "- [ ] call the bank [[Bujo/Daily/2026-11-09#^k3f9a1|from 2026-11-09]] #priority",
      ],
      rootBlockId: "k3f9a1",
      migrated: 1,
    });
  });

  it("moves nested bullets with the task, by the classification rules", () => {
    const source = note(
      "- [ ] plan trip",
      "\t- [ ] book flights",
      "\t\t* flights open friday",
      "\t- [x] pick dates",
      "\t\t- [ ] ask Ana (under a done task)",
      "\t- [<] renew passport ⏳ 2026-12-01",
      "\t- [-] old idea",
      "\t- [>] told mum ^m1",
      "\t- budget about 800 ^n1",
      "a stray paragraph",
      "\t* trip meeting thursday",
      "- [ ] unrelated",
    );
    const plan = planMigration(source, DATE, line(0), { newId: ids("r1", "c1") });
    expect(plan.targetLines).toEqual([
      "- [ ] plan trip [[2026-11-09#^r1|from 2026-11-09]]",
      "\t- [ ] book flights [[2026-11-09#^c1|from 2026-11-09]]",
      "\t\t* flights open friday",
      "\t- budget about 800",
      "\t* trip meeting thursday",
    ]);
    expect(plan.sourceEdits.map((e) => [e.line, e.after])).toEqual([
      [line(0), "- [>] plan trip ^r1"],
      [line(1), "\t- [>] book flights ^c1"],
    ]);
    expect(plan.migrated).toBe(2);
  });

  it("re-bases a nested root at depth 0", () => {
    const source = note("- idea: zine", "\t- [ ] buy paper", "\t\t- a4 is fine", "- after");
    const plan = planMigration(source, DATE, line(1), { newId: ids("p1") });
    expect(plan.targetLines).toEqual([
      "- [ ] buy paper [[2026-11-09#^p1|from 2026-11-09]]",
      "\t- a4 is fine",
    ]);
  });

  it("caps depth and never jumps more than one level", () => {
    const source = note(
      "- [ ] root",
      "\t\t\t- jumped three levels",
      "\t\t\t\t- deep",
      "\t\t\t\t\t- deeper",
      "\t\t\t\t\t\t- deepest",
    );
    const plan = planMigration(source, DATE, line(0), { newId: ids("a") });
    expect(plan.targetLines.slice(1)).toEqual([
      "\t- jumped three levels",
      "\t\t- deep",
      "\t\t\t- deeper",
      "\t\t\t- deepest",
    ]);
  });

  it("reuses an existing block id and skips ids already in the note", () => {
    const reuse = planMigration(note("- [ ] linked ^mine"), DATE, line(0), { newId: ids("x") });
    expect(reuse.rootBlockId).toBe("mine");
    expect(reuse.sourceEdits[0]?.after).toBe("- [>] linked ^mine");

    const collide = planMigration(note("- [ ] a", "* b ^taken"), DATE, line(0), {
      newId: ids("taken", "taken", "free"),
    });
    expect(collide.rootBlockId).toBe("free");
  });

  it("adds priority to the root's copy only", () => {
    const plan = planMigration(note("- [ ] a", "\t- [ ] b"), DATE, line(0), {
      newId: ids("r", "c"),
      priority: true,
    });
    expect(plan.targetLines).toEqual([
      "- [ ] a [[2026-11-09#^r|from 2026-11-09]] #priority",
      "\t- [ ] b [[2026-11-09#^c|from 2026-11-09]]",
    ]);
  });

  it("replaces an earlier origin with a link to this note", () => {
    const plan = planMigration(
      note("- [ ] call [[2026-11-08#^old|from 2026-11-08]]"),
      DATE,
      line(0),
      {
        newId: ids("new"),
      },
    );
    expect(plan.targetLines).toEqual(["- [ ] call [[2026-11-09#^new|from 2026-11-09]]"]);
    expect(plan.sourceEdits[0]?.after).toBe("- [>] call [[2026-11-08#^old|from 2026-11-08]] ^new");
  });

  it("resumes a root that an interrupted run already marked", () => {
    const source = note("- [>] plan trip ^r1", "\t- [>] book flights ^c1", "\t- [ ] new child");
    const plan = planMigration(source, DATE, line(0), { newId: ids("n1") });
    expect(plan.targetLines).toEqual([
      "- [ ] plan trip [[2026-11-09#^r1|from 2026-11-09]]",
      "\t- [ ] book flights [[2026-11-09#^c1|from 2026-11-09]]",
      "\t- [ ] new child [[2026-11-09#^n1|from 2026-11-09]]",
    ]);
    expect(plan.sourceEdits.map((e) => e.line)).toEqual([line(2)]);
    expect(plan.migrated).toBe(1);
  });

  it.each(["- [x] done", "- [<] later", "- [-] dropped", "- [>] moved by hand"])(
    "refuses to migrate %j",
    (task) => {
      try {
        planMigration(note(task), DATE, line(0), { newId: ids("a") });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(DibujoError);
        expect((error as DibujoError).code).toBe("TASK_NOT_OPEN");
      }
    },
  );

  it("refuses a line that isn't a task", () => {
    expect(() => planMigration(note("* event"), DATE, line(0), { newId: ids("a") })).toThrow();
  });
});

describe("migration properties", () => {
  it("plans valid nesting, links every copied task, and passes the edit guard", () => {
    fc.assert(
      fc.property(
        fc.array(bullet, { minLength: 1, maxLength: 12 }),
        fc.nat(),
        fc.boolean(),
        (bullets, pick, priority) => {
          const log = bullets.map((b) => formatBullet(b));
          const source = note(...log);
          const openIndexes = bullets.flatMap((b, i) =>
            b.type === "task" && b.state === "open" ? [i] : [],
          );
          fc.pre(openIndexes.length > 0);
          const index = openIndexes[pick % openIndexes.length] ?? 0;

          let n = 0;
          const plan = planMigration(source, DATE, line(index), {
            newId: () => `id${n++}`,
            priority,
            folder: "Bujo",
          });

          const copies = plan.targetLines.map((l) => parseBulletLine(l));
          expect(copies.every((c) => c !== null)).toBe(true);
          let previous = -1;
          for (const copy of copies) {
            expect(copy?.depth).toBeLessThanOrEqual(previous + 1);
            previous = copy?.depth ?? 0;
          }
          expect(copies[0]?.depth).toBe(0);

          const after = applyLineEdits(source, plan.sourceEdits);
          const marked = new Set(
            plan.sourceEdits.map((e) => parseBulletLine(e.after)?.blockId).filter(Boolean),
          );
          for (const copy of copies) {
            if (copy?.type !== "task") continue;
            expect(copy.state).toBe("open");
            expect(copy.origin?.date).toBe(DATE);
            expect(marked.has(copy.origin?.blockId)).toBe(true);
          }
          expect(copies[0]?.origin?.blockId).toBe(plan.rootBlockId);
          expect(after).not.toBe(source);
        },
      ),
    );
  });
});
