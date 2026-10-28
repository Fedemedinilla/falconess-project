import { loadContent } from "@falconess/content";
import { type EntryInput, ManufacturerRule, RaceEntry, RaceSkill } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { compileRule } from "../rules/index.js";
import { RULESET_V1 } from "../rulesets/index.js";
import { freezeEntry, freezeSkill } from "./entry.js";
import { buildCourseGeometry } from "./geometry.js";
import { compileTraits, defaultTraits } from "./modifiers.js";
import { segmentFactors } from "./physics.js";

const content = loadContent();
const R = RULESET_V1;
const COURSES = ["desert-sprint", "desert-ridge", "desert-canyon"] as const;
const BONEYARD_FRAMES = new Set(["kite", "mule", "caracara-signature"]);

function inputFor(
  falconessId: string,
  frameId: string,
  over: Partial<EntryInput> = {},
): EntryInput {
  const f = content.getFalconess(falconessId);
  return {
    runnerId: "player",
    kind: "player",
    falconessId,
    baseStats: f.baseStats,
    mood: 0,
    biomeAptitude: f.biomeAptitude,
    styleAptitude: f.styleAptitude,
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: f.uniqueSkills,
    durability: null,
    ...over,
  };
}

/** Curve factor written out from section 7: 1000 − fl(200 × (1200 − min(A, 1200)) × cs, 1.2e6). */
function curvesByHand(agility: number, curvesScale: number): number {
  return 1000 - Math.floor((200 * (1200 - Math.min(agility, 1200)) * curvesScale) / 1_200_000);
}

/**
 * f_seg per segment from the section 7 formulas by hand: flat/jump 1000, climb 0.25 → 963,
 * descent 0.3 → 1030 and 0.2 → 1020, canyon −0.1 → 900 and +0.15 → 1150, water 0.2 → 800, curves
 * from agility (×1.5 penalty on Boneyard frames); falke's no-climb-loss and Caracara's scrap-armor
 * override climb and water to 1000.
 */
function factorsByHand(courseId: string, frameId: string, agility: number): number[] {
  const c = curvesByHand(agility, BONEYARD_FRAMES.has(frameId) ? 1500 : 1000);
  switch (courseId) {
    case "desert-sprint":
      return [1000, c, 1000, c, 1000];
    case "desert-ridge":
      return [1000, 1030, 1000, 1000, 1020, 1000, 1000];
    case "desert-canyon":
      return [
        1000,
        frameId === "falke" ? 1000 : 963,
        900,
        1000,
        1150,
        frameId === "caracara-signature" ? 1000 : 800,
        1000,
      ];
    default:
      throw new Error(courseId);
  }
}

