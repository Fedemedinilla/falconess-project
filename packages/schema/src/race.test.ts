import { describe, expect, expectTypeOf, it } from "vitest";
import { ManufacturerRule } from "./manufacturer.js";
import {
  BOOST_MODES,
  EntryInput,
  RACE_FRAME_FLAGS,
  RACE_RULES,
  type RaceEntry,
  RaceEvent,
  RaceFrames,
  RaceLog,
  RaceResult,
  RaceRule,
  type RaceSkill,
  type RaceTraits,
  type RunnerDerived,
} from "./race.js";

const traits: RaceTraits = {
  segOverridePm: [0, 0, 0, 0, 0, 0, 0],
  segMultiplyPm: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
  curvesScalePm: 1000,
  heatImmune: false,
  heatImmuneUntilMm: null,
  obstacleArmor: false,
  obstacleArmorExtraTicks: 0,
  regenMe: 0,
  packRegenMultPm: 1000,
  freeFirstBoostMask: 0,
  pulseChainIndex: 0,
  pulseChainBonusPm: 0,
  pulseCooldown: [0, 0, 0, 0, 0, 0, 0],
  activationBonusPm: { start: 0, middle: 0, final: 0, any: 0 },
  heatToEnergyPm: 0,
  liftBonusPm: 0,
  noPulse: false,
  randomSkillGuaranteed: false,
};

const skill: RaceSkill = {
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
};

const entry: RaceEntry = {
  runnerId: "fixture-0",
  kind: "rival",
  falconessId: null,
  laneIndex: 0,
  frameId: "fixture-neutral",
  manufacturer: "none",
  rule: "none",
  style: "hover",
  passive: null,
  parts: [],
  quirks: [],
  mood: 0,
  biomeAptitude: "B",
  styleAptitude: "B",
  stats: { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 },
  powerToWeight: 1000,
  energy: 100,
  dissipation: 60,
  durabilityMax: 100,
  durabilityStart: 100,
  skills: [skill],
  traits,
};

const derived: RunnerDerived = {
  lane: 0,
  hpMax: 915_000,
  effectiveReserve: 1_464_000,
  stamDiv: 1_920_000,
  fatiguePm: 1300,
  tolerancePm: 1150,
  heatCap: 69_000,
  capLim: 69_000,
  coolTick: 1000,
  dmgTick: 1000,
  pAct: 850,
  pSkill: [680],
  u: [[12, 999, 0]],
  luckySkill: null,
  paceHalfWidthPm: 43,
  paceCentrePm: 0,
  pace: [-12, 3, 40],
  planErrWindowPm: 75,
  planErrPm: -20,
  landPm: 860,
  detourPm: 0,
  kickAtMm: 1_140_000,
  stoopPm: 1000,
  airPm: [1000],
  boostMms: 3000,
  pulseMms: 0,
  chainMms: 0,
  liftPm: 1000,
  jumpNeed: [],
  capFinal: 99_000,
  groundLevelMms: 0,
  brokenSpeedPm: 750,
  segments: [
    {
      fPm: 1000,
      cruiseMms: [23_500, 23_500, 23_500],
      accelMms2: 400,
      vMinMms: [17_000, 17_000, 17_000],
      jumpReserve: 0,
    },
  ],
};

const ledger = {
  phaseTicks: [156, 404, 252] as [number, number, number],
  boostTicks: [10, 0, 90] as [number, number, number],
  pulses: 0,
  stallTicks: 0,
  energySpent: 100_000,
  energyRegen: 0,
  energyRefunded: 0,
  energyFromHeat: 0,
  energyLift: 0,
  energyLeft: 0,
  overheatTicks: 0,
  durabilityLost: 0,
  durabilityRepaired: 0,
  hpEmptyMm: null,
  draftTicks: 0,
  landingLossMms: 0,
  jumpsOk: 0,
  jumpsFailed: 0,
  detours: 0,
  skillsActivated: ["last-gasp"],
  skillsMissed: [],
};

