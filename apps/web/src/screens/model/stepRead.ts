import type { GameSnapshot } from "../../game/controller";

/**
 * Whether the last step waits for the player: the last step of the run in play, not read yet
 * (`GameController.acknowledgeStep` marks it read). The test view's «Lo que pasó» opens on it and
 * an event waits behind it, in both views. The step that ends the season counts too.
 */
export function stepUnread(snap: Pick<GameSnapshot, "run" | "lastStep" | "lastStepSeen">): boolean {
  const step = snap.lastStep;
  return step !== undefined && !snap.lastStepSeen && snap.run?.state === step.after;
}
