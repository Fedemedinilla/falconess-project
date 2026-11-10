/**
 * The words of the v3 side view, from es.json (`ui.flight.*`): banners, chips and captions of the
 * runner she follows, the moments list and the stage's own labels. Every number is the log's
 * (km/h and seconds are unit changes, nothing recomputed).
 */
import type {
  FlightAhead,
  FlightMoment,
  FlightOverlay,
  RaceLabels,
  TakeoffStyle,
} from "@falconess/race-view";
import type { RaceEvent, RaceLog } from "@falconess/schema";
import { formatFixed, formatSeconds } from "../../text/format";
import { gameText, ui } from "../../text/ui";
import { POS_COLOR, type StageWords } from "./stage";

const upper = (s: string) => s.toLocaleUpperCase("es");

/** mm/s as whole km/h. */
export const kmh = (mms: number) => Math.round((mms * 3.6) / 1000);
/** mm as metres with one decimal. */
const m1 = (mm: number) => formatFixed(mm, 1000, 1);
/** m/s with one decimal from mm/s. */
const ms1 = (mms: number) => formatFixed(mms, 1000, 1);
/** me as whole energy units. */
const me = (v: number) => Math.round(v / 1000);
/** ‰ as a percent with one decimal. */
const pct1 = (pm: number) => formatFixed(Math.abs(pm), 10, 1);

export function bandName(b: number): string {
  return ui(`ui.flight.band.${Math.max(0, Math.min(3, b))}`);
}
/** The band in a sentence ("la banda ALTA" reads "la banda alta"). */
const bandLow = (b: number) => bandName(b).toLocaleLowerCase("es");

export function styleName(s: TakeoffStyle): string {
  return ui(`ui.flight.style.${s}`);
}

/** «frena 1,2 m/s al salir», «sale empujada», «conserva la velocidad». */
function launchSpeed(e: Extract<RaceEvent, { kind: "takeoff" }>): string {
  const dv = e.vMms - e.vAfterMms;
  if (dv > 0) return ui("ui.flight.cap.speed.lose", { v: ms1(dv) });
  if (dv < 0) return ui("ui.flight.cap.speed.gain", { v: ms1(-dv) });
  return ui("ui.flight.cap.speed.keep");
}

function skillName(id: string): string {
  return gameText(`skill.${id}`);
}

/** The short text of a banner or chip. */
export function overlayText(o: FlightOverlay): string {
  const e = o.event;
  const id = o.id;
  switch (e.kind) {
    case "takeoff": {
      if (id === "takeoffCost") {
        const dv = e.vMms - e.vAfterMms;
        const speed =
          dv > 0 ? `−${ms1(dv)} m/s` : dv < 0 ? `+${ms1(-dv)} m/s` : `${kmh(e.vAfterMms)} km/h`;
        return ui("ui.flight.ov.takeoffCost", { cost: me(e.cost), speed });
      }
      if (id === "airClean" || id === "airRough")
        return ui(`ui.flight.ov.${id}`, { pct: pct1(e.airPm) });
      if (id === "lowBand") return ui("ui.flight.ov.lowBand");
      return ui(`ui.flight.ov.${id}`, { style: upper(styleName(e.style)) });
    }
    case "lineChange":
      if (id === "bandChange")
        return ui("ui.flight.ov.bandChange", {
          from: bandName(e.fromBand),
          to: bandName(e.toBand),
        });
      return ui(`ui.flight.ov.${id}`);
    case "nerve":
      return ui(`ui.flight.ov.${id}`, { pct: Math.round(e.pPm / 10) });
    case "dive": {
      const peak = kmh(e.vBeforeMms + e.gainMms);
      if (id === "skillDive")
        return ui("ui.flight.ov.skillDive", {
          skill: upper(skillName(e.skillId ?? "")),
          kmh: kmh(e.skillMms ?? 0),
        });
      if (id === "peak") return ui("ui.flight.ov.peak", { kmh: peak });
      if (o.n === 0) return ui("ui.flight.ov.payoff.none", { m: m1(e.surgeMm) });
      return ui(o.n === 1 ? "ui.flight.ov.payoff.one" : "ui.flight.ov.payoff.other", {
        n: o.n,
        kmh: peak,
      });
    }
    case "touchdown":
      return ui("ui.flight.ov.touchLoss", { kmh: kmh(e.lossMms) });
    case "passSide":
      return ui(`ui.flight.ov.${id === "passedBy" ? "passedBy" : "passSide"}.${e.by}`);
    case "sprintPlan":
      return ui(`ui.flight.ov.${id}`, { pct: Math.round((e.kickPm ?? 0) / 10) });
    case "hpHit":
      return ui("ui.flight.ov.hit", {
        hp: Math.max(1, me(e.hp)),
        cause: upper(ui(`ui.flight.hit.${e.cause}`)),
      });
    case "finish":
      return e.place === 1
        ? ui("ui.flight.ov.finish.win")
        : ui("ui.flight.ov.finish", { place: e.place });
    default:
      return ui(`ui.flight.ov.${id}`);
  }
}

