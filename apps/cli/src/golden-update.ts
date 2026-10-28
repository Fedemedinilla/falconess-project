/**
 * `pnpm golden:update -- --yes [--only <name,...>] [--dir <path>]`
 *
 * Writes the golden logs of docs/race-engine.md 24.3 (ROADMAP D13): every scenario of
 * `GOLDEN_SCENARIOS` (`packages/sim/src/race/golden.ts`) run under ruleset v1 with detail "full",
 * as canonical JSON (sorted keys, no whitespace, no trailing newline), to
 * `tests/golden/v1/<name>.json`. `pnpm test:golden` compares them byte for byte. tests/golden is
 * protected (CLAUDE.md): the lead runs this, and every regeneration goes with an ADR. Without
 * `--yes` it writes nothing.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@falconess/content";
import type { ContentIndex } from "@falconess/schema";
import { canonicalJson, GOLDEN_SCENARIOS, goldenDiffHint, runGoldenScenario } from "@falconess/sim";
import { parseArgs } from "./args.js";

/** `tests/golden/v1` of this checkout. */
export const GOLDEN_DIR = fileURLToPath(new URL("../../../tests/golden/v1/", import.meta.url));

export const ADR_REMINDER = [
  "ADR reminder: the golden logs freeze the engine's output byte for byte (docs/race-engine.md 24.3).",
  "Regenerating them is a decision. Record it in docs/decisions/ (a new ADR, or a line in the ADR of",
  "the change): what changed in the engine, the rules or the content, and why the new logs are right.",
  "Commit the ADR together with the new files.",
].join("\n");

export const GOLDEN_USAGE = [
  "pnpm golden:update -- --yes [--only <name,...>] [--dir <path>]",
  "  --yes          required: without it nothing is written",
  "  --only a,b     only these scenarios (file names without .json)",
  "  --dir PATH     target directory (default tests/golden/v1)",
  `scenarios: ${GOLDEN_SCENARIOS.map((s) => s.name).join(", ")}`,
].join("\n");

const FLAGS = new Set(["yes", "only", "dir", "help"]);

export type GoldenUpdateResult = { readonly code: number; readonly lines: readonly string[] };

/** Everything `pnpm golden:update` does; returns the exit code and the printed lines. */
export function runGoldenUpdate(
  argv: readonly string[],
  content: ContentIndex,
  defaultDir: string = GOLDEN_DIR,
): GoldenUpdateResult {
  const args = parseArgs(argv);
  if (args.help === true) return { code: 0, lines: [GOLDEN_USAGE] };
  // a bare "--" (pnpm's argument separator) parses as the empty key
  const unknown = Object.keys(args).filter((k) => k !== "" && !FLAGS.has(k));
  if (unknown.length > 0)
    return { code: 64, lines: [`unknown option --${unknown.join(", --")}`, "", GOLDEN_USAGE] };
  if (args.yes !== true)
    return {
      code: 1,
      lines: ["golden:update writes nothing without --yes.", "", GOLDEN_USAGE, "", ADR_REMINDER],
    };

  const only = typeof args.only === "string" ? args.only.split(",").filter((s) => s !== "") : null;
  const known = new Set(GOLDEN_SCENARIOS.map((s) => s.name));
  const missing = (only ?? []).filter((name) => !known.has(name));
  if (missing.length > 0)
    return { code: 64, lines: [`unknown scenario ${missing.join(", ")}`, "", GOLDEN_USAGE] };
  const dir = typeof args.dir === "string" ? args.dir : defaultDir;
  const selected = GOLDEN_SCENARIOS.filter((s) => only === null || only.includes(s.name));

  mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  let written = 0;
  for (const s of selected) {
    const file = join(dir, `${s.name}.json`);
    const text = canonicalJson(runGoldenScenario(content, s));
    const before = existsSync(file) ? readFileSync(file, "utf8") : null;
    const size = `${Buffer.byteLength(text, "utf8")} bytes`;
    if (before === text) {
      lines.push(`unchanged  ${s.name}.json (${size})`);
      continue;
    }
    writeFileSync(file, text);
    written += 1;
    lines.push(
      before === null
        ? `new        ${s.name}.json (${size})`
        : `changed    ${s.name}.json (${size}): ${goldenDiffHint(before, text)}`,
    );
  }
  for (const f of readdirSync(dir).sort())
    if (f.endsWith(".json") && !known.has(f.slice(0, -".json".length)))
      lines.push(`stale      ${f} (no scenario writes it; not removed)`);
  lines.push(`${written} of ${selected.length} written to ${dir}`);
  if (written > 0) lines.push("", ADR_REMINDER);
  return { code: 0, lines };
}

const isMain =
  process.argv[1]?.endsWith("golden-update.ts") || process.argv[1]?.endsWith("golden-update.js");
if (isMain) {
  const { code, lines } = runGoldenUpdate(process.argv.slice(2), loadContent());
  (code === 0 ? console.log : console.error)(lines.join("\n"));
  process.exit(code);
}
