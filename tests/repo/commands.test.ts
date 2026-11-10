import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/commands.md lists every root `pnpm` script with one line each (the lead copies it into
 * CLAUDE.md "Comandos"); this keeps it and package.json in sync, and the script targets real.
 */
const ROOT = process.cwd();
const pkg: { scripts: Record<string, string> } = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
);
const doc = readFileSync(join(ROOT, "docs/commands.md"), "utf8");
const scripts = Object.keys(pkg.scripts);
/** pnpm's own commands the doc may name. */
const BUILTINS = new Set(["install"]);

/** The command named by each list line: "- `pnpm <name> ...`: ...". */
const listed = doc
  .split("\n")
  .map((line) => /^- `pnpm ([\w:-]+)/.exec(line)?.[1])
  .filter((name) => name !== undefined);

describe("docs/commands.md", () => {
  it("lists every root script exactly once", () => {
    for (const s of scripts)
      expect(
        listed.filter((name) => name === s),
        s,
      ).toHaveLength(1);
  });

  it("names only scripts that exist (or pnpm built-ins)", () => {
    expect(listed.filter((name) => !scripts.includes(name) && !BUILTINS.has(name))).toEqual([]);
  });

  it("keeps one line per command", () => {
    for (const line of doc.split("\n").filter((l) => l.startsWith("- `pnpm ")))
      expect(line.length, line).toBeLessThanOrEqual(100);
  });
});

describe("golden scripts", () => {
  it("test:golden runs the golden test file and golden:update runs the generator", () => {
    expect(pkg.scripts["test:golden"]).toBe(
      "vitest run --project sim src/race/golden.test.ts src/race/golden-v3.test.ts",
    );
    expect(existsSync(join(ROOT, "packages/sim/src/race/golden.test.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "packages/sim/src/race/golden-v3.test.ts"))).toBe(true);
    expect(pkg.scripts["golden:update"]).toBe("tsx apps/cli/src/golden-update.ts");
    expect(existsSync(join(ROOT, "apps/cli/src/golden-update.ts"))).toBe(true);
  });
});
