/**
 * The week's eight actions as the Turn screen shows them before a click: what each one trains,
 * by how much, with whom, at what risk, and what it does to vigor and mood. Every rule is the
 * sim's pure function, the one `advanceSeason` itself calls (season/rules.ts, ADR-0006 D9):
 * `trainingGains`, `trainingRisk`, `actionBlock`, `restOptions`, `nextTrainingDriftPm`,
 * `trainingMoodMultiplier`, `moodMultiplier` and `vigor`. Two things stay here because they are
 * presentation: the cap of a previewed gain at the stat's room (what the bar can still fill) and
 * the clamp of a previewed vigor to the bar.
 *
 * The screen speaks in vigor (`fatigueMax − fatigue`): a fatigue cost of +20 is "Vigor −20".
 * actions.test.ts compares every preview with what `advanceSeason` applies, in both rulesets.
 */
import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import {
  type ActionBlock,
  facilityLevel,
  moodDriftPm,
  moodMultiplier,
  nextTrainingDriftPm,
  restOptions,
  type SimContext,
  actionBlock as simActionBlock,
  statCap,
  trainingGains,
  trainingMoodMultiplier,
  trainingRisk,
  trainingStreak,
  vigor,
} from "@falconess/sim";

export const TRAINING_KINDS = [
  "train:agility",
  "train:stamina",
  "train:technique",
  "train:risk-flight",
  "train:simulator",
] as const satisfies readonly TrainingKind[];

