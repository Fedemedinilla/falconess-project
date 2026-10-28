import { loadContent } from "@falconess/content";
import { type Course, RaceModifier } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { compileRule } from "../rules/index.js";
import { RULESET_V1 } from "../rulesets/index.js";
import { buildCourseGeometry } from "./geometry.js";
import { compileTraits, defaultTraits } from "./modifiers.js";
import {
  accelVu,
  baseSegmentFactor,
  coolTick,
  drainCoefficients,
  groundDetourPm,
  landingKeepPm,
  overheatDamage,
  segmentFactors,
} from "./physics.js";
import { SEG_CURVES, SEG_JUMP } from "./units.js";

const content = loadContent();
const R = RULESET_V1.race;
const NONE = compileRule(R, "none", "desert");
const stats600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

function course(segments: Course["segments"]): Course {
  return {
    id: "test-course",
    version: 1,
    biome: "desert",
    traits: [],
    entries: 8,
    segments,
    textKey: "course.test",
  };
}

function factors(
  c: Course,
  opts: { agility?: number; modifiers?: unknown[]; rule?: "repairable" } = {},
) {
  const traits = compileTraits((opts.modifiers ?? []).map((m) => RaceModifier.parse(m)));
  const terms = opts.rule ? compileRule(R, opts.rule, "desert") : NONE;
  const G = buildCourseGeometry(RULESET_V1, c);
  return Array.from(
    segmentFactors(R, G, { stats: { ...stats600, agility: opts.agility ?? 600 }, traits }, terms),
  );
}

describe("segment factor f_seg (docs/race-engine.md 7)", () => {
  it("content values: 963, 1030, 1020, 800, 900, 1150", () => {
    expect(factors(content.getCourse("desert-canyon"))).toEqual([
      1000, 963, 900, 1000, 1150, 800, 1000,
    ]);
    expect(factors(content.getCourse("desert-ridge"))).toEqual([
      1000, 1030, 1000, 1000, 1020, 1000, 1000,
    ]);
    expect(factors(content.getCourse("desert-sprint"))).toEqual([1000, 900, 1000, 900, 1000]);
  });

  it("curves: 900 at A 600, 950 with the stabilizer, 1000 at A ≥ 1200, 800 at A 0", () => {
    const c = course([{ type: "curves", length: 200, radius: 60 }]);
    expect(factors(c)).toEqual([900]);
    expect(factors(c, { modifiers: [{ kind: "curves-penalty-scale", scale: 0.5 }] })).toEqual([
      950,
    ]);
    expect(factors(c, { agility: 1200 })).toEqual([1000]);
    expect(factors(c, { agility: 2000 })).toEqual([1000]);
    expect(baseSegmentFactor(R, SEG_CURVES, 0, 0, 0, 0, 1000)).toBe(800);
  });

  it("Boneyard curve term (13.1): 850 at A 600, 925 with the stabilizer", () => {
    const c = course([{ type: "curves", length: 200, radius: 60 }]);
    expect(factors(c, { rule: "repairable" })).toEqual([850]);
    expect(
      factors(c, { rule: "repairable", modifiers: [{ kind: "curves-penalty-scale", scale: 0.5 }] }),
    ).toEqual([925]);
  });

  it("modifiers: falke override, thin-air 1011 / 978, mud-runner 1000, max of two overrides", () => {
    const canyon = content.getCourse("desert-canyon");
    const ridge = content.getCourse("desert-ridge");
    expect(factors(canyon, { modifiers: content.getPassive("no-climb-loss").modifiers })[1]).toBe(
      1000,
    );
    const thinAir = content.getQuirk("thin-air").modifiers;
    expect(factors(canyon, { modifiers: thinAir })[1]).toBe(1011);
    expect(factors(ridge, { modifiers: thinAir })[1]).toBe(978);
    expect(factors(canyon, { modifiers: content.getQuirk("mud-runner").modifiers })[5]).toBe(1000);
    const two = [
      { kind: "segment-factor", segment: "water", mode: "override", value: 0.9 },
      { kind: "segment-factor", segment: "water", mode: "override", value: 1.1 },
    ];
    expect(factors(canyon, { modifiers: two })[5]).toBe(1100);
    // override, then multiply
    const both = [
      ...two,
      { kind: "segment-factor", segment: "water", mode: "multiply", value: 0.5 },
    ];
    expect(factors(canyon, { modifiers: both })[5]).toBe(550);
  });

  it("clamps to [500, 1500]", () => {
    const c = course([
      { type: "water", length: 100, drag: 0.5 },
      { type: "descent", length: 100, grade: 1 },
      { type: "canyon", length: 100, wind: -0.3 },
    ]);
    expect(factors(c)).toEqual([500, 1100, 700]);
    const low = [{ kind: "segment-factor", segment: "water", mode: "multiply", value: 0.5 }];
    expect(factors(c, { modifiers: low })[0]).toBe(500);
    const high = [{ kind: "segment-factor", segment: "descent", mode: "multiply", value: 1.5 }];
    expect(factors(c, { modifiers: high })[1]).toBe(1500);
  });

  it("jump and flat are 1000", () => {
    expect(baseSegmentFactor(R, SEG_JUMP, 0, 0, 0, 600, 1000)).toBe(1000);
    expect(() => baseSegmentFactor(R, 7, 0, 0, 0, 600, 1000)).toThrow();
  });

  it("is monotone non-decreasing in agility (curves only)", () => {
    const c = course([{ type: "curves", length: 200, radius: 60 }]);
    let prev = 0;
    for (let a = 1; a <= 2000; a += 37) {
      const [f] = factors(c, { agility: a });
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f ?? 0;
    }
  });
});

