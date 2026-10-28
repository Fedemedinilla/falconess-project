import { floorDiv } from "@falconess/rng";
import type { RaceConstants } from "../rulesets/index.js";
import { F_FINISHED, type RaceState } from "./state.js";
import { MODE_OFF } from "./units.js";

/**
 * Controller of docs/race-engine.md 9. This stage holds only the rank snapshot (9.1) and a
 * placeholder decision that never boosts, so races run end to end; the next stage replaces
 * `decide` and `planSprint` with modes, gates, the licence, the accumulator, pulses and the sprint
 * plan (9.2-9.6, 11, 12).
 */

/** Finished runners rank ahead of every unfinished runner, by finish time (9.1). */
export const KEY_FINISHED = 1e15;

/**
 * Step A of every tick, from positions at the end of the previous tick (9.1): competition
 * ranking (equal keys share a rank, so lane order never changes physics), `ahead` = runners
 * strictly in front, `posFrac = fl(ahead × 1000, n − 1)` (0 leader, 1000 last; 0 when solo).
 * O(n²) compares into preallocated arrays, no sort.
 */
export function rankSnapshot(S: RaceState, n: number): void {
  for (let i = 0; i < n; i++)
    S.key[i] =
      ((S.flags[i] ?? 0) & F_FINISHED) !== 0
        ? KEY_FINISHED - (S.finishMilli[i] ?? 0)
        : (S.pos[i] ?? 0);
  for (let i = 0; i < n; i++) {
    const ki = S.key[i] ?? 0;
    let ahead = 0;
    for (let j = 0; j < n; j++) if ((S.key[j] ?? 0) > ki) ahead++;
    S.ahead[i] = ahead;
    S.posFrac[i] = n > 1 ? floorDiv(ahead * 1000, n - 1) : 0;
  }
}

/** "Middle of the pack" (9.1): `R.style.packLo ≤ posFrac ≤ R.style.packHi`. */
export function inPack(R: RaceConstants, S: RaceState, i: number): boolean {
  const pf = S.posFrac[i] ?? 0;
  return pf >= R.style.packLo && pf <= R.style.packHi;
}

/**
 * Placeholder of step B7 (9.6): fixes the tick's decision with no boost at all (`boostOn`,
 * `isPulseTick`, `freeTick`, `burstChain` = 0) and mode OFF. Replaced by the controller stage.
 */
export function decide(S: RaceState, i: number): void {
  S.boostOn[i] = 0;
  S.isPulseTick[i] = 0;
  S.freeTick[i] = 0;
  S.burstChain[i] = 0;
  S.mode[i] = MODE_OFF;
  S.modeLevel[i] = 0;
}

/**
 * Placeholder of step B6 (11.3): counts the plan and leaves no spurt (`planLevel` 0, so the
 * runner would hold until the kick). Replaced by the sprint-plan stage.
 */
export function planSprint(S: RaceState, i: number): void {
  S.planCount[i] = (S.planCount[i] ?? 0) + 1;
  S.planLevel[i] = 0;
  S.planStartPos[i] = S.pos[i] ?? 0;
  S.planEndPos[i] = S.pos[i] ?? 0;
}
