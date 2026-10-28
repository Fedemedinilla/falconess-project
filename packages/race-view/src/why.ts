/**
 * "Why did I lose" from the log alone (docs/race-engine.md 20.3, 20.5, 20.6): one runner's phases
 * against the winner, her gains and time sinks from the ledger, her judgement, sprint plan, boost
 * modes, rule terms, terrain table, energy and body flows, and the skills that fired or missed.
 * Numbers only, straight from the log (differences of ledger values at most): the CLI and the web
 * word them, and both show the same rows because both read this model.
 */
import type { BoostMode, RaceEvent, RaceLog, SegmentType } from "@falconess/schema";
import { phaseIndexAt, type Runner } from "./log.js";

export type WhyPhase = {
  readonly ticks: number;
  /** Ticks against the winner's same phase; null for the winner and for a DNF. */
  readonly deltaTicks: number | null;
};

export type WhyGains = {
  /** Boost on-ticks per phase. */
  readonly boostTicks: readonly number[];
  readonly pulses: number;
  readonly draftTicks: number;
  readonly skillsActivated: number;
};

/** A time sink of the ledger (20.5), in the order the views list them. */
export type WhySink =
  | { readonly kind: "stall"; readonly ticks: number; readonly jumpsFailed: number }
  /** hp ran out at `atMm`; `restMm` metres were run at minimum speed. */
  | { readonly kind: "hpEmpty"; readonly atMm: number; readonly restMm: number }
  | { readonly kind: "landings"; readonly count: number; readonly lossMms: number }
  | { readonly kind: "detours"; readonly count: number }
  | { readonly kind: "overheat"; readonly ticks: number }
  | {
      readonly kind: "broken";
      /** Where they broke (the `durabilityBroken` event); null without the event. */
      readonly atMm: number | null;
      /** A frame that starts at durability 0 is broken from the start (no event). */
      readonly fromStart: boolean;
      /** PW before and after, when the break changed it. */
      readonly pw: { readonly before: number; readonly after: number } | null;
      /** `derived.brokenSpeedPm` when it is not neutral (8.4). */
      readonly speedPm: number | null;
    }
  | { readonly kind: "dnf" }
  | { readonly kind: "energyLeft"; readonly energy: number };

export type WhyJudgement = {
  readonly pace: readonly number[];
  readonly planErrPm: number;
  readonly planErrWindowPm: number;
};

export type SprintPlanEvent = RaceEvent & { kind: "sprintPlan" };

export type WhyPlan = {
  readonly first: SprintPlanEvent;
  readonly last: SprintPlanEvent;
  /** Plans logged (1 = no replan). */
  readonly count: number;
};

/** A boost mode other than "off" that held at least a second (ADR-0003 D54). */
export type ModeSpan = { readonly mode: BoostMode; readonly levelMms: number };

/** A style or rule term that differs from neutral (9.8, 13.1). */
export type WhyTerm =
  | { readonly kind: "stoop"; readonly pm: number }
  | { readonly kind: "landing"; readonly pm: number }
  | { readonly kind: "detour"; readonly pm: number }
  | {
      readonly kind: "air";
      readonly segments: readonly { readonly type: SegmentType; readonly pm: number }[];
    };

/** One course segment of the intact table: terrain factor and cruise in the segment's phase. */
export type WhySegment = {
  readonly type: SegmentType;
  /** Null when `derived` has no row for the segment. */
  readonly fPm: number | null;
  readonly cruiseMms: number | null;
};

export type WhyEnergy = {
  readonly spent: number;
  readonly lift: number;
  readonly regen: number;
  readonly refunded: number;
  readonly fromHeat: number;
  readonly left: number;
};

export type WhyBody = {
  /** milli-hp */
  readonly hpEnd: number;
  readonly durabilityLost: number;
  readonly durabilityRepaired: number;
  readonly durabilityEnd: number;
};

/** A skill that fired or missed; `p` and `u` only with events (detail "full"). */
export type WhySkill = {
  readonly skillId: string;
  readonly fired: boolean;
  readonly p: number | null;
  readonly u: number | null;
};

