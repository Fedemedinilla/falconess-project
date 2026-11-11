/**
 * The race told in Spanish: the shared view models of `@falconess/race-view` (events, "why",
 * timeline) worded with `ui.race.*` keys of es.json, numbers in Spanish style. The CLI words the
 * same models in its own lines, so both always show the same facts.
 */
import {
  type Compressed,
  compressRuns,
  type EventItem,
  type ModeSpan,
  type RaceLabels,
  type SprintPlanEvent,
  type WhyModel,
  type WhySink,
  type WhyTerm,
} from "@falconess/race-view";
import type { RaceEntry, RaceLog, RaceResult } from "@falconess/schema";
import { MIRROR_RUNNER_ID } from "@falconess/sim";
import { formatFixed, formatInt } from "../text/format";
import { locale, perLang } from "../text/lang";
import { type TextVars, ui } from "../text/ui";
import { type IconName, segmentIcon } from "../ui/icons";

// --- units --------------------------------------------------------------------------------------

const TICK_HZ = 15;

/** mm as metres: metres(1234567) = "1.235", metres(1234, 2) = "1,23". */
export const metres = (mm: number, decimals = 0) => formatFixed(mm, 1000, decimals);
/** mm/s as m/s. */
export const mps = (mms: number, decimals = 1) => formatFixed(mms, 1000, decimals);
/** Ticks as seconds. */
export const secs = (ticks: number, decimals = 1) => formatFixed(ticks, TICK_HZ, decimals);
/** Milli-ticks as seconds. */
export const secsMilli = (milli: number, decimals = 2) =>
  formatFixed(milli, 1000 * TICK_HZ, decimals);
/** Milli-units (energy, heat, durability) with one decimal. */
export const units = (milli: number) => formatFixed(milli, 1000, 1);
/** Per-mille as a factor: factor(750) = "0,75". */
export const factor = (pm: number) => formatFixed(pm, 1000, 2);

/** A formatted number with its sign: "+1,23", "−0,40", "0,00". */
export function withSign(text: string): string {
  return /^[−-]/.test(text) || /^0(?:[.,]0+)?$/.test(text) ? text : `+${text}`;
}

const plural = perLang(() => new Intl.PluralRules(locale()));

/** `<key>.one` or `<key>.other` by `n`, with `n` and the other variables filled in. */
export function uiPlural(key: string, n: number, vars: TextVars = {}): string {
  return ui(`${key}.${plural().select(n) === "one" ? "one" : "other"}`, { n, ...vars });
}

// --- runners ------------------------------------------------------------------------------------

/**
 * A runner's name on screen: the Falconess's name, else "Rival 3" for the season's rivals and
 * "Picada 2" for the neutral fixtures (`neutral-dive-2`), else the runner id.
 */
export function runnerName(entry: RaceEntry, labels: RaceLabels): string {
  if (entry.falconessId !== null) return labels.runnerName(entry);
  if (entry.runnerId === MIRROR_RUNNER_ID) return ui("ui.race.runner.mirror");
  const rival = /^rival-(\d+)$/.exec(entry.runnerId);
  if (rival) return ui("ui.race.runner.rival", { n: rival[1] ?? "" });
  const neutral = /^neutral-([a-z]+)-(\d+)$/.exec(entry.runnerId);
  if (neutral && entry.style === neutral[1])
    return ui("ui.race.runner.neutral", {
      style: labels.styleName(entry.style),
      n: neutral[2] ?? "",
    });
  return entry.runnerId;
}

/**
 * A runner's name in a narrow lane label: "Vos" for the player, "R3" for the season's rivals,
 * "Pic2" for the neutral fixtures, else the first letters of her name.
 */
export function runnerShort(entry: RaceEntry, labels: RaceLabels): string {
  if (entry.kind === "player") return ui("ui.race.lane.you");
  if (entry.runnerId === MIRROR_RUNNER_ID) return ui("ui.race.lane.mirror");
  const rival = /^rival-(\d+)$/.exec(entry.runnerId);
  if (rival) return ui("ui.race.lane.rival", { n: rival[1] ?? "" });
  const neutral = /^neutral-([a-z]+)-(\d+)$/.exec(entry.runnerId);
  if (neutral && entry.style === neutral[1])
    return `${labels.styleName(entry.style).slice(0, 3)}${neutral[2] ?? ""}`;
  return runnerName(entry, labels).slice(0, 3);
}

