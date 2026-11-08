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
// ruleset v3 draft (design7 «Despegar y caer»): a prototype outside rulesets/ until ADR-0009
export {
  airOffsetPm,
  buildCourseGeometry,
  type CourseGeometry,
  createRaceArena,
  disableSkill,
  FIELD_V3_R4,
  type FixtureBuild,
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_OFF_LINES,
  FLIGHT_OFF_R5,
  FLIGHT_V3_E1,
  FLIGHT_V3_E2,
  type FlightConstants,
  fixtureBuild,
  flightOf,
  freezeEntry,
  freezeSkill,
  type GenerateFieldArgs,
  type GoalRaceSetup,
  generateField,
  goalRaceSetup,
  NEUTRAL_WING,
  NEUTRAL_WINGS_R5,
  neutralFixtureEntry,
  PLAYER_RUNNER_ID,
  type RaceArena,
  RULESET_V3,
  type RulesetV3,
  raceMaxTicks,
  rivalPool,
  rulesetV3,
  type SimulateOptions,
  simulateRace,
  WINGS_R4,
  WINGS_V3,
  type WingFlight,
} from "./race/index.js";
export {
  CURRENT_RULESET,
  getRuleset,
  RULESET_V1,
  RULESET_V2,
  type Ruleset,
} from "./rulesets/index.js";
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
export { startSeason } from "./season/start.js";
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
