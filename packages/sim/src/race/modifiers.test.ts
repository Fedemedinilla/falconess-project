import { loadContent } from "@falconess/content";
import { RaceModifier, type RaceModifierKind, RaceTraits } from "@falconess/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyBuild } from "../frame-build.js";
import { compileRule } from "../rules/index.js";
import { buildCourseGeometry } from "./geometry.js";
import { compileTraits, defaultTraits, statDeltas } from "./modifiers.js";
import { segmentFactors } from "./physics.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";

const content = loadContent();
const R = SPEC_RULESET.race;
const D = defaultTraits();

/** Parse content-shaped modifiers through the schema (defaults filled, as content loads them). */
function mods(...raw: unknown[]): RaceModifier[] {
  return raw.map((m) => RaceModifier.parse(m));
}

/**
 * One case per RaceModifier kind (docs/race-engine.md 16): the compiled traits (freeze
 * aggregation), and where the kind acts at race prep, the table it feeds.
 */
const KIND_CASES: Record<RaceModifierKind, () => void> = {
  "falconess-stat": () => {
    const m = mods(
      { kind: "falconess-stat", stat: "intelligence", delta: 30 },
      { kind: "falconess-stat", stat: "intelligence", delta: 20 },
      { kind: "falconess-stat", stat: "agility", delta: -15 },
    );
    expect(compileTraits(m)).toEqual(D); // not a trait: freezeEntry step 3
    expect(statDeltas(m)).toEqual({
      agility: -15,
      stamina: 0,
      technique: 0,
      courage: 0,
      intelligence: 50,
    });
  },
  "segment-factor": () => {
    const t = compileTraits(
      mods(
        { kind: "segment-factor", segment: "water", mode: "override", value: 1.0 },
        { kind: "segment-factor", segment: "water", mode: "override", value: 0.9 },
        { kind: "segment-factor", segment: "climb", mode: "multiply", value: 1.05 },
        { kind: "segment-factor", segment: "climb", mode: "multiply", value: 0.95 },
        { kind: "segment-factor", segment: "descent", mode: "multiply", value: 0.95 },
      ),
    );
    expect(t.segOverridePm).toEqual([0, 0, 0, 0, 1000, 0, 0]); // max of the overrides
    // ascending product with a floor per step: fl(fl(1000 × 950, 1000) × 1050, 1000) = 997
    expect(t.segMultiplyPm).toEqual([1000, 997, 950, 1000, 1000, 1000, 1000]);
  },
  "curves-penalty-scale": () => {
    expect(compileTraits(mods({ kind: "curves-penalty-scale", scale: 0.5 })).curvesScalePm).toBe(
      500,
    );
    const two = mods(
      { kind: "curves-penalty-scale", scale: 0.5 },
      { kind: "curves-penalty-scale", scale: 0.8 },
    );
    expect(compileTraits(two).curvesScalePm).toBe(400);
  },
  "heat-penalty-immunity": () => {
    const until = compileTraits(mods({ kind: "heat-penalty-immunity", untilMeters: 300 }));
    expect([until.heatImmune, until.heatImmuneUntilMm]).toEqual([true, 300_000]);
    const max = compileTraits(
      mods(
        { kind: "heat-penalty-immunity", untilMeters: 300 },
        { kind: "heat-penalty-immunity", untilMeters: 500 },
      ),
    );
    expect(max.heatImmuneUntilMm).toBe(500_000);
    // absent untilMeters (whole race) wins
    const whole = compileTraits(
      mods({ kind: "heat-penalty-immunity", untilMeters: 300 }, { kind: "heat-penalty-immunity" }),
    );
    expect([whole.heatImmune, whole.heatImmuneUntilMm]).toEqual([true, null]);
  },
  "obstacle-armor": () => {
    const t = compileTraits(
      mods({ kind: "obstacle-armor", extraTicks: 6 }, { kind: "obstacle-armor" }),
    );
    expect([t.obstacleArmor, t.obstacleArmorExtraTicks]).toEqual([true, 10]); // default 10, max
  },
  regen: () => {
    expect(compileTraits(mods({ kind: "regen", perTick: 0.25 })).regenMe).toBe(250);
    expect(
      compileTraits(mods({ kind: "regen", perTick: 0.25 }, { kind: "regen", perTick: 0.5 }))
        .regenMe,
    ).toBe(750);
  },
  "regen-pack-multiplier": () => {
    expect(compileTraits(mods({ kind: "regen-pack-multiplier", factor: 2 })).packRegenMultPm).toBe(
      2000,
    );
    const two = mods(
      { kind: "regen-pack-multiplier", factor: 2 },
      { kind: "regen-pack-multiplier", factor: 1.5 },
    );
    expect(compileTraits(two).packRegenMultPm).toBe(3000);
  },
  "free-first-boost": () => {
    expect(
      compileTraits(mods({ kind: "free-first-boost", segment: "descent" })).freeFirstBoostMask,
    ).toBe(4);
    const two = mods(
      { kind: "free-first-boost", segment: "descent" },
      { kind: "free-first-boost", segment: "flat" },
      { kind: "free-first-boost", segment: "descent" },
    );
    expect(compileTraits(two).freeFirstBoostMask).toBe(5); // OR of bits
  },
  "pulse-chain-accel": () => {
    const t = compileTraits(
      mods(
        { kind: "pulse-chain-accel", chainIndex: 3, accelBonus: 0.2 },
        { kind: "pulse-chain-accel", chainIndex: 4, accelBonus: 0.3 },
      ),
    );
    expect([t.pulseChainIndex, t.pulseChainBonusPm]).toEqual([3, 300]); // min index, max bonus
  },
  "pulse-cooldown": () => {
    const t = compileTraits(
      mods(
        { kind: "pulse-cooldown", segment: "flat", cooldownTicks: 20 },
        { kind: "pulse-cooldown", segment: "flat", cooldownTicks: 25 },
        { kind: "pulse-cooldown", segment: "descent", cooldownTicks: 40 },
      ),
    );
    expect(t.pulseCooldown).toEqual([20, 0, 40, 0, 0, 0, 0]); // min per type, 0 = none
  },
  "activation-bonus": () => {
    const t = compileTraits(
      mods(
        { kind: "activation-bonus", phase: "middle", bonus: 0.1 },
        { kind: "activation-bonus", phase: "middle", bonus: 0.05 },
        { kind: "activation-bonus", bonus: 0.02 },
      ),
    );
    expect(t.activationBonusPm).toEqual({ start: 0, middle: 150, final: 0, any: 20 });
  },
  "heat-to-energy": () => {
    expect(compileTraits(mods({ kind: "heat-to-energy", ratio: 0.5 })).heatToEnergyPm).toBe(500);
    const capped = mods(
      { kind: "heat-to-energy", ratio: 0.75 },
      { kind: "heat-to-energy", ratio: 0.5 },
    );
    expect(compileTraits(capped).heatToEnergyPm).toBe(1000);
  },
  "lift-bonus": () => {
    const t = compileTraits(
      mods({ kind: "lift-bonus", factor: 0.1 }, { kind: "lift-bonus", factor: 0.05 }),
    );
    expect(t.liftBonusPm).toBe(150);
  },
  "no-pulse": () => {
    expect(compileTraits(mods({ kind: "no-pulse" })).noPulse).toBe(true);
  },
  "random-skill-guaranteed": () => {
    expect(compileTraits(mods({ kind: "random-skill-guaranteed" })).randomSkillGuaranteed).toBe(
      true,
    );
  },
  "power-cap": () => {
    const m = mods({ kind: "power-cap", max: 1.1 }, { kind: "power-cap", max: 1.2 });
    expect(compileTraits(m)).toEqual(D); // applied by the frame build, not a trait
    const base = { powerToWeight: 1400, energy: 100, dissipation: 60, durability: 100 };
    expect(applyBuild(base, m, [], [], null).powerToWeight).toBe(1100); // min of the caps
  },
};

