import { loadConfig, requireVault } from "../config.js";
import { showFuture } from "../vault/future.js";
import { humanEntry } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { legacyNotice } from "./future-due.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface FutureShowOptions {
  json?: boolean;
}

export const registerFutureShow: Register = (future, ctx) => {
  future
    .command("show")
    .description("Show every entry in the future log")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nWith --json, each entry has a ref for `future migrate`, `reschedule`, and `cancel`.\nEntries are in the order they are in the note.",
    )
    .action((options: FutureShowOptions) => runFutureShow(ctx, options));
};

export function runFutureShow(ctx: Ctx, options: FutureShowOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const note = showFuture(config);

  const lines: string[] = [];
  if (!note.exists) {
    lines.push(`No future log yet (${note.path}).`);
  } else {
    lines.push(note.path, "");
    if (note.entries.length === 0) lines.push("(no entries yet)");
    for (const entry of note.entries) lines.push(humanEntry(entry, 1));
    if (note.unrecognized.length > 0) {
      lines.push("", "Lines that aren't bullets (kept as they are):");
      for (const u of note.unrecognized) lines.push(`  line ${u.line}: ${u.text.trim()}`);
    }
  }
  lines.push(...legacyNotice(note.legacyNotes));
  out.success(note, lines);
}