describe("freezeSkill (docs/race-engine.md 3.2)", () => {
  const actives = [...content.skills.values()].filter((s) => s.kind === "active");

  it("freezes every active skill in content into a valid RaceSkill", () => {
    expect(actives).toHaveLength(15);
    for (const s of actives) {
      const frozen = freezeSkill(content, s.id);
      expect(RaceSkill.parse(frozen)).toEqual(frozen);
      expect(frozen.disabled).toBe(false);
      expect(frozen.id).toBe(s.id);
    }
  });

  it("converts decimals to ‰ and milli-units", () => {
    expect(freezeSkill(content, "last-gasp")).toEqual({
      id: "last-gasp",
      uniqueTo: null,
      activationBasePm: 800,
      trigger: {
        phase: "final",
        segment: null,
        posLoPm: null,
        posHiPm: null,
        heatAboveMilli: null,
        energyBelowMilli: null,
        once: true,
      },
      effect: {
        speedMms: 1000,
        accelMms2: 0,
        energyRefundMilli: 0,
        heatCoolMilli: 0,
        durabilityGuard: false,
        durationTicks: 30,
      },
      disabled: false,
    });
    const wind = freezeSkill(content, "wind-hover");
    expect([wind.trigger.posLoPm, wind.trigger.posHiPm, wind.trigger.phase]).toEqual([
      300,
      700,
      "middle",
    ]);
    expect([wind.effect.energyRefundMilli, wind.effect.heatCoolMilli]).toEqual([15_000, 10_000]);
    expect(freezeSkill(content, "lead-guard").trigger).toMatchObject({ posLoPm: 0, posHiPm: 200 });
    expect(freezeSkill(content, "cool-head")).toMatchObject({
      trigger: { heatAboveMilli: 50_000, phase: "any" },
      effect: { heatCoolMilli: 20_000, durationTicks: 0 },
    });
    expect(freezeSkill(content, "second-wind").trigger.energyBelowMilli).toBe(20_000);
    expect(freezeSkill(content, "clean-start").effect.accelMms2).toBe(300);
    expect(freezeSkill(content, "gravity-friend").effect.accelMms2).toBe(400);
    expect(freezeSkill(content, "stoop-strike")).toMatchObject({
      uniqueTo: "peregrina",
      trigger: { phase: "final", segment: "descent" },
      effect: { speedMms: 1500, durationTicks: 45 },
    });
    expect(freezeSkill(content, "iron-wings").effect).toMatchObject({
      durabilityGuard: true,
      durationTicks: 90,
    });
  });

  it("throws on a passive id; accepts a unique skill without a Falconess", () => {
    expect(() => freezeSkill(content, "talon-lock")).toThrow(/passive/);
    expect(() => freezeSkill(content, "no-such-skill")).toThrow();
    expect(freezeSkill(content, "scavenger-stride").uniqueTo).toBe("caracara");
  });
});

