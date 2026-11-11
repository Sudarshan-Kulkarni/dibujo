import { loadConfig, requireVault } from "../config.js";
import { importOldNotes } from "../vault/future.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface FutureImportOptions {
  dryRun?: boolean;
  json?: boolean;
}

export const registerFutureImport: Register = (future, ctx) => {
  future
    .command("import")
    .description("Copy the entries of old year notes (Future/YYYY.md) into the future log")
    .option("--dry-run", "print the resulting note without writing it")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nCopies waiting tasks, events, and notes. Tasks in any other state are not copied.\nThe old notes are never changed, so links that point to them keep working.\nRunning it again adds nothing that was already copied.",
    )
    .action((options: FutureImportOptions) => runFutureImport(ctx, options));
};

export function runFutureImport(ctx: Ctx, options: FutureImportOptions): void {
  const out = new Output(ctx, options.json === true);
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const result = importOldNotes(config, { dryRun: options.dryRun === true });

  if (out.json) {
    out.success(result, []);
    return;
  }
  if (result.dryRun && result.content !== undefined) {
    out.info(`Dry run: ${result.path} would be ${result.status}. Nothing was written.`);
    ctx.stdout.write(result.content);
    return;
  }

  const lines: string[] = [];
  if (result.copied === 0) {
    lines.push("Nothing to import. The future log already has every waiting entry.");
  } else {
    lines.push(
      `Copied ${result.copied} entr${result.copied === 1 ? "y" : "ies"} into ${result.path}:`,
    );
    for (const source of result.sources) lines.push(`  ${source.count} from ${source.path}`);
  }
  if (result.unreadable.length > 0) {
    lines.push("", "Lines that are not entries, so they were not copied:");
    for (const u of result.unreadable) lines.push(`  ${u.path} line ${u.line}: ${u.text.trim()}`);
  }
  out.success(result, lines);
}
