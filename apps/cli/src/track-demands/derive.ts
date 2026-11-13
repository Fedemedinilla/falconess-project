/**
 * What a track asks for, as letters (owner 2026-11-10: the tracks must read differently, but with
 * letters, never numbers). Pure: from the engine's measurements to the `trackDemands` of a
 * calendar. docs/formulas.md «Lo que pide una pista» documents the mapping:
 *
 * - weight of a stat on a track: the metres +100 of it is worth (the B5 probe: default field,
 *   level 450, paired seeds) over the metres +100 of Agility is worth there (Agility is the
 *   pillar, B5: always the largest, weight 1);
 * - the stats it asks: Agility, then every other stat of weight ≥ `MIN_WEIGHT`, the heaviest first,
 *   at most three and at least two;
 * - the level it asks in a stat: the rivals' level in that stat at the track's reference week (the
 *   rival curve `rivalBase + rivalPerTurn × week`, each stat by the mean of the four rival rows)
 *   times √weight; the reference week is the latest goal on that track in the calendar, or the
 *   middle of its latest month as track of the month;
 * - the letter: that level on the stat scale `LETTER_FROM` (G … S, Umamusume's steps).
 */
import type { Aptitude, Calendar, StatName, TrackDemand } from "@falconess/schema";
import type { Ruleset } from "@falconess/sim";

type FieldConstants = Ruleset["field"];

export const STATS: readonly StatName[] = [
  "agility",
  "stamina",
  "technique",
  "courage",
  "intelligence",
];

/** A stat enters the card when +100 of it is worth at least this share of +100 of Agility. */
export const MIN_WEIGHT = 0.12;

/** The stat scale: the lowest value of each letter, from S down (below 100 is G). */
export const LETTER_FROM: readonly (readonly [Aptitude, number])[] = [
  ["S", 1000],
  ["A", 800],
  ["B", 600],
  ["C", 400],
  ["D", 300],
  ["E", 200],
  ["F", 100],
];

export function letterForLevel(level: number): Aptitude {
  for (const [letter, from] of LETTER_FROM) if (level >= from) return letter;
  return "G";
}

/** Metres +100 of each stat is worth on one track (the B5 probe's means). */
export type StatMetres = Readonly<Record<StatName, number>>;

/** Each stat's weight on a track: its metres over Agility's, clamped to 0 … 1. */
export function statWeights(m: StatMetres): Record<StatName, number> {
  const agi = m.agility;
  if (!(agi > 0)) throw new Error("Agility is worth no metres: the probe is broken");
  const out = {} as Record<StatName, number>;
  for (const s of STATS) out[s] = Math.min(1, Math.max(0, m[s] / agi));
  return out;
}

/** The stats a track asks for: Agility first, then the heaviest others of weight ≥ MIN_WEIGHT. */
export function demandedStats(w: Readonly<Record<StatName, number>>): StatName[] {
  const others = STATS.filter((s) => s !== "agility").sort((a, b) => w[b] - w[a]);
  const picked = others.filter((s) => w[s] >= MIN_WEIGHT).slice(0, 2);
  if (picked.length === 0 && others[0]) picked.push(others[0]);
  return ["agility", ...picked];
}

/**
 * The week the track's letters are read at: its latest goal in the calendar (the hardest field it
 * is a goal in), else the middle week of the latest month it is the track of the month (month i of
 * 12 is weeks 4i+1 … 4i+4), else mid-season.
 */
/**
 * ADR-0014: the weeks Peregrina's goals gave the Sprint and the Mirador before her story races got
 * their grades. A graded goal is one Falconess's own season (its field is not the rival curve), so
 * it never moves what a track shows to the others: these two keep the week they had.
 */
const PINNED_REFERENCE_WEEK: Readonly<Record<string, number>> = { sprint: 36, overlook: 46 };

export function referenceWeek(cal: Calendar, track: string, turns = 48): number {
  const pinned = PINNED_REFERENCE_WEEK[track];
  if (pinned !== undefined) return pinned;
  let week = 0;
  for (const goals of Object.values(cal.goals ?? {}))
    for (const g of goals)
      if (g.courseId === track && g.grade === undefined) week = Math.max(week, g.turn);
  if (week > 0) return week;
  const perMonth = turns / cal.monthTrack.length;
  cal.monthTrack.forEach((t, i) => {
    if (t === track) week = Math.max(week, Math.round(perMonth * i + perMonth / 2));
  });
  return week > 0 ? week : turns / 2;
}

/** The rivals' mean level in each stat at a week: the rival curve × the mean rival row. */
export function rivalLevels(field: FieldConstants, week: number): Record<StatName, number> {
  const mu = field.rivalBase + field.rivalPerTurn * week;
  const rows = Object.values(field.rivalWeights);
  const out = {} as Record<StatName, number>;
  STATS.forEach((s, i) => {
    const w = rows.reduce((sum, r) => sum + (r[i] ?? 0), 0) / rows.length;
    out[s] = (STATS.length * mu * w) / 1000;
  });
  return out;
}

export type TrackDemandRow = {
  readonly track: string;
  readonly week: number;
  readonly weights: Readonly<Record<StatName, number>>;
  readonly demands: readonly (TrackDemand & { readonly level: number })[];
};

/** One track's demands from its probe metres, the calendar and the rival field. */
export function deriveTrackDemands(
  track: string,
  metres: StatMetres,
  cal: Calendar,
  field: FieldConstants,
  turns = 48,
): TrackDemandRow {
  const weights = statWeights(metres);
  const week = referenceWeek(cal, track, turns);
  const rivals = rivalLevels(field, week);
  const demands = demandedStats(weights).map((stat) => {
    const level = rivals[stat] * Math.sqrt(weights[stat]);
    return { stat, letter: letterForLevel(level), level };
  });
  return { track, week, weights, demands };
}
