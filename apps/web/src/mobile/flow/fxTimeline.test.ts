import { describe, expect, it } from "vitest";
import type { WeekFx, WeekFxKind } from "../weekFx";
import { FX, fxMs, fxSpots, fxTotalMs } from "./fxTimeline";

const one = (kind: WeekFxKind): WeekFx => ({ kind, good: true });
const skills = (n: number): WeekFx => ({
  kind: "skills",
  good: true,
  skills: Array.from({ length: n }, (_, i) => `skill-${i}`),
});
/** Every kind but the skills, in the order `weekFx` plays them. */
const KINDS: readonly WeekFxKind[] = ["sleep-great", "injury", "mood-up", "bond", "sync", "points"];

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

describe("fxTotalMs: how long the week's effects stay", () => {
  it("one effect more stays a stagger longer", () => {
    expect([1, 2, 3, 4].map((n) => fxTotalMs(KINDS.slice(0, n).map(one)))).toEqual([
      2300, 2460, 2620, 2780,
    ]);
  });
  it("learned skills stay longer the more there are", () => {
    expect([1, 2, 3, 4, 5].map((n) => fxTotalMs([skills(n)]))).toEqual([
      2300, 2750, 3200, 3650, 4100,
    ]);
    expect(fxMs(skills(3))).toBe(FX.life + 2 * FX.perSkill);
    expect(fxMs(one("bond"))).toBe(FX.life);
  });
});

describe("fxSpots: where each effect shows", () => {
  // the layouts of every week the content can bring: up to six effects, or skills and four more
  const weeks: WeekFx[][] = [
    ...KINDS.map((_, i) => KINDS.slice(0, i + 1).map(one)),
    ...[0, 1, 2, 3, 4].map((n) => [...KINDS.slice(0, n).map(one), skills(2)]),
  ];
  it("boxes 40 % wide never overlap (in one row 40 % apart, rows 10 % of the height apart)", () => {
    for (let seed = 0; seed < 300; seed++)
      for (const fx of weeks) {
        const spots = fxSpots(fx, seeded(seed));
        expect(spots).toHaveLength(fx.length);
        for (let i = 0; i < spots.length; i++)
          for (let j = i + 1; j < spots.length; j++) {
            const a = spots[i] ?? { x: 0, y: 0 };
            const b = spots[j] ?? { x: 0, y: 0 };
            const apart = Math.abs(a.x - b.x) >= 40 || Math.abs(a.y - b.y) >= 10;
            expect(apart, `seed ${seed}, ${fx.length} effects: ${i} and ${j}`).toBe(true);
          }
      }
  });
  it("each stays inside the clamp of WeekFx.module.css: 22–78 % × [100 px, 100 % − 110 px]", () => {
    for (let seed = 0; seed < 300; seed++)
      for (const fx of weeks)
        for (const { x, y } of fxSpots(fx, seeded(seed))) {
          expect(x).toBeGreaterThanOrEqual(22);
          expect(x).toBeLessThanOrEqual(78);
          // the shortest phones of the e2e (640 px) and an iPhone (844 px)
          for (const h of [640, 844]) {
            expect((y / 100) * h).toBeGreaterThanOrEqual(100);
            expect((y / 100) * h).toBeLessThanOrEqual(h - 110);
          }
        }
  });
});
