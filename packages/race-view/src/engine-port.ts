/**
 * The four race-engine operations a race viewer needs, named and typed as in
 * docs/race-engine.md section 23. The CLI and the web build fields through this port, so the field
 * builder is testable with a fake engine; `@falconess/sim` itself satisfies it.
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
  /** Spec 23: pure race; never reads content. Viewers only set `opts.detail`. */
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
