import { clamp } from "@falconess/rng";
import type { RaceConstants } from "../rulesets/index.js";
import {
  ACTIVATION_SLOTS,
  CAUSE_REFUND,
  F_PLAN_ACTIVE,
  F_REPLAN,
  ik,
  ikk,
  type RaceState,
  type RaceTables,
  SK_DISABLED,
  SK_GUARD,
  SK_HAS_ENERGY,
  SK_HAS_HEAT,
  SK_HAS_POSITION,
  SK_HAS_SEGMENT,
  SK_ONCE,
  SK_PHASE_ANY,
} from "./state.js";
import { addCap, sub0 } from "./units.js";

/**
 * Active skills (docs/race-engine.md 15): one pre-drawn `u` per activation slot, evaluated on every
 * non-stalled tick in id order; a skill fires on the first tick where it is eligible, its trigger
 * holds and `u < p(t)`. A trigger held for 1000 ticks gives no extra chance: over races a once-skill
 * whose trigger is reached fires with probability exactly p. Draws nothing.
 */

/** What the engine does with a skill outcome (events, ledger lists). */
export type SkillSink = {
  /** Skill j of runner i fired with probability p and draw u; `activation` is its slot k (0-based). */
  onSkill(i: number, j: number, p: number, u: number, activation: number): void;
  /** First tick the trigger of skill j held with u ≥ p (logged once per skill). */
  onMiss(i: number, j: number, p: number, u: number): void;
};

/**
 * `p_j(t)` of 15.2 in ‰: a disabled skill is 0 before anything else; the lucky pick is 1000;
 * otherwise `clamp(pSkill + bonus[phase] + bonus.any + rule bonus, 0, 1000)` (the bonuses are
 * folded into `actBonus` at race start).
 */
export function skillProbability(T: RaceTables, i: number, j: number, ph: number): number {
  const k = ik(i, j);
  if (((T.skFlags[k] ?? 0) & SK_DISABLED) !== 0) return 0;
  if (j === T.luckyIdx[i]) return 1000;
  return clamp((T.pSkill[k] ?? 0) + (T.actBonus[i * 3 + ph] ?? 0), 0, 1000);
}

/**
 * The trigger of skill j (15.3), a conjunction on the tick-start state after step B1 and the rank
 * snapshot: phase, segment type, position fraction (inclusive), heat above, energy below.
 */
export function skillTriggerHolds(
  T: RaceTables,
  S: RaceState,
  i: number,
  j: number,
  ph: number,
  segType: number,
): boolean {
  const k = ik(i, j);
  const fl = T.skFlags[k] ?? 0;
  const phase = T.skPhase[k] ?? SK_PHASE_ANY;
  if (phase !== SK_PHASE_ANY && phase !== ph) return false;
  if ((fl & SK_HAS_SEGMENT) !== 0 && T.skSeg[k] !== segType) return false;
  if ((fl & SK_HAS_POSITION) !== 0) {
    const pf = S.posFrac[i] ?? 0;
    if (pf < (T.skPosLo[k] ?? 0) || pf > (T.skPosHi[k] ?? 0)) return false;
  }
  if ((fl & SK_HAS_HEAT) !== 0 && !((S.heat[i] ?? 0) > (T.skHeat[k] ?? 0))) return false;
  if ((fl & SK_HAS_ENERGY) !== 0 && !((S.energy[i] ?? 0) < (T.skEnergy[k] ?? 0))) return false;
  return true;
}

/**
 * `replan = 1 (cause X)` (11.1): sets the flag and the cause; a later request before the plan runs
 * overwrites the cause, as the sequential assignments of the spec read.
 */
export function requestReplan(S: RaceState, i: number, cause: number): void {
  S.flags[i] = (S.flags[i] ?? 0) | F_REPLAN;
  S.replanCause[i] = cause;
}

/**
 * Step B3 for runner i: every skill in id order. Eligible means not disabled, fewer activations
 * than its cap (1, or `R.maxSkillActivations` for `once: false`), no effect running and armed; a
 * `once: false` skill re-arms after its trigger has been false on an evaluated tick since its last
 * activation (and fires again only once its previous effect has ended). Instant effects apply now
 * (an earlier skill's refund can satisfy a later skill's `energyBelow` of the same tick).
 */
