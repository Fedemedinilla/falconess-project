/**
 * The four race-engine operations `pnpm sim:race` needs, named and typed as in
 * docs/race-engine.md section 23. The CLI talks to the engine only through this port, so the
 * renderer and the field builder are testable with a fake engine; `engine-adapter.ts` binds it to
 * `@falconess/sim`.
 */
import type { ContentIndex, Course, EntryInput, RaceEntry, RaceLog } from "@falconess/schema";
import type { neutralFixtureEntry, Ruleset, SimulateOptions } from "@falconess/sim";

export type { EntryInput, SimulateOptions };

/** Spec 21.1 / 23 `generateField` arguments. */
export type GenerateFieldArgs = {
  course: Course;
  turn: number;
  raceSeed: string;
  player: EntryInput;
};

/** Spec 3.4 / 23 `neutralFixtureEntry` arguments. */
export type NeutralFixtureArgs = Parameters<typeof neutralFixtureEntry>[0];

export interface RaceEnginePort {
  /** Spec 23: pure race; never reads content. The CLI only sets `opts.detail`. */
  simulateRace(
    ruleset: Ruleset,
    entries: readonly RaceEntry[],
    course: Course,
    seed: string,
    opts?: SimulateOptions,
  ): RaceLog;
  /** Spec 3.1: content side, outside the pure race. */
  freezeEntry(
    ruleset: Ruleset,
    content: ContentIndex,
    input: EntryInput,
    course: Course,
    laneIndex: number,
  ): RaceEntry;
  /** Spec 21.1: the player plus `course.entries − 1` class-matched rivals, sorted by lane. */
  generateField(ruleset: Ruleset, content: ContentIndex, args: GenerateFieldArgs): RaceEntry[];
  /** Spec 3.4: rule "none", PW 1000, energy 100, dissipation 60, durability 100. */
  neutralFixtureEntry(args: NeutralFixtureArgs): RaceEntry;
}
