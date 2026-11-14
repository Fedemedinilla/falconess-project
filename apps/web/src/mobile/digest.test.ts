import { describe, expect, it } from "vitest";
import { digestLines } from "./storyModel";

describe("digestLines (owner 2026-11-14: a scene passed fast is a digest, not all of it)", () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  it("keeps about a third, the first and the last", () => {
    const d = digestLines(range(30));
    expect(d).toHaveLength(10);
    expect(d[0]).toBe(0);
    expect(d.at(-1)).toBe(29);
  });
  it("keeps at least three, and a short scene whole", () => {
    expect(digestLines(range(6))).toEqual([0, 3, 5]);
    expect(digestLines(range(3))).toEqual([0, 1, 2]);
    expect(digestLines(range(1))).toEqual([0]);
  });
  it("keeps the lines in order, without repeats", () => {
    const d = digestLines(range(17));
    expect(new Set(d).size).toBe(d.length);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
});