export function runSkills(
  R: RaceConstants,
  T: RaceTables,
  S: RaceState,
  i: number,
  ph: number,
  segType: number,
  sink: SkillSink,
): void {
  const nSkills = T.nSkills[i] ?? 0;
  for (let j = 0; j < nSkills; j++) {
    const k = ik(i, j);
    const flags = T.skFlags[k] ?? 0;
    if ((flags & SK_DISABLED) !== 0) continue; // never evaluated (3.2, 15.2)
    const trig = skillTriggerHolds(T, S, i, j, ph, segType);
    if (!trig) {
      S.armed[k] = 1;
      continue;
    }
    const acts = S.acts[k] ?? 0;
    const cap = (flags & SK_ONCE) !== 0 ? 1 : Math.min(R.maxSkillActivations, ACTIVATION_SLOTS);
    if (acts >= cap || (S.activeLeft[k] ?? 0) > 0 || S.armed[k] !== 1) continue;
    const p = skillProbability(T, i, j, ph);
    const u = T.u[ikk(i, j, acts)] ?? 0;
    if (u < p) {
      activate(T, S, i, j);
      sink.onSkill(i, j, p, u, acts);
    } else if (S.missLogged[k] !== 1) {
      S.missLogged[k] = 1;
      sink.onMiss(i, j, p, u);
    }
  }
}

/** Effects of one activation (15.4), from the activation tick inclusive. */
function activate(T: RaceTables, S: RaceState, i: number, j: number): void {
  const k = ik(i, j);
  S.acts[k] = (S.acts[k] ?? 0) + 1;
  S.armed[k] = 0;
  const refund = T.skRefund[k] ?? 0;
  if (refund > 0) {
    const before = S.energy[i] ?? 0;
    const after = addCap(before, refund, T.Emax[i] ?? 0);
    S.energy[i] = after;
    S.energyRefunded[i] = (S.energyRefunded[i] ?? 0) + (after - before);
    if (((S.flags[i] ?? 0) & F_PLAN_ACTIVE) !== 0) requestReplan(S, i, CAUSE_REFUND);
  }
  const cool = T.skCool[k] ?? 0;
  if (cool > 0) S.heat[i] = sub0(S.heat[i] ?? 0, cool);
  const dur = T.skDur[k] ?? 0;
  if (dur > 0) {
    S.activeLeft[k] = dur;
    S.activeSkills[i] = (S.activeSkills[i] ?? 0) + 1;
    S.skillSpeed[i] = (S.skillSpeed[i] ?? 0) + (T.skSpeed[k] ?? 0);
    S.skillAccel[i] = (S.skillAccel[i] ?? 0) + (T.skAccel[k] ?? 0);
    if (((T.skFlags[k] ?? 0) & SK_GUARD) !== 0) S.guardLeft[i] = Math.max(S.guardLeft[i] ?? 0, dur);
  }
}

/**
 * Skill effect timers of runner i (step B13, and stalled ticks): each running effect counts down
 * and is removed when it reaches 0. Effects of different skills stack additively.
 */
export function tickSkillTimers(T: RaceTables, S: RaceState, i: number): void {
  if ((S.activeSkills[i] ?? 0) === 0) return;
  const nSkills = T.nSkills[i] ?? 0;
  for (let j = 0; j < nSkills; j++) {
    const k = ik(i, j);
    const left = S.activeLeft[k] ?? 0;
    if (left <= 0) continue;
    S.activeLeft[k] = left - 1;
    if (left === 1) {
      S.activeSkills[i] = (S.activeSkills[i] ?? 0) - 1;
      S.skillSpeed[i] = (S.skillSpeed[i] ?? 0) - (T.skSpeed[k] ?? 0);
      S.skillAccel[i] = (S.skillAccel[i] ?? 0) - (T.skAccel[k] ?? 0);
    }
  }
}
