/**
 * The track card of the phone game (owner 2026-11-10, «no se distingue bien la diferencia entre las
 * pistas»): a track's drawn profile, its distance class and what it asks for, as letters. It reads
 * only content (the course's segments and the calendar's `trackDemands`, measured by `pnpm
 * content:track-demands`); it never puts her stats next to the demands, and says nothing about
 * whether she meets them (the owner: letters keep the gap ambiguous).
 */
import type { Course, Distance, SegmentType, TrackDemand } from "@falconess/schema";
import { distanceOfLength, flightOf, type SimContext } from "@falconess/sim";
import { seasonCalendar } from "../content/load";

/** One drawn stretch of the strip, in per-mille of the strip's width. */
export type StripPiece = {
  readonly type: SegmentType;
  /** The last stretch, when it is flat: the home straight. */
  readonly final: boolean;
  readonly fromPm: number;
  readonly widthPm: number;
};

/** The narrowest a stretch is drawn (a 60 m Salto of a 3600 m track would vanish otherwise). */
export const MIN_PIECE_PM = 35;

/**
 * The strip of a track: each segment as wide as its length, but never narrower than
 * `MIN_PIECE_PM`, the others shrunk to fit. The widths add up to exactly 1000.
 */
export function trackStrip(course: Pick<Course, "segments">, minPm = MIN_PIECE_PM): StripPiece[] {
  const segs = course.segments;
  const total = segs.reduce((sum, s) => sum + s.length, 0);
  const raw = segs.map((s) => (1000 * s.length) / total);
  const small = raw.map((w) => w < minPm);
  const fixed = small.filter(Boolean).length * minPm;
  const rest = raw.reduce((sum, w, i) => (small[i] ? sum : sum + w), 0);
  const scaled = raw.map((w, i) => (small[i] ? minPm : (w * (1000 - fixed)) / rest));
  const pieces: StripPiece[] = [];
  let from = 0;
  segs.forEach((s, i) => {
    const to = i === segs.length - 1 ? 1000 : Math.round(from + (scaled[i] ?? 0));
    pieces.push({
      type: s.type,
      final: i === segs.length - 1 && s.type === "flat",
      fromPm: from,
      widthPm: to - from,
    });
    from = to;
  });
  return pieces;
}

/** A feature of the track for the sheet's legend: a segment type (not plain flat) or the straight. */
export type TrackFeature = {
  readonly kind: Exclude<SegmentType, "flat"> | "final";
  readonly count: number;
};

/** The track's features in the order they first appear, how many of each; the straight last. */
export function trackFeatures(course: Pick<Course, "segments">): TrackFeature[] {
  const counts = new Map<TrackFeature["kind"], number>();
  for (const s of course.segments)
    if (s.type !== "flat") counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  const out: TrackFeature[] = [...counts].map(([kind, count]) => ({ kind, count }));
  if (course.segments.at(-1)?.type === "flat") out.push({ kind: "final", count: 1 });
  return out;
}

/** What a track asks for on a ruleset: the calendar's letters, none without a calendar. */
export function trackDemands(rulesetVersion: string, courseId: string): readonly TrackDemand[] {
  return seasonCalendar(rulesetVersion)?.trackDemands?.[courseId] ?? [];
}

export type TrackCardView = {
  readonly courseId: string;
  readonly nameKey: string;
  /** es.json: one line of the track's character. */
  readonly flavorKey: string;
  readonly lengthM: number;
  /** v3: the distance class (undefined on a ruleset without distances). */
  readonly distance: Distance | undefined;
  readonly strip: readonly StripPiece[];
  readonly features: readonly TrackFeature[];
  readonly demands: readonly TrackDemand[];
};

export function trackCard(ctx: SimContext, courseId: string): TrackCardView {
  const course = ctx.content.getCourse(courseId);
  const lengthM = course.segments.reduce((sum, s) => sum + s.length, 0);
  const F = flightOf(ctx.ruleset);
  return {
    courseId,
    nameKey: course.textKey,
    flavorKey: `${course.textKey}.flavor`,
    lengthM,
    distance: F === null ? undefined : distanceOfLength(F, lengthM * 1000),
    strip: trackStrip(course),
    features: trackFeatures(course),
    demands: trackDemands(ctx.ruleset.version, courseId),
  };
}
