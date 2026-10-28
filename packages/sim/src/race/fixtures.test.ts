import { loadContent } from "@falconess/content";
import { RaceEntry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1 } from "../rulesets/index.js";
import { freezeSkill } from "./entry.js";
import { disableSkill, FIXTURE_FRAME_ID, fixtureBuild, neutralFixtureEntry } from "./fixtures.js";
import { compileTraits, defaultTraits } from "./modifiers.js";

const content = loadContent();
const stats = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

describe("neutralFixtureEntry (docs/race-engine.md 3.4)", () => {
  it("returns the fixed values and parses as RaceEntry", () => {
    const e = neutralFixtureEntry({ runnerId: "fx-0", laneIndex: 2, style: "hover", stats });
    expect(e).toEqual({
      runnerId: "fx-0",
      kind: "rival",
      falconessId: null,
      laneIndex: 2,
      frameId: FIXTURE_FRAME_ID,
      manufacturer: "none",
      rule: "none",
      style: "hover",
      passive: null,
      parts: [],
      quirks: [],
      mood: 0,
      biomeAptitude: "B",
      styleAptitude: "B",
      stats,
      powerToWeight: 1000,
      energy: 100,
      dissipation: 60,
      durabilityMax: 100,
      durabilityStart: 100,
      skills: [],
      traits: compileTraits([]),
    });
    expect(e.frameId).toBe("fixture-neutral");
    expect(RaceEntry.parse(e)).toEqual(e);
  });

  it("takes frozen, unique, id-sorted skills (a unique skill included) and throws otherwise", () => {
    const skills = ["corner-carver", "last-gasp", "stoop-strike"].map((id) =>
      freezeSkill(content, id),
    );
    const e = neutralFixtureEntry({ runnerId: "fx", laneIndex: 0, style: "dive", stats, skills });
    expect(e.skills).toEqual(skills);
    expect(RaceEntry.safeParse(e).success).toBe(true);
    const [a, b] = skills;
    if (!a || !b) throw new Error("fixture skills");
    const make = (s: readonly unknown[]) => () =>
      neutralFixtureEntry({
        runnerId: "fx",
        laneIndex: 0,
        style: "dive",
        stats,
        skills: s as typeof skills,
      });
    expect(make([b, a])).toThrow(/id-sorted/);
    expect(make([a, a])).toThrow(/id-sorted/);
    const { disabled: _drop, ...notFrozen } = a;
    expect(make([notFrozen])).toThrow(/frozen/);
    expect(make([{ ...a, activationBasePm: 1.5 }])).toThrow(/frozen/);
    const nine = [...content.skills.values()]
      .filter((s) => s.kind === "active")
      .map((s) => s.id)
      .sort()
      .slice(0, 9)
      .map((id) => freezeSkill(content, id));
    expect(make(nine)).toThrow(/at most 8/);
    expect(() => make(nine.slice(0, 8))()).not.toThrow();
  });

  it("with a build: parts, quirks, frame values, stat deltas (clamped) and traits", () => {
    const build = fixtureBuild(content, ["koryu-firmware", "lumiere-stabilizer"], ["cheap-fuel"]);
    const e = neutralFixtureEntry({ runnerId: "fx", laneIndex: 1, style: "glide", stats, build });
    expect(e).toMatchObject({
      parts: ["koryu-firmware", "lumiere-stabilizer"],
      quirks: ["cheap-fuel"],
      energy: 115,
      dissipation: 50,
      durabilityMax: 100,
      durabilityStart: 100,
      rule: "none",
    });
    expect(e.stats.intelligence).toBe(630);
    expect(e.traits.curvesScalePm).toBe(500);
    expect(RaceEntry.parse(e)).toEqual(e);
    const top = { ...stats, intelligence: 1990 };
    expect(
      neutralFixtureEntry({ runnerId: "fx", laneIndex: 1, style: "glide", stats: top, build }).stats
        .intelligence,
    ).toBe(RULESET_V1.race.maxEffectiveStat);
  });
});

describe("fixtureBuild (3.4): parts and quirks on the neutral frame", () => {
  const neutral = {
    parts: [],
    quirks: [],
    powerToWeight: 1000,
    energy: 100,
    dissipation: 60,
    durabilityMax: 100,
    statDelta: { agility: 0, stamina: 0, technique: 0, courage: 0, intelligence: 0 },
    traits: defaultTraits(),
  };

  it("no parts and no quirks equals the fixed values", () => {
    expect(fixtureBuild(content, [], [])).toEqual(neutral);
  });

  it("steinhaus-turbine: PW 1100, dissipation 50 (no telemetry cap on rule none)", () => {
    expect(fixtureBuild(content, ["steinhaus-turbine"], [])).toMatchObject({
      powerToWeight: 1100,
      dissipation: 50,
    });
    expect(fixtureBuild(content, ["steinhaus-turbine"], ["loose-rivets"]).powerToWeight).toBe(1200);
  });

  it("lumiere-stabilizer: curvesScalePm 500", () => {
    expect(fixtureBuild(content, ["lumiere-stabilizer"], []).traits.curvesScalePm).toBe(500);
  });

  it("koryu-firmware: statDelta.intelligence 30", () => {
    expect(fixtureBuild(content, ["koryu-firmware"], []).statDelta).toEqual({
      ...neutral.statDelta,
      intelligence: 30,
    });
  });

  it("altair-firmware: nothing in race (skill slots have no race meaning)", () => {
    expect(fixtureBuild(content, ["altair-firmware"], [])).toEqual({
      ...neutral,
      parts: ["altair-firmware"],
    });
  });

  it("batteries and quirk mods add with the frame-build arithmetic and clamps", () => {
    expect(fixtureBuild(content, ["boneyard-battery"], [])).toMatchObject({
      energy: 125,
      durabilityMax: 90,
    });
    expect(fixtureBuild(content, [], ["patched-tank", "heavy-paint"])).toMatchObject({
      energy: 90,
      durabilityMax: 165,
      powerToWeight: 950,
    });
    expect(fixtureBuild(content, [], ["hot-head", "stutter"]).traits).toMatchObject({
      heatImmune: true,
      noPulse: true,
    });
  });
});

describe("disableSkill (3.2, ADR-0003 D49)", () => {
  const skills = ["corner-carver", "last-gasp"].map((id) => freezeSkill(content, id));
  const entry = neutralFixtureEntry({
    runnerId: "fx",
    laneIndex: 0,
    style: "hover",
    stats,
    skills,
  });

  it("changes only that skill's flag and leaves the input untouched", () => {
    const before = JSON.stringify(entry);
    const off = disableSkill(entry, "last-gasp");
    expect(JSON.stringify(entry)).toBe(before);
    expect(off.skills.map((s) => [s.id, s.disabled])).toEqual([
      ["corner-carver", false],
      ["last-gasp", true],
    ]);
    const { skills: offSkills, ...offRest } = off;
    const { skills: onSkills, ...onRest } = entry;
    expect(offRest).toEqual(onRest);
    expect(offSkills.map(({ disabled: _d, ...s }) => s)).toEqual(
      onSkills.map(({ disabled: _d, ...s }) => s),
    );
    expect(RaceEntry.safeParse(off).success).toBe(true);
  });

  it("throws on a skill the entry lacks", () => {
    expect(() => disableSkill(entry, "water-skimmer")).toThrow(/does not carry/);
  });
});