describe("scalar helpers of table 3.3 with the rule terms of 13.1", () => {
  const T = (rule: "mass-thrust" | "regen" | "pulse" | "telemetry" | "repairable" | "none") =>
    compileRule(R, rule, "desert");

  it("acceleration: 400 vu/tick at T 600 (telemetry 340), 300 at T 300, 500 at T 900", () => {
    expect(accelVu(R, 600, 1000, 1000, T("none"))).toBe(400);
    expect(accelVu(R, 600, 1000, 1000, T("telemetry"))).toBe(340);
    expect(accelVu(R, 300, 1000, 1000, T("none"))).toBe(300);
    expect(accelVu(R, 900, 1000, 1000, T("none"))).toBe(500);
    expect(accelVu(R, 600, 750, 1000, T("none"))).toBe(300); // broken PW table
  });

  it("drain: 625 000 / 812 500 µhp at St 600, C 600; telemetry ×0.9; fat floor at C ≥ 1500", () => {
    expect(drainCoefficients(R, 600, 600, T("none"))).toEqual([625_000, 812_500]);
    expect(drainCoefficients(R, 600, 600, T("telemetry"))).toEqual([562_500, 731_250]);
    const [n1500, f1500] = drainCoefficients(R, 600, 1500, T("none"));
    expect(f1500).toBe(n1500);
    const [n2000, f2000] = drainCoefficients(R, 600, 2000, T("none"));
    expect(f2000).toBe(n2000);
  });

  it("cooling: 1000 mh at neutral knobs, Steinhaus desert 500 (mountain 1250)", () => {
    expect(coolTick(R, "desert", 60, T("none"))).toBe(1000);
    expect(coolTick(R, "desert", 45, T("mass-thrust"))).toBe(500);
    expect(coolTick(R, "mountain", 45, compileRule(R, "mass-thrust", "mountain"))).toBe(1250);
    // the dissipation knob (0 = brief) scales cooling with dissipation / dissRef
    expect(coolTick({ ...R, coolDissWeight: 1000 }, "desert", 120, T("none"))).toBe(2000);
    expect(coolTick({ ...R, coolDissWeight: 1000 }, "desert", 30, T("none"))).toBe(500);
  });

  it("overheat damage: 1000 md, Steinhaus 2000, ground 500, Steinhaus ground 1000", () => {
    expect(overheatDamage(R, "hover", T("none"))).toBe(1000);
    expect(overheatDamage(R, "glide", T("mass-thrust"))).toBe(2000);
    expect(overheatDamage(R, "ground", T("none"))).toBe(500);
    expect(overheatDamage(R, "ground", T("mass-thrust"))).toBe(1000);
  });

  it("landing: 830 / 860 / 920 at T 300 / 600 / 1200; Lumière 720, Boneyard 930 at T 600", () => {
    expect(landingKeepPm(R, 300, T("none"))).toBe(830);
    expect(landingKeepPm(R, 600, T("none"))).toBe(860);
    expect(landingKeepPm(R, 1200, T("none"))).toBe(920);
    expect(landingKeepPm(R, 2000, T("none"))).toBe(920);
    expect(landingKeepPm(R, 0, T("none"))).toBe(800);
    expect(landingKeepPm(R, 600, T("regen"))).toBe(720);
    expect(landingKeepPm(R, 600, T("repairable"))).toBe(930);
    expect(landingKeepPm(R, 0, T("regen"))).toBe(600);
  });

  it("ground detour: 1100 (Boneyard 1050)", () => {
    expect(groundDetourPm(R, T("none"))).toBe(1100);
    expect(groundDetourPm(R, T("repairable"))).toBe(1050);
  });

  it("defaults trait object is untouched by the helpers", () => {
    const d = defaultTraits();
    factors(content.getCourse("desert-sprint"));
    expect(defaultTraits()).toEqual(d);
  });
});
