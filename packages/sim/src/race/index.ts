/**
 * Public API of the race engine foundation (docs/race-engine.md 23). `simulateRace`,
 * `generateField`, `createRaceArena` and `goalRaceSetup` arrive with the engine stages; the season
 * keeps the phase-1 stub until it is wired (D12).
 */
export { freezeEntry, freezeSkill } from "./entry.js";
export {
  disableSkill,
  type FixtureBuild,
  fixtureBuild,
  neutralFixtureEntry,
} from "./fixtures.js";
export { buildCourseGeometry, type CourseGeometry } from "./geometry.js";
