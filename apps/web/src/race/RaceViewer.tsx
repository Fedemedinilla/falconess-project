import type { RaceLabels } from "@falconess/race-view";
import type { RaceLog } from "@falconess/schema";
import { GoalRaceScreen } from "./GoalRaceScreen";
import { Replay } from "./RaceReplay";

export type RaceViewerProps = {
  /** The race to replay; without it, the #carrera screen picks a goal race of the run in play. */
  log?: RaceLog | undefined;
  /** Names and liveries; the page's content by default. */
  labels?: RaceLabels | undefined;
  /** Prefix of the controls' ids ("carrera" by default). */
  idPrefix?: string | undefined;
};

/**
 * The race viewer. It reads only the RaceLog (and content for names and liveries): positions
 * between sampled frames are interpolated for the animation, every other number is the log's.
 * Without a log it is the #carrera screen: a goal race of the run in play, rebuilt by the sim.
 */
export function RaceViewer({ log, labels, idPrefix = "carrera" }: RaceViewerProps) {
  if (!log) return <GoalRaceScreen />;
  return <Replay log={log} labels={labels} idPrefix={idPrefix} />;
}
