/**
 * "What should she train?" after a race, from one runner's RaceLog data alone (results, ledger,
 * derived, events, frames): Umamusume's post-race tip ("¡Se quedó sin energía! Quizás deberías
 * entrenar Resistencia"). Each cause names the stat that governs it in the engine
 * (docs/race-engine.md) and is claimed only when the log shows it:
 *
 * | Cause (`reason`) | What the log shows | Stat, and why (spec section) |
 * | --- | --- | --- |
 * | `hpEmpty` | `hpEmptyMm` before the winner's (or she emptied and the winner did not) | stamina divides the hp drain (6); courage cuts the final-phase fatigue (6) |
 * | `cruise` | lower agility: the share of her cruise agility gives against the winner's, timed over the middle phase and the curves | agility sets cruise and the curves factor (5.1, 7) |
 * | `start` | time lost in the start phase with a lower technique and the acceleration it gives | technique sets acceleration (5.1, 5.2) |
 * | `stall` | failed jumps and the ticks she stood still | technique sets the lift (14.2, 14.3) |
 * | `landings` | landings with a worse landing factor and technique than the winner | technique sets the landing loss (14.2) |
 * | `overheat` | overheated ticks, with a cap courage moves | courage raises the heat cap (8.2, 8.3) |
 * | `heatCapped` | heat at the boost gate in the final while energy was left at the line | courage raises the heat cap (8.2, 9.3) |
 * | `pace` | a slower pace judgement than the winner's, from a lower window centre | intelligence raises the centre of the pace window (10.2); the race position's letter scales it (10, ADR-0008) |
 * | `plan` | energy left at the line that the sprint plan did not see | intelligence narrows the plan error (10.3) |
 * | `skills` | skills whose trigger held and whose roll failed | intelligence sets activation (15.2) |
 * | `broken` | broken wings | the workshop repairs durability (8.4) |
 * | `worn` | wings that ended the race below half their durability | the workshop repairs durability (8.4) |
 *
 * Ranking (most costly first): the causes whose time the log gives, by that time against the
 * winner, then the ones it gives no time for (`UNTIMED_ORDER`). A timed cause under
 * `ADVICE_MIN_MILLI` is not worth a tip. The times are the log's own numbers or differences of
 * them: ledger ticks (start phase, stall), the time to run the log's distances at the speeds of
 * `derived` (her minimum speed against her cruise, her cruise against the winner's, her pace
 * judgement against the winner's), a missed speed skill's speed × duration, the time after the
 * break at `brokenSpeedPm`. Nothing is simulated again; words belong to each reader.
 */
import {
  type Aptitude,
  type Position,
  type RaceEntry,
  type RaceGeometry,
  type RaceLog,
  type RunnerDerived,
  SEGMENT_TYPES,
  type StatName,
} from "@falconess/schema";
import { getRuleset } from "@falconess/sim";
import { phaseIndexAt, type Runner, roundDiv, runnersInPlaceOrder, TICK_HZ } from "./log.js";

/** The stat a tip names, or the workshop (repair). */
export type AdviceStat = StatName | "workshop";

type Item<R extends string, S extends AdviceStat, E> = {
  readonly reason: R;
  readonly stat: S;
  /** Milli-ticks the cause cost her against the winner; null when the log gives no time for it. */
  readonly costMilli: number | null;
  readonly evidence: E;
};

