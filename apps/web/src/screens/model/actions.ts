/**
 * The week's eight actions as the Turn screen shows them before a click: what each one trains,
 * by how much, with whom, at what risk and fatigue. Gains come from the sim's `trainingGain` and
 * `facilityLevel`.
 *
 * KNOWN EXCEPTION to "the UI never computes a rule" (temporary, test-guarded): the split into a
 * secondary stat (and risk flight's two stats), the cap at statMax, the fail and injury chances,
 * the injured and forced-rest blocks, the outing's default crew and the fatigue clamp mirror
 * `applyTraining` / `applyAction` (packages/sim/src/season/training.ts and advance.ts) line for
 * line. They cannot come from running `advanceSeason` as a preview: its per-input draw would tell
 * whether the training succeeds. The fix is to extract those rules in the sim as pure functions
 * (`trainingGains`, `trainingRisk`, `actionResolution`) that `applyTraining` and the UI both call;
 * that is a sim change and waits for the owner's approval (CLAUDE.md). Until then
 * actions.test.ts compares every preview with what `advanceSeason` applies, including the risk
 * flight injury, fatigue at the forced-rest threshold and the statMax cap, so a change to these
 * rules in the sim fails the web tests instead of showing wrong numbers.
 */
import { scale } from "@falconess/rng";
import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import { facilityLevel, moodMultiplier, type SimContext, trainingGain } from "@falconess/sim";

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

export type TrainingPreview = {
  readonly kind: TrainingKind;
  /** Facility level 1–5 of this training. */
  readonly level: number;
  /** Stat gains on a success, the main stat first. */
  readonly gains: readonly StatGain[];
  /** Skill points on a success (the simulator). */
  readonly skillPoints: number;
  /** Chance that the training fails (half the gains are lost instead), per-mille. */
  readonly failPm: number;
  /** Part of `failPm` that is an injury, per-mille (risk flight). */
  readonly injuryPm: number;
  /** Fatigue change. */
  readonly fatigue: number;
  /** Crews present at this training this week. */
  readonly crews: readonly CrewBonus[];
};

/** What blocks the action this week: an injury rests whatever the input; high fatigue turns training into rest. */
export type ActionBlock = "injured" | "forced-rest";

export function actionBlock(
  ctx: SimContext,
  state: SeasonState,
  kind: ActionKind,
): ActionBlock | undefined {
  if (state.injuryTurns > 0) return "injured";
  if (isTraining(kind) && state.fatigue >= ctx.ruleset.season.forcedRestAt) return "forced-rest";
  return undefined;
}

export function crewsAt(ctx: SimContext, state: SeasonState, kind: TrainingKind): CrewBonus[] {
  return (state.crewPresence[kind] ?? []).map((manufacturer) => ({
    manufacturer,
    bonusPm: Math.round(ctx.content.getManufacturer(manufacturer).crew.trainingBonus * 1000),
  }));
}

export function trainingPreview(
  ctx: SimContext,
  state: SeasonState,
  kind: TrainingKind,
): TrainingPreview {
  const S = ctx.ruleset.season;
  const primary = ctx.ruleset.trainingStat[kind];
  // what a success adds: the gain, up to the stat's cap (applyStat clamps at statMax)
  const gain = (stat: StatName, g: number): StatGain => ({
    stat,
    gain: Math.max(0, Math.min(g, S.statMax - state.stats[stat])),
  });
  const gains: StatGain[] = [];
  if (kind === "train:risk-flight") {
    const g = trainingGain(ctx, state, kind, "courage");
    gains.push(
      gain("courage", scale(g, S.riskFlightCourage)),
      gain("agility", scale(g, S.riskFlightAgility)),
    );
  } else {
    const g = trainingGain(ctx, state, kind, primary);
    gains.push(gain(primary, g));
    const secondary = ctx.ruleset.trainingSecondary[kind];
    if (secondary) gains.push(gain(secondary, Math.max(1, scale(g, S.secondaryGain))));
  }
  const failPm =
    kind === "train:simulator"
      ? 0
      : kind === "train:risk-flight"
        ? S.riskFlightFail
        : S.failBase + Math.floor(state.fatigue / S.failPerFatigue);
  return {
    kind,
    level: facilityLevel(ctx, state.facilityUses[kind]),
    gains,
    skillPoints: kind === "train:simulator" ? S.simulatorSkillPoints : 0,
    failPm,
    injuryPm: kind === "train:risk-flight" ? S.riskFlightInjury : 0,
    fatigue: S.fatigueCost[kind],
    crews: crewsAt(ctx, state, kind),
  };
}

export type RestPreview = {
  readonly fatigue: number;
  /** Chance of mood +1, per-mille. */
  readonly moodUpPm: number;
};

/** Rest, also what a forced rest or an injured week does to fatigue. */
export function restPreview(ctx: SimContext): RestPreview {
  return {
    fatigue: ctx.ruleset.season.fatigueCost.rest,
    moodUpPm: ctx.ruleset.season.restMoodUpChance,
  };
}

export type OutingPreview = {
  readonly fatigue: number;
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
    fatigue: ctx.ruleset.season.fatigueCost.outing,
    mood: 1,
    bond: ctx.ruleset.season.bondPerOuting,
    crews,
  };
}

/** The workshop's fatigue cost (the workshop panel shows the rest). */
export function workshopFatigue(ctx: SimContext): number {
  return ctx.ruleset.season.fatigueCost.workshop;
}

/** The mood's training multiplier, per-mille (the sim's `moodMultiplier`). */
export function moodPm(ctx: SimContext, state: SeasonState): number {
  return moodMultiplier(ctx.ruleset, state.mood);
}

/** Fatigue after an action, within the ruleset's range (for the fatigue bar's preview). */
export function fatigueAfter(ctx: SimContext, state: SeasonState, change: number): number {
  return Math.max(0, Math.min(ctx.ruleset.season.fatigueMax, state.fatigue + change));
}

/**
 * What an action would do to the bars, for the board's preview while the pointer or the focus is
 * on it: the stat gains of a training on a success, and the fatigue after it. An injured week or
 * a forced rest shows the rest it turns into.
 */
export type ActionPreview = {
  readonly kind: ActionKind;
  readonly gains: readonly StatGain[];
  readonly fatigue: number;
};

export function actionPreview(
  ctx: SimContext,
  state: SeasonState,
  kind: ActionKind,
): ActionPreview {
  if (actionBlock(ctx, state, kind) !== undefined)
    return { kind, gains: [], fatigue: restPreview(ctx).fatigue };
  if (isTraining(kind)) {
    const t = trainingPreview(ctx, state, kind);
    return { kind, gains: t.gains, fatigue: t.fatigue };
  }
  const S = ctx.ruleset.season;
  return { kind, gains: [], fatigue: S.fatigueCost[kind] };
}

/** The previewed gain of one stat, if the preview trains it. */
export function previewGain(
  preview: ActionPreview | undefined,
  stat: StatName,
): number | undefined {
  return preview?.gains.find((g) => g.stat === stat)?.gain;
}

/** Fatigue after the previewed action, or undefined without a preview. */
export function previewFatigue(
  ctx: SimContext,
  state: SeasonState,
  preview: ActionPreview | undefined,
): number | undefined {
  return preview === undefined ? undefined : fatigueAfter(ctx, state, preview.fatigue);
}
