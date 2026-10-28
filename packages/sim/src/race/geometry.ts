import { floorDiv, toPermille } from "@falconess/rng";
import type { Biome, Course, RaceGeometry, Segment } from "@falconess/schema";
import { SEGMENT_TYPES } from "@falconess/schema";
import type { Ruleset } from "../rulesets/index.js";
import {
  engineUnits,
  PH_FINAL,
  PH_MIDDLE,
  PH_START,
  SEG_CANYON,
  SEG_CLIMB,
  SEG_CURVES,
  SEG_DESCENT,
  SEG_JUMP,
  SEG_WATER,
  segmentTypeCode,
} from "./units.js";

/**
 * A course turned into flat engine arrays (docs/race-engine.md 2). Pure, built once per race;
 * callers (the batch) may cache it by `courseId@version`. Positions in pu, content decimals in ‰.
 * Internal TS type, not a data format.
 */
export type CourseGeometry = {
  readonly courseId: string;
  readonly courseVersion: number;
  readonly biome: Biome;
  readonly lengthMm: number;
  /** lengthMm × 225 (pu). */
  readonly L: number;
  /** Segment count, 1..24. */
  readonly S: number;
  /** pu; segEnd[S − 1] = L. */
  readonly segStart: Float64Array;
  readonly segEnd: Float64Array;
  /** Index into `SEGMENT_TYPES`. */
  readonly segType: Uint8Array;
  readonly gradePm: Int32Array;
  readonly dragPm: Int32Array;
  /** Signed: + tail, − head. */
  readonly windPm: Int32Array;
  /** Content ints; 0 where not applicable. */
  readonly radius: Int32Array;
  readonly liftReq: Int32Array;
  /** Indices of jump segments, ascending. */
  readonly jumpIdx: Int32Array;
  readonly startEndMm: number;
  readonly finalStartMm: number;
  readonly hoverAttackMm: number;
  readonly reserveAtMm: number;
  readonly denseFromMm: number;
  /** The same five positions in pu. */
  readonly startEnd: number;
  readonly finalStart: number;
  readonly hoverAttack: number;
  readonly reserveAt: number;
  readonly denseFrom: number;
};

/** Maximum number of segments of a course (schema bound, validator 1.4). */
export const MAX_SEGMENTS = 24;

export function buildCourseGeometry(ruleset: Ruleset, course: Course): CourseGeometry {
  const R = ruleset.race;
  const { posPerMm } = engineUnits(R);
  const S = course.segments.length;
  if (S < 1 || S > MAX_SEGMENTS) throw new Error(`course ${course.id}: ${S} segments (1..24)`);

  const segStart = new Float64Array(S);
  const segEnd = new Float64Array(S);
  const segType = new Uint8Array(S);
  const gradePm = new Int32Array(S);
  const dragPm = new Int32Array(S);
  const windPm = new Int32Array(S);
  const radius = new Int32Array(S);
  const liftReq = new Int32Array(S);
  const jumps: number[] = [];

  let lengthMm = 0;
  course.segments.forEach((seg, s) => {
    const lenMm = seg.length * 1000;
    segStart[s] = lengthMm * posPerMm;
    lengthMm += lenMm;
    segEnd[s] = lengthMm * posPerMm;
    segType[s] = segmentTypeCode(seg.type);
    // Content decimals become ‰ here with toPermille: the only content-load rounding of a course.
    switch (seg.type) {
      case "climb":
      case "descent":
        gradePm[s] = toPermille(seg.grade);
        break;
      case "water":
        dragPm[s] = toPermille(seg.drag);
        break;
      case "canyon":
        windPm[s] = toPermille(seg.wind);
        break;
      case "curves":
        radius[s] = seg.radius;
        break;
      case "jump":
        liftReq[s] = seg.liftRequired;
        jumps.push(s);
        break;
      case "flat":
        break;
      default:
        assertNever(seg);
    }
  });
  if (lengthMm > R.maxCourseMeters * 1000)
    throw new Error(`course ${course.id}: ${lengthMm} mm exceeds ${R.maxCourseMeters} m`);

  const startEndMm = floorDiv(lengthMm, 6);
  const finalStartMm = floorDiv(2 * lengthMm, 3);
  const hoverAttackMm = floorDiv(lengthMm * R.style.hoverAttackAt, 1000);
  // ADR-0003 D53: clamped at 0 on a course shorter than the sprint reserve (kickAt follows, 9.4)
  const reserveAtMm = Math.max(0, lengthMm - R.finalSprintReserveMeters * 1000);
  const denseFromMm = lengthMm - R.log.denseLastMeters * 1000;

  return {
    courseId: course.id,
    courseVersion: course.version,
    biome: course.biome,
    lengthMm,
    L: lengthMm * posPerMm,
    S,
    segStart,
    segEnd,
    segType,
    gradePm,
    dragPm,
    windPm,
    radius,
    liftReq,
    jumpIdx: Int32Array.from(jumps),
    startEndMm,
    finalStartMm,
    hoverAttackMm,
    reserveAtMm,
    denseFromMm,
    startEnd: startEndMm * posPerMm,
    finalStart: finalStartMm * posPerMm,
    hoverAttack: hoverAttackMm * posPerMm,
    reserveAt: reserveAtMm * posPerMm,
    denseFrom: denseFromMm * posPerMm,
  };
}

/**
 * Phase of a position x (pu): start before `startEnd`, middle before `finalStart`, else final.
 * A runner exactly on a boundary belongs to the later phase.
 */
export function phaseOf(G: CourseGeometry, x: number): number {
  return x < G.startEnd ? PH_START : x < G.finalStart ? PH_MIDDLE : PH_FINAL;
}

/** The `geometry` block of a `RaceLog` (20.1), in public units, with the biome (ADR-0003 D55). */
export function logGeometry(ruleset: Ruleset, G: CourseGeometry): RaceGeometry {
  const { posPerMm } = engineUnits(ruleset.race);
  const segments: RaceGeometry["segments"] = [];
  for (let s = 0; s < G.S; s++) {
    const code = G.segType[s] ?? 0;
    const type = SEGMENT_TYPES[code];
    if (type === undefined) throw new Error(`bad segment type code ${code}`);
    segments.push({
      type,
      startMm: floorDiv(G.segStart[s] ?? 0, posPerMm),
      endMm: floorDiv(G.segEnd[s] ?? 0, posPerMm),
      param: segmentParam(G, s, code),
    });
  }
  return {
    biome: G.biome,
    lengthMm: G.lengthMm,
    startEndMm: G.startEndMm,
    finalStartMm: G.finalStartMm,
    hoverAttackMm: G.hoverAttackMm,
    reserveAtMm: G.reserveAtMm,
    denseFromMm: G.denseFromMm,
    segments,
  };
}

/** grade‰ (climb, descent), drag‰ (water), wind‰ signed (canyon), radius (curves), lift (jump). */
function segmentParam(G: CourseGeometry, s: number, code: number): number {
  switch (code) {
    case SEG_CLIMB:
    case SEG_DESCENT:
      return G.gradePm[s] ?? 0;
    case SEG_WATER:
      return G.dragPm[s] ?? 0;
    case SEG_CANYON:
      return G.windPm[s] ?? 0;
    case SEG_CURVES:
      return G.radius[s] ?? 0;
    case SEG_JUMP:
      return G.liftReq[s] ?? 0;
    default:
      return 0;
  }
}

function assertNever(seg: never): never {
  throw new Error(`unknown segment ${JSON.stringify(seg satisfies Segment)}`);
}