describe("freezeEntry (docs/race-engine.md 3.1): every frame × Falconess × course", () => {
  const frames = [...content.frames.keys()];
  const falconess = [...content.falconess.keys()];

  it("content has 13 frames and 3 Falconess", () => {
    expect(frames).toHaveLength(13);
    expect(falconess).toHaveLength(3);
  });

  for (const courseId of COURSES)
    for (const fid of falconess)
      it(`${courseId} / ${fid}: 13 frozen entries, per-segment factors by hand`, () => {
        const course = content.getCourse(courseId);
        const G = buildCourseGeometry(R, course);
        const f = content.getFalconess(fid);
        frames.forEach((frameId, lane) => {
          const frame = content.getFrame(frameId);
          const maker = content.getManufacturer(frame.manufacturer);
          const e = freezeEntry(R, content, inputFor(fid, frameId), course, lane % 8);
          expect(RaceEntry.parse(e)).toEqual(e);

          // identity and rule
          expect(e).toMatchObject({
            runnerId: "player",
            kind: "player",
            falconessId: fid,
            laneIndex: lane % 8,
            frameId,
            manufacturer: frame.manufacturer,
            rule: maker.rule,
            style: frame.style,
            passive: frame.passive ?? null,
            parts: [],
            quirks: [],
            mood: 0,
          });
          expect(ManufacturerRule.safeParse(e.rule).success).toBe(true); // never "none"

          // frame values in engine units (telemetry PW cap 1100)
          const pw = Math.round(frame.stats.powerToWeight * 1000);
          expect(e.powerToWeight).toBe(maker.rule === "telemetry" ? Math.min(pw, 1100) : pw);
          expect([e.energy, e.dissipation, e.durabilityMax, e.durabilityStart]).toEqual([
            frame.stats.energy,
            frame.stats.dissipation,
            frame.stats.durability,
            frame.stats.durability,
          ]);

          // letters applied: course biome on agility, frame style on intelligence (mood 0)
          const bLetter = f.biomeAptitude[course.biome];
          const sLetter = f.styleAptitude[frame.style];
          expect([e.biomeAptitude, e.styleAptitude]).toEqual([bLetter, sLetter]);
          const b = f.baseStats;
          expect(e.stats).toEqual({
            agility: Math.floor((b.agility * R.aptitudeMult[bLetter]) / 1000),
            stamina: b.stamina,
            technique: b.technique,
            courage: b.courage,
            intelligence: Math.floor((b.intelligence * R.aptitudeMult[sLetter]) / 1000),
          });

          // her unique skill, frozen; traits from the frame passive
          expect(e.skills).toEqual(f.uniqueSkills.map((id) => freezeSkill(content, id)));
          expect(e.traits).toEqual(
            frame.passive
              ? compileTraits(content.getPassive(frame.passive).modifiers)
              : defaultTraits(),
          );

          // per-segment factor table
          const terms = compileRule(R.race, e.rule, course.biome);
          expect(Array.from(segmentFactors(R.race, G, e, terms))).toEqual(
            factorsByHand(courseId, frameId, e.stats.agility),
          );
        });
      });

  it("spot values of the hand table: curves at the content agilities", () => {
    // Peregrina desert A: 110 → 115; Cernícala and Caracara desert B: 85, 80
    expect([curvesByHand(115, 1000), curvesByHand(115, 1500)]).toEqual([820, 729]);
    expect([curvesByHand(85, 1000), curvesByHand(85, 1500)]).toEqual([815, 722]);
    expect([curvesByHand(80, 1000), curvesByHand(80, 1500)]).toEqual([814, 720]);
    const sprint = content.getCourse("desert-sprint");
    const G = buildCourseGeometry(R, sprint);
    const e = freezeEntry(R, content, inputFor("peregrina", "kite"), sprint, 0);
    expect(e.stats.agility).toBe(115);
    expect(Array.from(segmentFactors(R.race, G, e, compileRule(R.race, e.rule, "desert")))).toEqual(
      [1000, 729, 1000, 729, 1000],
    );
  });

  it("600-balanced stats: curves 900 (Boneyard 850), 905 with desert A (Boneyard 858)", () => {
    const sprint = content.getCourse("desert-sprint");
    const G = buildCourseGeometry(R, sprint);
    const base = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
    const curves = (fid: string, frameId: string) => {
      const e = freezeEntry(R, content, inputFor(fid, frameId, { baseStats: base }), sprint, 0);
      return segmentFactors(R.race, G, e, compileRule(R.race, e.rule, "desert"))[1];
    };
    expect(curves("cernicala", "nimbus")).toBe(900);
    expect(curves("cernicala", "mule")).toBe(850);
    expect(curves("peregrina", "shiden")).toBe(905); // A 630
    expect(curves("peregrina", "kite")).toBe(858);
  });
});