/** The eight actions of a week, in the order of their keyboard shortcuts (1–8). */
export const ACTION_KINDS = [...TRAINING_KINDS, "workshop", "rest", "outing"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export function isTraining(kind: ActionKind): kind is TrainingKind {
  return kind.startsWith("train:");
}

export type StatGain = { readonly stat: StatName; readonly gain: number };

export type CrewBonus = {
  /** Manufacturer id (its crew, palette and name come from content). */
  readonly manufacturer: string;
  /** Training bonus of this crew, per-mille. */
  readonly bonusPm: number;
};

/**
 * How loud a failure chance is on its card: none (it cannot fail), low, high (one in ten or
 * more: amber) or danger (one in four or more, or an injury from exhaustion: red).
 */
export type RiskLevel = "none" | "low" | "high" | "danger";

/** A chance from which a card warns (‰): one in ten. */
export const HIGH_RISK_PM = 100;
/** A chance from which a card alarms (‰): one in four. */
export const DANGER_RISK_PM = 250;

export type TrainingPreview = {
  readonly kind: TrainingKind;
  /** Facility level 1–5 of this training. */
  readonly level: number;
  /** Stat gains on a success, the main stat first (capped at what the stat can still gain). */
  readonly gains: readonly StatGain[];
  /** Skill points on a success (the simulator). */
  readonly skillPoints: number;
  /** Chance that the training fails (part of the gains lost instead), per-mille. */
  readonly failPm: number;
  /** Part of `failPm` that is an injury, per-mille. */
  readonly injuryPm: number;
  readonly risk: RiskLevel;
  /** Vigor change (the negative of the fatigue cost). */
  readonly vigor: number;
  /** Crews present at this training this week. */
  readonly crews: readonly CrewBonus[];
};

export type { ActionBlock };

/** What turns this week's action into a rest: an injury (any input), or v1's forced rest. */
export function actionBlock(
  ctx: SimContext,
  state: SeasonState,
  kind: ActionKind,
): ActionBlock | undefined {
  return simActionBlock(ctx.ruleset, state, kind);
}

export function crewsAt(ctx: SimContext, state: SeasonState, kind: TrainingKind): CrewBonus[] {
  return (state.crewPresence[kind] ?? []).map((manufacturer) => ({
    manufacturer,
    bonusPm: Math.round(ctx.content.getManufacturer(manufacturer).crew.trainingBonus * 1000),
  }));
}

export function riskLevel(failPm: number, injuryPm: number, exhausted: boolean): RiskLevel {
  if (failPm <= 0) return "none";
  if (failPm >= DANGER_RISK_PM || (exhausted && injuryPm > 0)) return "danger";
  return failPm >= HIGH_RISK_PM ? "high" : "low";
}

export function trainingPreview(
  ctx: SimContext,
  state: SeasonState,
  kind: TrainingKind,
): TrainingPreview {
  const S = ctx.ruleset.season;
  // what a success adds, up to the stat's room (the sim clamps at statMax)
  const gains = trainingGains(ctx, state, kind).map(({ stat, gain }) => ({
    stat,
    gain: Math.max(0, Math.min(gain, statCap(ctx.ruleset, state) - state.stats[stat])),
  }));
  const { failPm, injuryPm } = trainingRisk(ctx.ruleset, state.fatigue, kind);
  const exhausted = kind !== "train:risk-flight" && injuryPm > 0;
  return {
    kind,
    level: facilityLevel(ctx, state.facilityUses[kind]),
    gains,
    skillPoints: kind === "train:simulator" ? S.simulatorSkillPoints : 0,
    failPm,
    injuryPm,
    risk: riskLevel(failPm, injuryPm, exhausted),
    vigor: -S.fatigueCost[kind],
    crews: crewsAt(ctx, state, kind),
  };
}

/** The mood's bounds: the sim keeps it within −2 … +2 (season/context.ts `changeMood`). */
export const MOOD_MIN = -2;
export const MOOD_MAX = 2;

export type RestPreview = {
  /** What a chosen rest can give back, with its chance (one option: no draw, v1). */
  readonly options: readonly { readonly vigor: number; readonly chancePm: number }[];
  /** The least and the most a chosen rest gives back. */
  readonly vigorMin: number;
  readonly vigorMax: number;
  /** Chance of mood +1, per-mille. */
  readonly moodUpPm: number;
  /** What an injured week (or v1's forced rest of an injured week) gives back. */
  readonly injuredVigor: number;
};

/** A chosen rest (`restOptions`), and the recovery of a week spent injured (`fatigueCost.rest`). */
export function restPreview(ctx: SimContext): RestPreview {
  const options = restOptions(ctx.ruleset).map((o) => ({
    vigor: o.recovery,
    chancePm: o.chancePm,
  }));
  const values = options.map((o) => o.vigor);
  return {
    options,
    vigorMin: Math.min(...values),
    vigorMax: Math.max(...values),
    moodUpPm: ctx.ruleset.season.restMoodUpChance,
    injuredVigor: -ctx.ruleset.season.fatigueCost.rest,
  };
}

export type OutingPreview = {
  readonly vigor: number;
  /** The mood it gives: +1, or 0 when she is already at the top (the sim keeps mood at +2). */
  readonly mood: number;
  readonly bond: number;
  /** The crews an outing can go with: the hangar's manufacturers, the equipped frame's first. */
  readonly crews: readonly string[];
};

export function outingPreview(ctx: SimContext, state: SeasonState): OutingPreview {
  const equipped = ctx.content.getFrame(state.equippedFrame).manufacturer;
  const crews = [equipped];
  for (const frameId of state.hangar) {
    const m = ctx.content.getFrame(frameId).manufacturer;
    if (!crews.includes(m)) crews.push(m);
  }
  return {
    vigor: -ctx.ruleset.season.fatigueCost.outing,
    mood: Math.min(1, MOOD_MAX - state.mood),
    bond: ctx.ruleset.season.bondPerOuting,
    crews,
  };
}

/** The workshop's vigor change (the workshop panel shows the rest). */
export function workshopVigor(ctx: SimContext): number {
  return -ctx.ruleset.season.fatigueCost.workshop;
}

/** The current mood's multiplier on training gains, per-mille (v2 ×0.80 … ×1.20). */
export function trainMoodPm(ctx: SimContext, state: SeasonState): number {
  return trainingMoodMultiplier(ctx.ruleset, state.mood);
}

/** The current mood's multiplier on race stats, per-mille (v2 ×0.96 … ×1.04). */
export function raceMoodPm(ctx: SimContext, state: SeasonState): number {
  return moodMultiplier(ctx.ruleset, state.mood);
}

export type DriftPreview = {
  /** Training weeks in a row at the end of the log. */
  readonly streak: number;
  /**
   * Chance that the next training week costs 1 mood, per-mille: 0 when the ruleset has no drift
   * (v1) or the mood is already at its lowest (the sim rolls, but a lower mood does not exist).
   */
  readonly nextPm: number;
  /** The streak makes it more likely than a first training's: worth a word on the screen. */
  readonly rising: boolean;
};

/** The mood drift the next training would roll (ADR-0006: a streak tires her of training). */
export function driftPreview(ctx: SimContext, state: SeasonState): DriftPreview {
  const nextPm = state.mood > MOOD_MIN ? nextTrainingDriftPm(ctx.ruleset, state) : 0;
  return {
    streak: trainingStreak(state),
    nextPm,
    rising: nextPm > moodDriftPm(ctx.ruleset, 1),
  };
}

/** The bar's value: vigor, `fatigueMax − fatigue`. */
export function vigorOf(ctx: SimContext, state: SeasonState): number {
  return vigor(ctx.ruleset, state.fatigue);
}

/** Vigor after a change, within the bar (the sim clamps fatigue to [0, fatigueMax]). */
export function vigorAfter(ctx: SimContext, state: SeasonState, change: number): number {
  return Math.max(0, Math.min(ctx.ruleset.season.fatigueMax, vigorOf(ctx, state) + change));
}

/** A vigor change that may be a range (v2's rest draws one of several recoveries). */
export type VigorChange = { readonly min: number; readonly max: number };

/**
 * What an action would do to the bars, for the board's preview while the pointer or the focus is
 * on it: the stat gains of a training on a success, and the vigor change. An injured week or
 * a forced rest shows the rest it turns into.
 */
export type ActionPreview = {
  readonly kind: ActionKind;
  readonly gains: readonly StatGain[];
  readonly vigor: VigorChange;
};

const exactly = (v: number): VigorChange => ({ min: v, max: v });

export function actionPreview(
  ctx: SimContext,
  state: SeasonState,
  kind: ActionKind,
): ActionPreview {
  const block = actionBlock(ctx, state, kind);
  const rest = restPreview(ctx);
  if (block === "injured") return { kind, gains: [], vigor: exactly(rest.injuredVigor) };
  if (block === "forced-rest" || kind === "rest")
    return { kind, gains: [], vigor: { min: rest.vigorMin, max: rest.vigorMax } };
  if (isTraining(kind)) {
    const t = trainingPreview(ctx, state, kind);
    return { kind, gains: t.gains, vigor: exactly(t.vigor) };
  }
  if (kind === "outing")
    return { kind, gains: [], vigor: exactly(outingPreview(ctx, state).vigor) };
  return { kind, gains: [], vigor: exactly(workshopVigor(ctx)) };
}

/** The previewed gain of one stat, if the preview trains it. */
export function previewGain(
  preview: ActionPreview | undefined,
  stat: StatName,
): number | undefined {
  return preview?.gains.find((g) => g.stat === stat)?.gain;
}

/** Vigor after the previewed action (a range for a drawn rest), or undefined without a preview. */
export function previewVigor(
  ctx: SimContext,
  state: SeasonState,
  preview: ActionPreview | undefined,
): VigorChange | undefined {
  if (preview === undefined) return undefined;
  return {
    min: vigorAfter(ctx, state, preview.vigor.min),
    max: vigorAfter(ctx, state, preview.vigor.max),
  };
}
