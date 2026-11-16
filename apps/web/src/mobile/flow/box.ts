/**
 * The black box a season leaves (ADR-0013, plan §1.11, critic (c)9): kept at the commit that
 * ends the season, before any replay, scene or end screen. Pure and text-free.
 */
import type { BlackBox, RunInput, SeasonState } from "@falconess/schema";
import { blackBoxFor, type SimContext } from "@falconess/sim";

/** The box to keep: an ended season's on v3 (no inheritance before it), else none. */
export function boxToKeep(
  ctx: SimContext,
  run: { readonly state: SeasonState; readonly inputs: readonly RunInput[] },
): BlackBox | undefined {
  const { state, inputs } = run;
  return state.status === "ended" && state.rulesetVersion === "v3"
    ? blackBoxFor(ctx, state, inputs)
    : undefined;
}
