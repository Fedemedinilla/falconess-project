/** Binds the batch's port to the real engine of `@falconess/sim` (docs/race-engine.md §23). */
import {
  buildCourseGeometry,
  createRaceArena,
  disableSkill,
  fixtureBuild,
  freezeEntry,
  freezeSkill,
  generateField,
  neutralFixtureEntry,
  simulateRace,
} from "@falconess/sim";
import type { RaceEnginePort } from "./engine-port.js";

export function createEngineAdapter(): RaceEnginePort {
  return {
    engineId: "v1",
    buildCourseGeometry,
    freezeEntry,
    generateField,
    simulateRace,
    createRaceArena,
    freezeSkill,
    neutralFixtureEntry,
    fixtureBuild,
    disableSkill,
  };
}
