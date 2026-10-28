import { floorDiv } from "@falconess/rng";
import type {
  BoostMode,
  RaceEntry,
  RaceEvent,
  RaceFrames,
  RaceResult,
  RunnerDerived,
  SegmentType,
  SprintPlanCause,
  SprintPlanReason,
} from "@falconess/schema";
import { RACE_FRAME_FLAGS, SEGMENT_TYPES } from "@falconess/schema";
import type { Ruleset } from "../rulesets/index.js";
import type { CourseGeometry } from "./geometry.js";
import {
  ACTIVATION_SLOTS,
  F_BROKEN,
  F_DNF,
  F_EXHAUSTED,
  F_FINISHED,
  ib,
  ibps,
  ibs,
  ik,
  ikk,
  is,
  type RaceArena,
} from "./state.js";
import { engineUnits, SEG_JUMP, STYLE_DIVE, STYLE_GROUND } from "./units.js";

/**
 * The race log (docs/race-engine.md 20): events in emission order, race-wide frame sampling, the
 * per-runner skill lists of the ledger, and the materialisation of `derived` and `results`. With
 * detail "results" no event object and no frame row is ever built; `derived` and `results` are
 * identical in both modes (property P7).
 */

type Column = number[];
type RunnerColumns = {
  posMm: Column;
  vMms: Column;
  hp: Column;
  energy: Column;
  heat: Column;
  durability: Column;
  boost: Column;
  flags: Column;
};

export class RaceRecorder {
  readonly full: boolean;
  readonly events: RaceEvent[] = [];
  readonly frameTick: number[] = [];
  readonly columns: RunnerColumns[] = [];
  /** Skill ids per lane, in activation order (ledger `skillsActivated`). */
  readonly activated: string[][] = [];
  /** Skill ids per lane, in miss order (ledger `skillsMissed`). */
  readonly missed: string[][] = [];
  private readonly entries: readonly RaceEntry[];

  constructor(full: boolean, entries: readonly RaceEntry[]) {
    this.full = full;
    this.entries = entries;
    for (let i = 0; i < entries.length; i++) {
      this.activated.push([]);
      this.missed.push([]);
      if (full)
        this.columns.push({
          posMm: [],
          vMms: [],
          hp: [],
          energy: [],
          heat: [],
          durability: [],
          boost: [],
          flags: [],
        });
    }
  }

  skillId(i: number, j: number): string {
    const id = this.entries[i]?.skills[j]?.id;
    if (id === undefined) throw new Error(`no skill ${j} on lane ${i}`);
    return id;
  }

  // --- events (20.4); every member carries tick, lane, posMm ---------------------------------------

  boostMode(tick: number, lane: number, posMm: number, mode: BoostMode, levelMms: number): void {
    if (this.full) this.events.push({ kind: "boostMode", tick, lane, posMm, mode, levelMms });
  }

  pulse(
    tick: number,
    lane: number,
    posMm: number,
    chain: number,
    thrustMms: number,
    free: boolean,
    cooldown: number,
  ): void {
    if (this.full)
      this.events.push({ kind: "pulse", tick, lane, posMm, chain, thrustMms, free, cooldown });
  }

  freeBoost(tick: number, lane: number, posMm: number, segType: number): void {
    if (this.full)
      this.events.push({ kind: "freeBoost", tick, lane, posMm, segment: segName(segType) });
  }

  sprintPlan(
    tick: number,
    lane: number,
    posMm: number,
    plan: {
      cause: SprintPlanCause;
      index: number;
      reason: SprintPlanReason;
      energy: number;
      energyPerceived: number;
      hp: number;
      hpPerceived: number;
      jumpReserve: number;
      startMm: number;
      endMm: number;
      levelMms: number;
      candidates: number;
      onTicks: number;
      clean: boolean;
    },
  ): void {
    if (this.full) this.events.push({ kind: "sprintPlan", tick, lane, posMm, ...plan });
  }

  skill(tick: number, lane: number, posMm: number, j: number, p: number, u: number, k: number) {
    const skillId = this.skillId(lane, j);
    this.activated[lane]?.push(skillId);
    if (this.full)
      this.events.push({ kind: "skill", tick, lane, posMm, skillId, p, u, activation: k });
  }