/** One tip: why, which stat, the log's numbers that show it. */
export type AdviceItem =
  | Item<
      "hpEmpty",
      "stamina" | "courage",
      {
        /** Where her hp ran out, and the metres left at minimum speed. */
        readonly atMm: number;
        readonly restMm: number;
        /** Where the winner's ran out; null when it never did. */
        readonly winnerAtMm: number | null;
        /** She ran out inside the final phase (where courage cuts the drain). */
        readonly inFinal: boolean;
      }
    >
  | Item<
      "cruise",
      "agility",
      {
        readonly agility: number;
        readonly winnerAgility: number;
        /** Milli-ticks lost at cruise on the middle phase's other terrain, and on curves. */
        readonly middleMilli: number;
        readonly curvesMilli: number;
      }
    >
  | Item<
      "start",
      "technique",
      { readonly deltaTicks: number; readonly accelMms2: number; readonly winnerAccelMms2: number }
    >
  | Item<"stall", "technique", { readonly jumpsFailed: number; readonly ticks: number }>
  | Item<
      "landings",
      "technique",
      {
        readonly count: number;
        /** Speed lost in all her landings (mm/s). */
        readonly lossMms: number;
        readonly landPm: number;
        readonly winnerLandPm: number;
      }
    >
  | Item<"overheat", "courage", { readonly ticks: number; readonly heatCap: number }>
  | Item<
      "heatCapped",
      "courage",
      {
        /** Where her heat first stood at the boost gate in the final phase. */
        readonly atMm: number;
        /** Energy left at the line (milli-units). */
        readonly energyLeft: number;
        readonly heatCap: number;
      }
    >
  | Item<
      "pace",
      "intelligence",
      {
        /** Her judgement per phase and the winner's (‰ of cruise), and the windows' centres. */
        readonly pace: readonly number[];
        readonly winnerPace: readonly number[];
        readonly centrePm: number;
        readonly winnerCentrePm: number;
        /** The phase where her judgement was the slowest (0 start, 1 middle, 2 final). */
        readonly phase: number;
        /**
         * Her race position and its letter, which scales the Intelligence the centre follows
         * (10, ADR-0008): a worse letter is a lower centre, whatever she trained.
         */
        readonly position: Position;
        readonly letter: Aptitude;
      }
    >
  | Item<
      "plan",
      "intelligence",
      {
        /** Energy left at the line, and the part of it the plan did not see (milli-units). */
        readonly energyLeft: number;
        readonly unseen: number;
        readonly planErrPm: number;
      }
    >
  | Item<"skills", "intelligence", { readonly skillIds: readonly string[]; readonly pAct: number }>
  | Item<
      "broken",
      "workshop",
      { readonly atMm: number | null; readonly fromStart: boolean; readonly speedPm: number }
    >
  | Item<"worn", "workshop", { readonly durabilityEnd: number; readonly durabilityMax: number }>;

export type AdviceReason = AdviceItem["reason"];

/** Tips a race gives at most. */
export const ADVICE_MAX = 2;
/** A cause whose time the log gives is a tip from 0.1 s on (milli-ticks). */
export const ADVICE_MIN_MILLI = (TICK_HZ * 1000) / 10;
/** Energy left worth a tip: a tenth of the tank (‰). */
const ENERGY_LEFT_PM = 100;
/** A landing factor this much worse than the winner's (‰, ≈ 100 technique) is worth a tip. */
const LANDING_GAP_PM = 10;
/** Wings below this share of their durability (‰) at the line need the workshop. */
const WORN_PM = 500;

/** The order of two causes with the same time. */
const ORDER: readonly AdviceReason[] = [
  "hpEmpty",
  "cruise",
  "start",
  "stall",
  "landings",
  "overheat",
  "heatCapped",
  "pace",
  "plan",
  "skills",
  "broken",
  "worn",
];
/**
 * The order of the causes the log gives no time for: what certainly cost time (wings broken
 * without a break event), energy left unspent, then the smaller losses, worn wings last (they
 * matter for the next race).
 */
const UNTIMED_ORDER: readonly AdviceReason[] = [
  "broken",
  "heatCapped",
  "plan",
  "overheat",
  "landings",
  "skills",
  "worn",
];

// --- the course in pieces --------------------------------------------------------------------

/** A stretch of the course inside one segment and one phase. */
type Piece = { readonly seg: number; readonly ph: 0 | 1 | 2; readonly lenMm: number };

/** The course between two positions, split at segment and phase boundaries. */
function pieces(g: RaceGeometry, fromMm: number, toMm: number): Piece[] {
  const cuts = [g.startEndMm, g.finalStartMm];
  const out: Piece[] = [];
  g.segments.forEach((s, seg) => {
    const lo = Math.max(s.startMm, fromMm);
    const hi = Math.min(s.endMm, toMm);
    const bounds = [lo, ...cuts.filter((c) => c > lo && c < hi), hi];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i] ?? 0;
      const b = bounds[i + 1] ?? 0;
      if (b > a) out.push({ seg, ph: phaseIndexAt(g, a), lenMm: b - a });
    }
  });
  return out;
}

/** Milli-ticks to run `lenMm` at `vMms`. */
const milliAt = (lenMm: number, vMms: number) => roundDiv(TICK_HZ * 1000 * lenMm, vMms);

