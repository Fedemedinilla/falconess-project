import type { RaceEvent, RaceLog } from "@falconess/schema";

/**
 * The flights of one runner, read from the log only (ruleset v3, diseno-v3-vuelo.md §6.1): each
 * planned takeoff with its climb, its fight for the line, its descent, its dive and touchdown, and
 * the passes made in the air or in the dive surge. Nothing is recomputed: the peak is the log's
 * `vBeforeMms + gainMms`. `problems` lists what does not add up (LOG-1); a v1 or v2 log has none
 * of these events and gives no flight.
 */

type Ev<K extends RaceEvent["kind"]> = Extract<RaceEvent, { kind: K }>;
export type TakeoffEvent = Ev<"takeoff">;
export type BandReachedEvent = Ev<"bandReached">;
export type DiveStartEvent = Ev<"diveStart">;
export type DiveEvent = Ev<"dive">;
export type TouchdownEvent = Ev<"touchdown">;
export type PassEvent = Ev<"pass">;
export type LineChangeEvent = Ev<"lineChange">;
export type AirDirtyEvent = Ev<"airDirty">;
export type FlightPlanEntry = { aMm: number; bMm: number; band: number; cornisa: boolean };

export type FlightBeat = {
  /** Index of the planned flight it flies (−1 if the log has no plan: detail "results"). */
  index: number;
  plan: FlightPlanEntry | null;
  takeoff: TakeoffEvent;
  /** Climbs of a chained flight (stage 2, R9). */
  chained: TakeoffEvent[];
  bands: BandReachedEvent[];
  lineChanges: LineChangeEvent[];
  dirty: AirDirtyEvent[];
  diveStart: DiveStartEvent | null;
  dive: DiveEvent | null;
  touchdown: TouchdownEvent | null;
  /** Passes she made from the takeoff to the end of her dive surge. */
  passes: PassEvent[];
  /** Highest band of the flight. */
  apex: number;
  /** km/h × 1000 is not used: the peak in mm/s, `vBeforeMms + gainMms` (null without a dive). */
  peakMms: number | null;
  /** Ticks from the takeoff to the highest band (null if it never climbed past the first). */
  climbToApexTicks: number | null;
  problems: string[];
};

/** Descent ticks per band of the v3 draft (R1); read from the log, never from constants. */
function descentTicks(f: FlightBeat): number | null {
  if (f.diveStart === null || f.touchdown === null) return null;
  return f.touchdown.tick - f.diveStart.tick;
}

/** Planned takeoffs and `noLift` of a lane, in order (the plan's entries are consumed in order). */
export function flightBeats(log: RaceLog, lane: number): FlightBeat[] {
  const plan = log.derived[lane]?.flightPlan ?? null;
  const out: FlightBeat[] = [];
  let cur: FlightBeat | null = null;
  let planned = 0;
  let surgeUntil = -1;
  for (const e of log.events ?? []) {
    if (e.lane !== lane) continue;
    if (e.kind === "noLift") {
      planned += 1;
      continue;
    }
    if (e.kind === "takeoff") {
      if (cur !== null && cur.touchdown === null) {
        cur.chained.push(e);
        continue;
      }
      const index = plan === null ? -1 : planned;
      planned += 1;
      cur = {
        index,
        plan: plan?.[index] ?? null,
        takeoff: e,
        chained: [],
        bands: [],
        lineChanges: [],
        dirty: [],
        diveStart: null,
        dive: null,
        touchdown: null,
        passes: [],
        apex: Math.max(1, e.fromBand),
        peakMms: null,
        climbToApexTicks: null,
        problems: [],
      };
      out.push(cur);
      continue;
    }
    if (e.kind === "pass") {
      const open = cur !== null && (cur.touchdown === null || e.tick <= surgeUntil);
      if (cur !== null && open) cur.passes.push(e);
      continue;
    }
    if (cur === null) continue;
    if (e.kind === "bandReached") {
      cur.bands.push(e);
      if (e.band > cur.apex) {
        cur.apex = e.band;
        cur.climbToApexTicks = e.tick - cur.takeoff.tick;
      }
    } else if (e.kind === "lineChange") cur.lineChanges.push(e);
    else if (e.kind === "airDirty") cur.dirty.push(e);
    else if (e.kind === "diveStart") cur.diveStart = e;
    else if (e.kind === "dive") {
      cur.dive = e;
      cur.peakMms = e.vBeforeMms + e.gainMms;
      surgeUntil = e.tick + e.surgeTicks;
    } else if (e.kind === "touchdown") cur.touchdown = e;
  }
  for (const f of out) f.problems = flightProblems(f);
  return out;
}

/** What does not add up in one flight (LOG-1); empty when the flight is told whole. */
export function flightProblems(f: FlightBeat): string[] {
  const p: string[] = [];
  const t = f.takeoff;
  const base = Math.max(1, t.fromBand);
  // the climb: one band per climbTicks from the takeoff, up to the takeoff's band (an `over`
  // line change climbs one more from its own tick)
  let band = base;
  let from = t.tick;
  let ticks = t.climbTicks;
  const overs = f.lineChanges.filter((l) => l.cause === "over");
  const knocks = f.lineChanges.filter((l) => l.cause === "knock");
  let target = t.band;
  for (const b of f.bands) {
    const over = overs.find((o) => o.tick < b.tick && o.toBand === b.band);
    if (over !== undefined) {
      band = over.fromBand;
      from = over.tick;
      target = over.toBand;
      // an over climbs at the wing's ticks off a cornisa: the gap is a multiple of a tick ≥ 1
      ticks = b.tick - over.tick;
    }
    if (b.band !== band + 1) p.push(`band ${b.band} after ${band}`);
    if (b.band > target) p.push(`band ${b.band} above the target ${target}`);
    if (over === undefined && b.tick !== from + (b.band - base) * ticks)
      p.push(`band ${b.band} at tick ${b.tick}, expected ${from + (b.band - base) * ticks}`);
    band = b.band;
  }
  if (f.chained.length === 0 && knocks.length === 0 && overs.length === 0 && band !== t.band)
    p.push(`climbed to ${band}, takeoff said ${t.band}`);
  if (f.diveStart === null) p.push("no diveStart");
  if (f.touchdown === null) p.push("no touchdown");
  if (f.diveStart !== null && f.touchdown !== null) {
    const d = f.diveStart;
    if (f.touchdown.fromBand !== d.fromBand) p.push("touchdown and diveStart bands differ");
    const dt = descentTicks(f);
    if (dt !== null && (dt <= 0 || dt % d.fromBand !== 0)) p.push(`descent of ${dt} ticks`);
    if (f.dive !== null) {
      if (f.dive.tick !== f.touchdown.tick) p.push("dive and touchdown ticks differ");
      if (f.dive.fromBand !== d.fromBand) p.push("dive and diveStart bands differ");
      if (f.dive.vBeforeMms !== d.vMms) p.push("dive speed is not the diveStart speed");
      if (f.touchdown.cause === "energy" && f.touchdown.lossMms > 0)
        p.push("a forced fall with a dive");
    } else if (d.fromBand >= 2 && f.touchdown.cause !== "energy")
      p.push(`no dive from band ${d.fromBand}`);
    if ((d.cause === "knock") !== (f.touchdown.cause === "knock")) p.push("knock cause differs");
    if (knocks.length > 0 && d.cause === "plan") p.push("knocked flight told as plan");
  }
  return p;
}