/** "Falke · Steinhaus Aerowerk · Planeo". */
export function runnerKit(entry: RaceEntry, labels: RaceLabels): string {
  return [
    labels.frameName(entry.frameId),
    labels.manufacturerName(entry.manufacturer),
    labels.styleName(entry.style),
  ].join(" · ");
}

/** The finish time, or "No terminó". */
export function finishTime(result: RaceResult): string {
  return result.dnf || result.finishMilli === null
    ? ui("ui.race.dnf")
    : ui("ui.race.seconds", { s: secsMilli(result.finishMilli, 2) });
}

/** Distance behind the previous finisher when it crossed (spec 19), from the log's `marginMm`. */
export function finishMargin(result: RaceResult): string {
  if (result.dnf || result.marginMm === null) return "";
  if (result.deadHeat) return ui("ui.race.margin.deadHeat");
  if (result.place === 1) return "—";
  return ui("ui.race.margin.behind", { m: metres(result.marginMm, 2) });
}

// --- events -------------------------------------------------------------------------------------

function planText(e: SprintPlanEvent): string {
  const reason = ui(`ui.race.plan.reason.${e.reason}`);
  if (e.levelMms === 0) return ui("ui.race.plan.none", { reason });
  return ui("ui.race.plan.level", {
    level: mps(e.levelMms, 2),
    from: metres(e.startMm),
    to: metres(e.endMm),
    reason,
    clean: ui(e.clean ? "ui.race.plan.clean" : "ui.race.plan.dirty"),
    energy: units(e.energy),
    energySeen: units(e.energyPerceived),
    hp: formatFixed(e.hp, 1000, 0),
    hpSeen: formatFixed(e.hpPerceived, 1000, 0),
    candidates: formatInt(e.candidates),
  });
}

/** "Plan de sprint (fase)" or "Replan 2 (salto)". */
export function planTitle(e: SprintPlanEvent): string {
  const cause = ui(`ui.race.plan.cause.${e.cause}`);
  return e.index === 0
    ? ui("ui.race.plan.first", { cause })
    : ui("ui.race.plan.replan", { n: e.index, cause });
}

/** A sprint plan in the events list, in player terms (the full plan is in the technical detail). */
function sprintEventText(e: SprintPlanEvent): string {
  if (e.levelMms === 0)
    return ui("ui.race.event.sprint.none", { reason: ui(`ui.race.plan.reason.${e.reason}`) });
  return e.index === 0
    ? ui("ui.race.event.sprint", {
        level: mps(e.levelMms, 1),
        from: metres(e.startMm),
        to: metres(e.endMm),
      })
    : ui("ui.race.event.sprint.replan", {
        cause: ui(`ui.race.plan.cause.${e.cause}`),
        level: mps(e.levelMms, 1),
        from: metres(e.startMm),
      });
}

/** The speed factor of broken wings (8.4), when it is not neutral. */
function brokenSpeed(log: RaceLog, lane: number): string | undefined {
  const pm = log.derived[lane]?.brokenSpeedPm ?? 1000;
  return pm === 1000 ? undefined : factor(pm);
}

