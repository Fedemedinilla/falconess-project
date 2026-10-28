/**
 * Binds the batch's port to the real engine of `@falconess/sim` (docs/race-engine.md §23).
 *
 * TODO(generateField): `generateField` (§21.1) is not exported yet. The batch never calls it (S7
 * reaches the goal-race field through the season engine), so the port holds a stub that throws;
 * bind the real one here once `@falconess/sim` exports it.
 */
import {
  buildCourseGeometry,
  createRaceArena,
  disableSkill,
  fixtureBuild,
  freezeEntry,
  freezeSkill,
  neutralFixtureEntry,
  simulateRace,
} from "@falconess/sim";
import type { RaceEnginePort } from "./engine-port.js";

/** Thrown by the port's `generateField` until `@falconess/sim` exports it. */
export class EngineUnavailableError extends Error {
  constructor(operation: string) {
    super(
      `race engine operation not available yet: \`${operation}\` (docs/race-engine.md §21.1); wire it in apps/cli/src/batch/engine-adapter.ts`,
    );
    this.name = "EngineUnavailableError";
  }
}

export function createEngineAdapter(): RaceEnginePort {
  return {
    engineId: "v1",
    buildCourseGeometry,
    freezeEntry,
    generateField: () => {
      throw new EngineUnavailableError("generateField");
    },
    simulateRace,
    createRaceArena,
    freezeSkill,
    neutralFixtureEntry,
    fixtureBuild,
    disableSkill,
  };
}
