/**
 * Rewrites the RaceLog fixtures of `load.ts` from the real engine, exactly as
 * `pnpm sim:race -- <args> --json` prints them, formatted for readable diffs (two-space JSON with
 * number arrays on one line). Run from the repository root:
 *
 *   pnpm exec tsx apps/cli/src/race/__fixtures__/generate.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadContent } from "@falconess/content";
import { RULESET_V1 } from "@falconess/sim";
import { runSimRace } from "../../sim-race.js";
import { createRaceEngine } from "../engine-adapter.js";
import { FIXTURE_DIR, RACE_FIXTURES, type RaceFixtureName, raceFixturePath } from "./load.js";

const LINE_WIDTH = 100;

function format(value: unknown, indent: string): string {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== "object") return flat;
  const primitives =
    Array.isArray(value) && value.every((v) => v === null || typeof v !== "object");
  if (primitives || indent.length + flat.length <= LINE_WIDTH) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value))
    return `[\n${value.map((v) => `${inner}${format(v, inner)}`).join(",\n")}\n${indent}]`;
  const fields = Object.entries(value).map(
    ([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`,
  );
  return `{\n${fields.join(",\n")}\n${indent}}`;
}

/**
 * Two-space JSON for readable diffs: arrays of plain values (the frame columns) on one line, and
 * any object or array that fits in 100 columns (each event, each derived segment) inline.
 */
export function formatFixture(value: unknown): string {
  return `${format(value, "")}\n`;
}

const deps = {
  engine: createRaceEngine(),
  ctx: { ruleset: RULESET_V1, content: loadContent() },
  readText: (path: string) => readFileSync(join(FIXTURE_DIR, path), "utf8"),
};

for (const name of Object.keys(RACE_FIXTURES) as RaceFixtureName[]) {
  const log: unknown = JSON.parse(runSimRace([...RACE_FIXTURES[name].args, "--json"], deps));
  const path = raceFixturePath(name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatFixture(log));
  console.log(`${name}: ${path}`);
}
