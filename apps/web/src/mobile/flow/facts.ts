/**
 * The facts the phone's flow is derived from (plan §1.1), read from the stores: the controller's
 * run and last step, the week's record, the scenes seen, the cards shown, the pace, the reduced
 * motion setting and whether a sheet is open. Pure and text-free (flow/imports.test.ts).
 */
import type { StoryScene } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { ActiveRun, Step } from "../../game/controller";
import { runFingerprint } from "../../game/run";
import type { Pace } from "../pace";
import type { StoryStore } from "../storyModel";
import { validRecord } from "./decidedWeek";
import type { InspirationStore } from "./inspirations";
import type { FlowFacts, WeekRecord } from "./types";
import { previewOf } from "./week";

/** Where the facts come from, as the run's view reads them. */
export type FactSources = {
  /** The controller's snapshot, with its run (the run's view shows only while there is one). */
  readonly snap: {
    readonly run: ActiveRun;
    readonly lastStep: Step | undefined;
    readonly lastStepSeen: boolean;
  };
  /** The week store's record, unchecked: kept only if it belongs to this run. */
  readonly week: WeekRecord | undefined;
  readonly story: Pick<StoryStore, "seenInRun" | "seenEver">;
  readonly cards: Pick<InspirationStore, "shown">;
  /** `allScenes()` in the app, the JSON files in the tests. */
  readonly scenes: readonly StoryScene[];
  readonly pace: Pace;
  readonly reduced: boolean;
  /** A sheet or the chat is open (`ui/modals`). */
  readonly sheetOpen: boolean;
};

const fingerprints = new WeakMap<ActiveRun, string>();

/** `runFingerprint(run)`, computed once per run object. */
function fingerprintOf(run: ActiveRun): string {
  let fp = fingerprints.get(run);
  if (fp === undefined) {
    fp = runFingerprint(run);
    fingerprints.set(run, fp);
  }
  return fp;
}

/**
 * The facts now. A record of another run (or a decided week whose preview no longer plays) reads
 * as none; the decided week's preview comes from the one preview cache, so reading the facts
 * again simulates nothing. Every set is the store's own reading, which keeps its identity until a
 * mark changes it.
 */
export function factsOf(ctx: SimContext, s: FactSources): FlowFacts {
  const { run, lastStep, lastStepSeen } = s.snap;
  const fp = fingerprintOf(run);
  const record = validRecord(ctx, run, fp, s.week);
  return {
    run: { run, fp, step: lastStep, stepSeen: lastStepSeen },
    scenes: s.scenes,
    record,
    preview: record?.phase === "decided" ? previewOf(ctx, run.state, record.input) : undefined,
    seenInRun: s.story.seenInRun(run.seed),
    seenEver: s.story.seenEver(),
    cardsShown: s.cards.shown(run.seed),
    pace: s.pace,
    reduced: s.reduced,
    sheetOpen: s.sheetOpen,
  };
}
