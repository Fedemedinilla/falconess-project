import { ceilDiv, floorDiv, Rng, scale } from "@falconess/rng";
import type { Course, RaceEntry, RaceLog, SprintPlanCause } from "@falconess/schema";
import { SprintPlanCause as PlanCauses, RACE_FRAME_FLAGS } from "@falconess/schema";
import { endBurst } from "../rules/index.js";
import type { RaceConstants, Ruleset } from "../rulesets/index.js";
import { type Controller, createController, decide, inPack, rankSnapshot } from "./controller.js";
import {
  BAND_CEILING,
  BAND_LOW,
  bandPu,
  climbTicksOf,
  type FlightConstants,
  flightOf,
  holdLift,
  holdMe,
  jrNow,
  wingOf,
} from "./flight.js";
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
  FLIGHTS_MAX,
  ib,
  ibps,
  ibs,
  ik,
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
  SEG_CANYON,
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
  /** Flight constants of the v3 draft (design7); null for v1 and v2, which never fly. */
  readonly F: FlightConstants | null;
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
  /** Ruleset v3 log only: index of the `pass` (i × MAX_LANES + j) and `airDirty` candidates. */
  passEvent: Int32Array;
  dirtyEvent: Int32Array;
  /** Two lines per band: index of the `passSide` candidate of each `pass` candidate. */
  passSideEvent: Int32Array;
  /** Two lines: someone switched line at t − 1 (step A2); else no door can open or close this tick. */
  swLast: boolean;
  /** `pass` candidates still waiting for their 8 ticks (0: step C2 skips the pending scan). */
  passPending: number;
  /** Pending passes of each passer (row i of passSince), so step C2 visits only those rows. */
  passRow: Int32Array;
  /** Runners unfinished at the start of the tick (bit per lane): the snapshot's live set (F9). */
  live: number;
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

/**
 * `simulateRace` with step B run in reverse lane order (INV-4 property tests only, not exported by
 * the index): the results must not change, only the order of the events within a tick.
 */
