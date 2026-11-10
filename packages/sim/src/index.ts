export { type FrameBuild, installPart, resolveFrameBuild } from "./frame-build.js";
export {
  canonicalJson,
  DETERMINISM_EXTRAS,
  GOLDEN_SCENARIOS,
  type GoldenScenario,
  goldenDiffHint,
  goldenEntries,
  runGoldenScenario,
} from "./race/golden.js";
export {
  GOLDEN_V3_SCENARIOS,
  type GoldenV3Scenario,
  runGoldenV3Scenario,
} from "./race/golden-v3.js";
export {
  airOffsetPm,
  buildCourseGeometry,
  type CourseGeometry,
  createRaceArena,
  disableSkill,
  distanceLetterPm,
  distanceOfLength,
  type FixtureBuild,
  fixtureBuild,
  flightOf,
  freezeEntry,
  freezeSkill,
  type GenerateFieldArgs,
  type GoalRaceSetup,
  generateField,
  goalRaceSetup,
  neutralFixtureEntry,
  PLAYER_RUNNER_ID,
  type RaceArena,
  raceMaxTicks,
  rivalPool,
  type SimulateOptions,
  simulateRace,
} from "./race/index.js";
export {
  CURRENT_RULESET,
  type FlightConstants,
  getRuleset,
  RULESET_V1,
  RULESET_V2,
  RULESET_V3,
  type Ruleset,
  type RulesetV3,
} from "./rulesets/index.js";
export { NEUTRAL_WING, WINGS as WINGS_V3N, type WingFlight } from "./rulesets/v3/constants.js";
// ADR-0011 §7: the invariance switches (B8 and the sim's tests only; nothing plays them)
export {
  FIELD_V3_R4,
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_OFF_ALLFLY,
  FLIGHT_OFF_HOMES,
  FLIGHT_OFF_JUMPSKIM,
  FLIGHT_OFF_KICK,
  FLIGHT_OFF_LINES,
  FLIGHT_OFF_NEUTRAL,
  FLIGHT_OFF_POLISH,
  FLIGHT_OFF_R5,
  FLIGHT_OFF_STAMINA,
  FLIGHT_OFF_TRIM,
  NEUTRAL_WINGS_R5,
  NEUTRAL_WINGS_V3N,
  rulesetV3With,
  WINGS_R4,
  WINGS_V3,
} from "./rulesets/v3/switches.js";
export { advanceSeason, goalRaceState, InvalidInputError } from "./season/advance.js";
export { type MoodCause, rngForInput, type SimContext, seasonContext } from "./season/context.js";
export { eligibleEvents } from "./season/events.js";
export { goalForTurn, inputPosition } from "./season/goals.js";
export { createBlackBox, gradeFor, seasonScore, stableInputsHash } from "./season/grade.js";
export { bondLevel, hangarManufacturers } from "./season/hangar.js";
export { blackBoxFor, replaySeason } from "./season/replay.js";
export {
  type ActionBlock,
  actionBlock,
  moodDriftPm,
  nextTrainingDriftPm,
  type RestOption,
  raceLossCostsMood,
  restOptions,
  type TrainingRisk,
  trainingMoodMultiplier,
  trainingRisk,
  trainingStreak,
  vigor,
} from "./season/rules.js";
export { boxDistanceFactor, seasonDistanceAptitudes, startSeason } from "./season/start.js";
export { facilityLevel, type StatGain, trainingGain, trainingGains } from "./season/training.js";
export {
  learnCap,
  maxDurability,
  rerollCost,
  rollQuirks,
  WorkshopError,
} from "./season/workshop.js";
export {
  addStat,
  aptitudeMult,
  aptitudeRank,
  clampStat,
  effectiveStats,
  highestStat,
  lowestStat,
  moodMultiplier,
  STAT_ORDER,
  statTotal,
  upgradeAptitude,
} from "./stats.js";
