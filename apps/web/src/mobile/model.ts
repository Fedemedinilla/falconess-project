/**
 * View models of the phone game (the approved prototype, docs/design/temporada-v3.md T14): what the
 * week menu, the training screen and the pre-race card show. Every number is the sim's, read from
 * the state or from the sim's own preview functions (screens/model/actions.ts and position.ts);
 * here only the presentation choices live: the risk colors of a failure chance, the medal tiers of
 * a stat, which trainings the delta button calls boosted, the crews' badges.
 */
import type { CupRound, Mood, SeasonState, StatName, TrainingKind } from "@falconess/schema";
import { bondLevel, type SimContext, STAT_ORDER, statCap } from "@falconess/sim";
import {
  type ActionKind,
  actionBlock,
  actionPreview,
  previewVigor,
  TRAINING_KINDS,
  trainingPreview,
  vigorOf,
} from "../screens/model/actions";
import { isRaceWeek, type RaceDistance, raceDistance } from "../screens/model/position";
import { nextGoal } from "../screens/model/season";
import { locale } from "../text/lang";

/**
 * The color of a failure chance (owner, 2026-10-30): light blue at 0 %, green from 1 to 19 %,
 * yellow from 20 to 39 %, red from 40 %. Separate from the stats' medal colors.
 */
export type RiskTone = "zero" | "low" | "mid" | "high";

export function riskTone(failPm: number): RiskTone {
  if (failPm <= 0) return "zero";
  if (failPm < 200) return "low";
  if (failPm < 400) return "mid";
  return "high";
}

/** A failure chance in whole percent, as the badge says it (rounded, never 0 when it can fail). */
export function failPercent(failPm: number): number {
  if (failPm <= 0) return 0;
  return Math.max(1, Math.round(failPm / 10));
}

/**
 * The medal tier of a stat value (owner, 2026-10-30): stone (< 150), jade (150-299), sapphire
 * (300-449), bronze (450-649), ruby (650-849), gold (850-1199), platinum (1200).
 */
export type StatTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const TIER_FROM = [150, 300, 450, 650, 850, 1200] as const;

export function statTier(value: number): StatTier {
  let tier = 0;
  for (const from of TIER_FROM) if (value >= from) tier++;
  return tier as StatTier;
}

export type MoodTone = "hi" | "mid" | "lo";

export function moodTone(mood: Mood | number): MoodTone {
  if (mood > 0) return "hi";
  return mood === 0 ? "mid" : "lo";
}

export type CrewBadge = {
  readonly manufacturer: string;
  /** Bond level with this crew, 0 … `bondMax` (the sim's `bondLevel`). */
  readonly bond: number;
  readonly bondMax: number;
  /** Training bonus of this crew, per-mille. */
  readonly bonusPm: number;
};

export type TrainingCard = {
  readonly kind: TrainingKind;
  readonly level: number;
  /** Stat gains on a success, the main stat first. */
  readonly gains: readonly { readonly stat: StatName; readonly gain: number }[];
  readonly skillPoints: number;
  readonly failPm: number;
  readonly failPercent: number;
  readonly risk: RiskTone;
  /** Vigor change of this training. */
  readonly vigor: number;
  /** Crews present this week, the strongest bond first. */
  readonly crews: readonly CrewBadge[];
  /** At least one crew showed up: the training is boosted. */
  readonly boosted: boolean;
};

function crewBadges(
  ctx: SimContext,
  state: SeasonState,
  crews: readonly { manufacturer: string; bonusPm: number }[],
): CrewBadge[] {
  const bondMax = Math.floor(100 / ctx.ruleset.season.bondLevelStep);
  return crews
    .map((c) => ({
      manufacturer: c.manufacturer,
      bonusPm: c.bonusPm,
      bond: Math.min(bondMax, bondLevel(ctx, state.bond[c.manufacturer] ?? 0)),
      bondMax,
    }))
    .sort((a, b) => b.bond - a.bond || b.bonusPm - a.bonusPm);
}

