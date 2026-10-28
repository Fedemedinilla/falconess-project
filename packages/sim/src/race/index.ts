/**
 * Public API of the race engine (docs/race-engine.md 23). `generateField` and `goalRaceSetup`
 * arrive with the integration stage; the season keeps the phase-1 stub until it is wired (D12).
 */
export { type SimulateOptions, simulateRace } from "./engine.js";
export { freezeEntry, freezeSkill } from "./entry.js";
export {
  disableSkill,
  type FixtureBuild,
  fixtureBuild,
  neutralFixtureEntry,
} from "./fixtures.js";
export { buildCourseGeometry, type CourseGeometry } from "./geometry.js";
export { createRaceArena, type RaceArena } from "./state.js";
