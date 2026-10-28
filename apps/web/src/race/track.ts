/**
 * The course as the lane chart draws it: segments, phases, the 60 m sprint reserve and a distance
 * scale, as fractions of the course length. Read from `RaceLog.geometry` only.
 */
import { PHASES, type PhaseName } from "@falconess/race-view";
import type { RaceGeometry, SegmentType } from "@falconess/schema";

export type TrackSegment = {
  readonly index: number;
  readonly type: SegmentType;
  readonly startMm: number;
  readonly endMm: number;
  /** grade‰ (climb, descent), drag‰ (water), wind‰ (canyon), radius (curves), lift (jump). */
  readonly param: number;
  readonly from: number;
  readonly to: number;
};

export type TrackPhase = {
  readonly name: PhaseName;
  readonly from: number;
  readonly to: number;
};

export type TrackLayout = {
  readonly lengthMm: number;
  readonly segments: readonly TrackSegment[];
  readonly phases: readonly TrackPhase[];
  /** Where the 60 m sprint reserve starts (spec 2); null on a course shorter than 60 m. */
  readonly reserve: { readonly mm: number; readonly at: number } | null;
  /** Distance marks (mm), from 0 to the finish. */
  readonly scale: readonly { readonly mm: number; readonly at: number }[];
};

const SCALE_STEPS_M = [50, 100, 200, 250, 500, 1000, 2000] as const;

/** The smallest round step that gives at most `maxMarks` intervals. */
export function scaleStepM(lengthMm: number, maxMarks: number): number {
  for (const step of SCALE_STEPS_M) if (lengthMm <= step * 1000 * maxMarks) return step;
  return SCALE_STEPS_M[SCALE_STEPS_M.length - 1] ?? 1000;
}

/** Pixel geometry of the lane chart for a plot `width` px wide. */
export type ChartGeometry = {
  readonly width: number;
  readonly height: number;
  /** x of the start and of the finish line. */
  readonly x0: number;
  readonly x1: number;
  /** Rows of the header: phase names, the segment strip, the distance scale. */
  readonly phaseY: number;
  readonly stripY: number;
  readonly stripH: number;
  readonly scaleY: number;
  /** Top of the first lane and the height of every lane. */
  readonly lanesY: number;
  readonly laneH: number;
};

export const CHART = {
  headH: 58,
  laneH: 28,
  /** Room left of the start for a runner's tail and right of the finish for her nose. */
  padL: 14,
  padR: 12,
  bottom: 6,
} as const;

export function chartGeometry(width: number, lanes: number): ChartGeometry {
  const w = Math.max(160, Math.round(width));
  return {
    width: w,
    height: CHART.headH + lanes * CHART.laneH + CHART.bottom,
    x0: CHART.padL,
    x1: w - CHART.padR,
    phaseY: 11,
    stripY: 18,
    stripH: 14,
    scaleY: 49,
    lanesY: CHART.headH,
    laneH: CHART.laneH,
  };
}

/** x of a course fraction on the chart. */
export function xAt(g: ChartGeometry, at: number): number {
  return g.x0 + (g.x1 - g.x0) * Math.max(0, Math.min(1, at));
}

export function trackLayout(geometry: RaceGeometry, maxMarks = 6): TrackLayout {
  const L = Math.max(1, geometry.lengthMm);
  const at = (mm: number) => Math.max(0, Math.min(1, mm / L));
  const bounds = [0, geometry.startEndMm, geometry.finalStartMm, geometry.lengthMm];
  const stepMm = scaleStepM(L, maxMarks) * 1000;
  const scale: { mm: number; at: number }[] = [];
  for (let mm = 0; mm < L; mm += stepMm) scale.push({ mm, at: at(mm) });
  // the finish is always marked; a mark too close to it gives way
  if (scale.length > 1 && L - (scale[scale.length - 1]?.mm ?? 0) < stepMm / 2) scale.pop();
  scale.push({ mm: L, at: 1 });
  return {
    lengthMm: geometry.lengthMm,
    segments: geometry.segments.map((s, index) => ({
      index,
      type: s.type,
      startMm: s.startMm,
      endMm: s.endMm,
      param: s.param,
      from: at(s.startMm),
      to: at(s.endMm),
    })),
    phases: PHASES.map((name, i) => ({
      name,
      from: at(bounds[i] ?? 0),
      to: at(bounds[i + 1] ?? L),
    })),
    reserve:
      geometry.reserveAtMm > 0 ? { mm: geometry.reserveAtMm, at: at(geometry.reserveAtMm) } : null,
    scale,
  };
}
