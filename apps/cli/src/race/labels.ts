import type { ContentIndex, SegmentType, Style } from "@falconess/schema";
import type { RaceEntry } from "./log-view.js";

/**
 * Names the renderer needs that are not in the RaceLog: game text comes from content, never from
 * code. Ids content does not know (the 3.4 fixtures: `fixture-neutral`, manufacturer `none`) are
 * printed as they are.
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
  };
}
