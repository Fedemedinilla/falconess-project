/**
 * Plain-language lines for content data the season screens show: frame passives, parts and
 * quirks (RaceModifier, FrameMods), active skills (trigger + effect) and event options
 * (EventEffects). Every word comes from es.json (`ui.mod.*`, `ui.skill.*`, `ui.fx.*` templates and
 * the game's own names); the numbers are the content's, only converted to the units a player reads
 * (ticks to seconds, fractions to percentages). Nothing here is a game rule.
 */
import { toPermille } from "@falconess/rng";
import type {
  ActiveSkill,
  EventEffects,
  EventOption,
  FrameMods,
  RaceModifier,
  RacePhase,
  SkillTrigger,
} from "@falconess/schema";
import { STAT_ORDER } from "@falconess/sim";
import { getContent } from "../../content/load";
import { formatFixed, formatInt, formatPermille, formatSigned } from "../../text/format";
import { locale, perLang } from "../../text/lang";
import { gameText, ui, uiCount } from "../../text/ui";
import { type IconName, statIcon } from "../../ui/icons";

const TICKS_PER_SECOND = 15;
const MINUS = "−";
const trimmed = perLang(() => new Intl.NumberFormat(locale(), { maximumFractionDigits: 3 }));

/** A content decimal as written, up to three places: 1.003 → "1,003", 0.5 → "0,5". */
export function formatDecimal(x: number): string {
  return trimmed().format(x).replace("-", MINUS);
}

/** A content decimal with its sign: "+0,05", "−10". */
export function formatSignedDecimal(x: number): string {
  return x > 0 ? `+${formatDecimal(x)}` : formatDecimal(x);
}

/** A fraction as a percentage: 0.1 → "10 %", 0.245 → "24,5 %". */
export function formatFraction(fraction: number): string {
  const pm = toPermille(fraction);
  return formatPermille(pm, pm % 10 === 0 ? 0 : 1);
}

/** Per-mille as a percentage with a decimal only when it has one: 55 → "5,5 %", 50 → "5 %". */
export function formatChance(pm: number): string {
  return formatPermille(pm, pm % 10 === 0 ? 0 : 1);
}

/** Race ticks as seconds: 45 → "3", 10 → "0,7". */
export function formatTicksAsSeconds(ticks: number): string {
  return ticks % TICKS_PER_SECOND === 0
    ? formatInt(ticks / TICKS_PER_SECOND)
    : formatFixed(ticks, TICKS_PER_SECOND, 1);
}

const segmentName = (segment: string) => gameText(`segment.${segment}`);
const statName = (stat: string) => gameText(`stat.${stat}`);

function phaseSuffix(phase: RacePhase): string {
  return phase === "any" ? "" : ui("ui.mod.inPhase", { phase: ui(`ui.phase.${phase}`) });
}

