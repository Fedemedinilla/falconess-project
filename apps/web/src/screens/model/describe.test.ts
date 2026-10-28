import type { ActiveSkill } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  describeActiveSkill,
  describeModifier,
  describeOption,
  describeSource,
  formatChance,
  formatDecimal,
  formatFraction,
  formatTicksAsSeconds,
} from "./describe";

const content = getContent();

function active(id: string): ActiveSkill {
  const skill = content.getSkill(id);
  if (skill.kind !== "active") throw new Error(`${id} is not active`);
  return skill;
}

describe("content in plain words", () => {
  it("formats content numbers in Spanish style", () => {
    expect(formatDecimal(1.003)).toBe("1,003");
    expect(formatDecimal(-0.05)).toBe("−0,05");
    expect(formatFraction(0.1)).toBe("10\u00a0%");
    expect(formatFraction(0.245)).toBe("24,5\u00a0%");
    expect(formatChance(55)).toBe("5,5\u00a0%");
    expect(formatChance(50)).toBe("5\u00a0%");
    expect(formatTicksAsSeconds(45)).toBe("3");
    expect(formatTicksAsSeconds(10)).toBe("0,7");
  });

  it("describes every modifier, part and quirk of the content", () => {
    for (const skill of content.skills.values())
      if (skill.kind === "passive")
        for (const m of skill.modifiers) expect(describeModifier(m)).not.toMatch(/\{|ui\./);
    for (const part of content.parts.values())
      expect(describeSource(part).length).toBeGreaterThan(0);
    for (const quirk of content.quirks.values())
      expect(describeSource(quirk).join(" ")).not.toMatch(/\{|ui\./);
    expect(describeSource(content.getPart("altair-firmware"))).toEqual(["Ranuras de habilidad +1"]);
    expect(describeSource(content.getQuirk("loose-rivets"))).toEqual([
      "Potencia/peso +0,1",
      "Durabilidad −20",
    ]);
    expect(describeModifier({ kind: "regen", perTick: 0.011 })).toContain("0,17");
  });

  it("says when an active skill fires and what it does", () => {
    expect(describeActiveSkill(active("canyon-sense"))).toBe("En Cañón: +0,5 m/s durante 3 s");
    expect(describeActiveSkill(active("stoop-strike"))).toBe(
      "En la fase final, en Bajada: +1,5 m/s durante 3 s",
    );
    expect(describeActiveSkill(active("last-gasp"))).toContain("activación ×0,8");
    for (const skill of content.skills.values())
      if (skill.kind === "active") expect(describeActiveSkill(skill)).not.toMatch(/\{|ui\./);
  });

  it("spells out an event option's sure effects and its chance branches", () => {
    const event = content.getEvent("koryu-data-session-1");
    const crew = (id: string) => content.t(content.getManufacturer(id).crew.textKey);
    const [first, second] = event.options;
    if (!first || !second) throw new Error("fixture");
    expect(describeOption(first, crew)).toEqual({
      sure: ["Inteligencia +12", "Ánimo −1"],
      branches: [],
    });
    expect(describeOption(second, crew)).toEqual({
      sure: ["Agilidad +6", "Vínculo Box Kōryū +5"],
      branches: [
        { chance: "70\u00a0%", effects: ["Ánimo +1"] },
        { chance: "30\u00a0%", effects: ["Fatiga +15"] },
      ],
    });
  });
});
