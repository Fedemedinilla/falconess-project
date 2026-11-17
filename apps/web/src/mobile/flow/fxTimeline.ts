/**
 * The week's effects (owner 2026-11-13): how long each stays and where each shows. Pure and
 * text-free (flow/imports.test.ts); WeekFx.tsx plays them.
 */
import type { WeekFx } from "../weekFx";

/**
 * The effects' times, ms (owner 2026-11-13: long enough to read, never a blink), on Normal:
 * - `life`, plus `perSkill` for each learned skill after the first; all the week's effects show
 *   together (owner 2026-11-13: one after another took too long), each `stagger` after the one
 *   before; the layer leaves `tail` after the last one ends, never before `floor` in all;
 * - a learned skill's card pops `skillAt` after its effect, `perSkill` after the one before, in
 *   `skillIn` (WeekFx.module.css `skillIn`, unscaled), and stays whole at least `readMs` before
 *   its effect fades, which is at `fadeAt` of its time (WeekFx.module.css `fxShow`, 86 %);
 * - between the grid's rows of effects, a share of the free height drawn in [spaceMin, spaceMax].
 */
export const FX = {
  life: 1800,
  perSkill: 450,
  stagger: 160,
  tail: 500,
  floor: 900,
  skillAt: 250,
  skillIn: 450,
  readMs: 350,
  fadeAt: 0.86,
  spaceMin: 0.2,
  spaceMax: 1.8,
} as const;

/**
 * When the effects show (plan §2.6), ms from the layer's start: each effect's pop (`starts`), each
 * learned skill's pop (`skillAt`, empty for the others), each effect's own time on screen
 * (`life`), and the layer's (`total`).
 */
export type FxTimeline = {
  readonly starts: readonly number[];
  readonly skillAt: readonly (readonly number[])[];
  readonly life: readonly number[];
  readonly total: number;
};

/**
 * The week's effects on a «Ritmo» of scale `k` (Normal 1, Rápido 0.6, Directo 0.35; required, so
 * the node walks never read the global pace): the stagger, the lives, the tail and each skill's pop
 * scale with it (M6: the skills' pops did not, and Directo cut the last ones short), never below
 * `floor` in all; the layer also stays until every learned skill was whole `readMs` before its
 * effect fades. On Normal it is the owner's timeline as it was.
 */
export function fxTimeline(fx: readonly WeekFx[], k: number): FxTimeline {
  const starts = fx.map((_, i) => FX.stagger * k * i);
  const skillAt = fx.map((e, i) =>
    e.kind === "skills"
      ? (e.skills ?? [""]).map((_, j) => (starts[i] ?? 0) + FX.skillAt * k + FX.perSkill * k * j)
      : [],
  );
  const life = fx.map((e) =>
    e.kind === "skills"
      ? (FX.life + FX.perSkill * Math.max(0, (e.skills?.length ?? 1) - 1)) * k
      : FX.life * k,
  );
  const ends = fx.map((_, i) => (starts[i] ?? 0) + (life[i] ?? 0) + FX.tail * k);
  // the last skill whole `readMs` before its effect's fade, which is at `fadeAt` of what is left
  const read = fx.map((_, i) => {
    const at = starts[i] ?? 0;
    const last = skillAt[i]?.at(-1);
    return last === undefined ? 0 : at + (last - at + FX.skillIn + FX.readMs) / FX.fadeAt;
  });
  const total = Math.ceil(Math.max(FX.floor, ...ends, ...read));
  return { starts, skillAt, life, total };
}

/** Where an effect sits in its cell, across and down. */
export type FxPlace = "start" | "center" | "end";

/** An effect's cell: its row, its column (or the whole row: the learned skills), its place in it. */
export type FxCell = {
  readonly row: number;
  readonly col: 0 | 1 | "both";
  readonly x: FxPlace;
  readonly y: FxPlace;
};

/**
 * The effects' grid (WeekFx lays it out as a CSS grid, so two effects can never overlap: each has
 * a cell of its own, and a row is as tall as its tallest effect): `rows` rows of two columns,
 * `space` the shares of the free height above, between and below them, and each effect's cell.
 */
export type FxGrid = {
  readonly rows: number;
  readonly space: readonly number[];
  readonly cells: readonly FxCell[];
};

const PLACES: readonly FxPlace[] = ["start", "center", "end"];

/**
 * Where each effect shows (owner 2026-11-13): somewhere new each week, never on top of another
 * and well inside the screen. The screen is cut in two columns and three rows (more if the effects
 * need them); each effect takes a cell of its own at random and a place in it; learned skills (a
 * wide list) take a whole row; the free height between the rows is shared at random.
 */
export function fxGrid(fx: readonly WeekFx[], random: () => number = Math.random): FxGrid {
  const wide = fx.some((e) => e.kind === "skills") ? 1 : 0;
  const rows = Math.max(3, Math.ceil((fx.length - wide) / 2) + wide);
  const order = shuffle(
    Array.from({ length: rows }, (_, r) => r),
    random,
  );
  const wideRow = wide ? order.pop() : undefined;
  const cells = shuffle(
    order.flatMap((row) => [0, 1].map((col) => ({ row, col: col === 0 ? 0 : 1 }) as const)),
    random,
  );
  const place = () => PLACES[Math.floor(random() * PLACES.length)] ?? "center";
  let next = 0;
  const out = fx.map((e): FxCell => {
    if (e.kind === "skills") return { row: wideRow ?? 0, col: "both", x: place(), y: place() };
    const c = cells[next++] ?? { row: 0, col: 0 };
    return { row: c.row, col: c.col, x: place(), y: place() };
  });
  const space = Array.from(
    { length: rows + 1 },
    () => FX.spaceMin + random() * (FX.spaceMax - FX.spaceMin),
  );
  return { rows, space, cells: out };
}

function shuffle<T>(xs: readonly T[], random: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
