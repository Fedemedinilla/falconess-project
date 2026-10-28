import type { RaceLog } from "@falconess/schema";
import { useMemo } from "react";
import { goalRaceLog } from "../../game/goal-race";
import { findRacePick } from "../../game/race-pick";
import { useGame } from "../../game/useGame";

/**
 * The full log of the run's goal race of week `turn` (undefined: none), rebuilt by the sim like
 * "Ver carrera" does (game/race-pick.ts, game/goal-race.ts): from the last step when it ran that
 * race, else by replaying the run once. P7 makes it the race the season recorded.
 */
export function useGoalRaceLog(turn: number | undefined): RaceLog | undefined {
  const { game, snap } = useGame();
  const run = snap.run;
  const last = snap.lastStep;
  return useMemo(() => {
    if (turn === undefined || !run) return undefined;
    const ctx = game.context();
    const pick = findRacePick(ctx, run, turn, last);
    return pick ? goalRaceLog(ctx, pick.step.before, pick.step.input) : undefined;
  }, [game, run, last, turn]);
}
