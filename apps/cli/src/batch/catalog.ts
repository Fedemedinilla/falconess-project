/**
 * Everything the batch derives from content before planning (docs/race-engine.md §25.2): course
 * order, the manufacturer cells of S2, the signature pairs of S3, the (skill, course) cells of S4
 * and the part, quirk and Falconess lists. Pure: a function of the content index only.
 */
import {
  type ContentIndex,
  type Course,
  courseLength,
  type Manufacturer,
  type ManufacturerRule,
  type RacePhase,
  type SegmentType,
  type Slug,
  STYLES,
  type Style,
} from "@falconess/schema";

/** S2 cell of a (manufacturer, course): home or weak are gated; both at once is neutral. */
export type CellKind = "home" | "weak" | "neutral" | "none";

export type S3Pair = {
  falconessId: Slug;
  signature: Slug;
  generic: Slug;
  style: Style;
  manufacturer: Slug;
};

export type S4Cell = { skillId: Slug; courseId: Slug };

export type Catalog = {
  /** Courses sorted by length, then id (sprint, ridge, canyon in v1). */
  courses: readonly Course[];
  /** Manufacturer ids in id order (S2 designated entries, roles 0..4). */
  manufacturers: readonly Slug[];
  rules: ReadonlyMap<Slug, ManufacturerRule>;
  /** Non-signature frames per manufacturer, sorted by id (S2's uniform draw). */
  s2Frames: ReadonlyMap<Slug, readonly Slug[]>;
  /** Keyed `${manufacturer}/${courseId}`. */
  s2Cells: ReadonlyMap<string, CellKind>;
  s3Pairs: readonly S3Pair[];
  s4Cells: readonly S4Cell[];
  parts: readonly Slug[];
  quirks: readonly Slug[];
  falconess: readonly Slug[];
  styles: readonly Style[];
};

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function matchesTerrain(terrain: Manufacturer["home"], course: Course): boolean {
  if (terrain.traits.some((t) => course.traits.includes(t))) return true;
  return terrain.segments.some((s) => course.segments.some((seg) => seg.type === s));
}

/** §25.2 S2 "Cells": trait or segment type (no biome since ADR-0007); home and weak at once is neutral. */
export function manufacturerCell(m: Manufacturer, course: Course): CellKind {
  const home = matchesTerrain(m.home, course);
  const weak = matchesTerrain(m.weak, course);
  if (home && weak) return "neutral";
  if (home) return "home";
  if (weak) return "weak";
  return "none";
}

/**
 * Phase spans of §2 in mm: start [0, L/6), middle [L/6, 2L/3), final [2L/3, L]; a boundary
 * belongs to the later phase.
 */
function phaseSpanMm(course: Course, phase: Exclude<RacePhase, "any">): [number, number] {
  const lengthMm = courseLength(course) * 1000;
  const startEnd = Math.floor(lengthMm / 6);
  const finalStart = Math.floor((2 * lengthMm) / 3);
  if (phase === "start") return [0, startEnd];
  if (phase === "middle") return [startEnd, finalStart];
  return [finalStart, lengthMm];
}

/**
 * S4: can a trigger with this phase and segment occur on the course? The segment must exist and,
 * for a phase-scoped trigger, overlap that phase. Position, heat and energy conditions are dynamic
 * and never exclude a cell (§25.2 S4: "segment present on the course, phase reachable").
 */
export function staticTriggerPossible(
  course: Course,
  phase: RacePhase,
  segment: SegmentType | undefined,
): boolean {
  if (segment === undefined) return true;
  let at = 0;
  for (const seg of course.segments) {
    const startMm = at * 1000;
    at += seg.length;
    const endMm = at * 1000;
    if (seg.type !== segment) continue;
    if (phase === "any") return true;
    const [a, b] = phaseSpanMm(course, phase);
    if (startMm < b && endMm > a) return true;
  }
  return false;
}

export function buildCatalog(content: ContentIndex): Catalog {
  const courses = [...content.courses.values()].sort(
    (a, b) => courseLength(a) - courseLength(b) || byId(a, b),
  );

  const mfrs = [...content.manufacturers.values()].sort(byId);
  const frames = [...content.frames.values()].sort(byId);
  const rules = new Map<Slug, ManufacturerRule>();
  const s2Frames = new Map<Slug, Slug[]>();
  const s2Cells = new Map<string, CellKind>();
  for (const m of mfrs) {
    rules.set(m.id, m.rule);
    const own = frames.filter((f) => f.manufacturer === m.id && f.signatureOf === undefined);
    if (own.length === 0) throw new Error(`S2: manufacturer ${m.id} has no non-signature frame`);
    s2Frames.set(
      m.id,
      own.map((f) => f.id),
    );
    for (const c of courses) s2Cells.set(`${m.id}/${c.id}`, manufacturerCell(m, c));
  }

  const s3Pairs: S3Pair[] = [];
  for (const sig of frames) {
    if (sig.signatureOf === undefined) continue;
    const generics = frames.filter(
      (f) =>
        f.signatureOf === undefined && f.manufacturer === sig.manufacturer && f.style === sig.style,
    );
    const generic = generics[0];
    if (generics.length !== 1 || !generic)
      throw new Error(
        `S3: signature ${sig.id} needs exactly one generic of the same style and manufacturer, found ${generics.length}`,
      );
    s3Pairs.push({
      falconessId: sig.signatureOf,
      signature: sig.id,
      generic: generic.id,
      style: sig.style,
      manufacturer: sig.manufacturer,
    });
  }
  s3Pairs.sort((a, b) => (a.falconessId < b.falconessId ? -1 : 1));

  const s4Cells: S4Cell[] = [];
  const skills = [...content.skills.values()].sort(byId);
  for (const s of skills) {
    if (s.kind !== "active") continue;
    for (const c of courses)
      if (staticTriggerPossible(c, s.trigger.phase, s.trigger.segment))
        s4Cells.push({ skillId: s.id, courseId: c.id });
  }

  return {
    courses,
    manufacturers: mfrs.map((m) => m.id),
    rules,
    s2Frames,
    s2Cells,
    s3Pairs,
    s4Cells,
    parts: [...content.parts.keys()].sort(),
    quirks: [...content.quirks.keys()].sort(),
    falconess: [...content.falconess.keys()].sort(),
    styles: STYLES,
  };
}
