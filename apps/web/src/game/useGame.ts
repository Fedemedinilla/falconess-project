import { createContext, useContext, useSyncExternalStore } from "react";
import type { GameController, GameSnapshot } from "./controller";

/** The one controller of the page, provided by App (`<GameContext value={controller}>`). */
export const GameContext = createContext<GameController | undefined>(undefined);

export function useGameController(): GameController {
  const game = useContext(GameContext);
  if (!game) throw new Error("useGame outside <GameContext>");
  return game;
}

/**
 * The run in play and the controller to act on it. Screens read `snap` and call `game.act(...)`,
 * `game.start(...)`, `game.undoLast()`...; they never keep a copy of the state.
 */
export function useGame(): { readonly game: GameController; readonly snap: GameSnapshot } {
  const game = useGameController();
  const snap = useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
  return { game, snap };
}
