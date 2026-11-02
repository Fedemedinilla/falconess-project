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
  buildCourseGeometry,
  type CourseGeometry,
  createRaceArena,
  disableSkill,
  type FixtureBuild,
  fixtureBuild,
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
