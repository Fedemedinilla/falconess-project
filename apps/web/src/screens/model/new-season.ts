/**
 * Choices of the new-season screen, read from content: the default pick (the same as `pnpm play`),
 * the frames in a stable order, the scale of the base-stat bars and which hangar crews train which
 * stat (BRIEF section 8: a crew shows up at the trainings of its stats).
 */
import type { ContentIndex, Frame, StatName } from "@falconess/schema";
import { STAT_ORDER } from "@falconess/sim";

/** Frames a hangar holds (RunInput `start`: 1 to 4). */
export const HANGAR_SIZE = 4;

/** The pick of `pnpm play` when nothing is chosen. */
export const DEFAULT_FALCONESS = "peregrina";
const DEFAULT_HANGAR = ["shiden", "mule", "nimbus", "falke"] as const;

/** The hangar `pnpm play` starts with, or the first frames content has. */
export function defaultHangar(content: ContentIndex): string[] {
  const known = DEFAULT_HANGAR.filter((id) => content.frames.has(id));
  if (known.length > 0) return known;
  return [...content.frames.keys()].slice(0, HANGAR_SIZE);
}

/** Add or remove a frame, keeping the hangar at most `HANGAR_SIZE` frames. */
export function toggleFrame(hangar: readonly string[], frameId: string): string[] {
  if (hangar.includes(frameId)) return hangar.filter((id) => id !== frameId);
  if (hangar.length >= HANGAR_SIZE) return [...hangar];
  return [...hangar, frameId];
}

const RARITY_ORDER = { SSR: 0, SR: 1, R: 2 } as const;

/** Frames by manufacturer, then rarity, then name id; signature frames after the rest. */
export function orderedFrames(content: ContentIndex): Frame[] {
  return [...content.frames.values()].sort(
    (a, b) =>
      Number(a.signatureOf !== undefined) - Number(b.signatureOf !== undefined) ||
      a.manufacturer.localeCompare(b.manufacturer) ||
      RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] ||
      a.id.localeCompare(b.id),
  );
}

/**
 * One scale for the stat bars of every season screen (NewSeason, Turn, SeasonEnd), so a stat
 * reads the same everywhere: a season ends around 630–660 per stat, so 800 leaves room at the top
 * and an early training (+40) is still a visible step. Never above the ruleset's statMax; a stat
 * past it fills the bar (its number is printed anyway).
 */
export const SEASON_STAT_SCALE = 800;

export function seasonStatScale(statMax: number): number {
  return Math.min(statMax, SEASON_STAT_SCALE);
}

export type StatCoverage = {
  readonly stat: StatName;
  /** Manufacturers of the hangar whose crew trains this stat. */
  readonly crews: readonly string[];
};

/** Which of the hangar's crews show up for each stat's training. */
export function crewCoverage(content: ContentIndex, hangar: readonly string[]): StatCoverage[] {
  const makers: string[] = [];
  for (const id of hangar) {
    const m = content.getFrame(id).manufacturer;
    if (!makers.includes(m)) makers.push(m);
  }
  return STAT_ORDER.map((stat) => ({
    stat,
    crews: makers.filter((m) => content.getManufacturer(m).crew.stats.includes(stat)),
  }));
}
