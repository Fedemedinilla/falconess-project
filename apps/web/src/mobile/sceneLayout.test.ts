import { describe, expect, it } from "vitest";
import { placeScene } from "./sceneLayout";

const art = { w: 720, h: 1290, fx: 0.63, fy: 0.23 };

describe("a training scene behind the whole screen", () => {
  for (const [w, h] of [
    [375, 667],
    [390, 664],
    [390, 844],
    [430, 932],
  ] as const)
    it(`${w}×${h}: covers the screen and puts her face where the stage asks`, () => {
      const target = { x: w / 2, y: h * 0.33 };
      const p = placeScene(art, { width: w, height: h }, target);
      // every edge covered
      expect(p.left).toBeLessThanOrEqual(0);
      expect(p.top).toBeLessThanOrEqual(0);
      expect(p.left + p.width).toBeGreaterThanOrEqual(w - 0.01);
      expect(p.top + p.height).toBeGreaterThanOrEqual(h - 0.01);
      // the face lands on the target height, and on screen horizontally
      const fy = p.top + art.fy * p.height;
      const fx = p.left + art.fx * p.width;
      expect(Math.abs(fy - target.y)).toBeLessThan(1);
      expect(fx).toBeGreaterThan(w * 0.25);
      expect(fx).toBeLessThan(w * 0.85);
    });
  it("grows the image when a face too high could not reach the stage", () => {
    const high = { w: 720, h: 1290, fx: 0.5, fy: 0.08 };
    const p = placeScene(high, { width: 390, height: 844 }, { x: 195, y: 260 });
    // at plain cover her face would sit at 0.08 × 844 ≈ 68 px, under the top bar; it grows (capped at 1.5 ×)
    expect(p.top + high.fy * p.height).toBeGreaterThan(95);
    expect(p.width).toBeLessThanOrEqual(720 * (844 / 1290) * 1.5 + 0.01);
  });
});
