import { parseCapture } from "../bujo/capture.js";
import { DibujoError } from "../errors.js";
import { addCapture } from "../vault/daily.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface LogAddOptions {
  date?: string;
  dryRun?: boolean;
  json?: boolean;
}

export const registerLogAdd: Register = (log, ctx) => {
  log
    .command("add")
    .description("Add a capture (JSON on stdin) to a daily note")
    .option("--date <YYYY-MM-DD>", "the day to add to (default: the current journal day)")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      '\nExample:\n  echo \'{"raw":"call the bank","bullets":[{"type":"task","text":"call the bank"}]}\' | dibujo log add\n\nSee docs/vault-format.md for the full capture schema.',
    )
    .action((options: LogAddOptions) => runLogAdd(ctx, options));
};

export async function runLogAdd(ctx: Ctx, options: LogAddOptions): Promise<void> {
  const out = new Output(ctx, options.json === true);

  // Check this first, so an accidental run in a terminal doesn't sit waiting for input.
  if (ctx.stdinIsTTY) {
    throw new DibujoError(
      "USAGE",
      "dibujo log add reads the capture as JSON on stdin, but stdin is a terminal.",
      'Pipe the JSON in, for example: echo \'{"raw":"...","bullets":[...]}\' | dibujo log add',
    );
  }

  const { config, date } = vaultAndDate(ctx, options.date);
  const capture = parseCapture(await ctx.readStdin());
  const result = addCapture(config, date, capture, {
    now: ctx.now(),
    dryRun: options.dryRun === true,
  });

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun && result.content !== undefined) {
    out.info(`Dry run: ${result.path} would be ${result.status}. Nothing was written.`);
    ctx.stdout.write(result.content);
    return;
  }
  const bullets = `${result.added} bullet${result.added === 1 ? "" : "s"}`;
  const message =
    result.status === "created"
      ? `Created ${result.path} with ${bullets}.`
      : result.status === "updated"
        ? `Added ${bullets} to ${result.path}.`
        : `Already logged (capture ${result.captureId}) in ${result.path}. Nothing changed.`;
  out.success(result, message);
}
