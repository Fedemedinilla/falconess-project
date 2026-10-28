import { floorDiv, Rng, scale } from "@falconess/rng";
import type { Course, RaceEntry, RaceLog, SprintPlanCause } from "@falconess/schema";
import { SprintPlanCause as PlanCauses, RACE_FRAME_FLAGS } from "@falconess/schema";
import { endBurst } from "../rules/index.js";
import type { RaceConstants, Ruleset } from "../rulesets/index.js";
import { type Controller, createController, decide, inPack, rankSnapshot } from "./controller.js";
import {
  buildCourseGeometry,
  type CourseGeometry,
  logGeometry,
  phaseOf,
  raceMaxTicks,
} from "./geometry.js";
import { buildDerived, buildResults, RaceRecorder } from "./log.js";
import {
  approachVu,
  crashDamageMd,
  dashEnds,
  detourDisp,
  drainMicro,
  finishMilliOf,
  liftMe,
  marginGapMm,
  penalisedVu,
  waterHitMd,
} from "./physics.js";
import { requestReplan, runSkills, type SkillSink, tickSkillTimers } from "./skills.js";
import { createPlanReport, type PlanReport, planSprint } from "./sprint.js";
import {
  buildTables,
  CAUSE_BROKEN,
  CAUSE_JUMP,
  CAUSE_PHASE,
  createRaceArena,
  DK_FINAL,
  DK_LEAD,
  drawRaceBlock,
  F_AIRBORNE,
  F_BROKEN,
  F_DASH,
  F_DNF,
  F_EXHAUSTED,
  F_FINAL_ENTERED,
  F_FINISHED,
  F_OVER,
  F_PENDING_JUMP,
  F_PLAN_ACTIVE,
  F_REPLAN,
  ib,
  ibps,
  ibs,
  initState,
  ips,
  is,
  MAX_LANES,
  type RaceArena,
  type RaceState,
  type RaceTables,
  validateRace,
} from "./state.js";
import {
  addCap,
  engineUnits,
  MODE_KICK,
  MODE_PLAN,
  modeName,
  PH_FINAL,
  PH_MIDDLE,
  PH_START,
  SEG_FLAT,
  SEG_JUMP,
  SEG_WATER,
  STYLE_GLIDE,
  STYLE_GROUND,
  STYLE_HOVER,
  sub0,
} from "./units.js";

/** `opts` of `simulateRace` (23): what is materialised and which memory is reused, never a result. */
export type SimulateOptions = {
  detail?: "full" | "results";
  geometry?: CourseGeometry;
  arena?: RaceArena;
};

/** Test-only probe (24.2 P4): called after every tick with the arena. Not exported by the index. */
export type RaceProbe = (t: number, arena: RaceArena) => void;

const FL = RACE_FRAME_FLAGS;

/** Everything one race reads in its loop; built once per race, no per-tick allocation. */
type Ctx = {
  readonly R: RaceConstants;
  readonly G: CourseGeometry;
  readonly A: RaceArena;
  readonly T: RaceTables;
  readonly S: RaceState;
  readonly n: number;
  readonly rec: RaceRecorder;
  readonly vBase: number;
  readonly posPerMm: number;
  readonly velPerMms: number;
  readonly pulseCostMe: number;
  readonly sink: SkillSink;
  /** Controller scratch and its event sink (9, 12). */
  readonly ctl: Controller;
  /** Scratch of the sprint plan (11.3). */
  readonly plan: PlanReport;
  /** Current tick. */
  t: number;
  /** Places handed out so far (19). */
  placed: number;
  /**
   * The current dead-heat group (equal finishMilli), kept across ticks: a runner landing exactly on
   * L in tick t has finishMilli 1000 (t + 1), which a crosser of tick t + 1 can equal. The group is
   * re-sorted by lane whenever it grows, so places always follow (finishMilli, lane).
   */
  group: Int32Array;
  groupCount: number;
  groupStart: number;
  groupFinish: number;
  /** The runner placed just before the current group (−1 = none): its gap gives the margin. */
  beforeGroup: number;
  /** Index of each runner's finish event in the event list (−1 = none or detail "results"). */
  finishEvent: Int32Array;
};