export type WhyModel = {
  readonly runner: Runner;
  readonly isWinner: boolean;
  /** Milli-ticks behind the winner at the line; null for the winner and for a DNF. */
  readonly gapMilli: number | null;
  readonly phases: readonly WhyPhase[];
  readonly gains: WhyGains;
  readonly sinks: readonly WhySink[];
  readonly judgement: WhyJudgement | null;
  readonly plan: WhyPlan | null;
  readonly modes: readonly ModeSpan[];
  /** Null without a `derived` row; empty when every term is neutral. */
  readonly terms: readonly WhyTerm[] | null;
  readonly segments: readonly WhySegment[] | null;
  readonly energy: WhyEnergy;
  readonly body: WhyBody;
  readonly skills: readonly WhySkill[];
};

/** The runner's boost modes other than "off", in order. */
export function boostModes(log: RaceLog, lane: number): ModeSpan[] {
  const out: ModeSpan[] = [];
  for (const e of log.events ?? []) {
    if (e.lane !== lane || e.kind !== "boostMode" || e.mode === "off") continue;
    out.push({ mode: e.mode, levelMms: e.levelMms });
  }
  return out;
}

function brokenSink(log: RaceLog, r: Runner): WhySink {
  const { entry } = r;
  const e = (log.events ?? []).find(
    (x): x is RaceEvent & { kind: "durabilityBroken" } =>
      x.lane === entry.laneIndex && x.kind === "durabilityBroken",
  );
  const speedPm = log.derived[entry.laneIndex]?.brokenSpeedPm ?? 1000;
  return {
    kind: "broken",
    atMm: e ? e.posMm : null,
    fromStart: !e && entry.durabilityStart === 0,
    pw:
      e && e.powerToWeight !== entry.powerToWeight
        ? { before: entry.powerToWeight, after: e.powerToWeight }
        : null,
    speedPm: speedPm === 1000 ? null : speedPm,
  };
}

function sinks(log: RaceLog, r: Runner): WhySink[] {
  const { result } = r;
  const L = result.ledger;
  const out: WhySink[] = [];
  if (L.stallTicks > 0)
    out.push({ kind: "stall", ticks: L.stallTicks, jumpsFailed: L.jumpsFailed });
  if (L.hpEmptyMm !== null)
    out.push({
      kind: "hpEmpty",
      atMm: L.hpEmptyMm,
      restMm: log.geometry.lengthMm - L.hpEmptyMm,
    });
  if (L.jumpsOk > 0) out.push({ kind: "landings", count: L.jumpsOk, lossMms: L.landingLossMms });
  if (L.detours > 0) out.push({ kind: "detours", count: L.detours });
  if (L.overheatTicks > 0) out.push({ kind: "overheat", ticks: L.overheatTicks });
  if (result.broken) out.push(brokenSink(log, r));
  if (result.dnf) out.push({ kind: "dnf" });
  if (L.energyLeft > 0) out.push({ kind: "energyLeft", energy: L.energyLeft });
  return out;
}

function terms(log: RaceLog, r: Runner): WhyTerm[] | null {
  const d = r.derived;
  if (!d) return null;
  const g = log.geometry;
  const out: WhyTerm[] = [];
  if (d.stoopPm !== 1000) out.push({ kind: "stoop", pm: d.stoopPm });
  const jumps = g.segments.some((s) => s.type === "jump");
  if (jumps && d.detourPm === 0) out.push({ kind: "landing", pm: d.landPm });
  if (jumps && d.detourPm > 0) out.push({ kind: "detour", pm: d.detourPm });
  if (d.pulseMms > 0)
    out.push({
      kind: "air",
      segments: g.segments.map((s, i) => ({ type: s.type, pm: d.airPm[i] ?? 1000 })),
    });
  return out;
}

function segments(log: RaceLog, r: Runner): WhySegment[] | null {
  const d = r.derived;
  if (!d) return null;
  const g = log.geometry;
  return g.segments.map((s, i) => {
    const row = d.segments[i];
    if (!row) return { type: s.type, fPm: null, cruiseMms: null };
    const cruise = row.cruiseMms[phaseIndexAt(g, Math.floor((s.startMm + s.endMm) / 2))];
    return { type: s.type, fPm: row.fPm, cruiseMms: cruise ?? 0 };
  });
}

