import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";
import { registers } from "../../src/cli/registers.js";
import { findPackage } from "../../src/package-info.js";
import { HARNESSES } from "../../src/skills/harnesses.js";
import {
  FORMAT_REFERENCE,
  installSkills,
  listPackageSkills,
  MARKER_FILE,
  planInstall,
} from "../../src/skills/install.js";
import { fakeCtx, parseJsonOut, tempDir } from "../helpers/ctx.js";

/** A fake package root with two skills and the format doc. */
function fakePackage(): string {
  const root = tempDir("dibujo-pkg-");
  for (const name of ["alpha", "beta"]) {
    mkdirSync(join(root, "skills", name, "scripts"), { recursive: true });
    writeFileSync(join(root, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n${name}\n`);
    writeFileSync(join(root, "skills", name, "scripts", "x.sh"), "echo hi\n");
  }
  mkdirSync(join(root, "skills", "not-a-skill"));
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "vault-format.md"), "# format v1\n");
  return root;
}

function install(
  root: string,
  target: string,
  version: string,
  extra: { force?: boolean; dryRun?: boolean } = {},
) {
  return installSkills({
    packageRoot: root,
    version,
    target,
    force: extra.force ?? false,
    dryRun: extra.dryRun ?? false,
  });
}

function marker(target: string, skill: string): unknown {
  return JSON.parse(readFileSync(join(target, skill, MARKER_FILE), "utf8"));
}

describe("planInstall", () => {
  it.each([
    [{ kind: "missing" }, false, "installed", true],
    [{ kind: "dibujo", version: "0.2.0", hash: "h" }, false, "unchanged", false],
    [{ kind: "dibujo", version: "0.2.0", hash: "other" }, false, "updated", true],
    [{ kind: "dibujo", version: "0.2.0", hash: null }, false, "updated", true],
    [{ kind: "dibujo", version: "0.1.0", hash: "h" }, false, "updated", true],
    [{ kind: "dibujo", version: "not-semver", hash: "h" }, false, "updated", true],
    [{ kind: "dibujo", version: "0.3.0", hash: "h" }, false, "skipped", false],
    [{ kind: "dibujo", version: "0.3.0", hash: "h" }, true, "updated", true],
    [{ kind: "foreign" }, false, "skipped", false],
    [{ kind: "foreign" }, true, "updated", true],
  ] as const)("%j with force=%s is %s", (destination, force, status, write) => {
    const [item] = planInstall([{ name: "s", destination, hash: "h" }], "0.2.0", force);
    expect(item).toMatchObject({ skill: "s", status, write });
  });
});

describe("installSkills", () => {
  it("lists only folders that contain a SKILL.md", () => {
    expect(listPackageSkills(fakePackage())).toEqual(["alpha", "beta"]);
  });

  it("installs each skill with the format reference and a marker", () => {
    const root = fakePackage();
    const target = join(tempDir(), "skills");
    expect(install(root, target, "0.1.0")).toEqual([
      { skill: "alpha", status: "installed" },
      { skill: "beta", status: "installed" },
    ]);
    expect(readFileSync(join(target, "alpha", "SKILL.md"), "utf8")).toContain("name: alpha");
    expect(readFileSync(join(target, "alpha", "scripts", "x.sh"), "utf8")).toBe("echo hi\n");
    expect(readFileSync(join(target, "alpha", FORMAT_REFERENCE), "utf8")).toBe("# format v1\n");
    expect(marker(target, "alpha")).toEqual({
      package: "digi-bujo",
      version: "0.1.0",
      skill: "alpha",
      hash: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(readdirSync(target).sort()).toEqual(["alpha", "beta"]);
  });

  it("leaves the same version and contents unchanged", () => {
    const root = fakePackage();
    const target = tempDir();
    install(root, target, "0.1.0");
    writeFileSync(join(target, "alpha", "local-note.md"), "mine");
    expect(install(root, target, "0.1.0").map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
    expect(existsSync(join(target, "alpha", "local-note.md"))).toBe(true);
  });

  it("updates a skill whose source changed at the same version", () => {
    const root = fakePackage();
    const target = tempDir();
    install(root, target, "0.1.0");
    writeFileSync(join(root, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\nedited\n");
    expect(install(root, target, "0.1.0")).toEqual([
      { skill: "alpha", status: "updated", reason: "contents changed" },
      { skill: "beta", status: "unchanged" },
    ]);
    expect(readFileSync(join(target, "alpha", "SKILL.md"), "utf8")).toContain("edited");
  });

  it("updates every skill when the format reference changes", () => {
    const root = fakePackage();
    const target = tempDir();
    install(root, target, "0.1.0");
    writeFileSync(join(root, "docs", "vault-format.md"), "# format v1, clarified\n");
    expect(install(root, target, "0.1.0").map((r) => r.status)).toEqual(["updated", "updated"]);
    expect(readFileSync(join(target, "beta", FORMAT_REFERENCE), "utf8")).toContain("clarified");
  });

  it("updates an older version and replaces its files", () => {
    const root = fakePackage();
    const target = tempDir();
    install(root, target, "0.1.0");
    writeFileSync(join(target, "alpha", "stale.md"), "old");
    writeFileSync(join(root, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\nv2\n");

    const results = install(root, target, "0.2.0");
    expect(results[0]).toMatchObject({ skill: "alpha", status: "updated", reason: "from 0.1.0" });
    expect(readFileSync(join(target, "alpha", "SKILL.md"), "utf8")).toContain("v2");
    expect(existsSync(join(target, "alpha", "stale.md"))).toBe(false);
    expect(marker(target, "alpha")).toMatchObject({ version: "0.2.0" });
    expect(readdirSync(target).sort()).toEqual(["alpha", "beta"]);
  });

  it("skips a newer version unless forced", () => {
    const root = fakePackage();
    const target = tempDir();
    install(root, target, "0.3.0");
    expect(install(root, target, "0.2.0")[0]).toMatchObject({ status: "skipped" });
    expect(marker(target, "alpha")).toMatchObject({ version: "0.3.0" });
    expect(install(root, target, "0.2.0", { force: true })[0]).toMatchObject({ status: "updated" });
    expect(marker(target, "alpha")).toMatchObject({ version: "0.2.0" });
  });

  it("skips a folder dibujo didn't install, unless forced", () => {
    const root = fakePackage();
    const target = tempDir();
    mkdirSync(join(target, "alpha"));
    writeFileSync(join(target, "alpha", "SKILL.md"), "someone else's skill");

    const results = install(root, target, "0.1.0");
    expect(results).toEqual([
      {
        skill: "alpha",
        status: "skipped",
        reason: expect.stringContaining("not installed by dibujo"),
      },
      { skill: "beta", status: "installed" },
    ]);
    expect(readFileSync(join(target, "alpha", "SKILL.md"), "utf8")).toBe("someone else's skill");

    expect(install(root, target, "0.1.0", { force: true })[0]).toMatchObject({ status: "updated" });
    expect(marker(target, "alpha")).toMatchObject({ package: "digi-bujo" });
  });

  it("treats a symlinked skill folder as not installed by dibujo", () => {
    const root = fakePackage();
    const target = tempDir();
    symlinkSync(join(root, "skills", "alpha"), join(target, "alpha"));
    expect(install(root, target, "0.1.0")[0]).toMatchObject({ status: "skipped" });
    install(root, target, "0.1.0", { force: true });
    // The symlink is replaced; the package's own folder is untouched.
    expect(existsSync(join(root, "skills", "alpha", MARKER_FILE))).toBe(false);
    expect(marker(target, "alpha")).toMatchObject({ skill: "alpha" });
  });

  it("writes nothing on a dry run", () => {
    const root = fakePackage();
    const target = join(tempDir(), "skills");
    expect(install(root, target, "0.1.0", { dryRun: true }).map((r) => r.status)).toEqual([
      "installed",
      "installed",
    ]);
    expect(existsSync(target)).toBe(false);
  });
});

describe("dibujo skills install", () => {
  const pkg = findPackage();

  it("installs the package's skills into --target", async () => {
    const target = join(tempDir(), "skills");
    const ctx = fakeCtx();
    expect(await runCli(["skills", "install", "--target", target, "--json"], ctx, registers)).toBe(
      0,
    );
    const parsed = parseJsonOut(ctx.out()) as {
      data: { target: string; harness: null; results: { skill: string; status: string }[] };
    };
    expect(parsed.data.target).toBe(target);
    expect(parsed.data.harness).toBeNull();
    expect(parsed.data.results).toContainEqual({ skill: "daily-log", status: "installed" });
    expect(readFileSync(join(target, "daily-log", FORMAT_REFERENCE), "utf8")).toBe(
      readFileSync(join(pkg.root, "docs", "vault-format.md"), "utf8"),
    );
    expect(marker(target, "daily-log")).toEqual({
      package: "digi-bujo",
      version: pkg.version,
      skill: "daily-log",
      hash: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });

  it("installs into the kiro folder by default", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["skills", "install"], ctx, registers)).toBe(0);
    expect(existsSync(join(ctx.homedir, ".kiro", "skills", "daily-log", "SKILL.md"))).toBe(true);
    expect(ctx.out()).toContain("(kiro)");
    expect(ctx.out()).toMatch(/installed\s+daily-log/);
  });

  it("uses each harness's folder", async () => {
    for (const harness of HARNESSES) {
      const ctx = fakeCtx();
      expect(
        await runCli(
          ["skills", "install", "--harness", harness.name, "--dry-run", "--json"],
          ctx,
          registers,
        ),
      ).toBe(0);
      expect(parseJsonOut(ctx.out())).toMatchObject({
        data: { harness: harness.name, target: harness.skillsDir(ctx.homedir), dryRun: true },
      });
    }
  });

  it("writes nothing with --dry-run", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["skills", "install", "--dry-run"], ctx, registers)).toBe(0);
    expect(ctx.out()).toContain("Dry run");
    expect(existsSync(join(ctx.homedir, ".kiro"))).toBe(false);
  });

  it("exits 2 when --harness and --target are both given", async () => {
    const ctx = fakeCtx();
    expect(
      await runCli(
        ["skills", "install", "--harness", "kiro", "--target", tempDir(), "--json"],
        ctx,
        registers,
      ),
    ).toBe(2);
    expect(parseJsonOut(ctx.out())).toMatchObject({ error: { code: "USAGE" } });
  });

  it("exits 2 with the supported list for an unknown harness", async () => {
    const ctx = fakeCtx();
    expect(await runCli(["skills", "install", "--harness", "vim", "--json"], ctx, registers)).toBe(
      2,
    );
    expect(parseJsonOut(ctx.out())).toMatchObject({
      error: { code: "UNKNOWN_HARNESS", hint: expect.stringContaining("kiro") },
    });
  });
});

describe("shipped skills", () => {
  const pkg = findPackage();

  it.each(listPackageSkills(pkg.root))(
    "%s uses only standard Agent Skills frontmatter",
    (skill) => {
      const text = readFileSync(join(pkg.root, "skills", skill, "SKILL.md"), "utf8");
      const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
      expect(match, "SKILL.md must start with frontmatter").not.toBeNull();
      const keys = (match?.[1] ?? "")
        .split("\n")
        .filter((line) => /^[A-Za-z_-]+:/.test(line))
        .map((line) => line.slice(0, line.indexOf(":")));
      expect(keys.sort()).toEqual(["description", "name"]);
      expect(text).toContain(`name: ${skill}\n`);
      expect(text).toContain("references/vault-format.md");
    },
  );
});