/**
 * Simulate one race (docs/race-engine.md 18): validate, sort entries by lane, draw the whole RNG
 * block before tick 0, build the per-race tables, run the tick loop in the exact order of section
 * 18, place finishers with milli-tick times, dead heats and margins, flag DNFs, and materialise the
 * log. Pure: never reads content, never mutates its inputs, zero draws inside the loop.
 */
export function simulateRace(
  ruleset: Ruleset,
  entries: readonly RaceEntry[],
  course: Course,
  seed: string,
  opts: SimulateOptions = {},
): RaceLog {
  return runRace(ruleset, entries, course, seed, opts, null);
}

/** `simulateRace` with a probe called after every tick (property tests only). */
export function simulateRaceProbed(
  ruleset: Ruleset,
  entries: readonly RaceEntry[],
  course: Course,
  seed: string,
  probe: RaceProbe,
  opts: SimulateOptions = {},
): RaceLog {
  return runRace(ruleset, entries, course, seed, opts, probe);
}

function runRace(
  ruleset: Ruleset,
  entries: readonly RaceEntry[],
  course: Course,
  seed: string,
  opts: SimulateOptions,
  probe: RaceProbe | null,
): RaceLog {
  validateRace(ruleset, entries, course, seed);
  const R = ruleset.race;
  if (R.ticksPerSecond !== 15)
    throw new Error("simulateRace: RaceLog.tickHz is the literal 15 (ticksPerSecond must be 15)");
  const E = [...entries].sort((a, b) => a.laneIndex - b.laneIndex);
  const n = E.length;
  const G = opts.geometry ?? buildCourseGeometry(ruleset, course);
  if (G.courseId !== course.id || G.courseVersion !== course.version)
    throw new Error(`simulateRace: geometry of ${G.courseId} given for course ${course.id}`);
  const A = (opts.arena ?? createRaceArena()).reset(n, G);
  const full = (opts.detail ?? "full") === "full";

  // P1, P2: the pre-drawn block and the lucky-bolt picks; nothing draws after this
  const rng = new Rng(seed);
  drawRaceBlock(ruleset, E, rng, A);
  // P3: per-race tables; P4: initial state
  buildTables(ruleset, E, G, A);
  initState(ruleset, E, A);

  const units = engineUnits(R);
  const rec = new RaceRecorder(full, E, R.log.sampleEveryTicks);
  const c: Ctx = {
    R,
    G,
    A,
    T: A.tables,
    S: A.state,
    n,
    rec,
    vBase: units.vBase,
    posPerMm: units.posPerMm,
    velPerMms: units.velPerMms,
    pulseCostMe: floorDiv(R.kE * R.pulseCostMult, 1000),
    sink: {
      onSkill: (i, j, p, u, k) => rec.skill(c.t, i, posMm(c, i), j, p, u, k),
      onMiss: (i, j, p, u) => rec.skillMiss(c.t, i, posMm(c, i), j, p, u),
    },
    ctl: createController({
      boostMode: (i, mode, level) =>
        rec.boostMode(c.t, i, posMm(c, i), modeName(mode), floorDiv(level, c.velPerMms)),
      freeBoost: (i, segType) => rec.freeBoost(c.t, i, posMm(c, i), segType),
      pulse: (i, chain, thrust, free, cooldown) =>
        rec.pulse(c.t, i, posMm(c, i), chain, floorDiv(thrust, c.velPerMms), free, cooldown),
    }),
    plan: createPlanReport(),
    t: 0,
    placed: 0,
    group: new Int32Array(MAX_LANES),
    groupCount: 0,
    groupStart: 0,
    groupFinish: -1,
    beforeGroup: -1,
    finishEvent: new Int32Array(MAX_LANES).fill(-1),
  };
  const S = c.S;

  // P4: segment-0 pre-step in lane order (a jump or water segment at index 0 counts as entered)
  for (let i = 0; i < n; i++) enterSegment(c, i, 0, false);
  for (let i = 0; i < n; i++) S.tickFlags[i] = stateFlags(c, i);
  // P5: frame row 0
  rec.row(0, A, c.posPerMm, c.velPerMms);

  const maxTicks = raceMaxTicks(ruleset, G);
  const crossers = new Int32Array(MAX_LANES);
  let unfinished = n;
  let t = 0;
  for (; t < maxTicks && unfinished > 0; t++) {
    c.t = t;
    // A. rank snapshot from end-of-(t − 1) positions
    rankSnapshot(S, n);
    let startUnfinished = 0;
    for (let i = 0; i < n; i++)
      if (((S.flags[i] ?? 0) & F_FINISHED) === 0) startUnfinished |= 1 << i;
    // B. every unfinished runner in lane order
    let nCross = 0;
    for (let i = 0; i < n; i++) {
      if ((startUnfinished & (1 << i)) === 0) continue;
      if (runnerTick(c, i)) crossers[nCross++] = i;
    }
    unfinished -= nCross;
    // C. finishers of tick t: places, dead heats, margins
    if (nCross > 0) placeFinishers(c, crossers, nCross, startUnfinished);
    // D. frame row T = t + 1 when due
    if (full) {
      const row = t + 1;
      let due =
        row <= R.log.denseFirstTicks ||
        row % R.log.sampleEveryTicks === 0 ||
        nCross > 0 ||
        unfinished === 0 ||
        row === maxTicks;
      for (let i = 0; i < n && !due; i++)
        if (((S.flags[i] ?? 0) & F_FINISHED) === 0 && (S.pos[i] ?? 0) >= G.denseFrom) due = true;
      if (due) rec.row(row, A, c.posPerMm, c.velPerMms);
    }
    if (probe !== null) probe(t, A);
  }

  // E. runners unfinished at maxTicks: DNF, placed after every finisher by position, then lane
  if (unfinished > 0) markDnfs(c, t);

  // F. materialise the log
  const log: RaceLog = {
    rulesetVersion: ruleset.version,
    engine: "v1",
    seed,
    courseId: course.id,
    courseVersion: course.version,
    tickHz: 15,
    detail: full ? "full" : "results",
    ticks: t,
    maxTicks,
    geometry: logGeometry(ruleset, G),
    entries: E.map(cloneEntry),
    derived: buildDerived(ruleset, E, G, A),
    results: buildResults(E, A, rec),
  };
  if (full) {
    log.frames = rec.frames();
    // a runner's last boostMode candidate is held until the tick after its last simulated tick:
    // its crossing tick + 1, or the end of the loop for a DNF (ADR-0003 D54)
    const ticks = t;
    log.events = rec.events((i) => (flag(S, i, F_FINISHED) ? (S.timeTicks[i] ?? ticks) : ticks));
  }
  return log;
}