/** One event line of a runner, as the events list shows it. */
export function eventText(item: EventItem, tick: number, log: RaceLog, labels: RaceLabels): string {
  switch (item.kind) {
    case "pulses": {
      const base =
        item.count === 1
          ? ui("ui.race.event.pulse", { chain: item.chainMax })
          : ui("ui.race.event.pulses", {
              n: item.count,
              until: secs(item.lastTick),
              chain: item.chainMax,
            });
      return item.free > 0
        ? `${base} · ${ui("ui.race.event.pulses.free", { n: item.free })}`
        : base;
    }
    case "overheatSpan":
      return item.offTick !== null && item.offHeat !== null
        ? ui("ui.race.event.overheat", {
            s: secs(item.offTick - tick),
            from: units(item.heat),
            to: units(item.offHeat),
          })
        : ui("ui.race.event.overheat.end", { from: units(item.heat) });
    case "skill": {
      const text = ui("ui.race.event.skill", { skill: labels.skillName(item.skillId) });
      return item.activation > 1
        ? `${text} · ${ui("ui.race.event.skill.again", { n: item.activation })}`
        : text;
    }
    case "skillMiss":
      return ui("ui.race.event.skillMiss", { skill: labels.skillName(item.skillId) });
    case "freeBoost":
      return ui("ui.race.event.freeBoost", { segment: labels.segmentName(item.segment) });
    case "sprintPlan":
      return sprintEventText(item);
    case "jumpOk":
      return ui("ui.race.event.jumpOk");
    case "jumpFail":
      return ui("ui.race.event.jumpFail", {
        damage: units(item.damage),
        s: secs(item.stallTicks),
      });
    case "landing":
      return ui("ui.race.event.landing", { loss: mps(item.speedLossMms, 2) });
    case "detour":
      return ui("ui.race.event.detour", { n: item.segment + 1 });
    case "waterHit":
      return item.damage === 0
        ? ui("ui.race.event.water.clean")
        : ui("ui.race.event.water", { damage: units(item.damage) });
    case "hpEmpty":
      return ui("ui.race.event.hpEmpty");
    case "durabilityBroken": {
      const speed = brokenSpeed(log, item.lane);
      return speed === undefined
        ? ui("ui.race.event.broken", { pw: factor(item.powerToWeight) })
        : ui("ui.race.event.broken.speed", { pw: factor(item.powerToWeight), speed });
    }
    case "repair":
      return ui("ui.race.event.repair", { amount: units(item.amount) });
    case "heatToEnergy":
      return ui("ui.race.event.heatToEnergy", {
        heat: units(item.heat),
        energy: units(item.energy),
      });
    case "finish":
      return ui("ui.race.event.finish", { place: item.place });
    case "dnf":
      return ui("ui.race.dnf");
    case "takeoff":
      return ui("ui.race.event.takeoff", { band: item.band, cost: units(item.cost) });
    case "dive":
      return ui("ui.race.event.dive", { band: item.fromBand, gain: mps(item.gainMms, 1) });
    case "touchdown":
      return item.cause === "energy"
        ? ui("ui.race.event.touchdown.energy")
        : item.cause === "knock"
          ? ui("ui.race.event.touchdown.knock")
          : item.cause === "nerve"
            ? ui("ui.race.event.touchdown.nerve")
            : ui("ui.race.event.touchdown");
    case "noLift":
      return ui("ui.race.event.noLift");
    case "hpHit":
      return ui(`ui.race.event.hpHit.${item.cause}`, { hp: Math.floor(item.hp / 1000) });
    case "bandReached":
      return ui("ui.race.event.bandReached", { band: item.band });
    case "diveStart":
      return item.cause === "energy"
        ? ui("ui.race.event.diveStart.energy", { band: item.fromBand })
        : item.cause === "knock"
          ? ui("ui.race.event.diveStart.knock", { band: item.fromBand })
          : ui("ui.race.event.diveStart", { band: item.fromBand });
    case "pass":
      return item.band >= 1 ? ui("ui.race.event.pass") : ui("ui.race.event.pass.dive");
    case "airDirty":
      return item.on ? ui("ui.race.event.airDirty") : ui("ui.race.event.airDirty.off");
    case "lineChange":
      return item.cause === "over"
        ? ui("ui.race.event.lineChange.over", { band: item.toBand })
        : ui("ui.race.event.lineChange.knock", { band: item.toBand });
    case "lineSwitch":
      return item.cause === "door"
        ? ui("ui.race.event.lineSwitch.door")
        : item.cause === "escape"
          ? ui("ui.race.event.lineSwitch.escape")
          : item.to === 1
            ? ui("ui.race.event.lineSwitch.out")
            : ui("ui.race.event.lineSwitch.in");
    case "boxedIn":
      return ui("ui.race.event.boxedIn");
    case "doorClosed":
      return ui("ui.race.event.doorClosed");
    case "passSide":
      return item.by === "outside"
        ? ui("ui.race.event.passSide.outside")
        : ui("ui.race.event.passSide.inside");
    case "nerve":
      return item.held ? ui("ui.race.event.nerve.held") : ui("ui.race.event.nerve.flinch");
  }
}

