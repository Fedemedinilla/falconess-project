import type { ContentIndex, RaceEntry, SegmentType, Style } from "@falconess/schema";
import type { AdviceStat } from "./advice.js";

/** A manufacturer's livery (content `palette`): the identity of its frames and runners. */
export type Livery = { readonly primary: string; readonly secondary: string };

/**
 * What a race view needs that is not in the RaceLog: game names and liveries come from content,
 * never from code. Ids content does not know (the 3.4 fixtures: `fixture-neutral`, manufacturer
 * `none`) are shown as they are, without a livery.
 */
export type RaceLabels = {
  courseName(courseId: string): string;
  /**
   * The biome's name: `loggedBiome` when the log carries one (`geometry.biome`), else the biome of
   * the content course `courseId` ("?" for a course content does not know).
   */
  biomeName(courseId: string, loggedBiome?: string): string;
  /** Falconess name when the entry has one, else its runnerId (rivals, fixtures). */
  runnerName(entry: RaceEntry): string;
  frameName(frameId: string): string;
  manufacturerName(manufacturerId: string): string;
  styleName(style: Style): string;
  segmentName(type: SegmentType): string;
  skillName(skillId: string): string;
  /** What a tip points to (advice.ts): a stat's name, or the workshop's. */
  adviceStatName(stat: AdviceStat): string;
  /** The manufacturer's palette; undefined for one content does not know. */
  livery(manufacturerId: string): Livery | undefined;
};

export function contentLabels(content: ContentIndex): RaceLabels {
  const named = (map: ReadonlyMap<string, { textKey: string }>, id: string): string => {
    const item = map.get(id);
    return item ? content.t(item.textKey) : id;
  };
  return {
    courseName: (id) => named(content.courses, id),
    biomeName: (id, loggedBiome) => {
      const biome = loggedBiome ?? content.courses.get(id)?.biome;
      return biome === undefined ? "?" : content.t(`biome.${biome}`);
    },
    runnerName: (entry) =>
      entry.falconessId === null ? entry.runnerId : named(content.falconess, entry.falconessId),
    frameName: (id) => named(content.frames, id),
    manufacturerName: (id) => named(content.manufacturers, id),
    styleName: (style) => content.t(`style.${style}`),
    segmentName: (type) => content.t(`segment.${type}`),
    skillName: (id) => named(content.skills, id),
    adviceStatName: (stat) => content.t(stat === "workshop" ? "action.workshop" : `stat.${stat}`),
    livery: (id) => content.manufacturers.get(id)?.palette,
  };
}
