/**
 * The season's closing numbers for SeasonEnd, all from the sim: the grade and score (`gradeFor`'s
 * `seasonScore`), the grade ladder of the ruleset, the feathers of the economy, the black box
 * (`blackBoxFor`) and the stats the season started with (`startSeason` of the run's first input).
 */
import type { BlackBox, FalconessStats, Grade, RunInput, SeasonState } from "@falconess/schema";
import { blackBoxFor, type SimContext, seasonScore, startSeason } from "@falconess/sim";
import { goalStatuses } from "./season";

export type GradeStep = { readonly grade: Grade; readonly min: number };

export type SeasonSummary = {
  readonly grade: Grade;
  readonly score: number;
  /** The ruleset's grade ladder, worst first. */
  readonly ladder: readonly GradeStep[];
  /** The best grade a season that failed a goal can get, when this one failed one. */
  readonly cap: Grade | undefined;
  readonly feathers: number;
  readonly endReason: "completed" | "goal-failed";
  /** The week of the goal race that ended the season, when one did. */
  readonly failedTurn: number | undefined;
  readonly startStats: FalconessStats;
  readonly blackBox: BlackBox;
};

export function seasonSummary(
  ctx: SimContext,
  state: SeasonState,
  seed: string,
  inputs: readonly RunInput[],
): SeasonSummary {
  const S = ctx.ruleset.season;
  const first = inputs[0];
  if (first?.kind !== "start") throw new Error("a run starts with `start`");
  const endReason = state.endReason ?? "completed";
  const grade = state.grade ?? "G";
  const failed = goalStatuses(ctx, state).find((g) => g.met === false);
  return {
    grade,
    score: seasonScore(ctx, state),
    ladder: [...S.gradeThresholds].map(([g, min]) => ({ grade: g, min })).reverse(),
    cap: endReason === "goal-failed" ? S.gradeCapOnGoalFailure : undefined,
    feathers: ctx.content.economy?.feathersByGrade[grade] ?? 0,
    endReason,
    failedTurn: failed?.goal.turn,
    startStats: startSeason(ctx, seed, first).stats,
    blackBox: blackBoxFor(ctx, state, inputs),
  };
}