describe("compileTraits: the 16 RaceModifier kinds (docs/race-engine.md 16)", () => {
  it("covers every kind of the schema union exactly once", () => {
    const kinds = RaceModifier.options.map((o) => o.shape.kind.value);
    expect(kinds).toHaveLength(16);
    expect(Object.keys(KIND_CASES).sort()).toEqual([...kinds].sort());
  });

  for (const [kind, check] of Object.entries(KIND_CASES)) it(kind, check);

  it("no modifiers gives every default, and it parses as RaceTraits", () => {
    expect(compileTraits([])).toEqual(D);
    expect(RaceTraits.parse(D)).toEqual(D);
    expect(D.segMultiplyPm).toHaveLength(7);
  });

  it("aggregation is order-free (any permutation of any modifier list)", () => {
    const pool = [
      ...[...content.skills.values()].flatMap((s) => (s.kind === "passive" ? s.modifiers : [])),
      ...[...content.quirks.values()].flatMap((q) => q.modifiers),
      ...[...content.parts.values()].flatMap((p) => p.modifiers),
      ...mods(
        { kind: "segment-factor", segment: "climb", mode: "multiply", value: 0.95 },
        { kind: "curves-penalty-scale", scale: 0.8 },
        { kind: "regen-pack-multiplier", factor: 1.5 },
        { kind: "heat-penalty-immunity" },
      ),
    ];
    fc.assert(
      fc.property(
        fc
          .subarray(pool)
          .chain((sub) =>
            fc.tuple(fc.constant(sub), fc.shuffledSubarray(sub, { minLength: sub.length })),
          ),
        ([a, b]) => {
          const ta = compileTraits(a);
          expect(compileTraits(b)).toEqual(ta);
          expect(RaceTraits.safeParse(ta).success).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

/**
 * The 11 passives of packages/content/skills: the traits each one compiles to (every other field
 * at its default).
 */
const PASSIVES: Record<string, Partial<ReturnType<typeof defaultTraits>>> = {
  "flat-cooldown": { pulseCooldown: [20, 0, 0, 0, 0, 0, 0] },
  "free-first-pulse": { freeFirstBoostMask: 4 },
  "heat-to-energy": { heatToEnergyPm: 500 },
  "mid-activation": { activationBonusPm: { start: 0, middle: 100, final: 0, any: 0 } },
  "no-climb-loss": { segOverridePm: [0, 1000, 0, 0, 0, 0, 0] },
  "obstacle-armor": { obstacleArmor: true, obstacleArmorExtraTicks: 10 },
  "pack-regen": { packRegenMultPm: 2000 },
  "scrap-armor": {
    obstacleArmor: true,
    obstacleArmorExtraTicks: 6,
    regenMe: 11,
    segMultiplyPm: [1000, 1000, 1003, 1000, 1000, 1004, 1000],
  },
  "still-air": { regenMe: 14 },
  "talon-lock": {
    pulseCooldown: [0, 0, 20, 0, 0, 0, 0],
    activationBonusPm: { start: 0, middle: 0, final: 100, any: 0 },
    pulseChainIndex: 2,
    pulseChainBonusPm: 240,
    segMultiplyPm: [1000, 1000, 1005, 1000, 1000, 1006, 1000],
  },
  "third-pulse": { pulseChainIndex: 3, pulseChainBonusPm: 200 },
};

describe("the 11 content passives", () => {
  it("the table lists exactly the passives in content", () => {
    const ids = [...content.skills.values()].filter((s) => s.kind === "passive").map((s) => s.id);
    expect(ids.sort()).toEqual(Object.keys(PASSIVES).sort());
    expect(ids).toHaveLength(11);
  });

  for (const [id, expected] of Object.entries(PASSIVES))
    it(id, () => {
      expect(compileTraits(content.getPassive(id).modifiers)).toEqual({ ...D, ...expected });
    });

  it("segment passives act on the f table: no-climb-loss climb 1000, talon-lock canyon × 1.006, scrap-armor × 1.004", () => {
    const canyon = buildCourseGeometry(SPEC_RULESET, content.getCourse("desert-canyon"));
    const stats = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
    const none = compileRule(R, "none", "desert");
    const plain = segmentFactors(R, canyon, { stats, traits: D }, none);
    expect(Array.from(plain)).toEqual([1000, 963, 900, 1000, 1150, 800, 1000]);
    const falke = compileTraits(content.getPassive("no-climb-loss").modifiers);
    expect(Array.from(segmentFactors(R, canyon, { stats, traits: falke }, none))).toEqual([
      1000, 1000, 900, 1000, 1150, 800, 1000,
    ]);
    const talon = compileTraits(content.getPassive("talon-lock").modifiers);
    expect(Array.from(segmentFactors(R, canyon, { stats, traits: talon }, none))).toEqual([
      1000, 963, 905, 1000, 1156, 800, 1000,
    ]);
    const scrap = compileTraits(content.getPassive("scrap-armor").modifiers);
    expect(Array.from(segmentFactors(R, canyon, { stats, traits: scrap }, none))).toEqual([
      1000, 963, 903, 1000, 1154, 800, 1000,
    ]);
  });
});
