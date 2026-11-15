/**
 * The week's effects (owner 2026-11-13): how long each stays and where each shows. Pure and
 * text-free (flow/imports.test.ts); WeekFx.tsx plays them.
 */
import type { WeekFx } from "../weekFx";

/**
 * Each effect's time on screen, ms (owner 2026-11-13: long enough to read, never a blink):
 * `life`, plus `perSkill` for each learned skill after the first. All the week's effects show
 * together (owner 2026-11-13: one after another took too long), each `stagger` after the one
 * before; the layer leaves `tail` after the last one ends.
 */
export const FX = { life: 1800, perSkill: 450, stagger: 160, tail: 500 } as const;

export function fxMs(e: WeekFx): number {
  return e.kind === "skills"
    ? FX.life + FX.perSkill * Math.max(0, (e.skills?.length ?? 1) - 1)
    : FX.life;
}

export function fxTotalMs(fx: readonly WeekFx[]): number {
  return Math.max(0, ...fx.map((e, i) => FX.stagger * i + fxMs(e))) + FX.tail;
}

/** A spot of the screen, in percent of its width and height (the effect's center). */
type Spot = { readonly x: number; readonly y: number };

/**
 * Where each effect shows (owner 2026-11-13): somewhere new each week, never on top of another
 * and well inside the screen. The screen is cut in two columns and three rows; each effect takes
 * a cell of its own at random and moves a little inside it. Learned skills (a wide list) take a
 * whole row, centered.
 */
export function fxSpots(fx: readonly WeekFx[], random: () => number = Math.random): Spot[] {
  const rows = shuffle([30, 50, 70], random);
  const skillsRow = fx.some((e) => e.kind === "skills") ? rows.pop() : undefined;
  const cells = shuffle(
    rows.flatMap((y) => [27, 73].map((x) => ({ x, y }))),
    random,
  );
  const jitter = (n: number) => (random() * 2 - 1) * n;
  return fx.map((e, i) => {
    if (e.kind === "skills") return { x: 50, y: (skillsRow ?? 50) + jitter(4) };
    // more effects than cells (never with today's six kinds): the center
    const c = cells[i % Math.max(1, cells.length)] ?? { x: 50, y: 50 };
    // sideways only a little: two in a row never touch (each is 40 % of the width)
    return { x: c.x + jitter(3), y: c.y + jitter(5) };
  });
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