/** The emoji of an event line: the concept it is about (ui/icons.ts). */
export function eventIcon(item: EventItem): IconName {
  switch (item.kind) {
    case "pulses":
      return "flag.pulse";
    case "overheatSpan":
      return "flag.overheated";
    case "skill":
      return "skill";
    case "skillMiss":
      return "skillMiss";
    case "freeBoost":
      return "flag.boost";
    case "sprintPlan":
      return "sprintPlan";
    case "jumpOk":
      return segmentIcon("jump");
    case "jumpFail":
      return "trouble";
    case "landing":
      return "landing";
    case "detour":
      return "detour";
    case "waterHit":
      return segmentIcon("water");
    case "hpEmpty":
      return "flag.exhausted";
    case "durabilityBroken":
      return "flag.broken";
    case "repair":
      return "race.durability";
    case "heatToEnergy":
      return "race.energy";
    case "finish":
      return "finish";
    case "dnf":
      return "dnf";
    case "takeoff":
    case "bandReached":
    case "diveStart":
    case "dive":
    case "touchdown":
    case "pass":
      return "landing";
    case "noLift":
    case "hpHit":
    case "airDirty":
    case "lineChange":
    case "nerve":
    case "lineSwitch":
    case "boxedIn":
    case "doorClosed":
      return "trouble";
    case "passSide":
      return "landing";
  }
}

/** What the runner's badge on the track says for a moment after the event; none for most. */
export function eventBadge(item: EventItem, labels: RaceLabels): string | undefined {
  switch (item.kind) {
    case "skill":
      return labels.skillName(item.skillId);
    case "skillMiss":
      return ui("ui.race.badge.skillMiss", { skill: labels.skillName(item.skillId) });
    case "jumpOk":
      return ui("ui.race.badge.jumpOk");
    case "jumpFail":
      return ui("ui.race.badge.jumpFail");
    case "hpEmpty":
      return ui("ui.race.badge.hpEmpty");
    case "durabilityBroken":
      return ui("ui.race.badge.broken");
    case "overheatSpan":
      return ui("ui.race.badge.overheat");
    case "sprintPlan":
      return item.levelMms > 0 && item.index === 0 ? ui("ui.race.badge.sprint") : undefined;
    case "detour":
      return ui("ui.race.badge.detour");
    default:
      return undefined;
  }
}

/** How an event marks the lane where it happened: a fired skill, a missed one, a mishap. */
export type PinKind = "skill" | "miss" | "trouble";

export function eventPin(item: EventItem): PinKind | undefined {
  switch (item.kind) {
    case "skill":
      return "skill";
    case "skillMiss":
      return "miss";
    case "jumpFail":
    case "hpEmpty":
    case "durabilityBroken":
    case "overheatSpan":
      return "trouble";
    default:
      return undefined;
  }
}

// --- why ----------------------------------------------------------------------------------------

/** One time sink, worded. */
export function sinkText(sink: WhySink): string {
  switch (sink.kind) {
    case "stall":
      return sink.jumpsFailed > 0
        ? uiPlural("ui.race.sink.stall.jumps", sink.jumpsFailed, { s: secs(sink.ticks, 2) })
        : ui("ui.race.sink.stall", { s: secs(sink.ticks, 2) });
    case "hpEmpty":
      return ui("ui.race.sink.hpEmpty", { at: metres(sink.atMm), rest: metres(sink.restMm) });
    case "landings":
      return uiPlural("ui.race.sink.landings", sink.count, { loss: mps(sink.lossMms, 2) });
    case "detours":
      return uiPlural("ui.race.sink.detours", sink.count);
    case "overheat":
      return ui("ui.race.sink.overheat", { s: secs(sink.ticks) });
    case "broken": {
      const costs: string[] = [];
      if (sink.pw)
        costs.push(
          ui("ui.race.sink.broken.pw", { from: factor(sink.pw.before), to: factor(sink.pw.after) }),
        );
      if (sink.speedPm !== null)
        costs.push(ui("ui.race.sink.broken.speed", { speed: factor(sink.speedPm) }));
      const what =
        sink.atMm !== null
          ? ui("ui.race.sink.broken.at", { at: metres(sink.atMm) })
          : ui(sink.fromStart ? "ui.race.sink.broken.start" : "ui.race.sink.broken");
      return costs.length > 0 ? `${what} (${costs.join(", ")})` : what;
    }
    case "dnf":
      return ui("ui.race.dnf");
    case "energyLeft":
      return ui("ui.race.sink.energyLeft", { energy: units(sink.energy) });
  }
}

