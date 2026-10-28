/**
 * The four race-engine operations `pnpm sim:race` needs, named and typed as in
 * docs/race-engine.md section 23. The CLI talks to the engine only through this port, so the
 * renderer and the field builder are testable with a fake engine, and the real one is wired in
 * `engine-adapter.ts` (re-exports from `@falconess/sim`) when it lands.
 */
import type {
  BiomeAptitudes,
  ContentIndex,
  Course,
  FalconessStats,
  Mood,
  Slug,
  Style,
  StyleAptitudes,
} from "@falconess/schema";
import type { Ruleset } from "@falconess/sim";
import type { RaceEntry, RaceLog } from "./log-view.js";

// TEMPORARY: replace EntryInput with the z.infer type from @falconess/schema (race.ts) and
// SimulateOptions with the type exported by @falconess/sim when the engine lands.

/** Spec 3.1 `EntryInput`: what `freezeEntry` freezes (also the `--entries` file format). */
export type EntryInput = {
  /** "player", "rival-1".."rival-7", batch ids. */
  runnerId: string;
  kind: "player" | "rival" | "ghost";
  falconessId: Slug | null;
  baseStats: FalconessStats;
  mood: Mood;
  biomeAptitude: BiomeAptitudes;
  styleAptitude: StyleAptitudes;
  frameId: Slug;
  parts: Slug[];
  quirks: Slug[];
  learnedSkills: Slug[];
  /** Season frameDurability; null = full. */
  durability: number | null;
};

/** Spec 23 `SimulateOptions` (the CLI only sets `detail`). */
export type SimulateOptions = { detail?: "full" | "results" };

/** Spec 21.1 / 23 `generateField` arguments. */
export type GenerateFieldArgs = {
  course: Course;
  turn: number;
  raceSeed: string;
  player: EntryInput;
};

/** Spec 3.4 / 23 `neutralFixtureEntry` arguments (`skills` and `build` are not used here). */
export type NeutralFixtureArgs = {
  runnerId: string;
  laneIndex: number;
  style: Style;
  stats: RaceEntry["stats"];
};

export interface RaceEnginePort {
  /** Spec 23: pure race; never reads content. */
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
