import type { Difficulty, SeasonGoal, SeasonState } from "@falconess/schema";
import type { Ruleset } from "../rulesets/index.js";
import type { SimContext } from "./context.js";

/** ADR-0012: a season's difficulty; absent (every save made before the difficulties) = Normal. */
export function difficultyOf(s: Pick<SeasonState, "difficulty">): Difficulty {
  return s.difficulty ?? "normal";
}

/** The most any stat can reach this season: the difficulty's cap, else the ruleset's `statMax`. */
export function statCap(ruleset: Ruleset, s: Pick<SeasonState, "difficulty">): number {
  const S = ruleset.season;
  return S.statCapByDifficulty?.[difficultyOf(s)] ?? S.statMax;
}

/** Her goal races this season: on Exigente her `exigenteGoals` when the calendar has them. */
export function seasonGoalsOf(
  ctx: SimContext,
  s: Pick<SeasonState, "falconessId" | "difficulty">,
): readonly SeasonGoal[] {
  const f = ctx.content.getFalconess(s.falconessId);
  return difficultyOf(s) === "exigente" ? (f.exigenteGoals ?? f.seasonGoals) : f.seasonGoals;
}
