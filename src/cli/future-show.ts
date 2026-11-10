import { DibujoError } from "../errors.js";
import { readFutureNote } from "../vault/future.js";
import { humanBullet } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface FutureShowOptions {
  year?: string;
  json?: boolean;
}

export const registerFutureShow: Register = (future, ctx) => {
  future
    .command("show")
    .description("Show the entries in a year's future log note")
    .option("--year <YYYY>", "the year to show (default: the current journal year)")
    .option("--json", "print the result as JSON")
    .action((options: FutureShowOptions) => runFutureShow(ctx, options));
};

export function runFutureShow(ctx: Ctx, options: FutureShowOptions): void {
  const out = new Output(ctx, options.json === true);
  if (options.year !== undefined && !/^\d{4}$/.test(options.year)) {
    throw new DibujoError(
      "INVALID_DATE",
      `Invalid year "${options.year}".`,
      "Use a four-digit year, for example 2026.",
    );
  }
  const { config, date } = vaultAndDate(ctx, undefined);
  const year = options.year ?? date.slice(0, 4);
  const note = readFutureNote(config, year);

  if (!note.exists) {
    out.success(note, `No future log for ${year} yet (${note.path}).`);
    return;
  }

  const lines = [`${year}  ${note.path}`, ""];
  if (note.months.length === 0) lines.push("(no entries yet)");
  for (const { month, entries } of note.months) {
    lines.push(month);
    for (const entry of entries) {
      lines.push(humanBullet(entry, 1));
    }
  }
  if (note.unrecognized.length > 0) {
    lines.push("", `Lines in the month sections that aren't bullets (kept as they are):`);
    for (const u of note.unrecognized) lines.push(`  line ${u.line}: ${u.text.trim()}`);
  }
  out.success(note, lines);
}
