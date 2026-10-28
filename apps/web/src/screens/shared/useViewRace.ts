import { navigate } from "../../app/useRoute";
import { findRacePick, pickRace } from "../../game/race-pick";
import { useGame } from "../../game/useGame";

/**
 * "Ver carrera": pick the goal race of a week of the run in play and open `#carrera` on it
 * (game/race-pick.ts). The pick replays the run once unless the race is the last step's.
 */
export function useViewRace(): (turn: number) => void {
  const { game, snap } = useGame();
  return (turn: number) => {
    const run = snap.run;
    if (!run) return;
    pickRace(findRacePick(game.context(), run, turn, snap.lastStep));
    navigate("carrera");
  };
}
