/** Public API of the race engine (docs/race-engine.md 23). */
export { type SimulateOptions, simulateRace } from "./engine.js";
export { freezeEntry, freezeSkill } from "./entry.js";
export {
  type GenerateFieldArgs,
  type GoalRaceSetup,
  generateField,
  goalRaceSetup,
  PLAYER_RUNNER_ID,
  rivalPool,
} from "./field.js";
export {
  disableSkill,
  type FixtureBuild,
  fixtureBuild,
  neutralFixtureEntry,
} from "./fixtures.js";
export { buildCourseGeometry, type CourseGeometry, raceMaxTicks } from "./geometry.js";
export { createRaceArena, type RaceArena } from "./state.js";
