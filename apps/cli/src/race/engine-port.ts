/**
 * The four race-engine operations `pnpm sim:race` needs (docs/race-engine.md section 23). The port
 * lives in `@falconess/race-view`, shared with the web's free race; `engine-adapter.ts` binds it
 * to `@falconess/sim`.
 */
export type {
  EntryInput,
  GenerateFieldArgs,
  NeutralFixtureArgs,
  RaceEnginePort,
  SimulateOptions,
} from "@falconess/race-view";
