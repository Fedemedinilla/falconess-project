import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The flow model is pure and text-free (plan §1.1): the native `web-flow` project runs it without
 * Vite, so nothing in `mobile/flow/` may reach React, a component (`.tsx`), a style sheet, the
 * text tables (`text/`) or the content globs (`content/load`, `content/story`, any
 * `import.meta.glob`). A type-only import (`import type`) is erased; any other import loads the
 * module, `import { type A }` included (`verbatimModuleSyntax` keeps it), so those are followed.
 */
const FLOW = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(FLOW, "../..");

const STATIC = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?"([^"]+)"/gm;
const DYNAMIC = /\bimport\(\s*"([^"]+)"\s*\)/g;

type Import = { readonly spec: string; readonly typeOnly: boolean };

function importsOf(source: string): Import[] {
  const out: Import[] = [];
  for (const m of source.matchAll(STATIC)) out.push({ spec: m[2] ?? "", typeOnly: !!m[1] });
  for (const m of source.matchAll(DYNAMIC)) out.push({ spec: m[1] ?? "", typeOnly: false });
  return out;
}

/** A relative import's file (`.ts`, `.tsx`, `.css`…), or undefined for a package. */
function fileOf(from: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(from), spec);
  const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(
    (p) => existsSync(p) && statSync(p).isFile(),
  );
  return hit ?? base;
}

/** Why a module may not be loaded by the flow model, if it may not. */
function banned(spec: string, file: string | undefined): string | undefined {
  if (/^react(-dom)?(\/|$)/.test(spec)) return "React";
  if (file === undefined) return undefined;
  const rel = relative(SRC, file).replaceAll("\\", "/");
  if (/\.(tsx|css)$/.test(rel)) return "a component or style sheet";
  if (rel.startsWith("text/")) return "the text tables";
  if (/^content\/(load|story)(\.ts)?$/.test(rel)) return "a content glob";
  if (rel.endsWith(".ts") && /\bimport\.meta\.glob\s*[<(]/.test(readFileSync(file, "utf8")))
    return "import.meta.glob";
  return undefined;
}

/** Every forbidden module `file` reaches, with the chain of imports that gets there. */
function violations(file: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (at: string, chain: readonly string[], direct: boolean): void => {
    for (const { spec, typeOnly } of importsOf(readFileSync(at, "utf8"))) {
      // a type-only import loads nothing; it is still kept out of the folder itself
      if (typeOnly && !direct) continue;
      const target = fileOf(at, spec);
      const why = banned(spec, target);
      const step = target ? relative(SRC, target) : spec;
      if (why) {
        out.push(`${[...chain, step].join(" → ")} (${why})`);
        continue;
      }
      if (typeOnly || !target?.endsWith(".ts") || seen.has(target)) continue;
      seen.add(target);
      walk(target, [...chain, step], false);
    }
  };
  walk(file, [relative(SRC, file)], true);
  return out;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsFiles(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

describe("mobile/flow stays pure and text-free", () => {
  it("no file in it imports React, a component, the text tables or a content glob", () => {
    const files = tsFiles(FLOW);
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap(violations)).toEqual([]);
  });
  it("the check follows imports: the season screens' model reaches the text tables", () => {
    const found = violations(join(SRC, "screens/model/season.ts"));
    expect(found).toContain("screens/model/season.ts → text/ui.ts (the text tables)");
  });
});
