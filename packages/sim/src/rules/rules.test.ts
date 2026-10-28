import { BIOMES, ManufacturerRule, RACE_RULES, type RaceRule } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { buildCourseGeometry } from "../race/geometry.js";
import { defaultTraits } from "../race/modifiers.js";
import {
  accelVu,
  coolTick,
  drainCoefficients,
  groundDetourPm,
  landingKeepPm,
  overheatDamage,
  segmentFactors,
} from "../race/physics.js";
import { SPEC_RULESET } from "../race/testing/spec-ruleset.js";
import { RULE_NONE, ruleCode } from "../race/units.js";
import { compileRule, neutralTerms, RULES, type RuleTerms } from "./index.js";

const R = SPEC_RULESET.race;

/** Fields of `RuleTerms` that differ from the neutral terms. */
function changed(terms: RuleTerms): Partial<RuleTerms> {
  const base = neutralTerms(terms.code);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(terms))
    if (JSON.stringify(v) !== JSON.stringify(base[k as keyof RuleTerms])) out[k] = v;
  return out;
}

describe("RULES: one RuleSpec per RaceRule (docs/race-engine.md 3.4, 13)", () => {
  it("is exhaustive over RaceRule, with codes in RACE_RULES order and RULE_NONE = 5", () => {
    expect(Object.keys(RULES).sort()).toEqual([...RACE_RULES].sort());
    for (const rule of RACE_RULES) {
      const spec = RULES[rule];
      expect(spec.rule).toBe(rule);
      expect(spec.code).toBe(ruleCode(rule));
      for (const biome of BIOMES) expect(spec.compile(R, biome).code).toBe(spec.code);
    }
    expect(RULES.none.code).toBe(RULE_NONE);
    expect(ManufacturerRule.options.every((r) => r in RULES)).toBe(true);
  });

  it("none is the no-op spec in every biome", () => {
    for (const biome of BIOMES) expect(compileRule(R, "none", biome)).toEqual(neutralTerms(5));
    const n = neutralTerms(5);
    expect(n).toMatchObject({
      capLimRaw: false,
      clampHeatAtD: false,
      heatPenalty: true,
      licence: "immunity",
      pulses: false,
      overheatDurPm: 1000,
      regenMe: 0,
      activationBonusPm: 0,
      repairMd: 0,
    });
  });

  it("each rule changes only its own mechanism and term (desert)", () => {
    const desert = (rule: RaceRule) => changed(compileRule(R, rule, "desert"));
    expect(desert("mass-thrust")).toEqual({
      heatPenalty: false,
      licence: "always",
      overheatDurPm: 2000,
      coolPm: 500,
    });
    expect(desert("regen")).toEqual({ regenMe: 500, landLossPm: 2000 });
    expect(desert("pulse")).toEqual({
      pulses: true,
      pulseAirPm: [1150, 1150, 1380, 1150, 690, 1150, 1150],
      pulseBiomePm: 1150,
    });
    expect(desert("telemetry")).toEqual({
      capLimRaw: true,
      clampHeatAtD: true,
      licence: "never",
      activationBonusPm: 150,
      drainPm: 900,
      accelPm: 850,
    });
    expect(desert("repairable")).toEqual({
      repairMd: 2000,
      landLossPm: 500,
      detourExtraPm: 500,
      curvesPm: 1500,
    });
    expect(desert("none")).toEqual({});
  });

  it("biome-keyed terms: Steinhaus cooling and Koryu intake air per biome", () => {
    expect(BIOMES.map((b) => compileRule(R, "mass-thrust", b).coolPm)).toEqual([
      500, 1250, 1000, 500, 1250,
    ]);
    const mountain = compileRule(R, "pulse", "mountain");
    expect(mountain.pulseAirPm).toEqual([1000, 1000, 1200, 1000, 600, 1000, 1000]);
    expect(mountain.pulseBiomePm).toBe(1000);
  });

  it("terms read the ruleset (a test ruleset changes them)", () => {
    const R2 = { ...R, regenPerTick: 60, telemetryDrainPm: 950, repairablePerFlatSegment: 3 };
    expect(compileRule(R2, "regen", "desert").regenMe).toBe(60);
    expect(compileRule(R2, "telemetry", "desert").drainPm).toBe(950);
    expect(compileRule(R2, "repairable", "desert").repairMd).toBe(3000);
  });
});

describe("one case per rule term of 13.1, through the table helpers", () => {
  const t = (rule: RaceRule) => compileRule(R, rule, "desert");

  it("Steinhaus: desert cooling 500 mh per tick, overheat damage ×2", () => {
    expect(coolTick(R, "desert", 45, t("mass-thrust"))).toBe(500);
    expect(overheatDamage(R, "glide", t("mass-thrust"))).toBe(2000);
  });

  it("Lumiere: landing loss ×2 (T 600 keeps 720 instead of 860), regen 500 me", () => {
    expect(landingKeepPm(R, 600, t("regen"))).toBe(720);
    expect(t("regen").regenMe).toBe(500);
  });

  it("Koryu: burst air ×1.15 in the desert, ×1.38 on descents, ×0.69 on water", () => {
    const air = t("pulse").pulseAirPm;
    expect([air[0], air[2], air[4]]).toEqual([1150, 1380, 690]);
  });

  it("Altair: drain ×0.9 and acceleration ×0.85 (340 vu/tick at T 600)", () => {
    expect(drainCoefficients(R, 600, 600, t("telemetry"))).toEqual([562_500, 731_250]);
    expect(accelVu(R, 600, 1000, 1000, t("telemetry"))).toBe(340);
  });

  it("Boneyard: landing and detour halved (930, 1050), curves ×1.5 (850 at A 600)", () => {
    expect(landingKeepPm(R, 600, t("repairable"))).toBe(930);
    expect(groundDetourPm(R, t("repairable"))).toBe(1050);
    const sprint = buildCourseGeometry(SPEC_RULESET, {
      id: "c",
      version: 1,
      biome: "desert",
      traits: [],
      entries: 8,
      segments: [{ type: "curves", length: 200, radius: 60 }],
      textKey: "course.c",
    });
    const stats = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
    const f = segmentFactors(R, sprint, { stats, traits: defaultTraits() }, t("repairable"));
    expect(Array.from(f)).toEqual([850]);
  });
});