export function simulateRaceReversed(
  ruleset: Ruleset,
  entries: readonly RaceEntry[],
  course: Course,
  seed: string,
  opts: SimulateOptions = {},
): RaceLog {
  return runRace(ruleset, entries, course, seed, opts, null, true);
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
  reverse = false,
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
    F: flightOf(ruleset),
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
      onSkill: (i, j, p, u, k) => {
        rec.skill(c.t, i, posMm(c, i), j, p, u, k);
        // ruleset v3 (L7): a skill with an effect that fires in the air is held until touchdown
        const x = ik(i, j);
        if (c.F?.heldSkill && flag(c.S, i, F_AIRBORNE) && (c.T.skDur[x] ?? 0) > 0) {
          if (c.S.skHeld[x] !== 1) c.S.heldN[i] = (c.S.heldN[i] ?? 0) + 1;
          c.S.skHeld[x] = 1;
          c.S.skHeldTicks[x] = 0;
        }
      },
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
    passEvent: new Int32Array(MAX_LANES * MAX_LANES).fill(-1),
    dirtyEvent: new Int32Array(MAX_LANES).fill(-1),
    passSideEvent: new Int32Array(MAX_LANES * MAX_LANES).fill(-1),
    swLast: false,
    passPending: 0,
    passRow: new Int32Array(MAX_LANES),
    live: 0,
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
    // A2. ruleset v3 (L3): the air snapshot of end-of-(t − 1), the same for every lane
    c.live = startUnfinished;
    if (c.F !== null) airSnapshot(c, c.F, startUnfinished);
    // B. every unfinished runner in lane order
    let nCross = 0;
    for (let q = 0; q < n; q++) {
      const i = reverse ? n - 1 - q : q;
      if ((startUnfinished & (1 << i)) === 0) continue;
      if (runnerTick(c, i)) crossers[nCross++] = i;
    }
    unfinished -= nCross;
    // C. finishers of tick t: places, dead heats, margins
    if (nCross > 0) placeFinishers(c, crossers, nCross, startUnfinished);
    // C2. ruleset v3 log: passes in the air or in a dive surge (no physics reads them)
    if (c.F !== null) passTick(c, startUnfinished);
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
  if (c.F !== null) closeAirLog(c, t);

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
    derived: buildDerived(ruleset, E, G, A, full),
    results: buildResults(E, A, rec, c.F, c.posPerMm),
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

  // B4b. v3 draft (design7 R1-R4, R7): planned takeoff, climb, end of flight, descent, dive
  // (on the ground, only when her next planned takeoff point is reached: flightTick's phase 0)
  if (c.F !== null) {
    const k = S.flK[i] ?? 0;
    if (
      (S.flPhase[i] ?? 0) !== 0 ||
      (k < (T.flN[i] ?? 0) && pos >= (T.flA[i * FLIGHTS_MAX + k] ?? 0))
    )
      flightTick(c, i, c.F);
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
  // F6 (round 5): in the air the tow is one rule by band and metres (step A2), for every wing
  const airBand = airborne && c.F?.airDraftBand === true;
  const drafting = airBand
    ? S.dirty[i] === 1 && S.flPhase[i] === 2 && !exhausted
    : style === STYLE_HOVER &&
      ph === PH_MIDDLE &&
      pack &&
      !exhausted &&
      !(airborne && c.F?.draftGroundOnly);
  if (drafting) {
    if (!airBand) tgt = floorDiv(tgt * R.style.hoverDraftPm, 1000);
    else S.towTicks[i] = (S.towTicks[i] ?? 0) + 1;
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
  } else if (c.F?.airCruise && S.flPhase[i] === 2)
    vCore = airCruiseTick(
      c,
      i,
      b,
      ph,
      seg,
      exhausted,
      drafting ? (airBand ? wingOf(c.F, style).draftPm : R.style.hoverDraftPm) : 1000,
    );
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
  let surge = 0;
  if (!airborne && (S.surge[i] ?? 0) > 0) {
    // v3 draft, `diveSurge` knob: the dive's surge decays by kDecel on top of the body speed
    surge = S.surge[i] ?? 0;
    S.surge[i] = Math.max(0, surge - R.kDecel);
  } else if (airborne && S.flPhase[i] === 3 && (S.surge[i] ?? 0) > 0 && c.F?.diveAirShare) {
    // F2 (round 5): the share of the dive gained so far carries her down, undecayed
    surge = S.surge[i] ?? 0;
    S.diveAirMm[i] = (S.diveAirMm[i] ?? 0) + surge;
  }
  const vTot = airborne
    ? vCore + surge
    : Math.max(0, vCore + thrust + surge + (S.skillSpeed[i] ?? 0));
  const penalised =
    over &&
    T.heatPenalty[i] === 1 &&
    !airborne &&
    !(T.heatImmune[i] === 1 && pos < (T.immuneUntil[i] ?? 0));
  let vOut = penalised ? penalisedVu(R, vTot) : vTot;
  // two lines per band: in her band and line nobody flies through the runner ahead
  if (c.F?.lines && airborne && S.flPhase[i] === 2) vOut = blocked(c, c.F, i, vOut);
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
  if (c.F !== null && S.flPhase[i] === 2) holdTick(c, i, c.F, vOut, seg);

  // B10. hp drain at the moved speed (6)
  const q =
    (ph === PH_FINAL ? DK_FINAL : 0) + (style === STYLE_GLIDE && S.ahead[i] === 0 ? DK_LEAD : 0);
  const dK = T.dK[i * 4 + q] ?? 0;
  const drain =
    c.F !== null && (S.alt[i] ?? 0) > 0
      ? airDrain(c, i, c.F, vOut, dK)
      : drainMicro(vOut, c.vBase, dK);
  const hp = sub0(S.hp[i] ?? 0, drain);
  S.hp[i] = hp;
  if (hp === 0 && !exhausted) {
    setFlag(S, i, F_EXHAUSTED);
    S.hpEmptyMm[i] = posMm(c, i);
    rec.hpEmpty(t, i, posMm(c, i));
  }

  // B11. move (ground detour as progress scaling, 14.5)
  const detouring = style === STYLE_GROUND && segType === SEG_JUMP;
  let disp = detouring ? detourDisp(vOut, T.detour[i] ?? 1000) : vOut;
  if (c.F?.lines && (S.alt[i] ?? 0) >= 1) disp = lineDisp(c, i, disp);
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
    (drafting ? FL.drafting : 0) |
    (inDirtyAir(c.F, S, i) ? FL.dirtyAir : 0) |
    (S.line[i] === 1 && (S.alt[i] ?? 0) >= 1 ? FL.lineOut : 0);

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
    if (G.segType[s] === SEG_JUMP && (S.flPhase[i] ?? 0) === 0) {
      if (flag(S, i, F_AIRBORNE)) {
        const v0 = S.vCore[i] ?? 0;
        const v1 = scale(v0, T.landPm[i] ?? 1000);
        S.vCore[i] = v1;
        const loss = floorDiv(v0 - v1, c.velPerMms);
        S.landingLossMms[i] = (S.landingLossMms[i] ?? 0) + loss;
        rec.landing(t, i, posMm(c, i), loss);
      }
      clearFlag(S, i, F_AIRBORNE);
      S.alt[i] = 0;
      if (flag(S, i, F_PLAN_ACTIVE) && style !== STYLE_GROUND) requestReplan(S, i, CAUSE_JUMP);
    }
    s += 1;
    S.seg[i] = s;
    S.freeLeft[i] = 0;
    enterSegment(c, i, s, true);
  }

  // B13. timers (ruleset v3, L7: the skills held in the air wait for the touchdown)
  if ((S.heldN[i] ?? 0) > 0) {
    heldSkills(c, i);
    tickSkillTimers(T, S, i, S.skHeld);
  } else tickSkillTimers(T, S, i);
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
    ((f & F_FINISHED) !== 0 ? FL.finished : 0) |
    // v3 draft R1: the altitude band in two bits (always 0 in v1 and v2)
    ((S.alt[i] ?? 0) & 1 ? FL.altLow : 0) |
    ((S.alt[i] ?? 0) & 2 ? FL.altHigh : 0)
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
    // F5 (round 5): flying over the Terreno líquido she never touches it
    if (c.F?.airWaterFree && (S.flPhase[i] ?? 0) !== 0) return;
    const guarded = (S.guardLeft[i] ?? 0) > 0 || T.armor[i] === 1;
    const hit = guarded ? 0 : waterHitMd(R, G.dragPm[s] ?? 0, T.styleDmg[i] ?? 1000);
    damage(c, i, hit);
    rec.waterHit(c.t, i, posMm(c, i), hit);
  } else if (type === SEG_JUMP) {
    if (T.style[i] === STYLE_GROUND) {
      S.detours[i] = (S.detours[i] ?? 0) + 1;
      rec.detour(c.t, i, posMm(c, i), s);
    } else if ((S.flPhase[i] ?? 0) !== 0)
      S.jumpsCovered[i] = (S.jumpsCovered[i] ?? 0) + 1; // v3 draft R3: crossed in flight, no lift
    else setFlag(S, i, F_PENDING_JUMP);
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
    if (c.F !== null) S.alt[i] = 1; // v3 draft: a jump flies low
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

/**
 * Step B8 in the air (v3 draft R5): holding a band, the body approaches her air cruise (L1b: her
 * pace draw, `airPacePm`) × her own air on this flight (L1, drawn before tick 0) × the tow
 * `draftPm` (round 4: the hover draft by her place in the field; round 5, F6: her wing's draft in
 * another's wake in her band). Kept out of `runnerTick` so the ground path stays as small as v2's.
 */
function airCruiseTick(
  c: Ctx,
  i: number,
  b: number,
  ph: number,
  seg: number,
  exhausted: boolean,
  draftPm: number,
): number {
  const { R, T, S } = c;
  // F5: from airTerrainFreeBand up the water and climbs cost the air nothing
  const hi = c.F !== null && (S.alt[i] ?? 0) >= c.F.airTerrainFreeBand;
  let ta = (exhausted ? T.vMin : hi ? T.vCAirHi : T.vCAir)[ibps(i, b, ph, seg)] ?? 0;
  const air =
    c.F !== null && (S.alt[i] ?? 0) < c.F.ownAirFromBand
      ? 0
      : (T.airOff[i * FLIGHTS_MAX + Math.max(0, (S.flCur[i] ?? 1) - 1)] ?? 0) +
        (c.F !== null && S.overWon[i] === 1 ? c.F.overAirPm : 0);
  if (air !== 0) ta = floorDiv(ta * (1000 + air), 1000);
  if (draftPm !== 1000) ta = floorDiv(ta * draftPm, 1000);
  const v = approachVu(S.vCore[i] ?? 0, ta, T.acc[ibs(i, b, seg)] ?? 0, R.kDecel);
  S.vCore[i] = v;
  return v;
}

/**
 * Step B10 in the air (v3 draft R6): the legs rest (`airDrainPm`), but not in dirty air (L3).
 * `drainMicro` written out once for the two drains (the same integers, one ratio); returns the
 * drain of the tick and books the rest in the ledger.
 */
function airDrain(c: Ctx, i: number, F: FlightConstants, vOut: number, dK: number): number {
  const S = c.S;
  const dirty = inDirtyAir(F, S, i);
  if (dirty) S.dirtyTicks[i] = (S.dirtyTicks[i] ?? 0) + 1;
  const restPm = dirty && F.dirtyNoRest ? Math.max(1000, F.airDrainPm) : F.airDrainPm;
  const dKAir = Math.floor((dK * restPm) / 1000);
  const rPm = Math.floor((vOut * 1000) / c.vBase);
  const r2 = rPm * rPm;
  const drain = Math.floor((r2 * dKAir) / 1_000_000);
  S.hpRested[i] = (S.hpRested[i] ?? 0) + Math.floor((r2 * dK) / 1_000_000) - drain;
  S.airTicks[i] = (S.airTicks[i] ?? 0) + 1;
  return drain;
}

// --- flight (ruleset v3, design7 stage 1 «Despegar, luchar y caer», diseno-v3-vuelo.md) ----------

/** `airDirty` is logged when the dirty air held at least this many ticks (like `boostMode`). */
const AIR_DIRTY_MIN_TICKS = 15;
/** A `pass` counts when the new order held this many ticks (§6.1). */
const PASS_HOLD_TICKS = 8;

function mms(c: Ctx, vu: number): number {
  return floorDiv(vu, c.velPerMms);
}

/**
 * Dirty air this tick (L3): round 4, anywhere in the wake (`dirty` ≥ 1); round 5 (F6,
 * `airDraftBand`), only within `fightM` (`dirty` 2): the rest of the wake tows her.
 */
function inDirtyAir(F: FlightConstants | null, S: RaceState, i: number): boolean {
  const d = S.dirty[i] ?? 0;
  return F?.airDraftBand ? d === 2 : d > 0;
}

/**
 * Step A2 (L3): from the end-of-(t − 1) snapshot, a runner holding her band (phase 2) is in dirty
 * air when another unfinished runner is in the same band, 0 < gap ≤ `dirtyM` metres ahead. It is
 * read before any lane moves, so lane order never changes it (INV-4). Also keeps the positions for
 * the passes (step C2) and the `airDirty` log.
 */
function airSnapshot(c: Ctx, F: FlightConstants, live: number): void {
  const { S, n } = c;
  const lim = F.dirtyM * 1000 * c.posPerMm;
  const fight = F.fightM > 0 ? Math.min(lim, F.fightM * 1000 * c.posPerMm) : lim;
  const lines = F.lines;
  const pos = S.pos;
  const altA = S.alt;
  const line = S.line;
  c.swLast = false;
  for (let i = 0; i < n; i++) {
    S.pos0[i] = pos[i] ?? 0;
    const ai = altA[i] ?? 0;
    S.alt0[i] = ai;
    // two lines: only a runner in the air has a line (every read of these is gated on alt0 ≥ 1)
    if (lines && ai >= 1) {
      if ((S.swTick[i] ?? 0) === c.t) c.swLast = true;
      S.line0[i] = line[i] ?? 0;
      S.swTick0[i] = S.swTick[i] ?? 0;
      S.swCause0[i] = S.swCause[i] ?? 0;
      S.disp0[i] = S.disp[i] ?? 0;
      S.v0[i] = S.vOut[i] ?? 0;
    }
  }
  if (lim <= 0) return;
  const highReach = F.dirtyHighM > 0 ? F.dirtyHighM * 1000 * c.posPerMm : lim;
  for (let i = 0; i < n; i++) {
    const ai = altA[i] ?? 0;
    // L3: the high band's wake reaches dirtyHighM (feel round 2), the others dirtyM
    const reach = ai === 2 ? highReach : lim;
    let gap = reach + 1;
    let ahead = -1;
    let side = 0;
    if (ai >= 1 && S.flPhase[i] === 2 && (live & (1 << i)) !== 0) {
      const pi = pos[i] ?? 0;
      const li = line[i] ?? 0;
      const slot = lines ? (c.T.lnSlot[i] ?? 0) : 0;
      for (let j = 0; j < n; j++) {
        if (j === i || (live & (1 << j)) === 0 || (altA[j] ?? 0) !== ai) continue;
        const d = (pos[j] ?? 0) - pi;
        // two lines: the wake is only in her line; alongside in the other line takes her slot
        if (lines && (line[j] ?? 0) !== li) {
          if (d < slot && d > -slot) side = 1;
          continue;
        }
        if (d > 0 && d < gap) {
          gap = d;
          ahead = j;
        }
      }
    }
    const dirty = gap > reach ? 0 : gap > fight ? 1 : 2;
    S.dirty[i] = dirty;
    if (lines) {
      S.lnAhead[i] = dirty > 0 ? ahead : -1;
      S.lnGap[i] = dirty > 0 ? gap : 0;
      S.side[i] = side;
    }
    // `dirtyLog` acts only when the dirt starts or ends
    const on = inDirtyAir(F, S, i);
    if (on !== (S.dirtySince[i] ?? 0) > 0) dirtyLog(c, i, on);
  }
}

/** The `airDirty` log: a candidate at the tick it began, kept if it held ≥ 15 ticks. */
function dirtyLog(c: Ctx, i: number, on: boolean): void {
  const S = c.S;
  const since = S.dirtySince[i] ?? 0;
  if (on && since === 0) {
    S.dirtySince[i] = c.t + 1;
    c.dirtyEvent[i] = c.rec.full
      ? c.rec.candidate({ kind: "airDirty", tick: c.t, lane: i, posMm: posMm(c, i), on: true })
      : -1;
  } else if (!on && since > 0) {
    if (c.t + 1 - since >= AIR_DIRTY_MIN_TICKS) c.rec.airDirtyOff(c.t, i, posMm(c, i));
    else c.rec.drop(c.dirtyEvent[i] ?? -1);
    S.dirtySince[i] = 0;
    c.dirtyEvent[i] = -1;
  }
}

/**
 * Step C2 (log and ledger only, no physics reads it): lane i passed lane j this tick (behind at
 * the end of t − 1, ahead now) while in the air or in her dive surge; it counts if the new order
 * holds `PASS_HOLD_TICKS` ticks, and the `pass` event keeps the tick it happened.
 */
function passTick(c: Ctx, live: number): void {
  const { S, n, t } = c;
  if (c.passPending > 0)
    for (let i = 0; i < n; i++) {
      if ((c.passRow[i] ?? 0) === 0) continue;
      for (let j = 0; j < n; j++) {
        const x = i * MAX_LANES + j;
        const since = S.passSince[x] ?? 0;
        if (since === 0) continue;
        if ((S.pos[i] ?? 0) <= (S.pos[j] ?? 0)) {
          c.rec.drop(c.passEvent[x] ?? -1);
          dropSide(c, x);
          S.passSince[x] = 0;
          c.passEvent[x] = -1;
          c.passPending -= 1;
          c.passRow[i] = (c.passRow[i] ?? 1) - 1;
        } else if (t + 1 - since >= PASS_HOLD_TICKS) confirmPass(c, i, x);
      }
    }
  for (let i = 0; i < n; i++) {
    const alt = S.alt[i] ?? 0;
    if ((alt === 0 && (S.surge[i] ?? 0) <= 0) || (live & (1 << i)) === 0) continue;
    const kind = alt >= 1 ? 1 : 2;
    const p0 = S.pos0[i] ?? 0;
    const pi = S.pos[i] ?? 0;
    for (let j = 0; j < n; j++) {
      if (j === i || (live & (1 << j)) === 0) continue;
      const x = i * MAX_LANES + j;
      if ((S.passSince[x] ?? 0) > 0 || !(p0 < (S.pos0[j] ?? 0) && pi > (S.pos[j] ?? 0))) continue;
      S.passSince[x] = t + 1;
      S.passKind[x] = kind;
      c.passPending += 1;
      c.passRow[i] = (c.passRow[i] ?? 0) + 1;
      c.passEvent[x] = c.rec.full
        ? c.rec.candidate({
            kind: "pass",
            tick: t,
            lane: i,
            posMm: posMm(c, i),
            otherLane: j,
            band: alt,
            otherBand: S.alt[j] ?? 0,
          })
        : -1;
      // two lines: a pass in the same band from the other line is a pass by the side
      // (both holding the band: a runner climbing or falling through it is not passed by the side)
      if (
        c.F?.lines &&
        alt >= 1 &&
        (S.alt[j] ?? 0) === alt &&
        S.line[i] !== S.line[j] &&
        S.flPhase[i] === 2 &&
        S.flPhase[j] === 2
      ) {
        S.passSide[x] = 1;
        c.passSideEvent[x] = c.rec.full
          ? c.rec.candidate({
              kind: "passSide",
              tick: t,
              lane: i,
              posMm: posMm(c, i),
              otherLane: j,
              by: S.line[i] === 1 ? "outside" : "inside",
              band: alt,
              line: S.line[i] ?? 0,
            })
          : -1;
      }
    }
  }
}

/** Two lines: the `passSide` candidate of pass candidate x did not hold. */
function dropSide(c: Ctx, x: number): void {
  if (c.S.passSide[x] !== 1) return;
  c.rec.drop(c.passSideEvent[x] ?? -1);
  c.S.passSide[x] = 0;
  c.passSideEvent[x] = -1;
}

function confirmPass(c: Ctx, i: number, x: number): void {
  const S = c.S;
  const kind = S.passKind[x] ?? 0;
  if ((kind & 1) !== 0) S.passesAir[i] = (S.passesAir[i] ?? 0) + 1;
  if ((kind & 2) !== 0) S.passesDive[i] = (S.passesDive[i] ?? 0) + 1;
  if (S.passSide[x] === 1) {
    S.passesSide[i] = (S.passesSide[i] ?? 0) + 1;
    if ((S.alt[i] ?? 0) >= 1) S.sideWon[i] = 1;
  }
  S.passSide[x] = 0;
  c.passSideEvent[x] = -1;
  S.passSince[x] = 0;
  c.passEvent[x] = -1;
  c.passPending -= 1;
  c.passRow[i] = (c.passRow[i] ?? 1) - 1;
}

/** After the loop: close the open `airDirty` and `pass` candidates. */
function closeAirLog(c: Ctx, t: number): void {
  const { S, n } = c;
  for (let i = 0; i < n; i++) {
    const since = S.dirtySince[i] ?? 0;
    if (since > 0 && t + 1 - since < AIR_DIRTY_MIN_TICKS) c.rec.drop(c.dirtyEvent[i] ?? -1);
    for (let j = 0; j < n && c.passPending > 0; j++) {
      const x = i * MAX_LANES + j;
      if (i === j || (S.passSince[x] ?? 0) === 0) continue;
      if ((S.pos[i] ?? 0) > (S.pos[j] ?? 0)) confirmPass(c, i, x);
      else {
        c.rec.drop(c.passEvent[x] ?? -1);
        dropSide(c, x);
        S.passSince[x] = 0;
        c.passPending -= 1;
      }
    }
  }
}

/** L7, step B13: held skills count their ticks in the air and are released on the ground. */
function heldSkills(c: Ctx, i: number): void {
  const { T, S } = c;
  const air = flag(S, i, F_AIRBORNE);
  const nSkills = T.nSkills[i] ?? 0;
  for (let j = 0; j < nSkills; j++) {
    const k = ik(i, j);
    if (S.skHeld[k] !== 1) continue;
    if (air) S.skHeldTicks[k] = (S.skHeldTicks[k] ?? 0) + 1;
    else {
      S.skHeld[k] = 0;
      S.heldN[i] = (S.heldN[i] ?? 1) - 1;
      c.rec.skillHeld(i, j, S.skHeldTicks[k] ?? 0);
    }
  }
}

/** RISK-1: the current planned flight is flown below its plan (counted once per flight). */
function below(c: Ctx, i: number): void {
  const S = c.S;
  if (S.belowCounted[i] === 1) return;
  S.belowCounted[i] = 1;
  S.belowPlan[i] = (S.belowPlan[i] ?? 0) + 1;
}

/** The climb reached `band`: the `bandReached` beat and the apex of the ledger. */
function reachBand(c: Ctx, i: number, band: number): void {
  const S = c.S;
  S.flApex[i] = Math.max(S.flApex[i] ?? 0, band);
  S.apexMax[i] = Math.max(S.apexMax[i] ?? 0, band);
  c.rec.bandReached(c.t, i, posMm(c, i), band);
}

/**
 * Step B4b: the runner's planned flight. On the ground (or in a plain jump) it takes off at the
 * planned point; climbing it gains one band every `climbTk` ticks (S1, S2); holding, it fights for
 * the line (L4); at the planned end (or when holding cannot be paid, `holdTick`) it descends one
 * band every `diveTicks`, and touches down.
 */
function flightTick(c: Ctx, i: number, F: FlightConstants): void {
  const { T, S } = c;
  const pos = S.pos[i] ?? 0;
  const phase = S.flPhase[i] ?? 0;
  if (phase === 0) {
    const k = S.flK[i] ?? 0;
    if (k < (T.flN[i] ?? 0) && pos >= (T.flA[i * FLIGHTS_MAX + k] ?? 0)) takeoff(c, i, k, F);
    return;
  }
  if (phase === 1) {
    const left = (S.altTimer[i] ?? 0) - 1;
    if (left > 0) S.altTimer[i] = left;
    else {
      const alt = (S.alt[i] ?? 0) + 1;
      S.alt[i] = alt;
      reachBand(c, i, alt);
      if (alt >= (S.altTarget[i] ?? 0)) S.flPhase[i] = 2;
      else S.altTimer[i] = S.climbTk[i] ?? 1;
    }
  }
  if (phase === 3) {
    const left = (S.altTimer[i] ?? 0) - 1;
    if (left > 0) {
      S.altTimer[i] = left;
      return;
    }
    const alt = Math.max(0, (S.alt[i] ?? 0) - 1);
    S.alt[i] = alt;
    if (alt === 0) touchdown(c, i);
    else if (alt <= (S.altTarget[i] ?? 0))
      S.flPhase[i] = 2; // R9 or a knock: down to the lower band
    else {
      S.altTimer[i] = wingOf(F, T.style[i] ?? 0).diveTicks;
      // F2: a planned dive gains its band's share of the Δv as she drops each band
      const from = S.fromBand[i] ?? 0;
      if (F.diveAirShare && from >= 2 && S.fallCause[i] === 0 && (S.altTarget[i] ?? 0) === 0) {
        const want = floorDiv(diveTotal(c, i, from) * (from - alt), from);
        S.surge[i] = (S.surge[i] ?? 0) + want - (S.diveAdded[i] ?? 0);
        S.diveAdded[i] = want;
      }
    }
    return;
  }
  const cur = (S.flCur[i] ?? 1) - 1;
  const x = i * FLIGHTS_MAX + cur;
  if (pos < (T.flB[x] ?? 0)) {
    if ((F.escapeTicks > 0 || F.knockTicks > 0) && lineFight(c, i, F, x)) return;
    return;
  }
  if (T.flChain[x] === 1 && cur + 1 < (T.flN[i] ?? 0)) chainNext(c, i, cur + 1, F);
  else startDescent(c, i, F, 0);
}

/**
 * L4, the fight for the line: after `escapeTicks` in dirty air in a row she tries once per race to
 * go over (a band up, below the ceiling, if the climb plus the extra hold to the planned end leave
 * `jr` and the reserve whole); otherwise after `knockAt` ticks she is knocked a band down (never
 * below the low band), with no loss of speed. Reads only her own state and the step-A dirt.
 */
function lineFight(c: Ctx, i: number, F: FlightConstants, x: number): boolean {
  const { T, S } = c;
  const run = S.dirty[i] === 2 ? (S.dirtyRun[i] ?? 0) + 1 : 0;
  S.dirtyRun[i] = run;
  if (F.lines && S.flPhase[i] === 2 && lineMoves(c, i, F, x, run)) return true;
  if (run === 0) return false;
  const alt = S.alt[i] ?? 0;
  // she goes over only if the climb ends before her planned line does; R9 (stage 2): nobody
  // climbs over inside a canyon with a ceiling, nor on a line that still reaches one
  const style = T.style[i] ?? 0;
  const pos = S.pos[i] ?? 0;
  const dist = Math.max(0, (T.flB[x] ?? 0) - pos);
  const roof = F.canyonCeiling && lineMeetsCanyon(c, pos, T.flB[x] ?? 0);
  if (
    F.escapeTicks > 0 &&
    run >= F.escapeTicks &&
    S.escaped[i] === 0 &&
    alt < Math.min(BAND_CEILING, wingOf(F, style).maxBand) &&
    !roof &&
    dist > climbTicksOf(F, style, false) * (S.vOut[i] ?? 0)
  ) {
    S.escaped[i] = 1;
    const liftF = holdLift(F, style, T.liftF[i] ?? 1000);
    const cost = T.climbMe[i] ?? 0;
    // F3: a won line is held at the price of the band she leaves (clean air), so it costs no extra
    const extra = F.overCleanHold
      ? 0
      : holdMe(F, bandPu(F, alt + 1, dist) - bandPu(F, alt, dist), c.posPerMm, liftF);
    const energy = S.energy[i] ?? 0;
    if (energy - cost >= jrNow(T, S, i, S.seg[i] ?? 0) + extra) {
      S.energy[i] = energy - cost;
      S.energyClimb[i] = (S.energyClimb[i] ?? 0) + cost;
      S.altTarget[i] = alt + 1;
      S.flPhase[i] = 1;
      S.climbTk[i] = climbTicksOf(F, style, false);
      S.altTimer[i] = S.climbTk[i] ?? 1;
      S.dirtyRun[i] = 0;
      S.overs[i] = (S.overs[i] ?? 0) + 1;
      S.overWon[i] = 1;
      c.rec.lineChange(c.t, i, posMm(c, i), alt, alt + 1, "over", run);
      // two lines: the diagonal, a band up and the other line when hers is taken up there
      const li = S.line[i] ?? 0;
      if (F.lines && lineTaken(c, i, alt + 1, li) && !lineTaken(c, i, alt + 1, 1 - li))
        switchLine(c, i, F, 1 - li, SW_DIAGONAL, alt + 1, true);
      return true;
    }
  }
  if (F.knockTicks > 0 && run >= (T.knockAt[i] ?? 0) && alt > BAND_LOW) {
    S.altTarget[i] = alt - 1;
    S.flPhase[i] = 3;
    S.altTimer[i] = wingOf(F, style).diveTicks;
    S.overWon[i] = 0;
    S.sideWon[i] = 0;
    S.dirtyRun[i] = 0;
    S.knocks[i] = (S.knocks[i] ?? 0) + 1;
    S.knocked[i] = 1;
    below(c, i);
    c.rec.lineChange(c.t, i, posMm(c, i), alt, alt - 1, "knock", run);
    return true;
  }
  return false;
}

/** R9: a canyon segment overlaps [a, b] (pu). */
function lineMeetsCanyon(c: Ctx, a: number, b: number): boolean {
  const G = c.G;
  for (let s = 0; s < G.S; s++)
    if (G.segType[s] === SEG_CANYON && (G.segStart[s] ?? 0) <= b && (G.segEnd[s] ?? 0) > a)
      return true;
  return false;
}

// --- two lines per band (owner, 2026-11-08: «pasar por los costados») -------------------------

/** Causes of a line switch, as `swCause` stores them. */
const SW_PASS = 1;
const SW_DOOR = 2;
const SW_ESCAPE = 3;
/** A diagonal (a band up and the other line): logged as a pass, never a door's trigger. */
const SW_DIAGONAL = 4;
const SW_NAMES = ["pass", "pass", "door", "escape", "pass"] as const;
/** Door decisions per race: one byte of the pre-drawn slot 31 each. */
const DOOR_TESTS_MAX = 4;

/**
 * Step B8: in her band and line, within `blockMm` of the runner ahead (step-A snapshot), she
 * cannot fly through her: she moves at most to half `blockMm` behind where the one ahead was plus
 * what that one moved last tick; her body keeps its speed. Reads only the snapshot.
 */
function blocked(c: Ctx, F: FlightConstants, i: number, vOut: number): number {
  const S = c.S;
  const a = S.lnAhead[i] ?? -1;
  const prev = S.blkRun[i] ?? 0;
  S.blkRun[i] = 0;
  if (a < 0 || (S.dirty[i] ?? 0) === 0 || S.line[i] !== S.line0[i]) return vOut;
  const gap = S.lnGap[i] ?? 0;
  const lim = F.blockMm * c.posPerMm;
  if (gap > lim) return vOut;
  const cap = Math.max(0, Math.floor(gap + (S.disp0[a] ?? 0) - floorDiv(lim, 2)));
  if (cap >= vOut) return vOut;
  S.blkRun[i] = prev + 1;
  S.blockedTicks[i] = (S.blockedTicks[i] ?? 0) + 1;
  // her body keeps its speed (the tow built it): she pulls out with it, the slingshot
  return cap;
}

/** Step B11: the lateral move's metres (spread over its ticks) and the longer outside line. */
function lineDisp(c: Ctx, i: number, disp: number): number {
  const { S, T } = c;
  let d = disp;
  let lost = 0;
  const left = S.latTicks[i] ?? 0;
  if (left > 0) {
    const pu = S.latLeft[i] ?? 0;
    const loss = Math.floor(pu / left);
    S.latLeft[i] = pu - loss;
    S.latTicks[i] = left - 1;
    const l = Math.min(d, loss);
    d -= l;
    lost += l;
  }
  if (S.line[i] === 1) {
    const o = Math.floor((d * (T.lnOutPm[i] ?? 0)) / 1000);
    d -= o;
    lost += o;
  }
  if (lost > 0) S.lineMm[i] = (S.lineMm[i] ?? 0) + lost;
  return d;
}

/**
 * Someone (but `but`) at the end of t − 1 in `band` and `line`, from her slot behind to `ahead` pu
 * in front of her: that line is taken for her.
 */
function lineTaken(c: Ctx, i: number, band: number, line: number, ahead = -1, but = -1): boolean {
  const { S, T, n } = c;
  const pi = S.pos0[i] ?? 0;
  const slot = T.lnSlot[i] ?? 0;
  const front = ahead >= 0 ? ahead : (T.lnLook[i] ?? 0) + slot;
  for (let j = 0; j < n; j++) {
    if (j === i || j === but || (c.live & (1 << j)) === 0) continue;
    if ((S.alt0[j] ?? 0) !== band || (S.line0[j] ?? 0) !== line) continue;
    const d = (S.pos0[j] ?? 0) - pi;
    if (d > -slot && d <= front) return true;
  }
  return false;
}

/** She moves to `to`: the lateral move's metres start, the event is logged. */
function switchLine(
  c: Ctx,
  i: number,
  F: FlightConstants,
  to: number,
  cause: number,
  band: number,
  diagonal: boolean,
): void {
  const S = c.S;
  const from = S.line[i] ?? 0;
  S.line[i] = to;
  S.swTick[i] = c.t + 1;
  S.swCause[i] = cause;
  S.latLeft[i] = (S.latLeft[i] ?? 0) + (c.T.lnSwitch[i] ?? 0);
  S.latTicks[i] = F.moveTicks;
  S.lineSwitches[i] = (S.lineSwitches[i] ?? 0) + 1;
  S.boxed[i] = 0;
  c.rec.lineSwitch(c.t, i, posMm(c, i), {
    from,
    to,
    cause: SW_NAMES[cause] ?? "pass",
    band,
    ...(diagonal ? { diagonal: true } : {}),
  });
}

/**
 * Step B4b, holding her band (two lines): the door she takes (she checks, a door closed on her last
 * tick), the door she closes (one that just moved to her other line behind her: slot 31), back to
 * the inside when it pays and is clear (escape), and the side move out of dirty air after her
 * intelligence's ticks, unless she is boxed in (someone alongside) or her intelligence sees the
 * other line taken ahead. Every read of another runner is the step-A snapshot (INV-4) and reads
 * metres, bands and lines only (INV-3). Returns true when she moved this tick.
 */
function lineMoves(c: Ctx, i: number, F: FlightConstants, x: number, run: number): boolean {
  const { T, S, n } = c;
  const t = c.t;
  const alt = S.alt[i] ?? 0;
  const me = S.line[i] ?? 0;
  const pi = S.pos0[i] ?? 0;
  const pu = c.posPerMm;
  // the door closed on her (by one ahead within twice doorMm that moved into her line at t − 1)
  for (let k = 0; k < n && c.swLast; k++) {
    if (k === i || (c.live & (1 << k)) === 0 || S.swCause0[k] !== SW_DOOR) continue;
    if ((S.swTick0[k] ?? 0) !== t || S.line0[k] !== me || (S.alt0[k] ?? 0) !== alt) continue;
    const d = (S.pos0[k] ?? 0) - pi;
    if (d <= 0 || d > 2 * F.doorMm * pu) continue;
    S.latLeft[i] = (S.latLeft[i] ?? 0) + F.doorLossMm * pu;
    S.latTicks[i] = Math.max(S.latTicks[i] ?? 0, F.moveTicks);
    S.dirtyRun[i] = 0;
    return true;
  }
  if ((S.latTicks[i] ?? 0) > 0) return false;
  // she closes the door on one that moved to her other line at t − 1, within doorMm behind her
  if (c.swLast && S.doorFlight[i] === 0 && (S.doorTests[i] ?? 0) < DOOR_TESTS_MAX)
    for (let j = 0; j < n; j++) {
      if (j === i || (c.live & (1 << j)) === 0 || S.swCause0[j] !== SW_PASS) continue;
      if ((S.swTick0[j] ?? 0) !== t || (S.alt0[j] ?? 0) !== alt || S.line0[j] === me) continue;
      const d = pi - (S.pos0[j] ?? 0);
      if (d <= 0 || d > F.doorMm * pu) continue;
      if (lineTaken(c, i, alt, 1 - me, T.lnSlot[i] ?? 0, j)) break;
      const k = S.doorTests[i] ?? 0;
      S.doorTests[i] = k + 1;
      const byte = ((T.u31[i] ?? 0) >>> (8 * k)) & 255;
      if (byte * 1000 >= (T.lnDoorP[i] ?? 0) * 256) break;
      switchLine(c, i, F, 1 - me, SW_DOOR, alt, false);
      S.doorFlight[i] = 1;
      S.doorsClosed[i] = (S.doorsClosed[i] ?? 0) + 1;
      c.rec.doorClosed(t, i, posMm(c, i), j, alt, 1 - me);
      return true;
    }
  // back inside (escape): the outside line costs more than the move for what is left of her line
  if (me === 1 && run === 0 && t + 1 - (S.swTick[i] ?? 0) >= F.backTicks) {
    const left = Math.max(0, (T.flB[x] ?? 0) - pi);
    const worth = Math.floor((left * (T.lnOutPm[i] ?? 0)) / 1000) > (T.lnSwitch[i] ?? 0);
    if (worth && !lineTakenBehind(c, i, alt, 0, F.backMm * pu)) {
      switchLine(c, i, F, 0, SW_ESCAPE, alt, false);
      return true;
    }
  }
  // she moves out to pass when the one ahead holds her up (blocked), not for the dirty air alone
  const held = S.blkRun[i] ?? 0;
  if (held === 0) {
    S.boxed[i] = 0;
    return false;
  }
  if (held < (T.lnSideAt[i] ?? 0)) return false;
  // boxed in: someone alongside in her other line; she can only climb or wait
  if (S.side[i] === 1) {
    S.boxedTicks[i] = (S.boxedTicks[i] ?? 0) + 1;
    if (S.boxed[i] === 0) {
      S.boxed[i] = 1;
      c.rec.boxedIn(t, i, posMm(c, i), alt, alongside(c, i, alt, 1 - me), S.lnAhead[i] ?? -1);
    }
    return false;
  }
  S.boxed[i] = 0;
  // her intelligence reads the other line ahead (0 m at intelligence 0: she moves blind)
  if (lineTaken(c, i, alt, 1 - me, T.lnLook[i] ?? 0)) return false;
  switchLine(c, i, F, 1 - me, SW_PASS, alt, false);
  S.dirtyRun[i] = 0;
  S.blkRun[i] = 0;
  return true;
}

/** The inside of `band` is clear from `back` pu behind her to her look ahead (escape). */
function lineTakenBehind(c: Ctx, i: number, band: number, line: number, back: number): boolean {
  const { S, T, n } = c;
  const pi = S.pos0[i] ?? 0;
  const front = (T.lnLook[i] ?? 0) + (T.lnSlot[i] ?? 0);
  for (let j = 0; j < n; j++) {
    if (j === i || (c.live & (1 << j)) === 0) continue;
    if ((S.alt0[j] ?? 0) !== band || (S.line0[j] ?? 0) !== line) continue;
    const d = (S.pos0[j] ?? 0) - pi;
    if (d > -back && d <= front) return true;
  }
  return false;
}

/** The nearest runner alongside in `line` of `band` (the one who boxes her in), −1 = none. */
function alongside(c: Ctx, i: number, band: number, line: number): number {
  const { S, n } = c;
  const pi = S.pos0[i] ?? 0;
  let best = -1;
  let bd = Number.MAX_SAFE_INTEGER;
  for (let j = 0; j < n; j++) {
    if (j === i || (c.live & (1 << j)) === 0) continue;
    if ((S.alt0[j] ?? 0) !== band || (S.line0[j] ?? 0) !== line) continue;
    const d = Math.abs((S.pos0[j] ?? 0) - pi);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

/**
 * R9: the flight flows into the next planned one without touching down: down to its band (no
 * dive, no loss) or up to it, paying the climb if the tank allows (else she holds her band).
 */
function chainNext(c: Ctx, i: number, k: number, F: FlightConstants): void {
  const { T, S } = c;
  S.flK[i] = k + 1;
  const x = i * FLIGHTS_MAX + k;
  S.flRes[i] = Math.max(
    0,
    (S.flRes[i] ?? 0) - (S.flHoldLeft[i] ?? 0) - (T.flClimb[x] ?? 0) - (T.flHold[x] ?? 0),
  );
  S.flHoldLeft[i] = 0;
  const alt = S.alt[i] ?? 0;
  const pos = S.pos[i] ?? 0;
  const dist = Math.max(0, (T.flB[x] ?? 0) - pos);
  const style = T.style[i] ?? 0;
  const liftF = holdLift(F, style, T.liftF[i] ?? 1000);
  const jr = jrNow(T, S, i, S.seg[i] ?? 0);
  const energy = S.energy[i] ?? 0;
  let band = T.flBand[x] ?? alt;
  let cost = band > alt ? (band - alt) * (T.climbMe[i] ?? 0) : 0;
  if (cost > 0 && energy - cost < jr + holdMe(F, bandPu(F, band, dist), c.posPerMm, liftF)) {
    band = alt;
    cost = 0;
  }
  const hold = holdMe(F, bandPu(F, band, dist), c.posPerMm, liftF);
  S.energy[i] = energy - cost;
  S.energyClimb[i] = (S.energyClimb[i] ?? 0) + cost;
  S.flRes[i] = (S.flRes[i] ?? 0) + hold;
  S.flHoldLeft[i] = hold;
  S.flCur[i] = k + 1;
  S.holdPu[i] = 0;
  S.holdBilled[i] = 0;
  S.altTarget[i] = band;
  if (band < alt) {
    S.flPhase[i] = 3;
    S.altTimer[i] = wingOf(F, style).diveTicks;
  } else if (band > alt) {
    const wing = wingOf(F, style);
    const v = mms(c, S.vCore[i] ?? 0);
    S.flPhase[i] = 1;
    S.climbTk[i] = wing.climbTicks;
    S.altTimer[i] = wing.climbTicks;
    c.rec.takeoff(c.t, i, posMm(c, i), {
      band,
      cost,
      fromBand: alt,
      climbTicks: wing.climbTicks,
      vMms: v,
      vAfterMms: v,
      airPm: T.airOff[x] ?? 0,
      style: wing.style,
    });
  }
}

/**
 * A planned takeoff (R3): the plan's reserve for this flight is released, then she climbs the
 * highest band ≤ the planned one whose climb leaves `energy ≥ jr + reserve + hold of that band`
 * (a cornisa climbs at `cornisaPm`, a jump in progress already holds band 1). None: `noLift`,
 * she stays on the ground with no damage and no draw. Exhausted, or past the planned end: no lift.
 * Leaving the ground she keeps her wing's `liftSpeedPm` of the body speed (S1).
 */
function takeoff(c: Ctx, i: number, k: number, F: FlightConstants): void {
  const { T, S } = c;
  S.flK[i] = k + 1;
  const x = i * FLIGHTS_MAX + k;
  S.flRes[i] = Math.max(0, (S.flRes[i] ?? 0) - (T.flClimb[x] ?? 0) - (T.flHold[x] ?? 0));
  const pos = S.pos[i] ?? 0;
  const end = T.flB[x] ?? 0;
  const energy = S.energy[i] ?? 0;
  const from = flag(S, i, F_AIRBORNE) ? 1 : 0;
  const target = T.flBand[x] ?? 1;
  const corn = T.flCorn[x] === 1;
  const unit = floorDiv((T.climbMe[i] ?? 0) * (corn ? F.cornisaPm : 1000), 1000);
  const jr = jrNow(T, S, i, S.seg[i] ?? 0);
  const style = T.style[i] ?? 0;
  const liftF = holdLift(F, style, T.liftF[i] ?? 1000);
  const dist = Math.max(0, end - pos);
  let band = 0;
  let cost = 0;
  let hold = 0;
  if (!flag(S, i, F_EXHAUSTED) && pos < end)
    for (let b = target; b > from; b--) {
      const cb = (b - from) * unit;
      const hb = holdMe(F, bandPu(F, b, dist), c.posPerMm, liftF);
      if (energy - cb >= jr + hb) {
        band = b;
        cost = cb;
        hold = hb;
        break;
      }
    }
  if (band === 0) {
    S.noLift[i] = (S.noLift[i] ?? 0) + 1;
    S.belowPlan[i] = (S.belowPlan[i] ?? 0) + 1;
    const need =
      (target - from) * unit + holdMe(F, bandPu(F, target, dist), c.posPerMm, liftF) + jr;
    c.rec.noLift(c.t, i, posMm(c, i), Math.max(0, need), energy);
    return;
  }
  S.energy[i] = energy - cost;
  S.energyClimb[i] = (S.energyClimb[i] ?? 0) + cost;
  S.flRes[i] = (S.flRes[i] ?? 0) + hold;
  S.flHoldLeft[i] = hold;
  setFlag(S, i, F_AIRBORNE);
  clearFlag(S, i, F_PENDING_JUMP);
  endBurst(S.pulse, i);
  const wing = wingOf(F, style);
  const v0 = S.vCore[i] ?? 0;
  if (from === 0) S.vCore[i] = floorDiv(v0 * wing.liftSpeedPm, 1000);
  // F7 (round 5): from the ground she climbs band 1 too, at her wing's pace
  const alt = F.climbFromGround ? from : Math.max(1, from);
  S.alt[i] = alt;
  S.altTarget[i] = band;
  S.flPhase[i] = alt < band ? 1 : 2;
  S.climbTk[i] = climbTicksOf(F, style, corn);
  S.altTimer[i] = S.climbTk[i] ?? 1;
  S.flCur[i] = k + 1;
  S.holdPu[i] = 0;
  S.holdBilled[i] = 0;
  S.flights[i] = (S.flights[i] ?? 0) + 1;
  S.knocked[i] = 0;
  S.overWon[i] = 0;
  S.sideWon[i] = 0;
  S.belowCounted[i] = 0;
  S.dirtyRun[i] = 0;
  S.flApex[i] = alt;
  S.apexMax[i] = Math.max(S.apexMax[i] ?? 0, alt);
  if (band < target) below(c, i);
  c.rec.takeoff(c.t, i, posMm(c, i), {
    band,
    cost,
    fromBand: from,
    climbTicks: S.climbTk[i] ?? 1,
    vMms: mms(c, v0),
    vAfterMms: mms(c, S.vCore[i] ?? 0),
    airPm: T.airOff[x] ?? 0,
    style: wing.style,
  });
}

/**
 * Holding a band (R4, step B9): `holdE` per band per 100 m at liftF, billed on the metres moved,
 * × the band's `bandHoldPm` (L2), × (1000 − airHoldK × air) for her own air (L1) and × her
 * `dirtyPm` in dirty air (L3); the wing's `holdPm` folds into liftF (S1). If paying breaks `jr`
 * plus the reserve left, she does not pay and starts down this tick (L6 decides how she lands).
 */
function holdTick(c: Ctx, i: number, F: FlightConstants, vOut: number, seg: number): void {
  const { T, S } = c;
  const air =
    (S.alt[i] ?? 0) < F.ownAirFromBand
      ? 0
      : (T.airOff[i * FLIGHTS_MAX + Math.max(0, (S.flCur[i] ?? 1) - 1)] ?? 0);
  let m = 1000 - F.airHoldK * air;
  if ((S.dirty[i] ?? 0) > 0) m = Math.floor((m * (T.dirtyPm[i] ?? 1000)) / 1000);
  // `holdMe` and `bandPu` written out (the same integers): the hold runs every tick in the air
  const den = c.posPerMm * 1000 * Math.max(1, T.liftH[i] ?? 1000);
  const num = F.holdE * 10_000;
  // F3: after a won over she holds at the price of the band she left (clean air)
  const alt = Math.max(0, (S.alt[i] ?? 0) - (F.overCleanHold && S.overWon[i] === 1 ? 1 : 0));
  const clean = Math.floor((alt * vOut * (F.bandHoldPm[alt] ?? 1000)) / 1000);
  const inc = m === 1000 ? clean : Math.floor((clean * m) / 1000);
  if (inc > clean) S.holdExtra[i] = (S.holdExtra[i] ?? 0) + Math.floor(((inc - clean) * num) / den);
  const pu = (S.holdPu[i] ?? 0) + inc;
  S.holdPu[i] = pu;
  const due = Math.floor((pu * num) / den) - (S.holdBilled[i] ?? 0);
  if (due <= 0) return;
  const covered = Math.min(due, S.flHoldLeft[i] ?? 0);
  const resAfter = (S.flRes[i] ?? 0) - covered;
  const energy = S.energy[i] ?? 0;
  if (energy - due < (T.jr[is(i, seg)] ?? 0) + resAfter) {
    startDescent(c, i, F, 1);
    return;
  }
  S.energy[i] = energy - due;
  S.holdBilled[i] = (S.holdBilled[i] ?? 0) + due;
  S.energyHold[i] = (S.energyHold[i] ?? 0) + due;
  S.flHoldLeft[i] = (S.flHoldLeft[i] ?? 0) - covered;
  S.flRes[i] = resAfter;
}

/** The descent starts (R1): no thrust, the body speed held, one band every `diveTicks`. */
function startDescent(c: Ctx, i: number, F: FlightConstants, cause: number): void {
  const S = c.S;
  const from = S.alt[i] ?? 0;
  S.flPhase[i] = 3;
  S.fromBand[i] = from;
  S.altTarget[i] = 0;
  S.fallCause[i] = cause;
  S.altTimer[i] = wingOf(F, c.T.style[i] ?? 0).diveTicks;
  S.diveAdded[i] = 0;
  S.diveAirMm[i] = 0;
  if (cause === 1) below(c, i);
  c.rec.diveStart(
    c.t,
    i,
    posMm(c, i),
    Math.max(1, from),
    mms(c, S.vCore[i] ?? 0),
    cause === 1 ? "energy" : S.knocked[i] === 1 ? "knock" : "plan",
  );
}

/** F3: the dive's Δv from `from`, plus `overDivePm` ‰ of one band's share after a won line. */
function diveTotal(c: Ctx, i: number, from: number): number {
  const F = c.F;
  const dv = c.T.diveV[i * 4 + from] ?? 0;
  if (F === null || from <= 0) return dv;
  // F3: a line won over; two lines: a line won by the side (the larger, never both)
  const over = F.overDivePm > 0 && c.S.overWon[i] === 1 ? F.overDivePm : 0;
  const side = F.lines && c.S.sideWon[i] === 1 ? F.sideDivePm : 0;
  const pm = Math.max(over, side);
  if (pm <= 0) return dv;
  return dv + floorDiv(floorDiv(dv, from) * pm, 1000);
}

/**
 * F9: another unfinished runner on the ground, from `nerveBackM` behind to `nerveM` ahead of her,
 * in the start-of-tick snapshot (step A2), so lane order never changes it.
 */
function trafficAtTouchdown(c: Ctx, F: FlightConstants, i: number): boolean {
  const { S, n } = c;
  const me = S.pos0[i] ?? 0;
  const ahead = F.nerveM * 1000 * c.posPerMm;
  const back = F.nerveBackM * 1000 * c.posPerMm;
  for (let j = 0; j < n; j++) {
    if (j === i || (c.live & (1 << j)) === 0 || (S.alt0[j] ?? 0) !== 0) continue;
    const d = (S.pos0[j] ?? 0) - me;
    if (d >= -back && d <= ahead) return true;
  }
  return false;
}

/**
 * Touchdown (R7): from band 2 or 3 the dive adds `diveV[band]` as a surge that `kDecel` brings
 * back down (≈ Δv² / (2 kDecel) metres); with F2 part of it came band by band in the air and the
 * rest lands now. F9: diving into traffic is a nerve test (slot 29): held, the dive × (1000 +
 * nerveBonusPm) ‰; flinched, the wings open: the air share is lost and she pays her landing. L6:
 * a descent the tank forced lands with her `landPm` and no dive. The flight's unspent hold reserve
 * is released and a running sprint plan replans.
 */
function touchdown(c: Ctx, i: number): void {
  const { R, T, S } = c;
  const F = c.F;
  const from = S.fromBand[i] ?? 0;
  S.flPhase[i] = 0;
  S.alt[i] = 0;
  S.flCur[i] = 0;
  clearFlag(S, i, F_AIRBORNE);
  if (F?.lines) {
    // two lines: on the ground there are none; the next flight starts inside
    S.line[i] = 0;
    S.latLeft[i] = 0;
    S.latTicks[i] = 0;
    S.boxed[i] = 0;
    S.blkRun[i] = 0;
    S.swTick[i] = 0;
    S.swCause[i] = 0;
    S.doorFlight[i] = 0;
  }
  S.flRes[i] = Math.max(0, (S.flRes[i] ?? 0) - (S.flHoldLeft[i] ?? 0));
  S.flHoldLeft[i] = 0;
  const p = posMm(c, i);
  const forced = S.fallCause[i] === 1;
  if (forced) S.falls[i] = (S.falls[i] ?? 0) + 1;
  const added = S.diveAdded[i] ?? 0;
  const airMm = floorDiv(S.diveAirMm[i] ?? 0, c.velPerMms * 15);
  S.diveAdded[i] = 0;
  S.diveAirMm[i] = 0;
  if (forced && F?.forcedLand) {
    const v0 = S.vCore[i] ?? 0;
    const v1 = scale(v0, T.landPm[i] ?? 1000);
    S.vCore[i] = v1;
    c.rec.touchdown(c.t, i, p, Math.max(1, from), mms(c, v0 - v1), "energy");
  } else {
    let flinched = false;
    if (from >= 2) {
      let dv = diveTotal(c, i, from);
      // F9: the nerve test, at most nerveMax per race, 16 bits of the pre-drawn slot 29 each
      const k = S.nerveTests[i] ?? 0;
      if (F !== null && F.nerveM > 0 && k < F.nerveMax && trafficAtTouchdown(c, F, i)) {
        S.nerveTests[i] = k + 1;
        const u = ((T.u29[i] ?? 0) >>> (16 * k)) & 0xffff;
        const pPm = T.nerveP[i] ?? 0;
        flinched = u * 1000 < pPm * 65536;
        if (!flinched) {
          S.nerveHeld[i] = (S.nerveHeld[i] ?? 0) + 1;
          dv = floorDiv(dv * (1000 + F.nerveBonusPm), 1000);
        }
        c.rec.nerve(c.t, i, p, !flinched, pPm, flinched ? 0 : mms(c, dv));
      }
      if (flinched && F !== null) {
        // she opens the wings: the share gained in the air is gone and she pays her landing
        S.surge[i] = Math.max(0, (S.surge[i] ?? 0) - added);
        const v0 = S.vCore[i] ?? 0;
        const v1 = scale(v0, T.landPm[i] ?? 1000);
        S.vCore[i] = v1;
        c.rec.touchdown(c.t, i, p, from, mms(c, v0 - v1) + mms(c, added), "nerve");
      } else {
        const before = S.vCore[i] ?? 0;
        if (F?.diveSurge) S.surge[i] = (S.surge[i] ?? 0) + dv - added;
        else S.vCore[i] = before + dv;
        const dvMms = mms(c, dv);
        const vBefore = mms(c, before);
        const surgeMm = floorDiv(dvMms * dvMms, 2 * R.kDecel) + airMm;
        S.dives[i] = (S.dives[i] ?? 0) + 1;
        if (from === 3) S.grandDives[i] = (S.grandDives[i] ?? 0) + 1;
        S.diveGainMm[i] = (S.diveGainMm[i] ?? 0) + surgeMm;
        S.peakMms[i] = Math.max(S.peakMms[i] ?? 0, vBefore + dvMms);
        c.rec.dive(c.t, i, p, {
          fromBand: from,
          gainMms: dvMms,
          vBeforeMms: vBefore,
          surgeTicks: ceilDiv(dv, Math.max(1, R.kDecel)),
          surgeMm,
          ...(F?.diveAirShare ? { airMms: mms(c, added), airMm } : {}),
        });
      }
    }
    if (!flinched) {
      const cause = forced ? "energy" : S.knocked[i] === 1 ? "knock" : "plan";
      c.rec.touchdown(c.t, i, p, Math.max(1, from), 0, cause);
    }
  }
  if (flag(S, i, F_PLAN_ACTIVE)) requestReplan(S, i, CAUSE_JUMP);
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
