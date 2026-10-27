import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * packages/sim must stay a pure function of its inputs. This test scans its sources and fails on
 * anything that would make a run depend on the machine, the clock, or a floating-point builtin
 * whose result may differ between engines. It is the executable form of CLAUDE.md "Arquitectura".
 */
const SIM_SRC = join(process.cwd(), "packages/sim/src");
const RNG_SRC = join(process.cwd(), "packages/rng/src");

const FORBIDDEN: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /\bMath\.random\b/, why: "randomness must come from rng.next*(stream)" },
  { re: /\bDate\b/, why: "no clock in the simulation" },
  { re: /\bperformance\.now\b/, why: "no clock in the simulation" },
  {
    re: /\bMath\.(pow|sin|cos|tan|exp|log|sqrt|cbrt|atan2?)\b/,
    why: "no transcendental floats; use tables and integer products",
  },
  { re: /\*\*/, why: "no exponent operator; use integer products" },
  {
    re: /from\s+["'](react|phaser|@supabase\/[^"']*|vite|node:[^"']*)["']/,
    why: "sim has no runtime or framework deps",
  },
  { re: /\bimport\(["']/, why: "no dynamic imports in sim" },
  { re: /\bprocess\.\w+/, why: "no process access in sim" },
  { re: /\bwindow\b|\bdocument\b|\blocalStorage\b/, why: "no DOM in sim" },
  { re: /\bas unknown as\b/, why: "CLAUDE.md forbids `as unknown as`" },
  { re: /@ts-ignore|@ts-expect-error/, why: "CLAUDE.md forbids ts-ignore" },
  { re: /:\s*any\b|<any>|as any\b/, why: "CLAUDE.md forbids any" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts)$/.test(name) && !/\.test\.ts$|\.bench\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function violations(dir: string): string[] {
  const found: string[] = [];
  for (const file of walk(dir)) {
    // Blank out block comments but keep newlines so line numbers stay right.
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) =>
      m.replace(/[^\n]/g, " "),
    );
    const lines = source.split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, ""); // ignore trailing comments
      for (const { re, why } of FORBIDDEN) {
        if (re.test(code)) found.push(`${file}:${i + 1}: ${why}\n    ${line.trim()}`);
      }
    });
  }
  return found;
}

describe("purity guard", () => {
  it("packages/sim has no nondeterministic or framework code", () => {
    expect(violations(SIM_SRC)).toEqual([]);
  });

  it("packages/rng has no nondeterministic code", () => {
    expect(violations(RNG_SRC)).toEqual([]);
  });

  it("packages/sim declares no third-party dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "packages/sim/package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => !d.startsWith("@falconess/"))).toEqual([]);
  });
});