// --- per-runner tick (step B) ----------------------------------------------------------------------

function flag(S: RaceState, i: number, f: number): boolean {
  return ((S.flags[i] ?? 0) & f) !== 0;
}
function setFlag(S: RaceState, i: number, f: number): void {
  S.flags[i] = (S.flags[i] ?? 0) | f;
}
function clearFlag(S: RaceState, i: number, f: number): void {
  S.flags[i] = (S.flags[i] ?? 0) & ~f;
}
function posMm(c: Ctx, i: number): number {
  return floorDiv(c.S.pos[i] ?? 0, c.posPerMm);
}

/**
 * Steps B1-B13 of section 18 for runner i at tick `c.t`. Returns true if the runner crossed the
 * line in this tick. Reads only its own state, its tables and the step-A snapshot, so lane order
 * changes the order of events, never physics.
 */
function runnerTick(c: Ctx, i: number): boolean {
  const { R, G, T, S, rec } = c;
  const t = c.t;

  // B1. phase; final entry (heat-to-energy); plan point
  const pos = S.pos[i] ?? 0;
  const ph = phaseOf(G, pos);
  if (ph === PH_FINAL && !flag(S, i, F_FINAL_ENTERED)) {
    setFlag(S, i, F_FINAL_ENTERED);
    heatToEnergy(c, i);
  }
  if (!flag(S, i, F_PLAN_ACTIVE) && pos >= (T.planPoint[i] ?? 0)) {
    setFlag(S, i, F_PLAN_ACTIVE);
    requestReplan(S, i, CAUSE_PHASE);
  }

  // B2. lost ticks of a failed jump
  if ((S.stall[i] ?? 0) > 0) {
    stalledTick(c, i);
    return false;
  }

  // B3. skills in id order
  const seg = S.seg[i] ?? 0;
  const segType = G.segType[seg] ?? SEG_FLAT;
  runSkills(R, T, S, i, ph, segType, c.sink);

  // B4. a jump entered last tick resolves now, after skills
  if (flag(S, i, F_PENDING_JUMP) && !resolveJump(c, i, ph)) {
    stalledTick(c, i);
    return false;
  }

  // B5. the tick's single overheat flag
  const heat0 = S.heat[i] ?? 0;
  const over = heat0 > (T.heatCap[i] ?? 0);
  if (over !== flag(S, i, F_OVER)) {
    if (over) setFlag(S, i, F_OVER);
    else clearFlag(S, i, F_OVER);
    rec.overheat(t, i, posMm(c, i), over, heat0);
  }

  // B6. sprint plan: the first at the plan point, then at most maxReplans replans (11.1)
  if (flag(S, i, F_REPLAN)) {
    clearFlag(S, i, F_REPLAN);
    if ((S.planCount[i] ?? 0) <= R.maxReplans) sprintPlan(c, i);
  }

  // B7. decision: mode, accumulator, gates, licence, free boost, pulse state machine (9, 12)
  decide(R, G, T, S, i, t, ph, over, c.ctl);

  // B8. speed (5)
  const b = S.b[i] ?? 0;
  const exhausted = flag(S, i, F_EXHAUSTED);
  const airborne = flag(S, i, F_AIRBORNE);
  const style = T.style[i] ?? 0;
  const pack = inPack(R, S, i);
  let tgt = (exhausted ? T.vMin : T.vC)[ibps(i, b, ph, seg)] ?? 0;
  const drafting = style === STYLE_HOVER && ph === PH_MIDDLE && pack && !exhausted;
  if (drafting) {
    tgt = floorDiv(tgt * R.style.hoverDraftPm, 1000);
    S.draftTicks[i] = (S.draftTicks[i] ?? 0) + 1;
  }
  let vCore = S.vCore[i] ?? 0;
  if (!airborne) {
    let dash = flag(S, i, F_DASH);
    if (dash && dashEnds(R, c.vBase, vCore, tgt)) {
      clearFlag(S, i, F_DASH);
      dash = false;
    }
    const a = (ph === PH_START ? T.accStart : T.acc)[ibs(i, b, seg)] ?? 0;
    const up = a + (S.skillAccel[i] ?? 0) + (dash ? R.kStartDash : 0);
    vCore = approachVu(vCore, tgt, up, R.kDecel);
    S.vCore[i] = vCore;
  }
  const boostOn = S.boostOn[i] === 1;
  const pulseTick = S.isPulseTick[i] === 1;
  let thrust = 0;
  if (boostOn) {
    const raw = pulseTick
      ? floorDiv(
          ((S.burstChain[i] === 1 ? T.Bpc : T.Bp)[ib(i, b)] ?? 0) * (T.airPm[is(i, seg)] ?? 1000),
          1000,
        )
      : (T.B[ib(i, b)] ?? 0);
    thrust = floorDiv(raw * (T.stoop[ips(i, ph, seg)] ?? 1000), 1000);
  }
  const vTot = airborne ? vCore : Math.max(0, vCore + thrust + (S.skillSpeed[i] ?? 0));
  const penalised =
    over &&
    T.heatPenalty[i] === 1 &&
    !airborne &&
    !(T.heatImmune[i] === 1 && pos < (T.immuneUntil[i] ?? 0));
  const vOut = penalised ? penalisedVu(R, vTot) : vTot;
  S.vOut[i] = vOut;

  // B9. energy, regen, heat, telemetry clamp, overheat damage, broken wings (8.1)
  if (boostOn) {
    const cost = S.freeTick[i] === 1 ? 0 : pulseTick ? c.pulseCostMe : R.kE;
    const before = S.energy[i] ?? 0;
    const after = sub0(before, cost);
    S.energy[i] = after;
    S.energySpent[i] = (S.energySpent[i] ?? 0) + (before - after);
    S.heat[i] = (S.heat[i] ?? 0) + R.kH;
    S.boostTicks[i * 3 + ph] = (S.boostTicks[i * 3 + ph] ?? 0) + 1;
    S.boostRow[i] = (S.boostRow[i] ?? 0) + 1;
  } else {
    regen(c, i, pack);
    S.heat[i] = sub0(S.heat[i] ?? 0, T.coolTick[i] ?? 0);
  }
  if (T.clampHeat[i] === 1) S.heat[i] = Math.min(S.heat[i] ?? 0, T.D[i] ?? 0);
  if (over) {
    S.overheatTicks[i] = (S.overheatTicks[i] ?? 0) + 1;
    if ((S.guardLeft[i] ?? 0) === 0) damage(c, i, T.dmgTick[i] ?? 0);
  }

  // B10. hp drain at the moved speed (6)
  const q =
    (ph === PH_FINAL ? DK_FINAL : 0) + (style === STYLE_GLIDE && S.ahead[i] === 0 ? DK_LEAD : 0);
  const hp = sub0(S.hp[i] ?? 0, drainMicro(vOut, c.vBase, T.dK[i * 4 + q] ?? 0));
  S.hp[i] = hp;
  if (hp === 0 && !exhausted) {
    setFlag(S, i, F_EXHAUSTED);
    S.hpEmptyMm[i] = posMm(c, i);
    rec.hpEmpty(t, i, posMm(c, i));
  }

  // B11. move (ground detour as progress scaling, 14.5)
  const detouring = style === STYLE_GROUND && segType === SEG_JUMP;
  const disp = detouring ? detourDisp(vOut, T.detour[i] ?? 1000) : vOut;
  const newPos = pos + disp;
  S.prevPos[i] = pos;
  S.pos[i] = newPos;
  S.disp[i] = disp;
  S.vOutPrev[i] = vOut;
  // ledger phase ticks here, in B11: a stalled tick (B2, or a failed jump at B4) never reaches it
  S.phaseTicks[i * 3 + ph] = (S.phaseTicks[i * 3 + ph] ?? 0) + 1;
  const mode = S.mode[i] ?? 0;
  const tickFlags =
    (boostOn ? FL.boosting : 0) |
    (pulseTick ? FL.pulseBurst : 0) |
    (over ? FL.overheated : 0) |
    (detouring ? FL.detour : 0) |
    (mode === MODE_PLAN ? FL.planSpurt : 0) |
    (mode === MODE_KICK ? FL.kick : 0) |
    (drafting ? FL.drafting : 0);

  // B12. finish, or segment changes (landing, repair, water hit, jump entry)
  if (newPos >= G.L) {
    setFlag(S, i, F_FINISHED);
    S.finishMilli[i] = finishMilliOf(t, G.L, pos, disp);
    S.timeTicks[i] = t + 1;
    S.vFinishMms[i] = floorDiv(vOut, c.velPerMms);
    S.tickFlags[i] = tickFlags | stateFlags(c, i);
    return true;
  }
  let s = seg;
  while (s < G.S - 1 && newPos >= (G.segEnd[s] ?? 0)) {
    if (G.segType[s] === SEG_JUMP) {
      if (flag(S, i, F_AIRBORNE)) {
        const v0 = S.vCore[i] ?? 0;
        const v1 = scale(v0, T.landPm[i] ?? 1000);
        S.vCore[i] = v1;
        const loss = floorDiv(v0 - v1, c.velPerMms);
        S.landingLossMms[i] = (S.landingLossMms[i] ?? 0) + loss;
        rec.landing(t, i, posMm(c, i), loss);
      }
      clearFlag(S, i, F_AIRBORNE);
      if (flag(S, i, F_PLAN_ACTIVE) && style !== STYLE_GROUND) requestReplan(S, i, CAUSE_JUMP);
    }
    s += 1;
    S.seg[i] = s;
    S.freeLeft[i] = 0;
    enterSegment(c, i, s, true);
  }

  // B13. timers
  tickSkillTimers(T, S, i);
  S.guardLeft[i] = sub0(S.guardLeft[i] ?? 0, 1);
  S.holdLeft[i] = sub0(S.holdLeft[i] ?? 0, 1);
  S.tickFlags[i] = tickFlags | stateFlags(c, i);
  return false;
}

