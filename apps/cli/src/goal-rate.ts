/**
 * The goal pass-rate diagnostic of docs/race-engine.md 21.1 (D12 acceptance), shared by
 * `pnpm sim:season-batch` and the S7 table of `pnpm sim:batch`: per Falconess × goal turn, the
 * share of the seasons that reach the goal race and pass it, the shape of the par table of 21.1
 * (a per-race pass rate). A cell under 80 % is flagged; it is not a gate. The share of all
 * seasons that pass a goal also counts the seasons an earlier goal ended, so it is reported as
 * survival, never flagged.
 */
export const GOAL_FLAG_BELOW = 0.8;

/** `passed / reached`, or `null` when no season reached the goal race. */
export function goalPassRate(passed: number, reached: number): number | null {
  return reached > 0 ? passed / reached : null;
}

/** Under 80 % of the seasons that ran the goal race passed it (never for an unreached goal). */
export function goalFlagged(passed: number, reached: number): boolean {
  return reached > 0 && passed < GOAL_FLAG_BELOW * reached;
}
