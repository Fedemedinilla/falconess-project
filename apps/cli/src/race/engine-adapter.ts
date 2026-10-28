/**
 * Binds the race-engine port to `@falconess/sim` (docs/race-engine.md section 23).
 *
 * TODO(generateField): `generateField` (21.1) is not exported yet; until it is, the player field
 * comes from the TEMPORARY `interimGenerateField` (`interim-field.ts`). When it lands, import it
 * here instead and delete `interim-field.ts`.
 */
import { freezeEntry, neutralFixtureEntry, simulateRace } from "@falconess/sim";
import type { RaceEnginePort } from "./engine-port.js";
import { interimGenerateField } from "./interim-field.js";

export function createRaceEngine(): RaceEnginePort {
  return {
    simulateRace,
    freezeEntry,
    generateField: interimGenerateField,
    neutralFixtureEntry,
  };
}
