/**
 * E1's «nivel del dueño» (ADR-0012 §4, method approved by the owner on 2026-11-28): the reference
 * player decides with her real stats all season; only each goal race runs with her stats × 1.2,
 * capped at the season's cap (1200 on Exigente). Nothing else is scaled. Pure: no I/O.
 */
import type { FalconessStats, RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, goalRaceState, type SimContext, statCap } from "@falconess/sim";

const STATS = ["agility", "stamina", "technique", "courage", "intelligence"] as const;

/** Each stat × `pm` ‰, rounded down, capped at `cap`. */
export function scaleStats(stats: FalconessStats, pm: number, cap: number): FalconessStats {
  const out = { ...stats };
  for (const k of STATS) out[k] = Math.min(cap, Math.floor((stats[k] * pm) / 1000));
  return out;
}

const shift = (a: FalconessStats, b: FalconessStats, sign: 1 | -1): FalconessStats => {
  const out = { ...a };
  for (const k of STATS) out[k] = a[k] + sign * b[k];
  return out;
};
const diff = (a: FalconessStats, b: FalconessStats) => shift(a, b, -1);

/** Most a goal race may run off the scaled stats, per stat, when the week skips the exact value. */
export const OWNER_LEVEL_SLACK = 2;

/**
 * The state to advance so that this week's goal race runs with the stats she reaches that week
 * × `pm` ‰: the week's action is applied by the season itself, so its gain (softened above 600)
 * must come out of the real stats. The state is offset until `goalRaceState` shows the scaled
 * stats. A failed training's loss can skip the exact value (599 → 588, 600 → 590): then the
 * closest reachable stats run, at most `OWNER_LEVEL_SLACK` off per stat. `raced` is what the
 * race sees. Undefined on a week without a goal race.
 */
export function ownerRaceInput(
  ctx: SimContext,
  state: SeasonState,
  input: RunInput,
  pm: number,
): { offsetState: SeasonState; real: FalconessStats; raced: FalconessStats } | undefined {
  const real = goalRaceState(ctx, state, input);
  if (real === undefined) return undefined;
  const target = scaleStats(real.stats, pm, statCap(ctx.ruleset, state));
  let offset = diff(target, real.stats);
  let best: { offsetState: SeasonState; raced: FalconessStats; off: number } | undefined;
  for (let i = 0; i < 12; i++) {
    const offsetState = { ...state, stats: shift(state.stats, offset, 1) };
    const probe = goalRaceState(ctx, offsetState, input);
    if (probe === undefined) break;
    const miss = diff(target, probe.stats);
    const off = Math.max(...STATS.map((k) => Math.abs(miss[k])));
    if (best === undefined || off < best.off) best = { offsetState, raced: probe.stats, off };
    if (off === 0) break;
    offset = shift(offset, miss, 1);
  }
  if (best === undefined || best.off > OWNER_LEVEL_SLACK)
    throw new Error(`owner level: turn ${state.turn} never reached the scaled stats`);
  return { offsetState: best.offsetState, real: real.stats, raced: best.raced };
}

/**
 * `advanceSeason`, except that a goal race runs with her stats × `pm` ‰ (`ownerRaceInput`); the
 * offset is taken back off afterwards, so she goes on with her real stats plus whatever the race
 * or the week's end added. A week without a goal race is `advanceSeason` unchanged.
 */
export function advanceAtOwnerLevel(
  ctx: SimContext,
  state: SeasonState,
  input: RunInput,
  pm: number,
): SeasonState {
  const o = ownerRaceInput(ctx, state, input, pm);
  if (o === undefined) return advanceSeason(ctx, state, input);
  const raced = advanceSeason(ctx, o.offsetState, input);
  return { ...raced, stats: shift(o.real, diff(raced.stats, o.raced), 1) };
}
