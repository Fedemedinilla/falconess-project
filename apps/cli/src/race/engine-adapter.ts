/**
 * Binds the race-engine port to `@falconess/sim`. The engine of docs/race-engine.md is being
 * written in parallel, so until it lands every operation throws `RaceEngineUnavailableError`.
 *
 * Wiring, once `@falconess/sim` exports the section 23 API and the TEMPORARY types of
 * `log-view.ts` and `engine-port.ts` are replaced by the `@falconess/schema` ones:
 *
 *   import {
 *     freezeEntry,
 *     generateField,
 *     neutralFixtureEntry,
 *     simulateRace,
 *   } from "@falconess/sim";
 *
 *   export function createRaceEngine(): RaceEnginePort {
 *     return { simulateRace, freezeEntry, generateField, neutralFixtureEntry };
 *   }
 */
import type { RaceEnginePort } from "./engine-port.js";

export class RaceEngineUnavailableError extends Error {
  constructor(operation: string) {
    super(
      `race engine not available yet: \`${operation}\` needs the engine of docs/race-engine.md ` +
        "(section 23) in @falconess/sim; wire it in apps/cli/src/race/engine-adapter.ts",
    );
    this.name = "RaceEngineUnavailableError";
  }
}

export function createRaceEngine(): RaceEnginePort {
  const unavailable = (operation: string) => (): never => {
    throw new RaceEngineUnavailableError(operation);
  };
  return {
    simulateRace: unavailable("simulateRace"),
    freezeEntry: unavailable("freezeEntry"),
    generateField: unavailable("generateField"),
    neutralFixtureEntry: unavailable("neutralFixtureEntry"),
  };
}
