import type { RaceEvent, RaceLog } from "@falconess/schema";
import { FLIGHT_PHASE, type FlightModel, positionAt } from "./flight-view.js";

/**
 * What the side view of a v3 race tells, read from the log's events only (the approved mock of
 * design7): the moments list of the whole field, and for the runner the camera follows, the
 * banners and chips of her race with the time they show, the takeoffs she is about to make, the
 * slow-motion windows of her dives and the line event the «Desde arriba» inset draws. Text-free:
 * each item carries an id and the event it reads; the web words it from es.json.
 */

type Ev<K extends RaceEvent["kind"]> = Extract<RaceEvent, { kind: K }>;

/** Moment filters of the list: takeoffs, the fight up high, dives, passes, all. */
export type MomentCat = "tk" | "fi" | "dv" | "pa" | "all";

export type MomentId =
  | "takeoff"
  | "takeoffLow"
  | "over"
  | "knock"
  | "dirty"
  | "noEnergyHigh"
  | "knockLow"
  | "dive"
  | "grandDive"
  | "nerveHeld"
  | "flinch"
  | "impact"
  | "passSide"
  | "boxedIn"
  | "doorClosed"
  | "diagonal"
  | "passAir"
  | "passJump"
  | "forcedTouch"
  | "noLift"
  | "kickShort"
  | "finish";

export type FlightMoment = {
  tick: number;
  lane: number;
  cat: MomentCat;
  id: MomentId;
  event: RaceEvent;
  /** Ticks before the moment a seek from the list starts at. */
  lead: number;
  /** Passes counted (impact, grouped passes). */
  n: number;
};

/** Passes she made from a dive's touchdown to the end of its surge (+8 ticks to hold). */
function surgePasses(ev: readonly RaceEvent[], d: Ev<"dive">): number {
  return ev.filter(
    (p) => p.kind === "pass" && p.tick >= d.tick && p.tick <= d.tick + d.surgeTicks + 8,
  ).length;
}

/** A `pass` the same tick as a `passSide` against the same runner: told once, as by the side. */
function sidePass(ev: readonly RaceEvent[], e: Ev<"pass">): boolean {
  return ev.some((q) => q.kind === "passSide" && q.tick === e.tick && q.otherLane === e.otherLane);
}

/** The previous `sprintPlan` of the lane before index k (its kick), else full. */
function previousKick(ev: readonly RaceEvent[], k: number): number | null {
  for (let j = k - 1; j >= 0; j--) {
    const q = ev[j];
    if (q?.kind === "sprintPlan") return q.kickPm ?? 1000;
  }
  return null;
}

/** A shortened kick worth telling: the first one, or one that dropped by 15 % or more. */
function kickTold(ev: readonly RaceEvent[], k: number, e: Ev<"sprintPlan">): boolean {
  if (e.kickPm === undefined || e.kickPm >= 1000) return false;
  const prev = previousKick(ev, k);
  return prev === null || prev - e.kickPm >= 150;
}