  skillMiss(tick: number, lane: number, posMm: number, j: number, p: number, u: number) {
    const skillId = this.skillId(lane, j);
    this.missed[lane]?.push(skillId);
    if (this.full) this.events.push({ kind: "skillMiss", tick, lane, posMm, skillId, p, u });
  }

  jumpOk(
    tick: number,
    lane: number,
    posMm: number,
    lift: number,
    required: number,
    before: number,
  ) {
    if (this.full)
      this.events.push({ kind: "jumpOk", tick, lane, posMm, lift, required, energyBefore: before });
  }

  jumpFail(
    tick: number,
    lane: number,
    posMm: number,
    lift: number,
    required: number,
    energyBefore: number,
    damage: number,
    stallTicks: number,
  ): void {
    if (this.full)
      this.events.push({
        kind: "jumpFail",
        tick,
        lane,
        posMm,
        lift,
        required,
        energyBefore,
        damage,
        stallTicks,
      });
  }

  detour(tick: number, lane: number, posMm: number, segment: number): void {
    if (this.full) this.events.push({ kind: "detour", tick, lane, posMm, segment });
  }

  waterHit(tick: number, lane: number, posMm: number, damage: number): void {
    if (this.full) this.events.push({ kind: "waterHit", tick, lane, posMm, damage });
  }

  overheat(tick: number, lane: number, posMm: number, on: boolean, heat: number): void {
    if (this.full) this.events.push({ kind: "overheat", tick, lane, posMm, on, heat });
  }

  hpEmpty(tick: number, lane: number, posMm: number): void {
    if (this.full) this.events.push({ kind: "hpEmpty", tick, lane, posMm });
  }

  durabilityBroken(tick: number, lane: number, posMm: number, powerToWeight: number): void {
    if (this.full) this.events.push({ kind: "durabilityBroken", tick, lane, posMm, powerToWeight });
  }

  landing(tick: number, lane: number, posMm: number, speedLossMms: number): void {
    if (this.full) this.events.push({ kind: "landing", tick, lane, posMm, speedLossMms });
  }

  repair(tick: number, lane: number, posMm: number, amount: number): void {
    if (this.full) this.events.push({ kind: "repair", tick, lane, posMm, amount });
  }

  heatToEnergy(tick: number, lane: number, posMm: number, heat: number, energy: number): void {
    if (this.full) this.events.push({ kind: "heatToEnergy", tick, lane, posMm, heat, energy });
  }

  /** Returns the event's index (−1 with detail "results") so a later dead heat can re-place it. */
  finish(tick: number, lane: number, posMm: number, finishMilli: number, place: number): number {
    if (!this.full) return -1;
    this.events.push({ kind: "finish", tick, lane, posMm, finishMilli, place });
    return this.events.length - 1;
  }

  /** A dead heat that spans two ticks re-sorts its group by lane (19): fix the earlier event. */
  patchFinishPlace(index: number, place: number): void {
    const e = this.events[index];
    if (e !== undefined && e.kind === "finish") e.place = place;
  }

  dnf(tick: number, lane: number, posMm: number): void {
    if (this.full) this.events.push({ kind: "dnf", tick, lane, posMm });
  }

  // --- frames (20.4) --------------------------------------------------------------------------------

  /** Row T: the state after tick T − 1 (T = 0 before tick 0), every runner, lane order. */
  row(T: number, A: RaceArena, posPerMm: number, velPerMms: number): void {
    if (!this.full) return;
    const S = A.state;
    this.frameTick.push(T);
    for (let i = 0; i < A.n; i++) {
      const c = this.columns[i];
      if (c === undefined) continue;
      c.posMm.push(floorDiv(S.pos[i] ?? 0, posPerMm));
      c.vMms.push(floorDiv(S.vOut[i] ?? 0, velPerMms));
      c.hp.push(floorDiv(S.hp[i] ?? 0, 1000));
      c.energy.push(S.energy[i] ?? 0);
      c.heat.push(S.heat[i] ?? 0);
      c.durability.push(S.dur[i] ?? 0);
      c.boost.push(S.boostRow[i] ?? 0);
      c.flags.push(S.tickFlags[i] ?? 0);
      S.boostRow[i] = 0;
    }
  }