/** The caption under the stage for a banner or chip (empty when it has none). */
export function overlayCaption(o: FlightOverlay): string {
  const e = o.event;
  switch (o.id) {
    case "takeoff":
    case "takeoffLow":
      if (e.kind !== "takeoff") return "";
      return ui(`ui.flight.cap.${o.id}`, {
        style: styleName(e.style),
        band: bandLow(e.band),
        s: formatSeconds(e.climbTicks * (e.band - e.fromBand)),
        cost: me(e.cost),
        speed: launchSpeed(e),
      });
    case "lowBand":
      return ui("ui.flight.cap.lowBand");
    case "airClean":
    case "airRough":
      return e.kind === "takeoff"
        ? ui(`ui.flight.cap.${o.id}`, { band: bandLow(e.band), pct: pct1(e.airPm) })
        : "";
    case "dirty":
      return ui("ui.flight.cap.dirty");
    case "over":
    case "knock":
      return e.kind === "lineChange"
        ? ui(`ui.flight.cap.${o.id}`, {
            s: formatSeconds(e.ticks),
            from: bandLow(e.fromBand),
            to: bandLow(e.toBand),
          })
        : "";
    case "noEnergy":
      return e.kind === "diveStart"
        ? ui("ui.flight.cap.noEnergy", { band: bandLow(e.fromBand) })
        : "";
    case "grandDive":
    case "dive":
      return e.kind === "diveStart"
        ? ui(`ui.flight.cap.${o.id}`, { band: bandLow(e.fromBand), kmh: kmh(e.vMms) })
        : "";
    case "nerveHeld":
    case "flinch":
      return e.kind === "nerve" ? ui(`ui.flight.cap.${o.id}`, { pct: Math.round(e.pPm / 10) }) : "";
    case "skillDive":
      return e.kind === "dive"
        ? ui("ui.flight.cap.skillDive", {
            skill: skillName(e.skillId ?? ""),
            kmh: kmh(e.skillMms ?? 0),
            total: kmh(e.gainMms),
          })
        : "";
    case "peak":
      return e.kind === "dive"
        ? ui("ui.flight.cap.peak", { from: kmh(e.vBeforeMms), kmh: kmh(e.vBeforeMms + e.gainMms) })
        : "";
    case "payoff":
      return e.kind === "dive"
        ? ui("ui.flight.cap.payoff", { what: placesText(o.n, e.surgeMm) })
        : "";
    case "touchLoss":
      return e.kind === "touchdown" ? ui("ui.flight.cap.touchLoss", { kmh: kmh(e.lossMms) }) : "";
    case "passSide":
      return e.kind === "passSide"
        ? ui("ui.flight.cap.passSide", {
            by: ui(`ui.flight.by.${e.by}`),
            lane: e.otherLane + 1,
            band: bandLow(e.band),
          })
        : "";
    case "boxedIn":
      return e.kind === "boxedIn"
        ? ui("ui.flight.cap.boxedIn", {
            band: bandLow(e.band),
            ahead: e.aheadLane + 1,
            lane: e.otherLane + 1,
          })
        : "";
    case "doorClosed":
      return e.kind === "doorClosed"
        ? ui("ui.flight.cap.doorClosed", { lane: e.otherLane + 1 })
        : "";
    case "doorOnHer":
      return ui("ui.flight.cap.doorOnHer", { lane: e.lane + 1 });
    case "diagonal":
    case "switchOut":
    case "switchIn":
    case "noKick":
      return ui(`ui.flight.cap.${o.id}`);
    case "kickShort":
      return e.kind === "sprintPlan"
        ? ui("ui.flight.cap.kickShort", { pct: Math.round((e.kickPm ?? 0) / 10) })
        : "";
    case "noLift":
      return e.kind === "noLift"
        ? ui("ui.flight.cap.noLift", { need: me(e.need), have: me(e.have) })
        : "";
    case "finish":
      return e.kind === "finish" ? ui("ui.flight.cap.finish", { place: e.place }) : "";
    case "hit":
      return e.kind === "hpHit"
        ? ui("ui.flight.cap.hit", {
            hp: Math.max(1, me(e.hp)),
            cause: ui(`ui.flight.hit.${e.cause}`),
          })
        : "";
    default:
      return "";
  }
}

