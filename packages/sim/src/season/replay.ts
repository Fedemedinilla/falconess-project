import type { BlackBox, RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason } from "./advance.js";
import type { Draft, SimContext } from "./context.js";
import { createBlackBox } from "./grade.js";
import { startSeason } from "./start.js";

/** Rebuild a season from its seed and inputs. This is the save format, the replay and the anti-cheat. */
export function replaySeason(
  ctx: SimContext,
  seed: string,
  inputs: readonly RunInput[],
): SeasonState {
  const first = inputs[0];
  if (!first || first.kind !== "start") throw new Error("the first input must be `start`");
  let state = startSeason(ctx, seed, first);
  for (const input of inputs.slice(1)) state = advanceSeason(ctx, state, input);
  return state;
}

export function blackBoxFor(
  ctx: SimContext,
  state: SeasonState,
  inputs: readonly RunInput[],
): BlackBox {
  if (state.status !== "ended") throw new Error("season has not ended");
  return createBlackBox(ctx, state as Draft, inputs);
}