  /** Mark the last row of a DNF runner with the `dnf` flag (step E). */
  markDnf(lane: number): void {
    const flags = this.columns[lane]?.flags;
    if (flags === undefined || flags.length === 0) return;
    const last = flags.length - 1;
    flags[last] = (flags[last] ?? 0) | RACE_FRAME_FLAGS.dnf;
  }

  frames(): RaceFrames {
    return { tick: this.frameTick, runners: this.columns };
  }
}

function segName(code: number): SegmentType {
  const t = SEGMENT_TYPES[code];
  if (t === undefined) throw new Error(`bad segment type code ${code}`);
  return t;
}

// --- derived (20.3) --------------------------------------------------------------------------------

/** The explanation table of every runner (lane order), from the per-race tables. */
export function buildDerived(
  ruleset: Ruleset,
  E: readonly RaceEntry[],
  G: CourseGeometry,
  A: RaceArena,
): RunnerDerived[] {
  const R = ruleset.race;
  const T = A.tables;
  const { posPerMm, velPerMms } = engineUnits(R);
  const mms = (vu: number) => floorDiv(vu, velPerMms);
  const out: RunnerDerived[] = [];
  E.forEach((e, i) => {
    const pulseFrame = T.pulseFrame[i] === 1;
    const style = T.style[i] ?? 0;
    const hpMilli = floorDiv(T.hpMax[i] ?? 0, 1000);
    const stamDiv = T.stamDiv[i] ?? 0;
    const lucky = T.luckyIdx[i] ?? -1;
    const segments: RunnerDerived["segments"] = [];
    const airPm: number[] = [];
    const jumpNeed: number[] = [];
    for (let s = 0; s < G.S; s++) {
      const triple = (tbl: Int32Array): [number, number, number] => [
        mms(tbl[ibps(i, 0, 0, s)] ?? 0),
        mms(tbl[ibps(i, 0, 1, s)] ?? 0),
        mms(tbl[ibps(i, 0, 2, s)] ?? 0),
      ];
      segments.push({
        fPm: T.f[is(i, s)] ?? 0,
        cruiseMms: triple(T.vC),
        accelMms2: T.acc[ibs(i, 0, s)] ?? 0,
        vMinMms: triple(T.vMin),
        jumpReserve: T.jr[is(i, s)] ?? 0,
      });
      airPm.push(T.airPm[is(i, s)] ?? 1000);
      if (G.segType[s] === SEG_JUMP) jumpNeed.push(T.need[is(i, s)] ?? 0);
    }
    const pSkill: number[] = [];
    const u: [number, number, number][] = [];
    for (let j = 0; j < e.skills.length; j++) {
      pSkill.push(T.pSkill[ik(i, j)] ?? 0);
      const row: [number, number, number] = [0, 0, 0];
      for (let k = 0; k < ACTIVATION_SLOTS; k++) row[k] = T.u[ikk(i, j, k)] ?? 0;
      u.push(row);
    }
    out.push({
      lane: i,
      hpMax: hpMilli,
      effectiveReserve: floorDiv(hpMilli * stamDiv, 1_200_000),
      stamDiv,
      fatiguePm: T.fat[i] ?? 0,
      tolerancePm: T.tol[i] ?? 0,
      heatCap: T.heatCap[i] ?? 0,
      capLim: T.capLim[i] ?? 0,
      coolTick: T.coolTick[i] ?? 0,
      dmgTick: T.dmgTick[i] ?? 0,
      pAct: T.pAct[i] ?? 0,
      pSkill,
      u,
      luckySkill: lucky >= 0 ? (e.skills[lucky]?.id ?? null) : null,
      paceHalfWidthPm: R.paceHalfWidth,
      paceCentrePm: T.paceCentre[i] ?? 0,
      pace: [T.pace[i * 3] ?? 0, T.pace[i * 3 + 1] ?? 0, T.pace[i * 3 + 2] ?? 0],
      planErrWindowPm: T.planErrWindow[i] ?? 0,
      planErrPm: T.planErr[i] ?? 0,
      landPm: T.landPm[i] ?? 0,
      detourPm: style === STYLE_GROUND ? (T.detour[i] ?? 0) : 0,
      kickAtMm: floorDiv(T.kickAt[i] ?? 0, posPerMm),
      stoopPm: style === STYLE_DIVE ? R.style.diveStoopPm : 1000,
      airPm,
      boostMms: mms(T.B[ib(i, 0)] ?? 0),
      pulseMms: pulseFrame ? mms(T.Bp[ib(i, 0)] ?? 0) : 0,
      chainMms: pulseFrame ? mms(T.Bpc[ib(i, 0)] ?? 0) : 0,
      liftPm: T.liftF[i] ?? 0,
      jumpNeed,
      capFinal: T.capFinal[ib(i, 0)] ?? 0,
      groundLevelMms: mms(T.groundLevel[ib(i, 0)] ?? 0),
      segments,
    });
  });
  return out;
}