/** The emoji of a time sink. */
export function sinkIcon(sink: WhySink): IconName {
  switch (sink.kind) {
    case "stall":
      return "flag.stalled";
    case "hpEmpty":
      return "flag.exhausted";
    case "landings":
      return "landing";
    case "detours":
      return "detour";
    case "overheat":
      return "flag.overheated";
    case "broken":
      return "flag.broken";
    case "dnf":
      return "dnf";
    case "energyLeft":
      return "race.energy";
  }
}

/** The tone of a sink: what cost the race, or energy that was simply left over. */
export function sinkTone(sink: WhySink): "bad" | "warn" {
  return sink.kind === "energyLeft" || sink.kind === "landings" ? "warn" : "bad";
}

export function termText(term: WhyTerm, labels: RaceLabels): string {
  switch (term.kind) {
    case "stoop":
      return ui("ui.race.term.stoop", { pm: term.pm });
    case "landing":
      return ui("ui.race.term.landing", { pm: term.pm });
    case "detour":
      return ui("ui.race.term.detour", { pm: term.pm });
    case "air":
      return ui("ui.race.term.air", {
        list: term.segments.map((s) => `${labels.segmentName(s.type)} ${s.pm}`).join(" · "),
      });
  }
}

/** "Plan 25,4 m/s" for a mode with a level, else the mode's name. */
export function modeText(mode: ModeSpan): string {
  const name = ui(`ui.race.mode.${mode.mode}`);
  return mode.levelMms > 0
    ? ui("ui.race.mode.level", { mode: name, level: mps(mode.levelMms, 2) })
    : name;
}

function compressedText(part: Compressed<ModeSpan>): string {
  if (part.kind === "more") return ui("ui.race.modes.more", { n: part.count });
  const text =
    part.items.length === 1
      ? modeText(part.items[0] ?? { mode: "off", levelMms: 0 })
      : `(${part.items.map(modeText).join(" → ")})`;
  return part.reps > 1 ? `${text} ×${part.reps}` : text;
}

/** The boost modes in order, repeated blocks run-length encoded like the CLI's "modos" row. */
export function modesText(modes: readonly ModeSpan[]): string {
  return compressRuns(modes, modeText).map(compressedText).join(" → ");
}

/** The sprint plan row: the first plan, and the last replan when there were more. */
export function planSummary(first: SprintPlanEvent, last: SprintPlanEvent, count: number): string {
  const head = `${planTitle(first)}: ${planText(first)}`;
  if (count <= 1) return head;
  const lastText =
    last.levelMms === 0
      ? ui("ui.race.plan.none", { reason: ui(`ui.race.plan.reason.${last.reason}`) })
      : ui("ui.race.plan.last.level", { level: mps(last.levelMms, 2), from: metres(last.startMm) });
  return `${head} · ${uiPlural("ui.race.plan.replans", count - 1, {
    cause: ui(`ui.race.plan.cause.${last.cause}`),
    last: lastText,
  })}`;
}

// --- why, in a few plain lines ------------------------------------------------------------------

const SUMMARY_PHASES = ["start", "middle", "final"] as const;

/** A share of the energy capacity under which what is left over is not worth a line. */
const ENERGY_LEFT_WORTH = 0.1;

export type WhySummaryInput = {
  readonly m: WhyModel;
  /** Her energy capacity (milli-units), to judge what was left over. */
  readonly energyMax: number;
  /** For the winner: milli-ticks to the second at the line; null without a second finisher. */
  readonly leadMilli: number | null;
};

function phaseName(i: number): string {
  return ui(`ui.race.why.summary.phase.${SUMMARY_PHASES[i] ?? "start"}`);
}