/** Step B6: plan (or replan) the final sprint and log the `sprintPlan` event (11, 20.4). */
function sprintPlan(c: Ctx, i: number): void {
  const { R, G, T, S, plan: p } = c;
  planSprint(R, G, T, S, i, p);
  if (!c.rec.full) return;
  const cause: SprintPlanCause = PlanCauses.options[S.replanCause[i] ?? 0] ?? "phase";
  c.rec.sprintPlan(c.t, i, posMm(c, i), {
    cause,
    index: (S.planCount[i] ?? 1) - 1,
    reason: p.reason,
    energy: S.energy[i] ?? 0,
    energyPerceived: p.energyPerceived,
    hp: floorDiv(S.hp[i] ?? 0, 1000),
    hpPerceived: floorDiv(p.hpPerceived, 1000),
    jumpReserve: p.jumpReserve,
    startMm: floorDiv(p.startPos, c.posPerMm),
    endMm: floorDiv(p.endPos, c.posPerMm),
    levelMms: floorDiv(p.level, c.velPerMms),
    candidates: p.candidates,
    onTicks: p.onTicks,
    clean: p.clean,
  });
}

/** Frame flags that read the runner's state after its tick (20.4). */
function stateFlags(c: Ctx, i: number): number {
  const S = c.S;
  const f = S.flags[i] ?? 0;
  return (
    ((S.pulse.pulseCd[i] ?? 0) > 0 ? FL.pulseCooldown : 0) |
    ((f & F_EXHAUSTED) !== 0 ? FL.exhausted : 0) |
    ((f & F_AIRBORNE) !== 0 ? FL.airborne : 0) |
    ((f & F_BROKEN) !== 0 ? FL.broken : 0) |
    ((S.activeSkills[i] ?? 0) > 0 ? FL.skillActive : 0) |
    ((f & F_FINISHED) !== 0 ? FL.finished : 0)
  );
}

