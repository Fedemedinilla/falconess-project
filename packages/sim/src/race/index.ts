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
export {
  airOffsetPm,
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_V3_E1,
  FLIGHT_V3_E2,
  type FlightConstants,
  flightOf,
  NEUTRAL_WING,
  RULESET_V3,
  type RulesetV3,
  rulesetV3,
  WINGS_V3,
  type WingFlight,
} from "./flight.js";
export { buildCourseGeometry, type CourseGeometry, raceMaxTicks } from "./geometry.js";
export { createRaceArena, type RaceArena } from "./state.js";