describe("freezeEntry details", () => {
  const sprint = content.getCourse("desert-sprint");
  const base600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

  it("falconess-stat deltas land after mood and aptitude (koryu-firmware: I +30 effective)", () => {
    const e = freezeEntry(
      R,
      content,
      inputFor("peregrina", "shiden", { baseStats: base600, parts: ["koryu-firmware"] }),
      sprint,
      0,
    );
    expect(e.stats.intelligence).toBe(630 + 30); // dive A → 630, then +30
    expect(e.parts).toEqual(["koryu-firmware"]);
  });

  it("clamps effective stats to [1, maxEffectiveStat]", () => {
    const low = { agility: 1, stamina: 1, technique: 1, courage: 1, intelligence: 1 };
    const e = freezeEntry(
      R,
      content,
      inputFor("caracara", "mule", { baseStats: low, mood: -2 }),
      sprint,
      0,
    );
    expect(e.stats).toEqual(low); // floor(1 × 0.95) = 0 → 1
    expect(RaceEntry.safeParse(e).success).toBe(true);
  });

  it("skills: deduplicated, sorted by id, actives only, unique to her, at most maxSkills", () => {
    const e = freezeEntry(
      R,
      content,
      inputFor("cernicala", "nimbus", {
        learnedSkills: ["water-skimmer", "wind-hover", "corner-carver", "water-skimmer"],
      }),
      sprint,
      0,
    );
    expect(e.skills.map((s) => s.id)).toEqual(["corner-carver", "water-skimmer", "wind-hover"]);
    expect(() =>
      freezeEntry(
        R,
        content,
        inputFor("cernicala", "nimbus", { learnedSkills: ["pack-regen"] }),
        sprint,
        0,
      ),
    ).toThrow(/passive/);
    expect(() =>
      freezeEntry(
        R,
        content,
        inputFor("cernicala", "nimbus", { learnedSkills: ["stoop-strike"] }),
        sprint,
        0,
      ),
    ).toThrow(/unique/);
    expect(() =>
      freezeEntry(
        R,
        content,
        inputFor("cernicala", "nimbus", { falconessId: null, learnedSkills: ["wind-hover"] }),
        sprint,
        0,
      ),
    ).toThrow(/unique/);
    const nine = [...content.skills.values()]
      .filter((s) => s.kind === "active" && s.uniqueTo === undefined)
      .map((s) => s.id)
      .slice(0, 9);
    expect(nine).toHaveLength(9);
    expect(() =>
      freezeEntry(R, content, inputFor("cernicala", "nimbus", { learnedSkills: nine }), sprint, 0),
    ).toThrow(/at most 8/);
    const eight = freezeEntry(
      R,
      content,
      inputFor("cernicala", "nimbus", { learnedSkills: nine.slice(0, 8) }),
      sprint,
      0,
    );
    expect(eight.skills).toHaveLength(8);
  });

  it("durabilityStart = min(durabilityMax, season durability ?? max)", () => {
    const d = (durability: number | null) =>
      freezeEntry(R, content, inputFor("caracara", "mule", { durability }), sprint, 0)
        .durabilityStart;
    expect(d(null)).toBe(180);
    expect(d(37)).toBe(37);
    expect(d(0)).toBe(0);
    expect(d(500)).toBe(180);
  });

  it("parts and quirks: telemetry PW cap, Boneyard quirks as traits", () => {
    const horizon = freezeEntry(
      R,
      content,
      inputFor("cernicala", "horizon", { parts: ["steinhaus-turbine"] }),
      sprint,
      0,
    );
    expect(horizon.powerToWeight).toBe(1100);
    // the cap is read from the ruleset passed in (3.1 step 1, 24.2 test rulesets), never from v1
    const capped = { ...R, race: { ...R.race, telemetryPowerCap: 1050 } };
    const input = inputFor("cernicala", "horizon", { parts: ["steinhaus-turbine"] });
    expect(freezeEntry(capped, content, input, sprint, 0).powerToWeight).toBe(1050);
    const falke = inputFor("cernicala", "falke", { parts: ["steinhaus-turbine"] });
    expect(freezeEntry(capped, content, falke, sprint, 0).powerToWeight).toBe(
      freezeEntry(R, content, falke, sprint, 0).powerToWeight,
    ); // no telemetry rule, no cap
    const mule = freezeEntry(
      R,
      content,
      inputFor("caracara", "mule", { quirks: ["hot-head", "glider-tape"] }),
      sprint,
      0,
    );
    expect(mule.quirks).toEqual(["hot-head", "glider-tape"]);
    expect(mule.traits).toMatchObject({
      heatImmune: true,
      heatImmuneUntilMm: 300_000,
      liftBonusPm: 100,
    });
    expect(mule.passive).toBeNull();
  });

  it("rejects a lane outside 0..7", () => {
    expect(() => freezeEntry(R, content, inputFor("caracara", "mule"), sprint, 8)).toThrow(
      /laneIndex/,
    );
    expect(() => freezeEntry(R, content, inputFor("caracara", "mule"), sprint, -1)).toThrow(
      /laneIndex/,
    );
  });

  it("does not mutate its input", () => {
    const input = inputFor("peregrina", "shiden", {
      learnedSkills: ["water-skimmer", "stoop-strike"],
    });
    const before = JSON.stringify(input);
    freezeEntry(R, content, input, sprint, 0);
    expect(JSON.stringify(input)).toBe(before);
  });
});