/**
 * A lost tick of a failed jump (14.3): the body is frozen (`pos`, `vCore` unchanged, `vOut` 0),
 * heat cools, regen accrues, skill timers and the guard count down; the pulse cooldown and the
 * style hold do not; no drain, no skill check, no decision, no overheat damage.
 */
function stalledTick(c: Ctx, i: number): void {
  const { R, T, S } = c;
  S.stall[i] = (S.stall[i] ?? 0) - 1;
  S.heat[i] = sub0(S.heat[i] ?? 0, T.coolTick[i] ?? 0);
  regen(c, i, inPack(R, S, i));
  tickSkillTimers(T, S, i);
  S.guardLeft[i] = sub0(S.guardLeft[i] ?? 0, 1);
  S.prevPos[i] = S.pos[i] ?? 0;
  S.disp[i] = 0;
  S.vOut[i] = 0;
  S.boostOn[i] = 0;
  S.isPulseTick[i] = 0;
  S.freeTick[i] = 0;
  S.stallTicks[i] = (S.stallTicks[i] ?? 0) + 1;
  S.tickFlags[i] = FL.stalled | stateFlags(c, i);
}

/** Regen of a non-boost tick (8.1): ×`packRegenMultPm` in the middle pack, capped at Emax. */
function regen(c: Ctx, i: number, pack: boolean): void {
  const { T, S } = c;
  const base = T.regenTick[i] ?? 0;
  if (base === 0) return;
  const eff = pack ? floorDiv(base * (T.packRegen[i] ?? 1000), 1000) : base;
  const before = S.energy[i] ?? 0;
  const after = addCap(before, eff, T.Emax[i] ?? 0);
  S.energy[i] = after;
  S.energyRegen[i] = (S.energyRegen[i] ?? 0) + (after - before);
}

