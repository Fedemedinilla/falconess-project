/** Binds the race-engine port to `@falconess/sim` (docs/race-engine.md section 23). */
import { freezeEntry, generateField, neutralFixtureEntry, simulateRace } from "@falconess/sim";
import type { RaceEnginePort } from "./engine-port.js";

export function createRaceEngine(): RaceEnginePort {
  return {
    simulateRace,
    freezeEntry,
    generateField,
    neutralFixtureEntry,
  };
}
