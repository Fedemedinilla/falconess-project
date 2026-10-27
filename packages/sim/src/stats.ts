import { clamp, scale } from "@falconess/rng";
import type {
  Aptitude,
  Biome,
  BiomeAptitudes,
  FalconessStats,
  Mood,
  StatName,
  Style,
  StyleAptitudes,
} from "@falconess/schema";
import type { Ruleset } from "./rulesets/index.js";

export const STAT_ORDER: readonly StatName[] = [
  "agility",
  "stamina",
  "technique",
  "courage",
  "intelligence",
];

export function aptitudeMult(ruleset: Ruleset, letter: Aptitude): number {
  return ruleset.aptitudeMult[letter];
}

export function moodMultiplier(ruleset: Ruleset, mood: Mood): number {
  return ruleset.moodMult[mood + 2] ?? 1000;
}

/**
 * Stats "of the day", computed once before training or racing (BRIEF §5):
 * S_eff = floor(S_base × m_mood × a), where biome aptitude scales agility and style aptitude
 * scales intelligence. Integers in, integers out.
 */
export function effectiveStats(
  ruleset: Ruleset,
  base: FalconessStats,
  mood: Mood,
  biomeApt: BiomeAptitudes,
  styleApt: StyleAptitudes,
  biome: Biome,
  style: Style,
): FalconessStats {
  const m = moodMultiplier(ruleset, mood);
  const a = aptitudeMult(ruleset, biomeApt[biome]);
  const s = aptitudeMult(ruleset, styleApt[style]);
  return {
    agility: scale(scale(base.agility, m), a),
    stamina: scale(base.stamina, m),
    technique: scale(base.technique, m),
    courage: scale(base.courage, m),
    intelligence: scale(scale(base.intelligence, m), s),
  };
}

export function clampStat(ruleset: Ruleset, v: number): number {
  return clamp(v, ruleset.season.statMin, ruleset.season.statMax);
}

export function addStat(
  ruleset: Ruleset,
  stats: FalconessStats,
  stat: StatName,
  delta: number,
): FalconessStats {
  return { ...stats, [stat]: clampStat(ruleset, stats[stat] + delta) };
}

export function statTotal(stats: FalconessStats): number {
  return STAT_ORDER.reduce((sum, k) => sum + stats[k], 0);
}

export function lowestStat(stats: FalconessStats): StatName {
  let best: StatName = "agility";
  for (const k of STAT_ORDER) if (stats[k] < stats[best]) best = k;
  return best;
}

export function highestStat(stats: FalconessStats): StatName {
  let best: StatName = "agility";
  for (const k of STAT_ORDER) if (stats[k] > stats[best]) best = k;
  return best;
}

const LETTERS: readonly Aptitude[] = ["G", "F", "E", "D", "C", "B", "A", "S"];

/** One letter better, capped at S. */
export function upgradeAptitude(letter: Aptitude): Aptitude {
  const i = LETTERS.indexOf(letter);
  return LETTERS[Math.min(i + 1, LETTERS.length - 1)] ?? letter;
}

export function aptitudeRank(letter: Aptitude): number {
  return LETTERS.indexOf(letter);
}
