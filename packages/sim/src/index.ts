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
  rivalPool,
  type SimulateOptions,
  simulateRace,
} from "./race/index.js";
export { getRuleset, RULESET_V1, type Ruleset } from "./rulesets/index.js";
export { advanceSeason, goalRaceState, InvalidInputError } from "./season/advance.js";
export { rngForInput, type SimContext } from "./season/context.js";
export { eligibleEvents } from "./season/events.js";
export { goalForTurn } from "./season/goals.js";
export { createBlackBox, gradeFor, seasonScore, stableInputsHash } from "./season/grade.js";
export { bondLevel, hangarManufacturers } from "./season/hangar.js";
export { blackBoxFor, replaySeason } from "./season/replay.js";
export { startSeason } from "./season/start.js";
export { facilityLevel, trainingGain } from "./season/training.js";
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
