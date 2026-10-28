/**
 * The race types the balance batch builds or reads: the z.infer types of `@falconess/schema`
 * (race.ts, docs/race-engine.md §3 and §20) and the internal TS types of `@falconess/sim`
 * (`RaceArena`, `CourseGeometry`, `FixtureBuild`, `SimulateOptions`), re-exported so the batch
 * imports them from one place.
 */
import type { RaceLog, RaceResult } from "@falconess/schema";

export type {
  EntryInput,
  RaceEntry,
  RaceLog,
  RaceResult,
  RaceRule,
  RaceSkill,
  RaceStats,
  RaceTraits,
} from "@falconess/schema";
export type { CourseGeometry, FixtureBuild, RaceArena, SimulateOptions } from "@falconess/sim";

/**
 * The fields of a result row the batch reads (`runnerId`, `finishMilli`, `dnf`,
 * `ledger.phaseTicks`, …). A `RaceResult` is one; the deterministic fake of `fake-engine.ts`
 * fills only these.
 */
export type BatchRaceResult = Pick<
  RaceResult,
  "lane" | "runnerId" | "place" | "finishMilli" | "timeTicks" | "deadHeat" | "dnf"
> & { ledger: Pick<RaceResult["ledger"], "phaseTicks"> };

/** The fields of a log the batch reads (`detail: "results"`). A `RaceLog` is one. */
export type BatchRaceLog = Pick<RaceLog, "rulesetVersion" | "seed" | "courseId" | "detail"> & {
  results: BatchRaceResult[];
};