/** Every durability loss (overheat, crash, water): sub0, ledger, then the break check of 8.4. */
function damage(c: Ctx, i: number, md: number): void {
  const { T, S } = c;
  const before = S.dur[i] ?? 0;
  const after = sub0(before, md);
  S.dur[i] = after;
  S.durabilityLost[i] = (S.durabilityLost[i] ?? 0) + (before - after);
  if (after === 0 && !flag(S, i, F_BROKEN)) {
    setFlag(S, i, F_BROKEN);
    S.b[i] = 1;
    c.rec.durabilityBroken(c.t, i, posMm(c, i), T.pwBroken[i] ?? 0);
    if (flag(S, i, F_PLAN_ACTIVE)) requestReplan(S, i, CAUSE_BROKEN);
  }
}

/** heat-to-energy on the first tick of the final phase, before the plan (16 #12). */
function heatToEnergy(c: Ctx, i: number): void {
  const { T, S } = c;
  const ratio = T.heatToEnergyPm[i] ?? 0;
  if (ratio <= 0) return;
  const heat = S.heat[i] ?? 0;
  const energy = S.energy[i] ?? 0;
  const gained = Math.min((T.Emax[i] ?? 0) - energy, floorDiv(heat * ratio, 1000));
  S.energy[i] = energy + gained;
  S.heat[i] = 0;
  S.energyFromHeat[i] = (S.energyFromHeat[i] ?? 0) + gained;
  c.rec.heatToEnergy(c.t, i, posMm(c, i), heat, gained);
}