/** «+2 puestos» or «impulso +4,9 m». */
function placesText(n: number, surgeMm: number): string {
  if (n === 0) return ui("ui.flight.mom.places.none", { m: m1(surgeMm) });
  return n === 1 ? ui("ui.flight.mom.places.one") : ui("ui.flight.mom.places.other", { n });
}

export function countdownText(a: FlightAhead, metres: number): string {
  return a.event.kind === "noLift"
    ? ui("ui.flight.countdown.noLift")
    : ui("ui.flight.countdown", { m: metres });
}

export function countdownCaption(a: FlightAhead, metres: number): string {
  return a.event.kind === "takeoff"
    ? ui("ui.flight.cap.countdown", {
        m: metres,
        band: bandLow(a.event.band),
        style: styleName(a.event.style),
      })
    : "";
}

/** The moment's name and detail in the list. */
export function momentText(x: FlightMoment): { name: string; detail: string } {
  const e = x.event;
  const k = `ui.flight.mom.${x.id}`;
  const v: Record<string, string | number> = {};
  switch (e.kind) {
    case "takeoff":
      Object.assign(v, {
        style: styleName(e.style),
        band: bandLow(e.band),
        s: formatSeconds(e.climbTicks * (e.band - e.fromBand)),
        cost: me(e.cost),
      });
      break;
    case "lineChange":
      Object.assign(v, {
        from: bandName(e.fromBand),
        to: bandName(e.toBand),
        s: formatSeconds(e.ticks),
      });
      break;
    case "diveStart":
      Object.assign(v, { band: bandLow(e.fromBand), kmh: kmh(e.vMms) });
      break;
    case "nerve":
      v.pct = Math.round(e.pPm / 10);
      break;
    case "dive":
      Object.assign(v, { kmh: kmh(e.vBeforeMms + e.gainMms), what: placesText(x.n, e.surgeMm) });
      break;
    case "passSide":
      Object.assign(v, {
        by: ui(`ui.flight.by.${e.by}`),
        lane: e.otherLane + 1,
        band: bandLow(e.band),
      });
      break;
    case "boxedIn":
      Object.assign(v, { lane: e.otherLane + 1, ahead: e.aheadLane + 1 });
      break;
    case "doorClosed":
      v.lane = e.otherLane + 1;
      break;
    case "lineSwitch":
      v.band = bandLow(e.band);
      break;
    case "pass":
      Object.assign(v, {
        n:
          x.n === 1 ? ui("ui.flight.mom.passes.one") : ui("ui.flight.mom.passes.other", { n: x.n }),
        band: bandLow(e.band),
      });
      break;
    case "touchdown":
      v.kmh = kmh(e.lossMms);
      break;
    case "noLift":
      Object.assign(v, { need: me(e.need), have: me(e.have) });
      break;
    case "sprintPlan":
      v.pct = Math.round((e.kickPm ?? 0) / 10);
      break;
    case "finish":
      v.lane = e.lane + 1;
      break;
    default:
      break;
  }
  return { name: ui(k, v), detail: ui(`${k}.detail`, v) };
}

/** The stage's own words. */
export function stageWords(
  log: RaceLog,
  labels: RaceLabels,
  styleOf: (lane: number) => TakeoffStyle,
): StageWords {
  return {
    bands: [0, 1, 2, 3].map(bandName),
    lines: [ui("ui.flight.line.0"), ui("ui.flight.line.1")],
    linesUpper: [upper(ui("ui.flight.line.0")), upper(ui("ui.flight.line.1"))],
    segment: (t) => upper(labels.segmentName(t)),
    descent: ui("ui.flight.descent"),
    final: ui("ui.flight.final"),
    finishLine: ui("ui.flight.finishLine"),
    sideBySide: ui("ui.flight.sideBySide"),
    wingToWing: ui("ui.flight.wingToWing"),
    gap: (m) => ui("ui.flight.gap", { m }),
    ahead: (tag) => ui("ui.flight.ahead", { tag }),
    inset: (band) => ui("ui.flight.inset", { band }),
    tag: (lane) =>
      ui("ui.flight.tag", {
        glyph: POS_COLOR[log.entries[lane]?.position ?? "pack"].glyph,
        lane: lane + 1,
        style: upper(styleName(styleOf(lane))),
      }),
    overlay: overlayText,
    countdown: countdownText,
  };
}
