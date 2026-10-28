/**
 * The race engine as the balance batch sees it: exactly the operations of docs/race-engine.md §23
 * that `sim:batch` calls, with the same names and signatures. `engine-adapter.ts` binds them to
 * `@falconess/sim`; tests bind them to the deterministic fake of `fake-engine.ts`.
 */
import type { ContentIndex, Course, Slug, Style } from "@falconess/schema";
import type { Ruleset } from "@falconess/sim";
import type {
  CourseGeometry,
  EntryInput,
  FixtureBuild,
  RaceArena,
  RaceEntry,
  RaceLog,
  RaceSkill,
  RaceStats,
  SimulateOptions,
} from "./engine-types.js";

export type NeutralFixtureArgs = {
  runnerId: string;
  laneIndex: number;
  style: Style;
  stats: RaceStats;
  skills?: readonly RaceSkill[];
  build?: FixtureBuild;
};

export type GenerateFieldArgs = {
  course: Course;
  turn: number;
  raceSeed: string;
  player: EntryInput;
};

export type RaceEnginePort = {
  /** Written to `metadata.engine`: `v1` for the real engine, `fake` for the test stand-in. */
  readonly engineId: string;
  /** §2: pure; the batch caches one geometry per course and passes it in `opts.geometry`. */
  buildCourseGeometry(ruleset: Ruleset, course: Course): CourseGeometry;
  /** §3.1: content side; S2 designated entries and both S3 entries. */
  freezeEntry(
    ruleset: Ruleset,
    content: ContentIndex,
    input: EntryInput,
    course: Course,
    laneIndex: number,
  ): RaceEntry;
  /** §21.1: the goal-race field. S7 reaches it through the season engine (`goalRaceSetup`). */
  generateField(ruleset: Ruleset, content: ContentIndex, args: GenerateFieldArgs): RaceEntry[];
  /** §23: always called with `detail: "results"`, the worker's arena and the cached geometry. */
  simulateRace(
    ruleset: Ruleset,
    entries: readonly RaceEntry[],
    course: Course,
    seed: string,
    opts?: SimulateOptions,
  ): RaceLog;
  /** §22: one arena per worker, reused for every race. */
  createRaceArena(): RaceArena;
  /** §3.2: S4 gives every runner the skill (uniques too: no `uniqueTo` check). */
  freezeSkill(content: ContentIndex, id: Slug): RaceSkill;
  /** §3.4: S1, S2 fillers and equal-PW variant, S4, S5, S8 and the diagnostics. */
  neutralFixtureEntry(args: NeutralFixtureArgs): RaceEntry;
  /** §3.4: S5 parts and the quirk diagnostic. */
  fixtureBuild(
    content: ContentIndex,
    parts: readonly Slug[],
    quirks: readonly Slug[],
  ): FixtureBuild;
  /** §3.4: S4's "off" run; keeps the skill's draws aligned (D49). */
  disableSkill(entry: RaceEntry, skillId: Slug): RaceEntry;
};