/** Milli-ticks to run `lenMm` at a cruise `vMms` judged `fromPm`, had she judged `toPm` instead. */
const milliRepaced = (lenMm: number, vMms: number, fromPm: number, toPm: number) =>
  roundDiv(TICK_HZ * 1000 * lenMm * (1000 + fromPm), vMms * (1000 + toPm));

const cruiseOf = (d: RunnerDerived, p: Piece) => d.segments[p.seg]?.cruiseMms[p.ph] ?? 0;

// --- the causes --------------------------------------------------------------------------------

type Pair = { readonly log: RaceLog; readonly r: Runner; readonly w: Runner };

/** hp ran out before the winner's did: the metres in between at her minimum speed, not cruise. */
function hpEmpty({ log, r, w }: Pair): AdviceItem | undefined {
  const at = r.result.ledger.hpEmptyMm;
  const d = r.derived;
  if (at === null || !d) return undefined;
  const winnerAt = w.result.ledger.hpEmptyMm;
  const until = winnerAt ?? log.geometry.lengthMm;
  if (until <= at) return undefined;
  let costMilli = 0;
  for (const p of pieces(log.geometry, at, until)) {
    const vMin = d.segments[p.seg]?.vMinMms[p.ph] ?? 0;
    const cruise = cruiseOf(d, p);
    if (vMin > 0 && cruise > 0) costMilli += milliAt(p.lenMm, vMin) - milliAt(p.lenMm, cruise);
  }
  if (costMilli <= 0) return undefined;
  const inFinal = at >= log.geometry.finalStartMm;
  // stamina divides every tick's drain; courage only the final's: courage when she emptied in the
  // final with a reserve as large as the winner's and a heavier final fatigue
  const wd = w.derived;
  const courage =
    inFinal && wd !== undefined && d.stamDiv >= wd.stamDiv && d.fatiguePm > wd.fatiguePm;
  return {
    reason: "hpEmpty",
    stat: courage ? "courage" : "stamina",
    costMilli,
    evidence: { atMm: at, restMm: log.geometry.lengthMm - at, winnerAtMm: winnerAt, inFinal },
  };
}

const CURVES = SEGMENT_TYPES.indexOf("curves");

/** The curve terms of a runner's frame (7): equal ones make two curve factors comparable. */
const curveTraits = (e: RaceEntry) =>
  `${e.traits.curvesScalePm}/${e.traits.segMultiplyPm[CURVES]}/${e.traits.segOverridePm[CURVES]}`;

/**
 * Lower agility (5.1, 6, 7). A segment's cruise is agility's `vA` times the PW, terrain, style
 * and pace terms, and its minimum speed the same without `vA`: cruise ÷ minimum speed is what
 * agility gives (with the style's pace knob, 1000 in v1), whatever the frame. The time lost is her
 * own cruise time over the middle phase and every curve, less that time at the winner's agility:
 * scaled by the two cruise ÷ minimum-speed ratios and, on a curve, by the two curve factors when
 * both frames carry the same curve terms. Terrain and frame terms stay hers, so a frame's
 * advantage is never agility's.
 */
function cruise({ log, r, w }: Pair): AdviceItem | undefined {
  const d = r.derived;
  const wd = w.derived;
  const agility = r.entry.stats.agility;
  const winnerAgility = w.entry.stats.agility;
  if (!d || !wd || agility >= winnerAgility) return undefined;
  const sameCurves = curveTraits(r.entry) === curveTraits(w.entry);
  let middleMilli = 0;
  let curvesMilli = 0;
  for (const p of pieces(log.geometry, 0, log.geometry.lengthMm)) {
    const curves = log.geometry.segments[p.seg]?.type === "curves";
    if (p.ph !== 1 && !curves) continue;
    const mine = d.segments[p.seg];
    const theirs = wd.segments[p.seg];
    const v = mine?.cruiseMms[p.ph] ?? 0;
    const vMin = mine?.vMinMms[p.ph] ?? 0;
    const wv = theirs?.cruiseMms[p.ph] ?? 0;
    const wvMin = theirs?.vMinMms[p.ph] ?? 0;
    if (v <= 0 || vMin <= 0 || wv <= 0 || wvMin <= 0) continue;
    const t = milliAt(p.lenMm, v);
    // three steps keep every product under 2^53
    let scaled = roundDiv(roundDiv(t * v, wv) * wvMin, vMin);
    const f = mine?.fPm ?? 0;
    const wf = theirs?.fPm ?? 0;
    if (curves && sameCurves && f > 0 && wf > 0) scaled = roundDiv(scaled * f, wf);
    if (curves) curvesMilli += t - scaled;
    else middleMilli += t - scaled;
  }
  if (middleMilli + curvesMilli <= 0) return undefined;
  return {
    reason: "cruise",
    stat: "agility",
    costMilli: middleMilli + curvesMilli,
    evidence: { agility, winnerAgility, middleMilli, curvesMilli },
  };
}

