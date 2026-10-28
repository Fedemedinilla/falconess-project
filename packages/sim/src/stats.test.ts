import { loadContent } from "@falconess/content";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { installPart, resolveFrameBuild } from "./frame-build.js";
import { SPEC_RULESET } from "./race/testing/spec-ruleset.js";
import { effectiveStats, lowestStat, upgradeAptitude } from "./stats.js";

const content = loadContent();
const R = SPEC_RULESET;
const base = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const biomeApt = { desert: "A", mountain: "B", coast: "C", urban: "D", tundra: "G" } as const;
const styleApt = { dive: "S", hover: "B", glide: "E", ground: "F" } as const;

describe("effective stats", () => {
  it("applies mood to every stat, biome aptitude to agility and style aptitude to intelligence", () => {
    const eff = effectiveStats(R, base, 0, biomeApt, styleApt, "desert", "dive");
    expect(eff).toEqual({
      agility: 630,
      stamina: 600,
      technique: 600,
      courage: 600,
      intelligence: 660,
    });
    const sad = effectiveStats(R, base, -2, biomeApt, styleApt, "mountain", "hover");
    expect(sad).toEqual({
      agility: 570,
      stamina: 570,
      technique: 570,
      courage: 570,
      intelligence: 570,
    });
  });

  it("aptitude G costs 30 % of agility, S gives 10 %", () => {
    expect(effectiveStats(R, base, 0, biomeApt, styleApt, "tundra", "hover").agility).toBe(420);
    expect(effectiveStats(R, base, 0, biomeApt, styleApt, "coast", "dive").intelligence).toBe(660);
  });

  it("is monotonic in base stats and in mood", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1199 }), fc.integer({ min: -2, max: 1 }), (a, mood) => {
        const lo = effectiveStats(
          R,
          { ...base, agility: a },
          mood,
          biomeApt,
          styleApt,
          "urban",
          "glide",
        );
        const hi = effectiveStats(
          R,
          { ...base, agility: a + 1 },
          mood + 1,
          biomeApt,
          styleApt,
          "urban",
          "glide",
        );
        return hi.agility >= lo.agility && hi.stamina >= lo.stamina;
      }),
    );
  });

  it("upgradeAptitude moves one letter and caps at S", () => {
    expect(upgradeAptitude("G")).toBe("F");
    expect(upgradeAptitude("A")).toBe("S");
    expect(upgradeAptitude("S")).toBe("S");
  });

  it("lowestStat picks the first minimum in canonical order", () => {
    expect(lowestStat({ agility: 5, stamina: 3, technique: 3, courage: 9, intelligence: 9 })).toBe(
      "stamina",
    );
  });
});

describe("frame build (variety seam)", () => {
  it("resolves a plain frame into per-mille stats with its passive modifiers", () => {
    const b = resolveFrameBuild(content, "shiden", [], []);
    expect(b).toMatchObject({
      manufacturer: "koryu",
      rule: "pulse",
      style: "dive",
      powerToWeight: 1400,
      energy: 100,
      dissipation: 60,
      durabilityMax: 100,
    });
    expect(b.modifiers).toEqual([{ kind: "pulse-chain-accel", chainIndex: 3, accelBonus: 0.2 }]);
  });

  it("adds part mods and collects part modifiers", () => {
    const b = resolveFrameBuild(
      content,
      "falke",
      ["steinhaus-turbine", "altair-battery", "lumiere-stabilizer", "altair-firmware"],
      [],
    );
    expect(b.powerToWeight).toBe(1100);
    expect(b.energy).toBe(140);
    expect(b.dissipation).toBe(35);
    expect(b.skillSlots).toBe(1);
    expect(b.modifiers.map((m) => m.kind)).toEqual(["segment-factor", "curves-penalty-scale"]);
  });

  it("Boneyard frames carry quirk mods and modifiers instead of a passive", () => {
    const b = resolveFrameBuild(content, "mule", [], ["cheap-fuel", "stutter"]);
    expect(b.energy).toBe(115);
    expect(b.dissipation).toBe(35);
    expect(b.modifiers).toEqual([{ kind: "no-pulse" }]);
    expect(b.rule).toBe("repairable");
  });

  it("Altair telemetry caps powerToWeight at 1.1 even with turbines", () => {
    const cap = R.race.telemetryPowerCap;
    const b = resolveFrameBuild(content, "horizon", ["steinhaus-turbine"], [], cap);
    expect(b.powerToWeight).toBe(1100);
    const noCap = resolveFrameBuild(content, "falke", ["steinhaus-turbine"], []);
    expect(noCap.powerToWeight).toBe(1100); // 1.0 + 0.1, coincidentally equal
    const koryu = resolveFrameBuild(content, "shiden", ["steinhaus-turbine"], []);
    expect(koryu.powerToWeight).toBe(1500);
  });

  it("installPart keeps one part per type and respects the cap", () => {
    const a = installPart(content, [], "steinhaus-turbine", 4);
    const b = installPart(content, a, "lumiere-turbine", 4);
    expect(b).toEqual(["lumiere-turbine"]);
    const full = ["steinhaus-turbine", "altair-battery", "lumiere-stabilizer", "altair-firmware"];
    expect(() => installPart(content, full, "koryu-firmware", 4)).not.toThrow(); // replaces firmware
    expect(() => installPart(content, full, "koryu-firmware", 3)).toThrow();
  });

  it("every frame in content resolves without throwing, with any part set and any quirk pair", () => {
    const quirks = [...content.quirks.keys()];
    const parts = [...content.parts.keys()];
    for (const f of content.frames.keys()) {
      for (const q of quirks) {
        const b = resolveFrameBuild(content, f, parts.slice(0, 4), [q]);
        expect(b.powerToWeight).toBeGreaterThanOrEqual(500);
        expect(b.durabilityMax).toBeGreaterThan(0);
      }
    }
  });
});
