/**
 * The measurement fields of the eight guardrails (ADR-0010, docs/design/barandas-balance.md §3),
 * ported from the prototype's harness (`.work/design7/harness/lib.ts`) with the same seeds, the
 * same entries and the same lane rotation, so `pnpm balance:barandas` measures exactly what the
 * prototype measured.
 */
import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type {
  Aptitude,
  Course,
  Position,
  RaceEntry,
  RaceLog,
  RaceStats,
  Style,
} from "@falconess/schema";
import {
  buildCourseGeometry,
  createRaceArena,
  neutralFixtureEntry,
  type Ruleset,
  simulateRace,
} from "@falconess/sim";

export const content = loadContent();
export const POS: readonly Position[] = ["lead", "pack", "stalk", "closer"];
export const WINGS: readonly Style[] = ["dive", "hover", "glide", "ground"];
/** ADR-0008 §2: each wing's default position. */
export const DEFAULT_POS: Readonly<Record<Style, Position>> = {
  glide: "lead",
  ground: "pack",
  hover: "stalk",
  dive: "closer",
};

const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));

/** A track of the v3 catalogue: `courses-v3/` or the content's courses. */
export function courseOf(id: string): Course {
  return catalogue.get(id) ?? content.getCourse(id);
}

export const courseLengthM = (c: Course): number => c.segments.reduce((q, s) => q + s.length, 0);

export const stats = (s: number): RaceStats => ({
  agility: s,
  stamina: s,
  technique: s,
  courage: s,
  intelligence: s,
});

/** The 90 balanced wing matrices: per position a pair of distinct wings, each wing twice. */
export const MATRICES: readonly (readonly [number, number])[][] = (() => {
  const pairs: [number, number][] = [];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) pairs.push([a, b]);
  const out: [number, number][][] = [];
  for (const r0 of pairs)
    for (const r1 of pairs)
      for (const r2 of pairs)
        for (const r3 of pairs) {
          const rows = [r0, r1, r2, r3];
          const cols = [0, 0, 0, 0];
          for (const [a, b] of rows) {
            cols[a] = (cols[a] ?? 0) + 1;
            cols[b] = (cols[b] ?? 0) + 1;
          }
          if (cols.every((c) => c === 2)) out.push(rows);
        }
  return out;
})();

/** A runner of a measurement field: position, wings, stats over the level, distance letter. */
export type Role = { p: Position; w: Style; over?: Partial<RaceStats>; d?: Aptitude };

const at = <T>(xs: readonly T[], i: number): T => {
  const x = xs[i];
  if (x === undefined) throw new Error(`index ${i} out of range`);
  return x;
};

/** Equal field of race k: 2 per position, wings from matrix k % 90. */
export function equalRoles(k: number): Role[] {
  const m = at(MATRICES, k % MATRICES.length);
  const roles: Role[] = [];
  m.forEach((pair, pi) => {
    for (const wi of pair) roles.push({ p: at(POS, pi), w: at(WINGS, wi) });
  });
  return roles;
}

/** Default field: 2 per wing, each in her wings' default position. */
export function defaultRoles(): Role[] {
  const order: Style[] = ["glide", "ground", "hover", "dive"];
  return Array.from({ length: 8 }, (_, r) => {
    const w = at(order, r % 4);
    return { p: DEFAULT_POS[w], w };
  });
}

/**
 * Entries for roles at level `st`: lane of role j is (j + rot) % 8, runnerId `r<j>`; `letter` is
 * the field's distance letter (B with the letters on: rivals are B at every distance).
 */
export function entriesOf(
  roles: readonly Role[],
  st: number,
  rot: number,
  letter: Aptitude | undefined,
): RaceEntry[] {
  const S0 = stats(st);
  return roles
    .map((ro, j) => {
      const e = neutralFixtureEntry({
        runnerId: `r${j}`,
        laneIndex: (j + rot) % roles.length,
        style: ro.w,
        position: ro.p,
        stats: ro.over ? { ...S0, ...ro.over } : S0,
      });
      const d = ro.d ?? letter;
      return d === undefined ? e : { ...e, distanceAptitude: d };
    })
    .sort((a, b) => a.laneIndex - b.laneIndex);
}

const arena = createRaceArena();
const geos = new Map<string, ReturnType<typeof buildCourseGeometry>>();

/** One race with a shared arena and geometry (results identical to a fresh one). */
export function race(
  R: Ruleset,
  course: Course,
  entries: RaceEntry[],
  seed: string,
  detail: "results" | "full" = "results",
): RaceLog {
  const key = `${R.version}/${course.id}`;
  let G = geos.get(key);
  if (!G) {
    G = buildCourseGeometry(R, course);
    geos.set(key, G);
  }
  return simulateRace(R, entries, course, seed, { detail, arena, geometry: G });
}

/** Win share per result (1/ties among the best finish; a DNF never wins), like `log.results`. */
export function winShares(log: RaceLog): number[] {
  let best = Number.POSITIVE_INFINITY;
  for (const r of log.results)
    if (!r.dnf && r.finishMilli !== null && r.finishMilli < best) best = r.finishMilli;
  const ties = log.results.filter((r) => r.finishMilli === best).length;
  return log.results.map((r) => (r.finishMilli === best ? 1 / ties : 0));
}

export const roleIdx = (runnerId: string): number => Number(runnerId.slice(1));