// --- results and ledger (20.5) ---------------------------------------------------------------------

/** One result per runner, in place order (places are already assigned by steps C and E). */
export function buildResults(
  E: readonly RaceEntry[],
  A: RaceArena,
  rec: RaceRecorder,
): RaceResult[] {
  const S = A.state;
  const out: RaceResult[] = [];
  E.forEach((e, i) => {
    const flags = S.flags[i] ?? 0;
    const dnf = (flags & F_DNF) !== 0;
    const finished = (flags & F_FINISHED) !== 0;
    const ph = (a: Int32Array): [number, number, number] => [
      a[i * 3] ?? 0,
      a[i * 3 + 1] ?? 0,
      a[i * 3 + 2] ?? 0,
    ];
    const hpEmpty = S.hpEmptyMm[i] ?? -1;
    out.push({
      lane: i,
      runnerId: e.runnerId,
      place: S.place[i] ?? 0,
      finishMilli: finished ? (S.finishMilli[i] ?? 0) : null,
      timeTicks: finished ? (S.timeTicks[i] ?? 0) : null,
      marginMm: finished ? Math.max(0, S.marginMm[i] ?? 0) : null,
      vFinishMms: finished ? (S.vFinishMms[i] ?? 0) : null,
      deadHeat: S.deadHeat[i] === 1,
      dnf,
      hpEnd: floorDiv(S.hp[i] ?? 0, 1000),
      energyEnd: S.energy[i] ?? 0,
      durabilityEnd: S.dur[i] ?? 0,
      exhausted: (flags & F_EXHAUSTED) !== 0,
      broken: (flags & F_BROKEN) !== 0,
      ledger: {
        phaseTicks: ph(S.phaseTicks),
        boostTicks: ph(S.boostTicks),
        pulses: S.pulses[i] ?? 0,
        stallTicks: S.stallTicks[i] ?? 0,
        energySpent: S.energySpent[i] ?? 0,
        energyRegen: S.energyRegen[i] ?? 0,
        energyRefunded: S.energyRefunded[i] ?? 0,
        energyFromHeat: S.energyFromHeat[i] ?? 0,
        energyLift: S.energyLift[i] ?? 0,
        energyLeft: S.energy[i] ?? 0,
        overheatTicks: S.overheatTicks[i] ?? 0,
        durabilityLost: S.durabilityLost[i] ?? 0,
        durabilityRepaired: S.durabilityRepaired[i] ?? 0,
        hpEmptyMm: hpEmpty >= 0 ? hpEmpty : null,
        draftTicks: S.draftTicks[i] ?? 0,
        landingLossMms: S.landingLossMms[i] ?? 0,
        jumpsOk: S.jumpsOk[i] ?? 0,
        jumpsFailed: S.jumpsFailed[i] ?? 0,
        detours: S.detours[i] ?? 0,
        skillsActivated: [...(rec.activated[i] ?? [])],
        skillsMissed: [...(rec.missed[i] ?? [])],
      },
    });
  });
  out.sort((a, b) => a.place - b.place);
  return out;
}
