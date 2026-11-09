import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

export interface Writable {
  write(chunk: string): unknown;
}

/**
 * Everything a command needs from the outside world.
 * Commands never touch `process` directly, so tests can pass a fake context.
 */
export interface Ctx {
  env: Readonly<Record<string, string | undefined>>;
  now: () => Date;
  cwd: string;
  /** Reads all of stdin as a string. */
  readStdin: () => Promise<string>;
  /** Asks one question on the terminal and returns the answer. Only call when `interactive`. */
  ask: (question: string) => Promise<string>;
  stdout: Writable;
  stderr: Writable;
  /** True when stdin is a terminal. */
  stdinIsTTY: boolean;
  /** True when both stdin and stdout are terminals, so prompting is allowed. */
  interactive: boolean;
  homedir: string;
}

export function processCtx(): Ctx {
  const stdinIsTTY = process.stdin.isTTY === true;
  return {
    env: process.env,
    now: () => new Date(),
    cwd: process.cwd(),
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    },
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    stdout: process.stdout,
    stderr: process.stderr,
    stdinIsTTY,
    interactive: stdinIsTTY && process.stdout.isTTY === true,
    homedir: homedir(),
  };
}
