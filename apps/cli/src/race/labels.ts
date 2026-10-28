import type { ContentIndex, SegmentType, Style } from "@falconess/schema";
import type { RaceEntry } from "./log-view.js";

/**
 * Names the renderer needs that are not in the RaceLog: game text comes from content, never from
 * code. Ids content does not know (the 3.4 fixtures: `fixture-neutral`, manufacturer `none`) are
 * printed as they are.
 */
export type RaceLabels = {
  courseName(courseId: string): string;
  /** The log has no biome (only CourseGeometry does); it is a property of the content course. */
  biomeName(courseId: string): string;
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
    biomeName: (id) => {
      const course = content.courses.get(id);
      return course ? content.t(`biome.${course.biome}`) : "?";
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
