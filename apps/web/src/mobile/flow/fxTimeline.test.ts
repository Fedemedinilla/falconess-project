import { describe, expect, it } from "vitest";
import type { WeekFx, WeekFxKind } from "../weekFx";
import { FX, type FxGrid, fxGrid, fxTimeline } from "./fxTimeline";

const one = (kind: WeekFxKind): WeekFx => ({ kind, good: true });
const skills = (n: number): WeekFx => ({
  kind: "skills",
  good: true,
  skills: Array.from({ length: n }, (_, i) => `skill-${i}`),
});
/** Every kind but the skills, in the order `weekFx` plays them. */
const KINDS: readonly WeekFxKind[] = ["sleep-great", "injury", "mood-up", "bond", "sync", "points"];
/** «Ritmo»: Normal, Rápido, Directo (pace.ts `paceScale`). */
const PACES = [1, 0.6, 0.35] as const;

/** A seeded generator in [0, 1) (mulberry32), so each layout is a fixed one. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's layer time (before M6), the reference for Normal: unchanged there. */
function todaysTotal(fx: readonly WeekFx[]): number {
  const life = (e: WeekFx) =>
    e.kind === "skills" ? 1800 + 450 * Math.max(0, (e.skills?.length ?? 1) - 1) : 1800;
  return Math.max(0, ...fx.map((e, i) => 160 * i + life(e))) + 500;
}

// the weeks the content can bring: up to six effects, or the skills alone or after up to four more
const WEEKS: WeekFx[][] = [
  ...KINDS.map((_, i) => KINDS.slice(0, i + 1).map(one)),
  ...[1, 2, 3, 4, 5].flatMap((n) =>
    [0, 1, 2, 3, 4].map((before) => [...KINDS.slice(0, before).map(one), skills(n)]),
  ),
];

describe("fxTimeline: when each of the week's effects shows, and how long the layer stays", () => {
  it("one effect more stays a stagger longer", () => {
    expect([1, 2, 3, 4].map((n) => fxTimeline(KINDS.slice(0, n).map(one), 1).total)).toEqual([
      2300, 2460, 2620, 2780,
    ]);
  });

  it("learned skills stay longer the more there are", () => {
    expect([1, 2, 3, 4, 5].map((n) => fxTimeline([skills(n)], 1).total)).toEqual([
      2300, 2750, 3200, 3650, 4100,
    ]);
    expect(fxTimeline([skills(3)], 1).life[0]).toBe(FX.life + 2 * FX.perSkill);
    expect(fxTimeline([one("bond")], 1).life[0]).toBe(FX.life);
  });

  it("on Normal it is today's timeline, whatever the week", () => {
    for (const fx of WEEKS) {
      const t = fxTimeline(fx, 1);
      expect(t.total).toBe(todaysTotal(fx));
      expect(t.starts).toEqual(fx.map((_, i) => FX.stagger * i));
    }
  });

  it("Ritmo scales the stagger, the lives and each skill's pop (M6), never below 0.9 s in all", () => {
    for (const k of PACES)
      for (const fx of WEEKS) {
        const t = fxTimeline(fx, k);
        expect(t.starts).toEqual(fx.map((_, i) => FX.stagger * k * i));
        expect(t.total).toBeGreaterThanOrEqual(FX.floor);
        fx.forEach((e, i) => {
          const at = t.starts[i] ?? 0;
          const pops = t.skillAt[i] ?? [];
          expect(pops).toHaveLength(e.kind === "skills" ? (e.skills?.length ?? 1) : 0);
          pops.forEach((p, j) => {
            expect(p).toBeCloseTo(at + FX.skillAt * k + FX.perSkill * k * j, 9);
          });
          // every effect has its whole life before the layer goes
          expect(at + (t.life[i] ?? 0)).toBeLessThanOrEqual(t.total);
        });
      }
  });

  it("§2.8: every learned skill is fully in at least 350 ms before its group fades (86 %), on every Ritmo", () => {
    for (const k of PACES)
      for (const fx of WEEKS)
        fx.forEach((e, i) => {
          if (e.kind !== "skills") return;
          const t = fxTimeline(fx, k);
          const at = t.starts[i] ?? 0;
          // the effect's own fade (WeekFx: fxShow over the rest of the layer's time, out from 86 %)
          const fades = at + FX.fadeAt * (t.total - at);
          for (const pop of t.skillAt[i] ?? [])
            expect(
              fades - (pop + FX.skillIn),
              `k ${k}, ${fx.length} effects`,
            ).toBeGreaterThanOrEqual(FX.readMs);
        });
  });
});

describe("fxGrid: where each effect shows (owner 2026-11-13: all together, in random cells)", () => {
  const cellsOf = (g: FxGrid) => g.cells.map((c) => `${c.row}:${c.col}`);

  it("each effect has a cell of its own: two never share one, the skills a whole row alone", () => {
    for (let seed = 0; seed < 300; seed++)
      for (const fx of WEEKS) {
        const g = fxGrid(fx, seeded(seed));
        expect(g.cells).toHaveLength(fx.length);
        expect(new Set(cellsOf(g)).size).toBe(fx.length);
        fx.forEach((e, i) => {
          const c = g.cells[i];
          expect(c).toBeDefined();
          if (!c) return;
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(g.rows);
          if (e.kind === "skills") {
            expect(c.col).toBe("both");
            expect(g.cells.filter((o) => o.row === c.row)).toHaveLength(1);
          } else expect([0, 1]).toContain(c.col);
        });
      }
  });

  it("three rows at least, more only when the effects need them; the space between them drawn", () => {
    for (let seed = 0; seed < 50; seed++)
      for (const fx of WEEKS) {
        const g = fxGrid(fx, seeded(seed));
        const wide = fx.some((e) => e.kind === "skills") ? 1 : 0;
        expect(g.rows).toBe(Math.max(3, Math.ceil((fx.length - wide) / 2) + wide));
        expect(g.space).toHaveLength(g.rows + 1);
        for (const w of g.space) {
          expect(w).toBeGreaterThanOrEqual(FX.spaceMin);
          expect(w).toBeLessThanOrEqual(FX.spaceMax);
        }
      }
  });

  it("somewhere new each week: every cell and every place in it comes up", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      const g = fxGrid([one("sleep-great")], seeded(seed));
      const c = g.cells[0];
      if (c) seen.add(`${c.row}:${c.col}:${c.x}:${c.y}`);
    }
    // 3 rows × 2 columns × 3 places across × 3 places down
    expect(seen.size).toBe(54);
  });
});