/** Every moment of the race, in tick order (then lane). */
export function flightMoments(model: FlightModel): FlightMoment[] {
  const out: FlightMoment[] = [];
  const add = (e: RaceEvent, cat: MomentCat, id: MomentId, lead: number, n = 0) =>
    out.push({ tick: e.tick, lane: e.lane, cat, id, event: e, lead, n });
  for (const t of model.tracks) {
    const ev = t.events;
    for (let k = 0; k < ev.length; k++) {
      const e = ev[k];
      if (e === undefined) continue;
      switch (e.kind) {
        case "takeoff":
          add(e, "tk", e.band === 1 && e.fromBand === 0 ? "takeoffLow" : "takeoff", 24);
          break;
        case "lineChange":
          add(e, "fi", e.cause === "over" ? "over" : "knock", e.cause === "over" ? 22 : 26);
          break;
        case "airDirty":
          if (e.on) add(e, "fi", "dirty", 6);
          break;
        case "diveStart":
          if (e.cause === "energy") add(e, "fi", "noEnergyHigh", 14);
          else if (e.cause === "knock") add(e, "fi", "knockLow", 8);
          else if (e.fromBand >= 2) add(e, "dv", e.fromBand === 3 ? "grandDive" : "dive", 8);
          break;
        case "nerve":
          add(e, e.held ? "dv" : "fi", e.held ? "nerveHeld" : "flinch", 12);
          break;
        case "dive":
          add(e, "dv", "impact", 4, surgePasses(ev, e));
          break;
        case "passSide":
          add(e, "pa", "passSide", 14);
          break;
        case "boxedIn":
          add(e, "fi", "boxedIn", 10);
          break;
        case "doorClosed":
          add(e, "fi", "doorClosed", 14);
          break;
        case "lineSwitch":
          if (e.diagonal) add(e, "fi", "diagonal", 16);
          break;
        case "pass": {
          if (e.band < 1 || sidePass(ev, e)) break;
          // passes in a row (within 1 s) are one moment
          let n = 1;
          let j = k + 1;
          for (; j < ev.length; j++) {
            const q = ev[j];
            if (q?.kind !== "pass" || q.band < 1 || q.tick - e.tick > 15) break;
            n++;
          }
          const jump = (t.phase[e.tick + 1] ?? 0) === FLIGHT_PHASE.jump;
          add(e, "pa", jump ? "passJump" : "passAir", 10, n);
          k = j - 1;
          break;
        }
        case "touchdown":
          if (e.cause === "energy") add(e, "fi", "forcedTouch", 4);
          break;
        case "noLift":
          add(e, "fi", "noLift", 20);
          break;
        case "sprintPlan":
          if (kickTold(ev, k, e)) add(e, "fi", "kickShort", 12);
          break;
        case "finish":
          if (e.place === 1) add(e, "all", "finish", 20);
          break;
        default:
          break;
      }
    }
  }
  return out.sort((a, b) => a.tick - b.tick || a.lane - b.lane);
}

/** A banner (one at a time, top of the stage), the great dive's band, or a chip over her head. */
export type OverlayKind = "banner" | "grand" | "chip";

export type OverlayId =
  | "takeoff"
  | "takeoffLow"
  | "takeoffCost"
  | "lowBand"
  | "airClean"
  | "airRough"
  | "dirty"
  | "over"
  | "knock"
  | "bandChange"
  | "noEnergy"
  | "fallNoDive"
  | "lowNoDive"
  | "grandDive"
  | "dive"
  | "nerveHeld"
  | "flinch"
  | "skillDive"
  | "peak"
  | "payoff"
  | "touchLoss"
  | "passAir"
  | "passSide"
  | "boxedIn"
  | "doorClosed"
  | "diagonal"
  | "switchOut"
  | "switchIn"
  | "escape"
  | "detour"
  | "kickShort"
  | "noKick"
  | "noLift"
  | "finish"
  | "passedBy"
  | "doorOnHer"
  | "boxing"
  | "hit";

export type FlightOverlay = {
  t0: number;
  t1: number;
  kind: OverlayKind;
  id: OverlayId;
  prio: number;
  event: RaceEvent;
  /** Passes in the dive surge (payoff). */
  n: number;
};

/** A takeoff she is about to make (or a planned one she could not afford), for the countdown. */
export type FlightAhead = {
  tick: number;
  /** mm where she leaves the ground: the plan's point, else the event's. */
  atMm: number;
  event: Ev<"takeoff"> | Ev<"noLift">;
};

