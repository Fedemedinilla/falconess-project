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

/** Top of the base-stat bars: the roster's highest base stat, rounded up to a multiple of 50. */
export function statScale(content: ContentIndex): number {
  let max = 0;
  for (const f of content.falconess.values())
    for (const stat of STAT_ORDER) max = Math.max(max, f.baseStats[stat]);
  return Math.max(50, Math.ceil(max / 50) * 50);
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