const result: RaceResult = {
  lane: 0,
  runnerId: "fixture-0",
  place: 1,
  finishMilli: 817_050,
  timeTicks: 818,
  marginMm: 0,
  vFinishMms: 26_500,
  deadHeat: false,
  dnf: false,
  hpEnd: 223_000,
  energyEnd: 0,
  durabilityEnd: 100_000,
  exhausted: false,
  broken: false,
  ledger,
};

/** A hand-built minimal one-runner log on a one-segment 1200 m course, detail "results". */
function minimalLog(): RaceLog {
  return {
    rulesetVersion: "v1",
    engine: "v1",
    seed: "test/1",
    courseId: "flat-1200",
    courseVersion: 1,
    tickHz: 15,
    detail: "results",
    ticks: 818,
    maxTicks: 12_000,
    geometry: {
      biome: "desert",
      lengthMm: 1_200_000,
      startEndMm: 200_000,
      finalStartMm: 800_000,
      hoverAttackMm: 840_000,
      reserveAtMm: 1_140_000,
      denseFromMm: 1_175_000,
      segments: [{ type: "flat", startMm: 0, endMm: 1_200_000, param: 0 }],
    },
    entries: [entry],
    derived: [derived],
    results: [result],
  };
}

function fullLog(): RaceLog {
  return {
    ...minimalLog(),
    detail: "full",
    frames: {
      tick: [0, 1, 818],
      runners: [
        {
          posMm: [0, 200, 1_200_000],
          vMms: [3000, 4600, 26_500],
          hp: [915_000, 914_990, 223_000],
          energy: [100_000, 99_000, 0],
          heat: [0, 2000, 3000],
          durability: [100_000, 100_000, 100_000],
          boost: [0, 1, 99],
          flags: [0, RACE_FRAME_FLAGS.boosting, RACE_FRAME_FLAGS.finished],
        },
      ],
    },
    events: [
      { kind: "boostMode", tick: 0, lane: 0, posMm: 0, mode: "surplus", levelMms: 0 },
      {
        kind: "sprintPlan",
        tick: 545,
        lane: 0,
        posMm: 841_300,
        cause: "phase",
        index: 1,
        reason: "planned",
        energy: 90_000,
        energyPerceived: 90_000,
        hp: 500_000,
        hpPerceived: 500_000,
        jumpReserve: 0,
        startMm: 841_300,
        endMm: 1_140_000,
        levelMms: 1300,
        candidates: 30,
        onTicks: 82,
        clean: true,
      },
      {
        kind: "skill",
        tick: 600,
        lane: 0,
        posMm: 900_000,
        skillId: "last-gasp",
        p: 680,
        u: 12,
        activation: 0,
      },
      { kind: "hpEmpty", tick: 700, lane: 0, posMm: 1_000_000 },
      { kind: "finish", tick: 817, lane: 0, posMm: 1_200_000, finishMilli: 817_050, place: 1 },
    ],
  };
}

