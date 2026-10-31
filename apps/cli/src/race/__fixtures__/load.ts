import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RaceLog } from "@falconess/schema";

/**
 * Real RaceLogs of the engine, written by `pnpm sim:race -- <args> --json` with the arguments
 * below (`generate.ts` rewrites them; `--entries` files live next to this module). The renderer
 * tests read these files, never the engine, so an engine change does not move them until they are
 * regenerated:
 *
 *   pnpm exec tsx apps/cli/src/race/__fixtures__/generate.ts
 *   pnpm exec vitest run --project cli -u
 *
 * The logs predate ADR-0003 D56: `derived[].brokenSpeedPm` was added by hand as 1000, the neutral
 * factor of the engine that wrote them (its broken wings went through the PW alone). They also
 * predate ADR-0007: `geometry.biome` and `derived[].biomeAptitude` were removed by hand, the
 * course ids lost their `desert-` prefix and the canyon `param` (its wind) became 0; the canyon
 * race itself is still the one the windy engine ran.
 */
export const RACE_FIXTURES = {
  /** sprint, player field: Peregrina at 600 with three actives against turn-46 rivals. */
  sprint: {
    file: "sprint.json",
    args: [
      "--seed",
      "pt1-sprint",
      "--course",
      "sprint",
      "--stats",
      "600",
      "--turn",
      "46",
      "--skills",
      "corner-carver,last-gasp,stoop-strike",
    ],
  },
  /** ridge, six mixed real frames: jumps and landings, ground detours, repairs, drafting. */
  ridge: {
    file: "ridge.json",
    args: ["--seed", "pt1-ridge", "--course", "ridge", "--entries", "ridge-entries.json"],
  },
  /**
   * canyon, eight mixed real frames: hp empties, worn wings break in the water, heat to
   * energy, an overheat, repairs and the regen/ground-constant mode churn.
   */
  canyon: {
    file: "canyon.json",
    args: ["--seed", "pt1-canyon", "--course", "canyon", "--entries", "canyon-entries.json"],
  },
  /** The sprint again with detail "results": no frames, no events. */
  results: {
    file: "sprint-results.json",
    args: [
      "--seed",
      "pt1-sprint",
      "--course",
      "sprint",
      "--stats",
      "600",
      "--turn",
      "46",
      "--skills",
      "corner-carver,last-gasp,stoop-strike",
      "--detail",
      "results",
    ],
  },
} as const;

export type RaceFixtureName = keyof typeof RACE_FIXTURES;

export const FIXTURE_DIR = import.meta.dirname;
const LOG_DIR = join(FIXTURE_DIR, "logs");

export function raceFixturePath(name: RaceFixtureName): string {
  return join(LOG_DIR, RACE_FIXTURES[name].file);
}

/** A fresh copy of the fixture, validated against the current `RaceLog` schema. */
export function loadRaceFixture(name: RaceFixtureName): RaceLog {
  const raw: unknown = JSON.parse(readFileSync(raceFixturePath(name), "utf8"));
  const parsed = RaceLog.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `${RACE_FIXTURES[name].file} no longer matches the RaceLog schema; regenerate it (see load.ts): ${parsed.error.message}`,
    );
  return parsed.data;
}
