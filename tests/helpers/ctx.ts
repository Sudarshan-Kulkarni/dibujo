import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Ctx } from "../../src/cli/context.js";

export interface FakeCtx extends Ctx {
  out: () => string;
  err: () => string;
}

export interface FakeCtxOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
  stdin?: string;
  stdinIsTTY?: boolean;
  interactive?: boolean;
  homedir?: string;
}

/** A context with captured output, a fixed clock, and a temp home folder. */
export function fakeCtx(options: FakeCtxOptions = {}): FakeCtx {
  let stdout = "";
  let stderr = "";
  const stdinText = options.stdin ?? "";
  const home = options.homedir ?? mkdtempSync(join(tmpdir(), "dibujo-home-"));
  return {
    env: options.env ?? {},
    now: () => options.now ?? new Date("2026-11-09T09:00:00"),
    readStdin: async () => stdinText,
    stdin: Readable.from([stdinText]),
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
    stdinIsTTY: options.stdinIsTTY ?? false,
    interactive: options.interactive ?? false,
    homedir: home,
    out: () => stdout,
    err: () => stderr,
  };
}

/** Parses JSON-mode stdout, failing the test if it isn't exactly one JSON document. */
export function parseJsonOut(text: string): { ok: boolean; data?: unknown; error?: unknown } {
  return JSON.parse(text) as { ok: boolean; data?: unknown; error?: unknown };
}
