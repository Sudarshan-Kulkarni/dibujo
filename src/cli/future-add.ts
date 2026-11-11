import { parseFutureAdd } from "../bujo/future-input.js";
import { loadConfig, requireVault } from "../config.js";
import { DibujoError } from "../errors.js";
import { addEntries } from "../vault/future.js";
import { humanEntry } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface FutureAddOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerFutureAdd: Register = (future, ctx) => {
  future
    .command("add")
    .description("Add tasks, events, and notes (JSON on stdin) to the future log")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      '\nExample:\n  echo \'{"entries":[{"type":"event","text":"dentist at 3pm","date":"2026-12-12"},{"type":"task","text":"learn Rust"}]}\' | dibujo future add\n\nA task or an event may have a date (YYYY-MM-DD, today or later). A note may not.\nAn entry that is already waiting in the future log is not added again.\nSee docs/vault-format.md for the format.',
    )
    .action((options: FutureAddOptions) => runFutureAdd(ctx, options));
};

export async function runFutureAdd(ctx: Ctx, options: FutureAddOptions): Promise<void> {
  const out = new Output(ctx, options.json === true);

  // Check this first, so an accidental run in a terminal doesn't sit waiting for input.
  if (ctx.stdinIsTTY) {
    throw new DibujoError(
      "USAGE",
      "dibujo future add reads the entries as JSON on stdin, but stdin is a terminal.",
      'Pipe the JSON in, for example: echo \'{"entries":[{"type":"task","text":"..."}]}\' | dibujo future add',
    );
  }

  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const input = parseFutureAdd(await ctx.readStdin());
  const result = addEntries(config, input, { now: ctx.now(), dryRun: options.dryRun === true });

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun && result.content !== undefined) {
    out.info(`Dry run: ${result.path} would be ${result.status}. Nothing was written.`);
    ctx.stdout.write(result.content);
    return;
  }

  const count = (n: number) => `${n} entr${n === 1 ? "y" : "ies"}`;
  const skipped = result.skipped > 0 ? ` (${count(result.skipped)} already there)` : "";
  const lines =
    result.status === "unchanged"
      ? [`Already in the future log${skipped}. Nothing changed.`]
      : [
          result.status === "created"
            ? `Created ${result.path} with ${count(result.added.length)}${skipped}.`
            : `Added ${count(result.added.length)} to ${result.path}${skipped}.`,
          ...result.added.map((e) =>
            humanEntry(e.type === "task" ? { ...e, state: "open" } : e, 1),
          ),
        ];
  out.success(result, lines);
}
