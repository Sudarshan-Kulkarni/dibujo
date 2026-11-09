import { Command, CommanderError } from "commander";
import { EXIT_OK, EXIT_RUNTIME, EXIT_USAGE, exitCodeFor, isDibujoError } from "../errors.js";
import { findPackage } from "../package-info.js";
import type { Ctx } from "./context.js";
import { internalPayload, Output, toPayload } from "./output.js";

/** Adds commands to the program. Each command module exports one of these. */
export type Register = (program: Command, ctx: Ctx) => void;

/** Commander codes that mean "printed help or version, nothing went wrong". */
const COMMANDER_OK_CODES = new Set([
  "commander.helpDisplayed",
  "commander.help",
  "commander.version",
]);

export function createProgram(ctx: Ctx, registers: readonly Register[]): Command {
  const pkg = findPackage();
  const program = new Command()
    .name("dibujo")
    .description("A digital companion to your Bullet Journal.")
    .version(pkg.version, "-v, --version", "print the version")
    .showHelpAfterError("(run with --help for usage)")
    .configureOutput({
      writeOut: (s) => ctx.stdout.write(s),
      writeErr: (s) => ctx.stderr.write(s),
    })
    .exitOverride();

  for (const register of registers) register(program, ctx);

  // Subcommands don't inherit exitOverride/configureOutput, so apply them everywhere.
  const applyAll = (cmd: Command) => {
    for (const sub of cmd.commands) {
      sub.exitOverride().configureOutput({
        writeOut: (s) => ctx.stdout.write(s),
        writeErr: (s) => ctx.stderr.write(s),
      });
      applyAll(sub);
    }
  };
  applyAll(program);
  return program;
}

/** Runs the CLI and returns the exit code. Never throws. */
export async function runCli(
  argv: readonly string[],
  ctx: Ctx,
  registers: readonly Register[],
): Promise<number> {
  const json = argv.includes("--json");
  const out = new Output(ctx, json);

  try {
    const program = createProgram(ctx, registers);
    await program.parseAsync([...argv], { from: "user" });
    return EXIT_OK;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (COMMANDER_OK_CODES.has(error.code)) return EXIT_OK;
      // Commander already printed its message to stderr in human mode.
      if (json) out.error({ code: "USAGE", message: stripErrorPrefix(error.message) });
      return EXIT_USAGE;
    }
    if (isDibujoError(error)) {
      out.error(toPayload(error));
      return exitCodeFor(error.code);
    }
    out.error(internalPayload());
    if (ctx.env.DIBUJO_DEBUG === "1") {
      ctx.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    }
    return EXIT_RUNTIME;
  }
}

function stripErrorPrefix(message: string): string {
  return message.replace(/^error:\s*/, "");
}