/**
 * Entering segment s (B12, and the segment-0 pre-step with `crossing` false): Boneyard repairs on a
 * crossed flat start, water hits durability, a jump becomes pending for flyers and a detour for
 * ground runners (14.1, 14.5, 14.6, 13).
 */
function enterSegment(c: Ctx, i: number, s: number, crossing: boolean): void {
  const { R, G, T, S, rec } = c;
  const type = G.segType[s] ?? SEG_FLAT;
  if (type === SEG_FLAT) {
    const amount = T.repairMd[i] ?? 0;
    if (!crossing || amount <= 0) return;
    const before = S.dur[i] ?? 0;
    const after = addCap(before, amount, T.durMax[i] ?? 0);
    if (after <= before) return;
    S.dur[i] = after;
    S.durabilityRepaired[i] = (S.durabilityRepaired[i] ?? 0) + (after - before);
    rec.repair(c.t, i, posMm(c, i), after - before);
  } else if (type === SEG_WATER) {
    const guarded = (S.guardLeft[i] ?? 0) > 0 || T.armor[i] === 1;
    const hit = guarded ? 0 : waterHitMd(R, G.dragPm[s] ?? 0, T.styleDmg[i] ?? 1000);
    damage(c, i, hit);
    rec.waterHit(c.t, i, posMm(c, i), hit);
  } else if (type === SEG_JUMP) {
    if (T.style[i] === STYLE_GROUND) {
      S.detours[i] = (S.detours[i] ?? 0) + 1;
      rec.detour(c.t, i, posMm(c, i), s);
    } else setFlag(S, i, F_PENDING_JUMP);
  }
}

/**
 * Jump resolution at step B4 (14.2, 14.3), on true energy. Success spends `min(energy, req)` and
 * takes off at the jump segment's cruise (vMin when exhausted), held until the runner leaves the
 * segment; a running burst ends. Failure spends no lift energy: damage unless guarded or armored,
 * then either the crash (×0.4, 20 lost ticks, recovery dash) or, with armor, a longer stall at
 * full speed. Returns whether the jump succeeded.
 */
function resolveJump(c: Ctx, i: number, ph: number): boolean {
  const { R, G, T, S, rec } = c;
  clearFlag(S, i, F_PENDING_JUMP);
  const seg = S.seg[i] ?? 0;
  const b = S.b[i] ?? 0;
  const energy = S.energy[i] ?? 0;
  const lift = liftMe(energy, T.liftF[i] ?? 0);
  const req = (G.liftReq[seg] ?? 0) * 1000;
  if (lift >= req) {
    const spent = Math.min(energy, req);
    S.energy[i] = energy - spent;
    S.energyLift[i] = (S.energyLift[i] ?? 0) + spent;
    setFlag(S, i, F_AIRBORNE);
    S.vCore[i] = (flag(S, i, F_EXHAUSTED) ? T.vMin : T.vC)[ibps(i, b, ph, seg)] ?? 0;
    endBurst(S.pulse, i);
    S.jumpsOk[i] = (S.jumpsOk[i] ?? 0) + 1;
    rec.jumpOk(c.t, i, posMm(c, i), lift, req, energy);
    return true;
  }
  const armor = T.armor[i] === 1;
  const dmg = (S.guardLeft[i] ?? 0) > 0 || armor ? 0 : crashDamageMd(R, T.styleDmg[i] ?? 1000);
  damage(c, i, dmg);
  let stall: number;
  if (armor) stall = R.kJumpPenaltyTicks + (T.armorExtra[i] ?? 0);
  else {
    S.vCore[i] = scale(S.vCore[i] ?? 0, R.crashSpeedMult);
    stall = R.kJumpPenaltyTicks;
    setFlag(S, i, F_DASH);
  }
  S.stall[i] = stall;
  endBurst(S.pulse, i);
  S.jumpsFailed[i] = (S.jumpsFailed[i] ?? 0) + 1;
  rec.jumpFail(c.t, i, posMm(c, i), lift, req, energy, dmg, stall);
  return false;
}

// --- finish and DNF (steps C and E, section 19) ----------------------------------------------------