/** The banners and chips of the runner the camera follows, by race time. */
export function flightOverlays(log: RaceLog, model: FlightModel, lane: number): FlightOverlay[] {
  const t = model.tracks[lane];
  if (t === undefined) return [];
  const ev = t.events;
  const O: FlightOverlay[] = [];
  const add = (
    e: RaceEvent,
    t0: number,
    dur: number,
    kind: OverlayKind,
    id: OverlayId,
    prio: number,
    n = 0,
  ) => O.push({ t0, t1: t0 + dur, kind, id, prio, event: e, n });
  let grand = false;
  for (let k = 0; k < ev.length; k++) {
    const e = ev[k];
    if (e === undefined) continue;
    switch (e.kind) {
      case "takeoff": {
        const low = e.band === 1 && e.fromBand === 0;
        add(e, e.tick, 22, "banner", low ? "takeoffLow" : "takeoff", 3);
        add(e, e.tick, 20, "chip", "takeoffCost", 3);
        const climb = e.climbTicks * (e.band - e.fromBand);
        const brs = ev.filter(
          (q) => q.kind === "bandReached" && q.tick > e.tick && q.tick <= e.tick + climb + 2,
        );
        const top = brs[brs.length - 1]?.tick ?? e.tick + climb;
        add(e, top + 1, 30, "chip", low ? "lowBand" : e.airPm >= 0 ? "airClean" : "airRough", 2);
        break;
      }
      case "airDirty":
        if (e.on) {
          const off = ev.find((q) => q.kind === "airDirty" && !q.on && q.tick > e.tick);
          add(e, e.tick, Math.min(60, (off ? off.tick : e.tick + 30) - e.tick), "chip", "dirty", 3);
        }
        break;
      case "lineChange":
        add(e, e.tick, 26, "banner", e.cause === "over" ? "over" : "knock", 4);
        add(e, e.tick, 24, "chip", "bandChange", 3);
        break;
      case "diveStart":
        if (e.cause === "energy") {
          add(e, e.tick, 24, "banner", "noEnergy", 5);
          add(e, e.tick, 20, "chip", "fallNoDive", 3);
        } else if (e.cause === "knock") add(e, e.tick, 18, "chip", "lowNoDive", 3);
        else if (e.fromBand === 3 && !grand) {
          grand = true;
          add(e, e.tick, 30, "grand", "grandDive", 6);
        } else if (e.fromBand >= 2) add(e, e.tick, 20, "banner", "dive", 5);
        break;
      case "nerve":
        if (e.held) add(e, e.tick, 22, "chip", "nerveHeld", 4);
        else add(e, e.tick, 26, "banner", "flinch", 6);
        break;
      case "dive": {
        if (e.skillId !== undefined && (e.skillMms ?? 0) > 0)
          add(e, e.tick - 2, 32, "banner", "skillDive", 7);
        add(e, e.tick, 14, "chip", "peak", 5);
        add(e, e.tick + 14, 34, "chip", "payoff", 4, surgePasses(ev, e));
        break;
      }
      case "touchdown":
        if (e.lossMms > 0) add(e, e.tick, 24, "chip", "touchLoss", 4);
        break;
      case "pass":
        if (e.band >= 1 && !sidePass(ev, e)) add(e, e.tick, 16, "chip", "passAir", 2);
        break;
      case "passSide":
        add(e, e.tick, 26, "banner", "passSide", 5);
        break;
      case "boxedIn":
        add(e, e.tick, 30, "banner", "boxedIn", 6);
        break;
      case "doorClosed":
        add(e, e.tick, 26, "banner", "doorClosed", 6);
        break;
      case "lineSwitch":
        if (e.diagonal) add(e, e.tick, 24, "chip", "diagonal", 4);
        else if (e.cause === "pass")
          add(e, e.tick, 18, "chip", e.to === 1 ? "switchOut" : "switchIn", 3);
        else if (e.cause === "escape") add(e, e.tick, 18, "chip", "escape", 2);
        break;
      case "detour":
        add(e, e.tick, 20, "chip", "detour", 1);
        break;
      case "sprintPlan":
        if (kickTold(ev, k, e))
          add(e, e.tick, 30, "banner", e.kickPm === 0 ? "noKick" : "kickShort", 6);
        break;
      case "noLift":
        add(e, e.tick, 24, "banner", "noLift", 5);
        break;
      case "hpHit":
        if (e.cause !== "takeoff" && e.cause !== "dive") add(e, e.tick, 20, "chip", "hit", 3);
        break;
      case "finish":
        add(e, e.tick, 60, "banner", "finish", 2);
        break;
      default:
        break;
    }
  }
  // what the others did to her
  for (const e of log.events ?? []) {
    if (e.lane === lane || !("otherLane" in e) || e.otherLane !== lane) continue;
    if (e.kind === "passSide") add(e, e.tick, 20, "chip", "passedBy", 3);
    else if (e.kind === "doorClosed") add(e, e.tick, 26, "banner", "doorOnHer", 6);
    else if (e.kind === "boxedIn") add(e, e.tick, 20, "chip", "boxing", 2);
  }
  return O.sort((a, b) => a.t0 - b.t0);
}