/** One race modifier of a passive, part or quirk. */
export function describeModifier(m: RaceModifier): string {
  switch (m.kind) {
    case "falconess-stat":
      return ui("ui.mod.falconess-stat", { stat: statName(m.stat), delta: formatSigned(m.delta) });
    case "segment-factor":
      return ui(m.mode === "override" ? "ui.mod.segment-override" : "ui.mod.segment-multiply", {
        segment: segmentName(m.segment),
        value: formatDecimal(m.value),
      });
    case "curves-penalty-scale":
      return ui("ui.mod.curves-penalty-scale", { scale: formatDecimal(m.scale) });
    case "heat-penalty-immunity":
      return m.untilMeters === undefined
        ? ui("ui.mod.heat-penalty-immunity")
        : ui("ui.mod.heat-penalty-immunity.until", { meters: m.untilMeters });
    case "obstacle-armor":
      return ui("ui.mod.obstacle-armor", { seconds: formatTicksAsSeconds(m.extraTicks) });
    case "regen":
      // energy per tick → per second, from per-mille so the digits round once
      return ui("ui.mod.regen", {
        energy: formatFixed(toPermille(m.perTick) * TICKS_PER_SECOND, 1000, 2),
      });
    case "regen-pack-multiplier":
      return ui("ui.mod.regen-pack-multiplier", { factor: formatDecimal(m.factor) });
    case "free-first-boost":
      return ui("ui.mod.free-first-boost", { segment: segmentName(m.segment) });
    case "pulse-chain-accel":
      return ui("ui.mod.pulse-chain-accel", {
        n: m.chainIndex,
        bonus: formatFraction(m.accelBonus),
      });
    case "pulse-cooldown":
      return ui("ui.mod.pulse-cooldown", {
        segment: segmentName(m.segment),
        seconds: formatTicksAsSeconds(m.cooldownTicks),
      });
    case "activation-bonus":
      return ui("ui.mod.activation-bonus", {
        bonus: formatFraction(m.bonus),
        phase: phaseSuffix(m.phase),
      });
    case "heat-to-energy":
      return ui("ui.mod.heat-to-energy", { ratio: formatFraction(m.ratio) });
    case "lift-bonus":
      return ui("ui.mod.lift-bonus", { bonus: formatFraction(m.factor) });
    case "no-pulse":
      return ui("ui.mod.no-pulse");
    case "random-skill-guaranteed":
      return ui("ui.mod.random-skill-guaranteed");
    case "power-cap":
      return ui("ui.mod.power-cap", { max: formatFixed(toPermille(m.max), 1000, 2) });
  }
}

/** The additive frame mods of a part or quirk, one line per non-zero field. */
export function describeMods(mods: FrameMods): string[] {
  const out: string[] = [];
  if (mods.powerToWeight !== 0)
    out.push(
      ui("ui.mod.frame", {
        stat: gameText("framestat.powerToWeight"),
        delta: formatSignedDecimal(mods.powerToWeight),
      }),
    );
  for (const stat of ["energy", "dissipation", "durability"] as const)
    if (mods[stat] !== 0)
      out.push(
        ui("ui.mod.frame", {
          stat: gameText(`framestat.${stat}`),
          delta: formatSigned(mods[stat]),
        }),
      );
  if (mods.skillSlots !== 0)
    out.push(ui("ui.mod.skillSlots", { delta: formatSigned(mods.skillSlots) }));
  return out;
}

/** Everything a part or quirk does: its mods, then its race modifiers. */
export function describeSource(source: {
  readonly mods: FrameMods;
  readonly modifiers: readonly RaceModifier[];
}): string[] {
  return [...describeMods(source.mods), ...source.modifiers.map(describeModifier)];
}

function positionText(range: readonly [number, number]): string {
  const [from, to] = range;
  if (from === 0) return ui("ui.skill.when.front", { to: formatFraction(to) });
  if (to === 1) return ui("ui.skill.when.back", { from: formatFraction(from) });
  return ui("ui.skill.when.between", { from: formatFraction(from), to: formatFraction(to) });
}

/** When an active skill can fire, or "" when it has no condition. */
export function describeTrigger(trigger: SkillTrigger): string {
  const parts: string[] = [];
  if (trigger.phase !== "any")
    parts.push(ui("ui.skill.when.phase", { phase: ui(`ui.phase.${trigger.phase}`) }));
  if (trigger.segment !== undefined)
    parts.push(ui("ui.skill.when.segment", { segment: segmentName(trigger.segment) }));
  if (trigger.positionRange !== undefined) parts.push(positionText(trigger.positionRange));
  if (trigger.heatAbove !== undefined)
    parts.push(ui("ui.skill.when.heatAbove", { n: trigger.heatAbove }));
  if (trigger.energyBelow !== undefined)
    parts.push(ui("ui.skill.when.energyBelow", { n: trigger.energyBelow }));
  return parts.join(", ");
}

