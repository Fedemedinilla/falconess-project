/**
 * The race position chosen before a race (ADR-0008): Punta, Pelotón, Acecho, Remate. The web only
 * picks one and puts it on the input; what it does is the sim's. Without a choice she runs in the
 * position of the wings she races with (`DEFAULT_POSITION`), the race of ruleset v1 as it was.
 */
import {
  type ContentIndex,
  DEFAULT_POSITION,
  POSITIONS,
  type Position,
  type PositionAptitudes,
  type RunInput,
  type SeasonState,
  type WorkshopOp,
} from "@falconess/schema";
import { actionBlock, goalForTurn, type Ruleset, type SimContext } from "@falconess/sim";

/** A week's action input: the only inputs that carry a race position. */
export type WeekActionInput = Exclude<RunInput, { kind: "start" | "event:choose" }>;

/** The position of a frame's wings: the default when none is chosen. */
export function wingsPosition(content: ContentIndex, frameId: string): Position {
  return DEFAULT_POSITION[content.getFrame(frameId).style];
}

/**
 * The frame she races with after a week's workshop ops: the last one they equip, else the one
 * equipped now (the sim races after the action; apps/cli `raceWings` reads it the same way). An
 * injured week rests whatever the input, so its ops change no wings.
 */
export function raceFrame(
  ruleset: Ruleset,
  state: Pick<SeasonState, "equippedFrame" | "injuryTurns" | "fatigue">,
  ops: readonly WorkshopOp[] = [],
): string {
  let frameId = state.equippedFrame;
  if (actionBlock(ruleset, state, "workshop") === "injured") return frameId;
  for (const op of ops) if (op.op === "equip-frame") frameId = op.frameId;
  return frameId;
}

/**
 * Whether this week's action runs a goal race: only then does the input take a position. Not once
 * the race has run (its event waits, or the race ended the season).
 */
export function isRaceWeek(ctx: SimContext, state: SeasonState): boolean {
  return (
    state.status === "active" &&
    state.pendingEvent === undefined &&
    goalForTurn(ctx, state) !== undefined
  );
}

/**
 * The week's input with the position the player chose. No choice leaves the input as it was, so
 * the race runs in her wings' position and the save carries nothing new.
 */
export function withPosition(
  input: WeekActionInput,
  position: Position | undefined,
): WeekActionInput {
  return position === undefined ? input : { ...input, position };
}

/** One option of the pre-race card. */
export type PositionOption = {
  readonly position: Position;
  /** Her aptitude letter in it: it scales her Intelligence in the race (race-engine §10). */
  readonly letter: PositionAptitudes[Position];
  /** The position of the wings she races with: the one preselected. */
  readonly wings: boolean;
};

/** The four positions, front to back, with her letter in each and the wings' one marked. */
export function positionOptions(
  letters: PositionAptitudes,
  wings: Position,
): readonly PositionOption[] {
  return POSITIONS.map((position) => ({
    position,
    letter: letters[position] ?? "G",
    wings: position === wings,
  }));
}

/**
 * A choice made on the card holds for the week it was made in: a new week (or an undo) starts
 * on the wings' position again.
 */
export type WeekPosition = { readonly turn: number; readonly position: Position };

export function chosenFor(
  choice: WeekPosition | undefined,
  state: SeasonState,
): Position | undefined {
  return choice !== undefined && choice.turn === state.turn ? choice.position : undefined;
}