function skills(log: RaceLog, r: Runner): WhySkill[] {
  if (log.events) {
    return log.events
      .filter((e) => e.lane === r.entry.laneIndex)
      .flatMap((e): WhySkill[] => {
        if (e.kind === "skill") return [{ skillId: e.skillId, fired: true, p: e.p, u: e.u }];
        if (e.kind === "skillMiss") return [{ skillId: e.skillId, fired: false, p: e.p, u: e.u }];
        return [];
      });
  }
  const { skillsActivated, skillsMissed } = r.result.ledger;
  return [
    ...skillsActivated.map((skillId) => ({ skillId, fired: true, p: null, u: null })),
    ...skillsMissed.map((skillId) => ({ skillId, fired: false, p: null, u: null })),
  ];
}

/** The "why" of `r`, against `winner` (the first runner in place order). */
export function whyModel(log: RaceLog, r: Runner, winner: Runner): WhyModel {
  const { entry, derived, result } = r;
  const L = result.ledger;
  const W = winner.result.ledger;
  const isWinner = r === winner || r.entry.laneIndex === winner.entry.laneIndex;
  const plans = (log.events ?? []).filter(
    (e): e is SprintPlanEvent => e.lane === entry.laneIndex && e.kind === "sprintPlan",
  );
  const first = plans[0];
  const last = plans[plans.length - 1];
  return {
    runner: r,
    isWinner,
    gapMilli:
      !isWinner && result.finishMilli !== null && winner.result.finishMilli !== null
        ? result.finishMilli - winner.result.finishMilli
        : null,
    phases: L.phaseTicks.map((ticks, i) => ({
      ticks,
      deltaTicks: isWinner || result.dnf ? null : ticks - (W.phaseTicks[i] ?? 0),
    })),
    gains: {
      boostTicks: [...L.boostTicks],
      pulses: L.pulses,
      draftTicks: L.draftTicks,
      skillsActivated: L.skillsActivated.length,
    },
    sinks: sinks(log, r),
    judgement: derived
      ? {
          pace: [...derived.pace],
          planErrPm: derived.planErrPm,
          planErrWindowPm: derived.planErrWindowPm,
        }
      : null,
    plan: first && last ? { first, last, count: plans.length } : null,
    modes: boostModes(log, entry.laneIndex),
    terms: terms(log, r),
    segments: segments(log, r),
    energy: {
      spent: L.energySpent,
      lift: L.energyLift,
      regen: L.energyRegen,
      refunded: L.energyRefunded,
      fromHeat: L.energyFromHeat,
      left: L.energyLeft,
    },
    body: {
      hpEnd: result.hpEnd,
      durabilityLost: L.durabilityLost,
      durabilityRepaired: L.durabilityRepaired,
      durabilityEnd: result.durabilityEnd,
    },
    skills: skills(log, r),
  };
}

// --- run-length of repeated blocks --------------------------------------------------------------

const MAX_PERIOD = 4;
const MAX_PARTS = 12;

/** A block of items repeated `reps` times, or the count of parts an ellipsis stands for. */
export type Compressed<T> =
  | { readonly kind: "block"; readonly items: readonly T[]; readonly reps: number }
  | { readonly kind: "more"; readonly count: number };

function sameBlock(keys: readonly string[], a: number, b: number, length: number): boolean {
  for (let k = 0; k < length; k++) if (keys[a + k] !== keys[b + k]) return false;
  return true;
}

/**
 * Run-length of repeated blocks of up to 4 items (equal when their `key` is), greedy from the
 * left, keeping the block that covers the most items (the shorter one on a tie): `a a a` →
 * `a ×3`, `a b a b c` → `(a → b) ×2`, `c`. More than 12 parts keep the first 7 and the last 4
 * around a "more" part.
 */
export function compressRuns<T>(items: readonly T[], key: (item: T) => string): Compressed<T>[] {
  const keys = items.map(key);
  const out: Compressed<T>[] = [];
  let i = 0;
  while (i < items.length) {
    let period = 1;
    let reps = 1;
    for (let p = 1; p <= MAX_PERIOD && i + 2 * p <= items.length; p++) {
      let r = 1;
      while (i + (r + 1) * p <= items.length && sameBlock(keys, i, i + r * p, p)) r++;
      if (r >= 2 && r * p > reps * period) {
        period = p;
        reps = r;
      }
    }
    out.push({ kind: "block", items: items.slice(i, i + period), reps });
    i += period * reps;
  }
  if (out.length <= MAX_PARTS) return out;
  return [...out.slice(0, 7), { kind: "more", count: out.length - 11 }, ...out.slice(-4)];
}