/**
 * Step C of tick t: gaps of every runner unfinished at the start of the tick at each crosser's
 * instant, then places by (finishMilli, lane); equal finishMilli is a dead heat (`deadHeat` on the
 * whole group, margin 0 on every member, places still distinct by lane); the margin of any other
 * k-th finisher is gap[(k − 1)-th][k-th].
 */
function placeFinishers(c: Ctx, crossers: Int32Array, nCross: number, startUnfinished: number) {
  const { G, S, n, rec } = c;
  // insertion sort by (finishMilli, lane): at most 8 runners
  for (let a = 1; a < nCross; a++) {
    const x = crossers[a] ?? 0;
    const fx = S.finishMilli[x] ?? 0;
    let k = a - 1;
    while (k >= 0) {
      const y = crossers[k] ?? 0;
      const fy = S.finishMilli[y] ?? 0;
      if (fy < fx || (fy === fx && y < x)) break;
      crossers[k + 1] = y;
      k--;
    }
    crossers[k + 1] = x;
  }
  for (let a = 0; a < nCross; a++) {
    const A = crossers[a] ?? 0;
    const fA = (S.finishMilli[A] ?? 0) - 1000 * c.t;
    for (let B = 0; B < n; B++)
      if (B !== A && (startUnfinished & (1 << B)) !== 0)
        S.gap[A * MAX_LANES + B] = marginGapMm(
          G.L,
          S.prevPos[B] ?? 0,
          S.disp[B] ?? 0,
          fA,
          c.posPerMm,
        );
  }
  for (let a = 0; a < nCross; a++) {
    const A = crossers[a] ?? 0;
    const fm = S.finishMilli[A] ?? 0;
    c.placed += 1;
    if (c.groupCount === 0 || fm !== c.groupFinish) {
      c.beforeGroup = c.groupCount > 0 ? (c.group[c.groupCount - 1] ?? -1) : -1;
      c.groupCount = 0;
      c.groupStart = c.placed;
      c.groupFinish = fm;
    }
    // insert A into the group by lane (a no-op append unless the group began in an earlier tick)
    let k = c.groupCount;
    while (k > 0 && (c.group[k - 1] ?? 0) > A) {
      c.group[k] = c.group[k - 1] ?? 0;
      k--;
    }
    c.group[k] = A;
    c.groupCount += 1;
    for (let g = 0; g < c.groupCount; g++) {
      const lane = c.group[g] ?? 0;
      const place = c.groupStart + g;
      S.place[lane] = place;
      S.deadHeat[lane] = c.groupCount > 1 ? 1 : 0;
      // margin 0 on every runner of a dead heat, the first one included (19)
      S.marginMm[lane] =
        c.groupCount === 1 && c.beforeGroup >= 0
          ? (S.gap[c.beforeGroup * MAX_LANES + lane] ?? 0)
          : 0;
      if (lane !== A) rec.patchFinishPlace(c.finishEvent[lane] ?? -1, place);
    }
    c.finishEvent[A] = rec.finish(c.t, A, posMm(c, A), fm, S.place[A] ?? 0);
  }
}

/** Step E: runners unfinished at maxTicks get `dnf`, places after every finisher (pos desc, lane). */
function markDnfs(c: Ctx, ticks: number): void {
  const { S, n, rec } = c;
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (!flag(S, i, F_FINISHED)) order.push(i);
  order.sort((a, b) => (S.pos[b] ?? 0) - (S.pos[a] ?? 0) || a - b);
  for (const i of order) {
    c.placed += 1;
    S.place[i] = c.placed;
    setFlag(S, i, F_DNF);
    rec.dnf(Math.max(0, ticks - 1), i, posMm(c, i));
    rec.markDnf(i);
  }
}

/** A deep copy of an entry for the log, so the log never aliases the caller's inputs. */
function cloneEntry(e: RaceEntry): RaceEntry {
  const tr = e.traits;
  return {
    ...e,
    parts: [...e.parts],
    quirks: [...e.quirks],
    stats: { ...e.stats },
    skills: e.skills.map((s) => ({ ...s, trigger: { ...s.trigger }, effect: { ...s.effect } })),
    traits: {
      ...tr,
      segOverridePm: [...tr.segOverridePm],
      segMultiplyPm: [...tr.segMultiplyPm],
      pulseCooldown: [...tr.pulseCooldown],
      activationBonusPm: { ...tr.activationBonusPm },
    },
  };
}
