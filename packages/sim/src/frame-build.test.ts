import { loadContent } from "@falconess/content";
import { RaceModifier } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { applyBuild, resolveFrameBuild } from "./frame-build.js";

const content = loadContent();
const base = { powerToWeight: 1000, energy: 100, dissipation: 60, durability: 100 };
const mods = (raw: Record<string, number>) => ({
  powerToWeight: 0,
  energy: 0,
  dissipation: 0,
  durability: 0,
  skillSlots: 0,
  ...raw,
});

describe("applyBuild: the arithmetic shared by resolveFrameBuild and fixtureBuild", () => {
  it("adds part then quirk mods and collects passive, part, then quirk modifiers in order", () => {
    const passive = [RaceModifier.parse({ kind: "no-pulse" })];
    const part = {
      mods: mods({ powerToWeight: 0.1, energy: 20, skillSlots: 1 }),
      modifiers: [RaceModifier.parse({ kind: "lift-bonus", factor: 0.1 })],
    };
    const quirk = {
      mods: mods({ durability: -20, dissipation: 5 }),
      modifiers: [RaceModifier.parse({ kind: "random-skill-guaranteed" })],
    };
    const v = applyBuild(base, passive, [part], [quirk], null);
    expect(v).toEqual({
      powerToWeight: 1100,
      energy: 120,
      dissipation: 65,
      durabilityMax: 80,
      skillSlots: 1,
      modifiers: [...passive, ...part.modifiers, ...quirk.modifiers],
    });
  });

  it("applies the rule cap, then every power-cap, then the clamps", () => {
    const cap = [RaceModifier.parse({ kind: "power-cap", max: 1.05 })];
    const turbo = { mods: mods({ powerToWeight: 0.5 }), modifiers: [] };
    expect(applyBuild(base, [], [turbo], [], 1100).powerToWeight).toBe(1100);
    expect(applyBuild(base, cap, [turbo], [], 1100).powerToWeight).toBe(1050);
    expect(applyBuild({ ...base, powerToWeight: 1500 }, [], [turbo], [], null).powerToWeight).toBe(
      1600,
    );
    const drain = {
      mods: mods({ energy: -60, dissipation: -40, durability: -80, powerToWeight: -0.5 }),
      modifiers: [],
    };
    expect(
      applyBuild(
        { powerToWeight: 600, energy: 40, dissipation: 30, durability: 50 },
        [],
        [drain],
        [drain],
        null,
      ),
    ).toMatchObject({
      powerToWeight: 500,
      energy: 20,
      dissipation: 20,
      durabilityMax: 20,
    });
  });

  it("resolveFrameBuild of every content frame equals its stats, passive and rule cap", () => {
    for (const frame of content.frames.values()) {
      const rule = content.getManufacturer(frame.manufacturer).rule;
      const b = resolveFrameBuild(content, frame.id, [], []);
      const pw = Math.round(frame.stats.powerToWeight * 1000);
      expect(b).toEqual({
        frameId: frame.id,
        manufacturer: frame.manufacturer,
        rule,
        style: frame.style,
        powerToWeight: rule === "telemetry" ? Math.min(pw, 1100) : pw,
        energy: frame.stats.energy,
        dissipation: frame.stats.dissipation,
        durabilityMax: frame.stats.durability,
        skillSlots: 0,
        modifiers: frame.passive ? content.getPassive(frame.passive).modifiers : [],
        parts: [],
        quirks: [],
      });
    }
  });
});
