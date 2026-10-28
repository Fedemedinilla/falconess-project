import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RaceLog } from "../log-view.js";

/**
 * Hand-built RaceLogs that follow docs/race-engine.md section 20 field by field (every field of the
 * spec is present, not only the ones the CLI reads). Synthesised with a toy kinematic model, not
 * the engine: numbers are plausible and internally consistent (frames, events, margins, ledger
 * identity P5), not engine output. Replace them with real logs once `simulateRace` lands.
 */
export const RACE_FIXTURES = {
  /** desert-sprint, 3 runners: étoile (regen) exhausts near the line, two pulse frames. */
  sprint: "sprint-pulse.json",
  /** desert-ridge, 4 neutral fixtures: landings, a ground detour, a 25-energy hover fails jump 1. */
  ridge: "ridge-jumps.json",
  /** desert-canyon, --entries field: hp empties, worn wings break in the water, falke overheats. */
  canyon: "canyon-hp.json",
  /** desert-sprint, detail "results": one finisher and one DNF (the engine bug case of 19). */
  dnf: "sprint-dnf-results.json",
} as const;

export function loadRaceFixture(name: keyof typeof RACE_FIXTURES): RaceLog {
  const file = join(import.meta.dirname, RACE_FIXTURES[name]);
  const log: RaceLog = JSON.parse(readFileSync(file, "utf8"));
  return log;
}