/** The gap to the winner and where it was lost, from the phase deltas of the model. */
function gapLine({ m, leadMilli }: WhySummaryInput): string {
  if (m.runner.result.dnf) return ui("ui.race.why.summary.dnf");
  if (m.isWinner)
    return leadMilli !== null && leadMilli > 0
      ? ui("ui.race.why.summary.winner", { lead: secsMilli(leadMilli, 2) })
      : ui("ui.race.why.summary.winner.alone", { time: finishTime(m.runner.result) });
  if (m.gapMilli === null || m.gapMilli <= 0) return ui("ui.race.why.summary.level");
  const lost = m.phases
    .map((p, i) => ({ i, d: p.deltaTicks ?? 0 }))
    .filter((p) => p.d > 0)
    .sort((a, b) => b.d - a.d || a.i - b.i);
  const total = lost.reduce((sum, p) => sum + p.d, 0);
  const gap = secsMilli(m.gapMilli, 2);
  const [first, second] = lost;
  let line: string;
  if (!first) line = ui("ui.race.why.summary.level");
  else if (!second || first.d * 10 >= total * 7)
    line = ui("ui.race.why.summary.lost.one", {
      gap,
      phase: phaseName(first.i),
      delta: withSign(secs(first.d, 2)),
    });
  else
    line = ui("ui.race.why.summary.lost.two", {
      gap,
      phase: phaseName(first.i),
      delta: withSign(secs(first.d, 2)),
      phase2: phaseName(second.i),
      delta2: withSign(secs(second.d, 2)),
    });
  const ahead = m.phases
    .map((p, i) => ({ i, d: p.deltaTicks ?? 0 }))
    .filter((p) => p.d < 0)
    .sort((a, b) => a.d - b.d)[0];
  return ahead
    ? `${line} ${ui("ui.race.why.summary.ahead", {
        phase: phaseName(ahead.i),
        delta: secs(ahead.d, 2),
      })}`
    : line;
}

/** A time sink in player terms, or undefined for the ones the summary leaves to the list. */
function sinkLine(sink: WhySink): string | undefined {
  switch (sink.kind) {
    case "hpEmpty":
      return ui("ui.race.why.summary.hpEmpty", {
        at: metres(sink.atMm),
        rest: metres(sink.restMm),
      });
    case "stall":
      return sink.jumpsFailed > 0
        ? uiPlural("ui.race.why.summary.stall.jumps", sink.jumpsFailed, { s: secs(sink.ticks, 1) })
        : ui("ui.race.why.summary.stall", { s: secs(sink.ticks, 1) });
    case "broken":
      return sink.atMm !== null
        ? ui("ui.race.why.summary.broken.at", { at: metres(sink.atMm) })
        : ui(sink.fromStart ? "ui.race.why.summary.broken.start" : "ui.race.why.summary.broken");
    case "overheat":
      return ui("ui.race.why.summary.overheat", { s: secs(sink.ticks) });
    case "detours":
      return uiPlural("ui.race.why.summary.detours", sink.count);
    default:
      return undefined;
  }
}

/**
 * "Why" in a few plain lines, for a tester who never read the engine spec: the gap to the winner
 * and the phase where it went, what cost her the race, and energy left unused. Only words for
 * the model's numbers (race-view's whyModel); nothing is recomputed.
 */
export function whySummary(input: WhySummaryInput): string[] {
  const { m, energyMax } = input;
  const lines = [gapLine(input)];
  const sinks = m.sinks.flatMap((sink) => {
    const line = sinkLine(sink);
    return line === undefined ? [] : [line];
  });
  lines.push(...sinks.slice(0, 2));
  const hpEmpty = m.sinks.some((sink) => sink.kind === "hpEmpty");
  const left = m.sinks.find((sink) => sink.kind === "energyLeft");
  if (left?.kind === "energyLeft" && left.energy >= energyMax * ENERGY_LEFT_WORTH)
    lines.push(
      ui(hpEmpty ? "ui.race.why.summary.energy.hp" : "ui.race.why.summary.energy", {
        energy: units(left.energy),
        max: formatFixed(energyMax, 1000, 0),
      }),
    );
  if (sinks.length === 0 && !m.isWinner && !m.runner.result.dnf && lines.length === 1)
    lines.push(ui("ui.race.why.summary.clean"));
  return lines;
}