/** The five trainings of the week with what the sim says each would do. */
export function trainingCards(ctx: SimContext, state: SeasonState): TrainingCard[] {
  return TRAINING_KINDS.map((kind) => {
    const t = trainingPreview(ctx, state, kind);
    const crews = crewBadges(ctx, state, t.crews);
    return {
      kind,
      level: t.level,
      gains: t.gains,
      skillPoints: t.skillPoints,
      failPm: t.failPm,
      failPercent: failPercent(t.failPm),
      risk: riskTone(t.failPm),
      vigor: t.vigor,
      crews,
      boosted: crews.length > 0,
    };
  });
}

/** The main stat of each training (the first of its gains), for the delta button's chips. */
export function boostedTrainings(cards: readonly TrainingCard[]): TrainingCard[] {
  return cards.filter((c) => c.boosted);
}

export type VigorView = {
  readonly value: number;
  readonly max: number;
  /** Vigor after the previewed action: a range for a drawn rest. */
  readonly after: { readonly min: number; readonly max: number } | undefined;
};

/** The vigor bar, with the cost preview of `kind` when one is selected. */
export function vigorView(
  ctx: SimContext,
  state: SeasonState,
  kind: ActionKind | undefined,
): VigorView {
  const preview = kind && actionPreview(ctx, state, kind);
  return {
    value: vigorOf(ctx, state),
    max: ctx.ruleset.season.fatigueMax,
    after: previewVigor(ctx, state, preview),
  };
}

export type GoalCard = {
  readonly turn: number;
  readonly courseId: string;
  readonly minPlace: number;
  /** Weeks until it: 0 = this week. */
  readonly weeksLeft: number;
  /** v3: the distance, its length and her letter there (undefined on v1/v2). */
  readonly distance: RaceDistance | undefined;
  /** ADR-0012: a round of the Copa (Exigente). */
  readonly cup: CupRound | undefined;
  /** ADR-0012: Gerifalte, the rival built on her, runs in it. */
  readonly mirror: boolean;
};

export type StatCell = {
  readonly stat: StatName;
  readonly value: number;
  readonly tier: StatTier;
  /** ADR-0012: at the season's cap (900 on Normal): training it adds nothing. */
  readonly capped: boolean;
};

export type WeekMenu = {
  readonly turn: number;
  readonly turns: number;
  /** Weeks left after this one. */
  readonly turnsLeft: number;
  readonly goal: GoalCard | undefined;
  readonly mood: number;
  readonly stats: readonly StatCell[];
  readonly skillPoints: number;
  /** This week's action runs a goal race afterwards. */
  readonly raceWeek: boolean;
  /** Injured: whatever she is told, she rests (the sim's `actionBlock`). */
  readonly injured: boolean;
  readonly injuryTurns: number;
  /** Trainings with a crew this week (the delta button's chips). */
  readonly boosted: readonly TrainingKind[];
};

/** Her stats as cells; `cap` is the season's stat cap (`statCap`), none when absent. */
export function statCells(state: SeasonState, cap = Number.POSITIVE_INFINITY): StatCell[] {
  return STAT_ORDER.map((stat) => ({
    stat,
    value: state.stats[stat],
    tier: statTier(state.stats[stat]),
    capped: state.stats[stat] >= cap,
  }));
}

export function weekMenu(ctx: SimContext, state: SeasonState): WeekMenu {
  const turns = ctx.ruleset.season.turns;
  const next = nextGoal(ctx, state);
  return {
    turn: state.turn,
    turns,
    turnsLeft: Math.max(0, turns - state.turn),
    goal: next && {
      turn: next.goal.turn,
      courseId: next.goal.courseId,
      minPlace: next.goal.minPlace,
      weeksLeft: next.weeksLeft,
      distance: raceDistance(ctx, state, next.goal.courseId),
      cup: next.goal.cup,
      mirror: next.goal.mirrorRival === true,
    },
    mood: state.mood,
    stats: statCells(state, statCap(ctx.ruleset, state)),
    skillPoints: state.skillPoints,
    raceWeek: isRaceWeek(ctx, state),
    injured: actionBlock(ctx, state, "rest") === "injured",
    injuryTurns: state.injuryTurns,
    boosted: boostedTrainings(trainingCards(ctx, state)).map((c) => c.kind),
  };
}

/** Two letters for a crew's portrait, from its manufacturer's name: "Kōryū Racing" → "KR". */
export function crewInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w !== "");
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "").slice(0, 2);
  return letters.toLocaleUpperCase(locale());
}