/**
 * A slower start phase than the winner's (5.1, 5.2) with a lower technique, and an acceleration
 * that technique keeps lower: acceleration ÷ minimum speed on the first segment, where the PW and
 * terrain terms cancel, below the winner's. Time: the start phase's ticks against the winner's.
 */
function start({ r, w }: Pair): AdviceItem | undefined {
  const deltaTicks = (r.result.ledger.phaseTicks[0] ?? 0) - (w.result.ledger.phaseTicks[0] ?? 0);
  const mine = r.derived?.segments[0];
  const theirs = w.derived?.segments[0];
  if (!mine || !theirs || r.result.dnf || deltaTicks <= 0) return undefined;
  if (r.entry.stats.technique >= w.entry.stats.technique) return undefined;
  const vMin = mine.vMinMms[0] ?? 0;
  const wvMin = theirs.vMinMms[0] ?? 0;
  if (vMin <= 0 || mine.accelMms2 * wvMin >= theirs.accelMms2 * vMin) return undefined;
  return {
    reason: "start",
    stat: "technique",
    costMilli: deltaTicks * 1000,
    evidence: { deltaTicks, accelMms2: mine.accelMms2, winnerAccelMms2: theirs.accelMms2 },
  };
}

/** Failed jumps: the ticks she stood still (lift = energy × technique, 14.2). */
function stall({ r }: Pair): AdviceItem | undefined {
  const L = r.result.ledger;
  if (L.jumpsFailed === 0 || L.stallTicks === 0) return undefined;
  return {
    reason: "stall",
    stat: "technique",
    costMilli: L.stallTicks * 1000,
    evidence: { jumpsFailed: L.jumpsFailed, ticks: L.stallTicks },
  };
}

/** Landings with a clearly worse landing factor than the winner's, from a lower technique. */
function landings({ r, w }: Pair): AdviceItem | undefined {
  const L = r.result.ledger;
  const landPm = r.derived?.landPm;
  const winnerLandPm = w.derived?.landPm;
  if (L.jumpsOk === 0 || landPm === undefined || winnerLandPm === undefined) return undefined;
  if (landPm > winnerLandPm - LANDING_GAP_PM) return undefined;
  if (r.entry.stats.technique >= w.entry.stats.technique) return undefined;
  return {
    reason: "landings",
    stat: "technique",
    costMilli: null,
    evidence: { count: L.jumpsOk, lossMms: L.landingLossMms, landPm, winnerLandPm },
  };
}

/** Courage moves her heat cap (not telemetry's, which governs at raw dissipation, 13.1). */
const courageMovesCap = (d: RunnerDerived) => d.capLim === d.heatCap;

/** Overheated ticks under a cap courage raises. */
function overheat({ r }: Pair): AdviceItem | undefined {
  const d = r.derived;
  const ticks = r.result.ledger.overheatTicks;
  if (!d || ticks === 0 || !courageMovesCap(d)) return undefined;
  return {
    reason: "overheat",
    stat: "courage",
    costMilli: null,
    evidence: { ticks, heatCap: d.heatCap },
  };
}

/**
 * The boost gate refused heat in the final (a sampled row whose heat plus one boost's heat is over
 * the cap, with energy above a boost's cost) and energy was left at the line, hp intact.
 */
