import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx } from "../../src/cli/context.js";

export interface FakeCtx extends Ctx {
  out: () => string;
  err: () => string;
  /** Questions asked through `ask`, in order. */
  questions: string[];
}

export interface FakeCtxOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
  cwd?: string;
  stdin?: string;
  /** Answers returned by `ask`, in order. Running out of answers fails the test. */
  answers?: string[];
  stdinIsTTY?: boolean;
  interactive?: boolean;
  homedir?: string;
}

/** A context with captured output, a fixed clock, and a temp home folder. */
export function fakeCtx(options: FakeCtxOptions = {}): FakeCtx {
  let stdout = "";
  let stderr = "";
  const answers = [...(options.answers ?? [])];
  const questions: string[] = [];
  const home = options.homedir ?? tempDir("dibujo-home-");
  return {
    env: options.env ?? {},
    now: () => options.now ?? new Date("2026-11-09T09:00:00"),
    cwd: options.cwd ?? home,
    readStdin: async () => options.stdin ?? "",
    ask: async (question) => {
      questions.push(question);
      const answer = answers.shift();
      if (answer === undefined) throw new Error(`fakeCtx: no answer left for "${question}"`);
      return answer;
    },
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
    stdinIsTTY: options.stdinIsTTY ?? options.interactive ?? false,
    interactive: options.interactive ?? false,
    homedir: home,
    out: () => stdout,
    err: () => stderr,
    questions,
  };
}

export function tempDir(prefix = "dibujo-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Parses JSON-mode stdout, failing the test if it isn't exactly one JSON document. */
export function parseJsonOut(text: string): { ok: boolean; data?: unknown; error?: unknown } {
  return JSON.parse(text) as { ok: boolean; data?: unknown; error?: unknown };
}
