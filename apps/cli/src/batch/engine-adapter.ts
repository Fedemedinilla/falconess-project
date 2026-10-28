import type { RaceEnginePort } from "./engine-port.js";

/** Thrown while `@falconess/sim` does not export the race API of docs/race-engine.md §23. */
export class EngineUnavailableError extends Error {
  constructor() {
    super(
      "race engine not available yet: wire apps/cli/src/batch/engine-adapter.ts to @falconess/sim (docs/race-engine.md §23)",
    );
    this.name = "EngineUnavailableError";
  }
}

/**
 * Binds the batch's port to the real engine. The lead wires it when the engine lands:
 *
 * 1. Replace the TEMPORARY types of `engine-types.ts` with the z.infer types of
 *    `@falconess/schema` (race.ts) and the `RaceArena` / `CourseGeometry` types of `@falconess/sim`.
 * 2. Replace the body of this function with:
 *
 * ```ts
 * import {
 *   buildCourseGeometry,
 *   createRaceArena,
 *   disableSkill,
 *   fixtureBuild,
 *   freezeEntry,
 *   freezeSkill,
 *   generateField,
 *   neutralFixtureEntry,
 *   simulateRace,
 * } from "@falconess/sim";
 *
 * export function createEngineAdapter(): RaceEnginePort {
 *   return {
 *     engineId: "v1",
 *     buildCourseGeometry,
 *     freezeEntry,
 *     generateField,
 *     simulateRace,
 *     createRaceArena,
 *     freezeSkill,
 *     neutralFixtureEntry,
 *     fixtureBuild,
 *     disableSkill,
 *   };
 * }
 * ```
 *
 * 3. `pnpm sim:batch -- --runs 1000` (CI smoke of §24.4), then the full 10 000.
 */
export function createEngineAdapter(): RaceEnginePort {
  throw new EngineUnavailableError();
}