describe("race schema (docs/race-engine.md 3, 16, 20)", () => {
  it("RaceRule is every manufacturer rule plus none, in that order", () => {
    expect(RACE_RULES).toEqual([...ManufacturerRule.options, "none"]);
    expect(RaceRule.safeParse("none").success).toBe(true);
    expect(ManufacturerRule.safeParse("none").success).toBe(false);
    expectTypeOf<RaceRule>().toEqualTypeOf<
      "mass-thrust" | "regen" | "pulse" | "telemetry" | "repairable" | "none"
    >();
  });

  it("BoostMode lists the modes of 9.4 with off first (mode codes index into it)", () => {
    expect(BOOST_MODES).toEqual([
      "off",
      "kick",
      "plan",
      "hold",
      "preheat",
      "surplus",
      "regen-overflow",
      "dive-descent",
      "hover-catchup",
      "glide-chase",
      "ground-constant",
    ]);
  });

  it("frame flags are distinct single bits", () => {
    const bits = Object.values(RACE_FRAME_FLAGS);
    expect(new Set(bits).size).toBe(bits.length);
    for (const b of bits) expect(b & (b - 1)).toBe(0);
    expect(RACE_FRAME_FLAGS.drafting).toBe(16_384);
  });

  it("a hand-built minimal log parses (detail results and full)", () => {
    expect(RaceLog.parse(minimalLog())).toEqual(minimalLog());
    expect(RaceLog.parse(fullLog())).toEqual(fullLog());
  });

  it("an EntryInput parses", () => {
    const input: EntryInput = {
      runnerId: "player",
      kind: "player",
      falconessId: "peregrina",
      baseStats: { agility: 110, stamina: 80, technique: 95, courage: 100, intelligence: 85 },
      mood: 0,
      biomeAptitude: { desert: "A", mountain: "B", coast: "B", urban: "C", tundra: "D" },
      styleAptitude: { dive: "A", hover: "C", glide: "B", ground: "E" },
      frameId: "peregrina-signature",
      parts: [],
      quirks: [],
      learnedSkills: ["stoop-strike"],
      durability: null,
    };
    expect(EntryInput.parse(input)).toEqual(input);
    expect(EntryInput.safeParse({ ...input, durability: -1 }).success).toBe(false);
    expect(EntryInput.safeParse({ ...input, kind: "boss" }).success).toBe(false);
  });

  describe("malformed logs fail", () => {
    const cases: ReadonlyArray<[string, (log: RaceLog) => unknown]> = [
      ["unknown top-level key", (l) => ({ ...l, extra: 1 })],
      ["wrong engine", (l) => ({ ...l, engine: "v2" })],
      ["wrong tick rate", (l) => ({ ...l, tickHz: 30 })],
      ["empty seed", (l) => ({ ...l, seed: "" })],
      ["decimal in a result (P8)", (l) => ({ ...l, results: [{ ...result, finishMilli: 817.5 }] })],
      ["unsafe integer", (l) => ({ ...l, ticks: Number.MAX_SAFE_INTEGER + 1 })],
      ["no entries", (l) => ({ ...l, entries: [], derived: [], results: [] })],
      ["nine entries", (l) => ({ ...l, entries: Array.from({ length: 9 }, () => entry) })],
      ["entry out of lane order", (l) => ({ ...l, entries: [{ ...entry, laneIndex: 1 }] })],
      ["derived missing", (l) => ({ ...l, derived: [] })],
      ["result place not in place order", (l) => ({ ...l, results: [{ ...result, place: 2 }] })],
      ["frames with detail results", (l) => ({ ...l, frames: fullLog().frames })],
      ["full without frames", (l) => ({ ...l, detail: "full" })],
      ["unknown rule", (l) => ({ ...l, entries: [{ ...entry, rule: "warp" }] })],
      [
        "effective stat 0",
        (l) => ({ ...l, entries: [{ ...entry, stats: { ...entry.stats, agility: 0 } }] }),
      ],
      [
        "durabilityStart above max",
        (l) => ({ ...l, entries: [{ ...entry, durabilityStart: 101 }] }),
      ],
      [
        "skills not id-sorted",
        (l) => ({
          ...l,
          entries: [{ ...entry, skills: [skill, { ...skill, id: "corner-carver" }] }],
        }),
      ],
      ["duplicate skill", (l) => ({ ...l, entries: [{ ...entry, skills: [skill, skill] }] })],
      [
        "skill trigger with only posLoPm",
        (l) => ({
          ...l,
          entries: [
            { ...entry, skills: [{ ...skill, trigger: { ...skill.trigger, posLoPm: 0 } }] },
          ],
        }),
      ],
      [
        "skill without disabled",
        (l) => {
          const { disabled: _drop, ...rest } = skill;
          return { ...l, entries: [{ ...entry, skills: [rest] }] };
        },
      ],
      [
        "trait array of the wrong length",
        (l) => ({ ...l, entries: [{ ...entry, traits: { ...traits, segMultiplyPm: [1000] } }] }),
      ],
      [
        "segment override below the clamp",
        (l) => ({
          ...l,
          entries: [{ ...entry, traits: { ...traits, segOverridePm: [0, 400, 0, 0, 0, 0, 0] } }],
        }),
      ],
      ["PW above 1600", (l) => ({ ...l, entries: [{ ...entry, powerToWeight: 1700 }] })],
      ["u out of range", (l) => ({ ...l, derived: [{ ...derived, u: [[1000, 0, 0]] }] })],
      [
        "broken wings that speed up (ADR-0003 D56)",
        (l) => ({ ...l, derived: [{ ...derived, brokenSpeedPm: 1001 }] }),
      ],
      ["dnf with a finish time", (l) => ({ ...l, results: [{ ...result, dnf: true }] })],
      ["finisher without a time", (l) => ({ ...l, results: [{ ...result, timeTicks: null }] })],
      [
        "geometry without a biome (ADR-0003 D55)",
        (l) => {
          const { biome: _drop, ...rest } = l.geometry;
          return { ...l, geometry: rest };
        },
      ],
      [
        "geometry of an unknown biome",
        (l) => ({ ...l, geometry: { ...l.geometry, biome: "moon" } }),
      ],
      [
        "negative reserveAtMm (ADR-0003 D53)",
        (l) => ({ ...l, geometry: { ...l.geometry, reserveAtMm: -10_000 } }),
      ],
      [
        "negative kickAtMm (ADR-0003 D53)",
        (l) => ({ ...l, derived: [{ ...derived, kickAtMm: -1 }] }),
      ],
      [
        "geometry segment of unknown type",
        (l) => ({
          ...l,
          geometry: { ...l.geometry, segments: [{ type: "lava", startMm: 0, endMm: 1, param: 0 }] },
        }),
      ],
    ];
    for (const [name, mutate] of cases)
      it(name, () => {
        expect(RaceLog.safeParse(mutate(minimalLog())).success).toBe(false);
      });
  });

  it("frames reject misaligned columns and non-increasing ticks", () => {
    const frames = fullLog().frames;
    expect(frames).toBeDefined();
    if (!frames) return;
    expect(RaceFrames.safeParse(frames).success).toBe(true);
    const [runner] = frames.runners;
    if (!runner) throw new Error("fixture has a runner");
    expect(RaceFrames.safeParse({ ...frames, runners: [{ ...runner, hp: [1, 2] }] }).success).toBe(
      false,
    );
    expect(RaceFrames.safeParse({ ...frames, tick: [0, 1, 1] }).success).toBe(false);
  });

  it("events reject unknown kinds, missing base fields and wrong payloads", () => {
    const ok = { kind: "waterHit", tick: 10, lane: 3, posMm: 1, damage: 10_000 };
    expect(RaceEvent.safeParse(ok).success).toBe(true);
    expect(RaceEvent.safeParse({ ...ok, kind: "teleport" }).success).toBe(false);
    const { posMm: _drop, ...noPos } = ok;
    expect(RaceEvent.safeParse(noPos).success).toBe(false);
    expect(RaceEvent.safeParse({ ...ok, lane: 8 }).success).toBe(false);
    expect(RaceEvent.safeParse({ ...ok, damage: -1 }).success).toBe(false);
    expect(
      RaceEvent.safeParse({
        kind: "boostMode",
        tick: 0,
        lane: 0,
        posMm: 0,
        mode: "turbo",
        levelMms: 0,
      }).success,
    ).toBe(false);
    expect(
      RaceEvent.safeParse({ kind: "hpEmpty", tick: 0, lane: 0, posMm: 0, extra: true }).success,
    ).toBe(false);
  });

  it("a DNF result carries nulls", () => {
    const dnf = {
      ...result,
      place: 1,
      dnf: true,
      finishMilli: null,
      timeTicks: null,
      marginMm: null,
      vFinishMms: null,
    };
    expect(RaceResult.safeParse(dnf).success).toBe(true);
  });
});