function heatCapped({ log, r }: Pair): AdviceItem | undefined {
  const d = r.derived;
  const L = r.result.ledger;
  const frames = log.frames;
  const lane = r.entry.laneIndex;
  const row = frames?.runners[lane];
  if (!d || !row || L.hpEmptyMm !== null || !courageMovesCap(d)) return undefined;
  if (L.energyLeft * 1000 < ENERGY_LEFT_PM * r.entry.energy * 1000) return undefined;
  const R = getRuleset(log.rulesetVersion).race;
  const pulse = d.pulseMms > 0;
  const heatAdd = pulse ? R.pulseTicks * R.kH : R.kH;
  const cost = pulse ? R.pulseTicks * Math.floor((R.kE * R.pulseCostMult) / 1000) : R.kE;
  const i = row.heat.findIndex(
    (heat, k) =>
      (row.posMm[k] ?? 0) >= log.geometry.finalStartMm &&
      heat + heatAdd > d.capLim &&
      (row.energy[k] ?? 0) >= cost,
  );
  if (i < 0) return undefined;
  return {
    reason: "heatCapped",
    stat: "courage",
    costMilli: null,
    evidence: { atMm: row.posMm[i] ?? 0, energyLeft: L.energyLeft, heatCap: d.heatCap },
  };
}

/**
 * A slower pace judgement than the winner's from a lower intelligence (10.2): the window's draw
 * is luck, its centre rises with intelligence. Time: what judging like the winner would have
 * saved her over the whole course at her own cruise, at most the share the two centres explain
 * (the rest was the draw, which no stat trains).
 */
function pace({ log, r, w }: Pair): AdviceItem | undefined {
  const d = r.derived;
  const wd = w.derived;
  if (!d || !wd || d.paceCentrePm >= wd.paceCentrePm) return undefined;
  let drawn = 0;
  let centred = 0;
  for (const p of pieces(log.geometry, 0, log.geometry.lengthMm)) {
    const v = cruiseOf(d, p);
    const mine = d.pace[p.ph] ?? 0;
    if (v <= 0) continue;
    drawn +=
      milliRepaced(p.lenMm, v, mine, mine) - milliRepaced(p.lenMm, v, mine, wd.pace[p.ph] ?? 0);
    centred +=
      milliRepaced(p.lenMm, v, mine, d.paceCentrePm) -
      milliRepaced(p.lenMm, v, mine, wd.paceCentrePm);
  }
  const costMilli = Math.min(drawn, centred);
  if (costMilli <= 0) return undefined;
  let phase = 0;
  d.pace.forEach((pm, i) => {
    if (pm < (d.pace[phase] ?? 0)) phase = i;
  });
  return {
    reason: "pace",
    stat: "intelligence",
    costMilli,
    evidence: {
      pace: [...d.pace],
      winnerPace: [...wd.pace],
      centrePm: d.paceCentrePm,
      winnerCentrePm: wd.paceCentrePm,
      phase,
      position: r.entry.position,
      letter: r.entry.positionAptitude,
    },
  };
}

/**
 * Energy left at the line, hp intact, that her first sprint plan did not see (it perceived less
 * than she had, 10.3): the smaller of the two, worth a tenth of the tank and, for a pulse frame,
 * more than one pulse (a pulse frame leaves less than one by cadence).
 */
function plan({ log, r }: Pair): AdviceItem | undefined {
  const L = r.result.ledger;
  const d = r.derived;
  const first = (log.events ?? []).find(
    (e) => e.lane === r.entry.laneIndex && e.kind === "sprintPlan",
  );
  if (!d || first?.kind !== "sprintPlan" || L.hpEmptyMm !== null) return undefined;
  const unseen = first.energy - first.energyPerceived;
  const wasted = Math.min(L.energyLeft, unseen);
  const R = getRuleset(log.rulesetVersion).race;
  const pulse = d.pulseMms > 0 ? R.pulseTicks * Math.floor((R.kE * R.pulseCostMult) / 1000) : 0;
  const worth = Math.max(pulse + 1, ENERGY_LEFT_PM * r.entry.energy);
  if (wasted < worth) return undefined;
  return {
    reason: "plan",
    stat: "intelligence",
    costMilli: null,
    evidence: { energyLeft: L.energyLeft, unseen, planErrPm: d.planErrPm },
  };
}

/**
 * Skills whose trigger held and whose roll failed. Time: what each missed speed skill would have
 * given (speed × duration, run at her cruise where it missed); null when none of them is a speed
 * skill, or when the log has no events to place them.
 */