/** What an active skill does once it fires. */
export function describeSkillEffect(skill: ActiveSkill): string {
  const e = skill.effect;
  const parts: string[] = [];
  if (e.speed !== 0) parts.push(ui("ui.skill.effect.speed", { v: formatSignedDecimal(e.speed) }));
  if (e.accel !== 0) parts.push(ui("ui.skill.effect.accel", { v: formatSignedDecimal(e.accel) }));
  if (e.energyRefund !== 0) parts.push(ui("ui.skill.effect.energy", { n: e.energyRefund }));
  if (e.heatCool !== 0) parts.push(ui("ui.skill.effect.heat", { n: e.heatCool }));
  if (e.durabilityGuard) parts.push(ui("ui.skill.effect.guard"));
  let text = parts.join(", ");
  if (e.durationTicks > 0)
    text = ui("ui.skill.effect.during", {
      effect: text,
      seconds: formatTicksAsSeconds(e.durationTicks),
    });
  if (skill.activationBase < 1)
    text = ui("ui.skill.effect.activation", {
      effect: text,
      factor: formatDecimal(skill.activationBase),
    });
  return text;
}

/** An active skill in one line: "En Pasillo: +0,5 m/s durante 3 s". */
export function describeActiveSkill(skill: ActiveSkill): string {
  const when = describeTrigger(skill.trigger);
  const effect = describeSkillEffect(skill);
  return when === "" ? effect : ui("ui.skill.desc", { when: capitalize(when), effect });
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
}

/** One effect of an event option: its words and the emoji of what it changes. */
export type EffectLine = { readonly icon: IconName; readonly text: string };

/**
 * One event effect block as short lines ("Inteligencia +12", "Ánimo −1"). `crewName` names a
 * manufacturer's crew for bond changes.
 */
export function describeEffects(
  fx: EventEffects,
  crewName: (mfrId: string) => string,
): EffectLine[] {
  const out: EffectLine[] = [];
  const add = (icon: IconName, text: string) => out.push({ icon, text });
  for (const stat of STAT_ORDER) {
    const delta = fx.stats[stat];
    if (delta !== undefined && delta !== 0)
      add(statIcon(stat), ui("ui.fx.stat", { stat: statName(stat), delta: formatSigned(delta) }));
  }
  if (fx.mood !== 0) add("mood", ui("ui.fx.mood", { delta: formatSigned(fx.mood) }));
  // the screen speaks in vigor: an effect's fatigue +10 is vigor −10 (ADR-0006)
  if (fx.fatigue !== 0) add("vigor", ui("ui.fx.vigor", { delta: formatSigned(-fx.fatigue) }));
  for (const [mfr, delta] of Object.entries(fx.bond))
    if (delta !== 0)
      add("bond", ui("ui.fx.bond", { crew: crewName(mfr), delta: formatSigned(delta) }));
  if (fx.skillPoints !== 0)
    add("skillPoints", ui("ui.fx.skillPoints", { delta: formatSigned(fx.skillPoints) }));
  if (fx.durability !== 0)
    add("framestat.durability", ui("ui.fx.durability", { delta: formatSigned(fx.durability) }));
  if (fx.injuryTurns > 0)
    add("injury", ui("ui.fx.injury", { weeks: uiCount("ui.count.weeks", fx.injuryTurns) }));
  if (fx.learnSkill !== undefined)
    add(
      "skill",
      ui("ui.fx.learnSkill", { skill: gameText(getContent().getSkill(fx.learnSkill).textKey) }),
    );
  return out;
}

export type OptionSummary = {
  /** The option's sure effects. */
  readonly sure: readonly EffectLine[];
  /** Chance branches: the probability and what that branch adds. */
  readonly branches: readonly {
    readonly chance: string;
    readonly effects: readonly EffectLine[];
  }[];
};

/** What an event option does, with its chance branches spelled out. */
export function describeOption(
  option: EventOption,
  crewName: (mfrId: string) => string,
): OptionSummary {
  return {
    sure: describeEffects(option.effects, crewName),
    branches: (option.chance ?? []).map((b) => ({
      chance: formatFraction(b.p),
      effects: describeEffects(b.effects, crewName),
    })),
  };
}
