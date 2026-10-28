import { STAT_ORDER } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  crewCoverage,
  defaultHangar,
  HANGAR_SIZE,
  orderedFrames,
  statScale,
  toggleFrame,
} from "./new-season";

const content = getContent();

describe("new season choices", () => {
  it("starts from the hangar of pnpm play and keeps the hangar at four frames", () => {
    expect(defaultHangar(content)).toEqual(["shiden", "mule", "nimbus", "falke"]);
    let h = toggleFrame([], "shiden");
    for (const f of ["mule", "nimbus", "falke", "kite"]) h = toggleFrame(h, f);
    expect(h).toEqual(["shiden", "mule", "nimbus", "falke"]);
    expect(h).toHaveLength(HANGAR_SIZE);
    expect(toggleFrame(h, "mule")).toEqual(["shiden", "nimbus", "falke"]);
  });

  it("orders every frame with the signature frames last", () => {
    const frames = orderedFrames(content);
    expect(frames).toHaveLength(content.frames.size);
    const firstSignature = frames.findIndex((f) => f.signatureOf !== undefined);
    expect(frames.slice(firstSignature).every((f) => f.signatureOf !== undefined)).toBe(true);
  });

  it("scales the base-stat bars above the roster's highest stat", () => {
    const scale = statScale(content);
    for (const f of content.falconess.values())
      for (const stat of STAT_ORDER) expect(f.baseStats[stat]).toBeLessThanOrEqual(scale);
    expect(scale % 50).toBe(0);
  });

  it("names which hangar crews train each stat", () => {
    const coverage = crewCoverage(content, ["shiden", "mule"]);
    expect(coverage.map((c) => c.stat)).toEqual([...STAT_ORDER]);
    for (const c of coverage)
      for (const m of c.crews) expect(content.getManufacturer(m).crew.stats).toContain(c.stat);
    const courage = coverage.find((c) => c.stat === "courage");
    expect(courage?.crews).toContain("boneyard");
    expect(crewCoverage(content, []).every((c) => c.crews.length === 0)).toBe(true);
  });
});