function skills({ log, r }: Pair): AdviceItem | undefined {
  const d = r.derived;
  const skillIds = r.result.ledger.skillsMissed;
  if (!d || skillIds.length === 0) return undefined;
  let costMilli: number | null = null;
  for (const e of log.events ?? []) {
    if (e.lane !== r.entry.laneIndex || e.kind !== "skillMiss") continue;
    const effect = r.entry.skills.find((s) => s.id === e.skillId)?.effect;
    const seg = log.geometry.segments.findIndex((s) => e.posMm < s.endMm);
    const v = d.segments[seg]?.cruiseMms[phaseIndexAt(log.geometry, e.posMm)] ?? 0;
    if (!effect || effect.speedMms <= 0 || effect.durationTicks === 0 || v <= 0) continue;
    costMilli = (costMilli ?? 0) + roundDiv(1000 * effect.speedMms * effect.durationTicks, v);
  }
  return {
    reason: "skills",
    stat: "intelligence",
    costMilli,
    evidence: { skillIds: [...skillIds], pAct: d.pAct },
  };
}

/** Broken wings: from the break to the line at `brokenSpeedPm` of every speed (8.4). */
function broken({ log, r }: Pair): AdviceItem | undefined {
  const { entry, result } = r;
  if (!result.broken) return undefined;
  const speedPm = r.derived?.brokenSpeedPm ?? 1000;
  const e = (log.events ?? []).find(
    (x) => x.lane === entry.laneIndex && x.kind === "durabilityBroken",
  );
  const fromStart = !e && entry.durabilityStart === 0;
  const from = e ? e.tick * 1000 : fromStart ? 0 : null;
  const costMilli =
    from === null || result.finishMilli === null || speedPm === 1000
      ? null
      : roundDiv((result.finishMilli - from) * (1000 - speedPm), 1000);
  return {
    reason: "broken",
    stat: "workshop",
    costMilli,
    evidence: { atMm: e ? e.posMm : null, fromStart, speedPm },
  };
}

/** Wings that ended below half their durability: the next race starts from there. */
function worn({ r }: Pair): AdviceItem | undefined {
  const { entry, result } = r;
  if (result.broken || result.durabilityEnd * 1000 >= WORN_PM * entry.durabilityMax * 1000)
    return undefined;
  return {
    reason: "worn",
    stat: "workshop",
    costMilli: null,
    evidence: { durabilityEnd: result.durabilityEnd, durabilityMax: entry.durabilityMax },
  };
}

const CAUSES: readonly ((pair: Pair) => AdviceItem | undefined)[] = [
  hpEmpty,
  cruise,
  start,
  stall,
  landings,
  overheat,
  heatCapped,
  pace,
  plan,
  skills,
  broken,
  worn,
];

const rank = (order: readonly AdviceReason[], item: AdviceItem) => order.indexOf(item.reason);

/**
 * Every cause the log shows for the runner in `lane`, timed ones first by their time against the
 * winner, then the untimed ones (see the module comment); empty for the winner and for a lane the
 * log does not have. No threshold: `raceAdvice` keeps the ones worth a tip.
 */
export function adviceCauses(log: RaceLog, lane: number): AdviceItem[] {
  const runners = runnersInPlaceOrder(log);
  const w = runners[0];
  const r = runners.find((x) => x.entry.laneIndex === lane);
  if (!w || !r || r === w) return [];
  const found = CAUSES.flatMap((cause) => cause({ log, r, w }) ?? []);
  const timed = found
    .filter((c): c is AdviceItem & { costMilli: number } => c.costMilli !== null)
    .sort((a, b) => b.costMilli - a.costMilli || rank(ORDER, a) - rank(ORDER, b));
  const untimed = found
    .filter((c) => c.costMilli === null)
    .sort((a, b) => rank(UNTIMED_ORDER, a) - rank(UNTIMED_ORDER, b));
  return [...timed, ...untimed];
}

/**
 * The tips of a race for the runner in `lane`: her causes worth one (a timed cause from
 * `ADVICE_MIN_MILLI` on, every untimed one), the first `ADVICE_MAX` of them.
 */
export function raceAdvice(log: RaceLog, lane: number): AdviceItem[] {
  return adviceCauses(log, lane)
    .filter((c) => c.costMilli === null || c.costMilli >= ADVICE_MIN_MILLI)
    .slice(0, ADVICE_MAX);
}
