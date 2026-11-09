import { resolve } from "node:path";
import { DibujoError } from "../errors.js";
import { findPackage } from "../package-info.js";
import { DEFAULT_HARNESS, findHarness, HARNESSES } from "../skills/harnesses.js";
import { type InstallResult, installSkills } from "../skills/install.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";

interface SkillsInstallOptions {
  harness?: string;
  target?: string;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export const registerSkills: Register = (program, ctx) => {
  const skills = program.command("skills").description("Manage dibujo's agent skills");
  skills
    .command("install")
    .description("Install dibujo's skills into an agent's skills folder")
    .option(
      "--harness <name>",
      `agent to install for: ${HARNESSES.map((h) => h.name).join(", ")} (default: ${DEFAULT_HARNESS})`,
    )
    .option("--target <dir>", "install into this folder instead of a harness's folder")
    .option("--force", "replace folders not installed by dibujo, or newer versions")
    .option("--dry-run", "show what would change without writing anything")
    .option("--json", "print the result as JSON")
    .action((options: SkillsInstallOptions) => runSkillsInstall(ctx, options));
};

export function runSkillsInstall(ctx: Ctx, options: SkillsInstallOptions): void {
  const out = new Output(ctx, options.json === true);

  if (options.harness !== undefined && options.target !== undefined) {
    throw new DibujoError(
      "USAGE",
      "Use either --harness or --target, not both.",
      "--target installs into any folder; --harness picks a supported agent's folder.",
    );
  }

  let harness: string | null = null;
  let target: string;
  if (options.target !== undefined) {
    target = resolve(ctx.cwd, options.target);
  } else {
    const name = options.harness ?? DEFAULT_HARNESS;
    const found = findHarness(name);
    if (!found) {
      throw new DibujoError(
        "UNKNOWN_HARNESS",
        `Unknown harness "${name}".`,
        `Supported harnesses: ${HARNESSES.map((h) => h.name).join(", ")}. Or use --target <dir>.`,
      );
    }
    harness = found.name;
    target = found.skillsDir(ctx.homedir);
  }

  const pkg = findPackage();
  const dryRun = options.dryRun === true;
  const results = installSkills({
    packageRoot: pkg.root,
    version: pkg.version,
    target,
    force: options.force === true,
    dryRun,
  });

  const header = `${dryRun ? "Dry run: would install" : "Installed"} dibujo ${pkg.version} skills into ${target}${harness ? ` (${harness})` : ""}`;
  out.success({ target, harness, version: pkg.version, dryRun, results }, [
    header,
    ...results.map(humanResult),
    ...(results.length === 0 ? ["  (no skills found in the package)"] : []),
  ]);
}

function humanResult(result: InstallResult): string {
  return `  ${result.status.padEnd(9)}  ${result.skill}${result.reason ? `  (${result.reason})` : ""}`;
}