/** Her takeoffs and refused takeoffs, with the plan's point when the log has one (4 m around). */
export function flightAhead(log: RaceLog, lane: number): FlightAhead[] {
  const plan = log.derived[lane]?.flightPlan ?? [];
  const out: FlightAhead[] = [];
  for (const e of log.events ?? []) {
    if (e.lane !== lane) continue;
    if (e.kind === "takeoff") {
      const p = plan.find((q) => Math.abs(q.aMm - e.posMm) < 4000);
      out.push({ tick: e.tick, atMm: p ? p.aMm : e.posMm, event: e });
    } else if (e.kind === "noLift") out.push({ tick: e.tick, atMm: e.posMm, event: e });
  }
  return out.sort((a, b) => a.tick - b.tick);
}

/** The banner and the chip showing at `row` (the highest priority, then the latest). */
export function activeOverlays(
  overlays: readonly FlightOverlay[],
  row: number,
): { banner: FlightOverlay | null; chip: FlightOverlay | null } {
  let banner: FlightOverlay | null = null;
  let chip: FlightOverlay | null = null;
  for (const o of overlays) {
    if (row < o.t0 || row >= o.t1) continue;
    if (o.kind === "chip") {
      if (chip === null || o.prio > chip.prio || (o.prio === chip.prio && o.t0 > chip.t0)) chip = o;
    } else if (
      banner === null ||
      o.prio > banner.prio ||
      (o.prio === banner.prio && o.t0 > banner.t0)
    )
      banner = o;
  }
  return { banner, chip };
}

/**
 * The slow-motion windows of her dives: a planned dive from the high band or the ceiling that is
 * a great dive, a nerve test, or falls on a rival on the ground within 10 m ahead.
 */
export function slowWindows(model: FlightModel, lane: number): [number, number][] {
  const t = model.tracks[lane];
  if (t === undefined) return [];
  const out: [number, number][] = [];
  for (const e of t.events) {
    if (e.kind !== "diveStart" || e.cause !== "plan" || e.fromBand < 2) continue;
    const td = t.events.find((q) => q.kind === "touchdown" && q.tick >= e.tick);
    if (td === undefined) continue;
    const nerve = t.events.some((q) => q.kind === "nerve" && q.tick === td.tick);
    const rival = model.tracks.some((o) => {
      if (o.lane === lane) return false;
      const d = positionAt(o, e.tick) - e.posMm;
      return d > 0 && d <= 10000 && (o.band[e.tick] ?? 0) === 0;
    });
    if (e.fromBand === 3 || nerve || rival) out.push([e.tick, td.tick + 3]);
  }
  return out;
}

const LINE_EVENTS = new Set(["lineSwitch", "passSide", "doorClosed", "boxedIn"]);

/** The line event of hers (or done to her) the «Desde arriba» inset draws at `row`, if any. */
export function insetEvent(log: RaceLog, lane: number, row: number): RaceEvent | null {
  let best: RaceEvent | null = null;
  for (const e of log.events ?? []) {
    if (!LINE_EVENTS.has(e.kind)) continue;
    const other = "otherLane" in e ? e.otherLane : -1;
    if (e.lane !== lane && other !== lane) continue;
    if (e.kind === "lineSwitch" && e.cause === "escape") continue;
    const dt = row - e.tick;
    if (dt < -12 || dt > 34) continue;
    if (best === null || Math.abs(dt) < Math.abs(row - best.tick)) best = e;
  }
  return best;
}
