import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import semver from "semver";
import { PACKAGE_NAME } from "../package-info.js";

export const MARKER_FILE = ".dibujo.json";
export const FORMAT_REFERENCE = join("references", "vault-format.md");

export type InstallStatus = "installed" | "updated" | "unchanged" | "skipped";

/** Written into every installed skill, so later installs know dibujo owns the folder. */
export interface Marker {
  package: string;
  version: string;
  skill: string;
  /** Hash of the skill's source files and the format reference at install time. */
  hash: string;
}

/** What's at a skill's destination before installing. */
export type Destination =
  | { kind: "missing" }
  | { kind: "dibujo"; version: string; hash: string | null }
  | { kind: "foreign" };

export interface PlanItem {
  skill: string;
  status: InstallStatus;
  reason?: string;
  /** Whether the folder will be written. */
  write: boolean;
}

export interface SkillToPlan {
  name: string;
  destination: Destination;
  /** Hash of the skill as it would be installed now. */
  hash: string;
}

/**
 * Decides what to do with each skill. Pure: it only looks at the destination
 * states it's given.
 */
export function planInstall(
  skills: readonly SkillToPlan[],
  version: string,
  force: boolean,
): PlanItem[] {
  return skills.map((skill) => planOne(skill, version, force));
}

function planOne(
  { name: skill, destination, hash }: SkillToPlan,
  version: string,
  force: boolean,
): PlanItem {
  if (destination.kind === "missing") return { skill, status: "installed", write: true };

  if (destination.kind === "foreign") {
    return force
      ? {
          skill,
          status: "updated",
          reason: "replaced a folder not installed by dibujo (--force)",
          write: true,
        }
      : {
          skill,
          status: "skipped",
          reason: "a folder not installed by dibujo is in the way; use --force to replace it",
          write: false,
        };
  }

  const installed = semver.valid(destination.version);
  if (installed && semver.eq(installed, version)) {
    if (destination.hash === hash) return { skill, status: "unchanged", write: false };
    // Same version, different files: a skill edited during development.
    return { skill, status: "updated", reason: "contents changed", write: true };
  }
  if (installed && semver.gt(installed, version)) {
    return force
      ? {
          skill,
          status: "updated",
          reason: `replaced newer version ${installed} (--force)`,
          write: true,
        }
      : {
          skill,
          status: "skipped",
          reason: `a newer version (${installed}) is installed; use --force to replace it`,
          write: false,
        };
  }
  return {
    skill,
    status: "updated",
    reason: `from ${installed ?? "an unknown version"}`,
    write: true,
  };
}

export interface InstallOptions {
  /** Root of the digi-bujo package, containing `skills/` and `docs/`. */
  packageRoot: string;
  version: string;
  target: string;
  force: boolean;
  dryRun: boolean;
}

export interface InstallResult {
  skill: string;
  status: InstallStatus;
  reason?: string;
}

/** Installs every skill shipped in the package into `target`. */
export function installSkills(options: InstallOptions): InstallResult[] {
  const sources = listPackageSkills(options.packageRoot);
  const reference = join(options.packageRoot, "docs", "vault-format.md");
  if (!existsSync(reference)) throw new Error(`Missing ${reference} in the package`);

  const skills = sources.map((name) => ({
    name,
    destination: inspect(join(options.target, name)),
    hash: hashSkill(join(options.packageRoot, "skills", name), reference),
  }));
  const plan = planInstall(skills, options.version, options.force);

  if (!options.dryRun) {
    if (plan.some((item) => item.write)) mkdirSync(options.target, { recursive: true });
    plan.forEach((item, index) => {
      if (!item.write) return;
      replaceSkill({
        source: join(options.packageRoot, "skills", item.skill),
        reference,
        target: options.target,
        skill: item.skill,
        marker: {
          package: PACKAGE_NAME,
          version: options.version,
          skill: item.skill,
          hash: skills[index]?.hash ?? "",
        },
      });
    });
  }

  return plan.map(({ write: _write, ...result }) => result);
}

/** Skill folders shipped in the package: folders under `skills/` that contain a `SKILL.md`. */
export function listPackageSkills(packageRoot: string): string[] {
  const dir = join(packageRoot, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .filter((entry) => existsSync(join(dir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

export function inspect(dir: string): Destination {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(dir);
  } catch {
    return { kind: "missing" };
  }
  if (!stat.isDirectory()) return { kind: "foreign" };
  const marker = readMarker(join(dir, MARKER_FILE));
  return marker
    ? { kind: "dibujo", version: marker.version, hash: marker.hash }
    : { kind: "foreign" };
}

/** Hashes every file in the skill folder (by relative path and content) plus the format reference. */
export function hashSkill(skillDir: string, reference: string): string {
  const hash = createHash("sha256");
  const files = (
    readdirSync(skillDir, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[]
  )
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    hash.update(relative(skillDir, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  hash.update("reference\0");
  hash.update(readFileSync(reference));
  return hash.digest("hex").slice(0, 16);
}

function readMarker(path: string): (Omit<Marker, "hash"> & { hash: string | null }) | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (record.package !== PACKAGE_NAME || typeof record.version !== "string") return null;
    return {
      package: PACKAGE_NAME,
      version: record.version,
      skill: typeof record.skill === "string" ? record.skill : "",
      hash: typeof record.hash === "string" ? record.hash : null,
    };
  } catch {
    // Missing or unreadable marker: not ours.
    return null;
  }
}

/**
 * Builds the skill in a staging folder, then swaps it into place. If anything
 * fails, the previous folder is put back.
 */
function replaceSkill(args: {
  source: string;
  reference: string;
  target: string;
  skill: string;
  marker: Marker;
}): void {
  const suffix = `${process.pid}-${Date.now()}`;
  const staging = join(args.target, `.${args.skill}.tmp-${suffix}`);
  const backup = join(args.target, `.${args.skill}.old-${suffix}`);
  const destination = join(args.target, args.skill);

  try {
    cpSync(args.source, staging, { recursive: true });
    mkdirSync(join(staging, "references"), { recursive: true });
    cpSync(args.reference, join(staging, FORMAT_REFERENCE));
    writeFileSync(join(staging, MARKER_FILE), `${JSON.stringify(args.marker, null, 2)}\n`);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  const hadExisting = existsSync(destination) || isSymlink(destination);
  try {
    if (hadExisting) renameSync(destination, backup);
    renameSync(staging, destination);
  } catch (error) {
    if (hadExisting && !existsSync(destination) && existsSync(backup)) {
      renameSync(backup, destination);
    }
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  rmSync(backup, { recursive: true, force: true });
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
