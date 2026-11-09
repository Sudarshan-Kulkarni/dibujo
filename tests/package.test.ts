import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findPackage } from "../src/package-info.js";

const root = findPackage().root;

interface PackEntry {
  files: { path: string }[];
}

describe("published package", () => {
  it("contains only the build, skills, docs, and top-level metadata", () => {
    // --ignore-scripts so this doesn't run prepublish/prepare hooks.
    const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const [entry] = JSON.parse(output) as PackEntry[];
    const paths = (entry?.files ?? []).map((f) => f.path).sort();

    const allowedTopLevel = new Set(["package.json", "README.md", "LICENSE"]);
    const unexpected = paths.filter(
      (p) =>
        !allowedTopLevel.has(p) &&
        !p.startsWith("dist/") &&
        !p.startsWith("skills/") &&
        !p.startsWith("docs/"),
    );
    expect(unexpected).toEqual([]);

    expect(paths).toContain("skills/daily-log/SKILL.md");
    expect(paths).toContain("docs/vault-format.md");
    expect(paths).toContain("LICENSE");
    // Tests and sources stay out of the package.
    expect(paths.some((p) => p.startsWith("src/") || p.startsWith("tests/"))).toBe(false);
  }, 60_000);

  it("declares the bin, engines, and only runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as {
      name: string;
      bin: Record<string, string>;
      engines: { node: string };
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("digi-bujo");
    expect(pkg.bin).toEqual({ dibujo: "./dist/cli/index.js" });
    expect(pkg.engines.node).toBe(">=22.12");
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "commander",
      "date-fns",
      "semver",
      "yaml",
      "zod",
    ]);
  });
});
