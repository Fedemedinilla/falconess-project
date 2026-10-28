/**
 * The RaceLog types `pnpm sim:race` reads: the z.infer types of `@falconess/schema` (race.ts,
 * docs/race-engine.md section 20), re-exported so the renderer, the field builder and their tests
 * import them from one place. No parallel interfaces (CLAUDE.md): a field the view needs and the
 * log lacks is added to the log.
 */
export {
  type BoostMode,
  RACE_FRAME_FLAGS,
  type RaceEntry,
  type RaceEvent,
  type RaceFrames,
  type RaceGeometry,
  type RaceLedger,
  type RaceLog,
  type RaceResult,
  type RunnerDerived,
} from "@falconess/schema";
