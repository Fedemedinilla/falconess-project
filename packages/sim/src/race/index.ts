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
  distanceLetterPm,
  distanceOfLength,
  FIELD_V3_R4,
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_OFF_ALLFLY,
  FLIGHT_OFF_KICK,
  FLIGHT_OFF_LINES,
  FLIGHT_OFF_NEUTRAL,
  FLIGHT_OFF_R5,
  FLIGHT_OFF_STAMINA,
  FLIGHT_V3_E1,
  FLIGHT_V3_E2,
  type FlightConstants,
  flightOf,
  NEUTRAL_WING,
  NEUTRAL_WINGS_R5,
  NEUTRAL_WINGS_V3N,
  RULESET_V3,
  type RulesetV3,
  rulesetV3,
  WINGS_R4,
  WINGS_V3,
  WINGS_V3N,
  type WingFlight,
} from "./flight.js";
export { buildCourseGeometry, type CourseGeometry, raceMaxTicks } from "./geometry.js";
export { createRaceArena, type RaceArena } from "./state.js";
