import { loadContent } from "@falconess/content";
import type { SeasonState, StatName } from "@falconess/schema";
import {
  advanceSeason,
  learnCap,
  RULESET_V1,
  RULESET_V2,
  type SimContext,
  STAT_ORDER,
  startSeason,
  trainingRisk,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import {
  carefulPolicy,
  lowestStatPolicy,
  needsRepair,
  REFERENCE_HANGAR,
  REST_AT_FATIGUE,
  referencePolicy,
  skillsToLearn,
  usefulGenericActives,
} from "./policy.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const start = (falconessId: string) =>
  startSeason(ctx, "policy", {
    kind: "start",
    falconessId,
    hangar: [...REFERENCE_HANGAR],
    parents: [],
  });
const worn = (s: SeasonState, durability: number): SeasonState => ({
  ...s,
  frameDurability: { ...s.frameDurability, [s.equippedFrame]: durability },
});

describe("reference policy (R8: repair once durability persists)", () => {
  it("repairs below half of the equipped build's maximum, not at half", () => {
    const s = start("peregrina"); // shiden, durability 100
    expect(needsRepair(ctx, s)).toBe(false);
    expect(needsRepair(ctx, worn(s, 50))).toBe(false);
    expect(needsRepair(ctx, worn(s, 49))).toBe(true);
    expect(lowestStatPolicy(ctx, worn(s, 49))).toEqual({
      kind: "workshop",
      ops: [{ op: "repair" }],
    });
    // the maximum includes the rolled quirks of a Boneyard frame
    const mule = start("caracara");
    expect(mule.equippedFrame).toBe("mule");
    const max = mule.frameDurability.mule ?? 0;
    expect(needsRepair(ctx, worn(mule, Math.ceil(max / 2)))).toBe(false);
    expect(needsRepair(ctx, worn(mule, Math.ceil(max / 2) - 1))).toBe(true);
  });

  it("answers an event first, repairs before resting, rests when tired, else trains", () => {
    const s = start("cernicala");
    const tired = { ...s, fatigue: REST_AT_FATIGUE };
    expect(
      lowestStatPolicy(ctx, { ...worn(tired, 0), pendingEvent: { eventId: "x", turn: 1 } }),
    ).toEqual({ kind: "event:choose", option: 0 });
    expect(lowestStatPolicy(ctx, worn(tired, 0)).kind).toBe("workshop");
    expect(lowestStatPolicy(ctx, tired)).toEqual({ kind: "rest" });
    expect(lowestStatPolicy(ctx, s).kind).toMatch(/^train:/);
  });

  it("brings a worn frame back to full at the workshop", () => {
    const s = worn(start("peregrina"), 10);
    const input = lowestStatPolicy(ctx, s);
    const next = advanceSeason(ctx, s, input);
    expect(next.frameDurability[s.equippedFrame]).toBe(100);
  });
});

describe("reference policy: generic actives (ADR-0005 Pasada 2, decision 2)", () => {
  const withPoints = (s: SeasonState, skillPoints: number, turn = s.turn): SeasonState => ({
    ...s,
    skillPoints,
    turn,
  });

  it("learns the cheapest useful generic actives the points pay for, ties by id", () => {
    const s = start("peregrina");
    const costs = usefulGenericActives(ctx, s).map((k) => k.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(skillsToLearn(ctx, withPoints(s, 59))).toEqual([]);
    expect(skillsToLearn(ctx, withPoints(s, 60))).toEqual(["clean-start"]);
    // iron-wings and pack-shadow both cost 70: id order
    expect(skillsToLearn(ctx, withPoints(s, 130))).toEqual(["clean-start", "iron-wings"]);
    expect(skillsToLearn(ctx, withPoints(s, 199))).toEqual(["clean-start", "iron-wings"]);
    expect(skillsToLearn(ctx, withPoints(s, 200))).toEqual([
      "clean-start",
      "iron-wings",
      "pack-shadow",
    ]);
    expect(lowestStatPolicy(ctx, withPoints(s, 130))).toEqual({
      kind: "workshop",
      ops: [
        { op: "learn-skill", skillId: "clean-start" },
        { op: "learn-skill", skillId: "iron-wings" },
      ],
    });
    const next = advanceSeason(ctx, withPoints(s, 130), lowestStatPolicy(ctx, withPoints(s, 130)));
    expect(next.learnedSkills).toEqual(["stoop-strike", "clean-start", "iron-wings"]);
    expect(next.skillPoints).toBe(0);
  });

  it("stops at the learn cap, the unique skill included", () => {
    const s = withPoints(start("cernicala"), 2000);
    const cap = learnCap(ctx, s);
    expect(skillsToLearn(ctx, s)).toHaveLength(cap - s.learnedSkills.length);
    const full = { ...s, learnedSkills: skillsToLearn(ctx, s).concat(s.learnedSkills) };
    expect(full.learnedSkills).toHaveLength(cap);
    expect(skillsToLearn(ctx, full)).toEqual([]);
    expect(lowestStatPolicy(ctx, full).kind).toMatch(/^train:/);
  });

  it("only counts a segment trigger when a goal course still ahead has that segment", () => {
    // Peregrina: T12 sprint, T24 ridge, T36 canyon, T46 ridge
    const ids = (turn: number) =>
      usefulGenericActives(ctx, withPoints(start("peregrina"), 0, turn)).map((k) => k.id);
    expect(ids(36)).toEqual(
      expect.arrayContaining(["water-skimmer", "canyon-sense", "hill-lungs"]),
    );
    expect(ids(36)).not.toContain("corner-carver"); // curves: only the T12 sprint
    expect(ids(1)).toContain("corner-carver");
    const late = ids(37); // only the T46 ridge is ahead
    expect(late).toContain("gravity-friend");
    expect(late).toContain("last-gasp");
    for (const id of ["water-skimmer", "canyon-sense", "hill-lungs", "corner-carver"])
      expect(late).not.toContain(id);
    expect(ids(47)).toEqual([]); // no goal race left
  });

  it("learns on the repair visit and before resting", () => {
    const s = withPoints(worn({ ...start("peregrina"), fatigue: REST_AT_FATIGUE }, 10), 60);
    expect(lowestStatPolicy(ctx, s)).toEqual({
      kind: "workshop",
      ops: [{ op: "repair" }, { op: "learn-skill", skillId: "clean-start" }],
    });
  });
});

describe("careful policy: the reference of ruleset v2 (ADR-0006 «Métrica 7»)", () => {
  const v2: SimContext = { ruleset: RULESET_V2, content: ctx.content };
  const fresh = startSeason(v2, "careful", {
    kind: "start",
    falconessId: "peregrina",
    hangar: [...REFERENCE_HANGAR],
    parents: [],
  });
  /** A state whose lowest stat is `low` (its training is the target), at this vigor and mood. */
  const where = (low: StatName, fatigue: number, mood: SeasonState["mood"]): SeasonState => ({
    ...fresh,
    stats: { ...fresh.stats, ...Object.fromEntries(STAT_ORDER.map((k) => [k, 300])), [low]: 200 },
    fatigue,
    mood,
  });

  it("trains the lowest stat while its failure chance is still 0", () => {
    expect(trainingRisk(RULESET_V2, 40, "train:agility").failPm).toBe(0);
    expect(carefulPolicy(v2, where("agility", 40, 1))).toEqual({ kind: "train:agility" });
    expect(carefulPolicy(v2, where("intelligence", 0, 2))).toEqual({ kind: "train:simulator" });
  });

  it("recovers once the chance rises: an outing when it brings the chance back to 0, else a rest", () => {
    expect(trainingRisk(RULESET_V2, 45, "train:stamina").failPm).toBeGreaterThan(0);
    // 45 − 20 = 25: the outing is enough, and mood is not at the top
    expect(carefulPolicy(v2, where("stamina", 45, 1))).toEqual({ kind: "outing" });
    // at the top of the mood scale the outing adds nothing: rest
    expect(carefulPolicy(v2, where("stamina", 45, 2))).toEqual({ kind: "rest" });
    // 70 − 20 = 50 still fails sometimes: rest
    expect(carefulPolicy(v2, where("stamina", 70, 0))).toEqual({ kind: "rest" });
  });

  it("judges a risk flight against its fixed chance, not against 0", () => {
    const fixed = trainingRisk(RULESET_V2, 0, "train:risk-flight").failPm;
    expect(fixed).toBeGreaterThan(0);
    expect(carefulPolicy(v2, where("courage", 40, 1))).toEqual({ kind: "train:risk-flight" });
    expect(trainingRisk(RULESET_V2, 50, "train:risk-flight").failPm).toBeGreaterThan(fixed);
    expect(carefulPolicy(v2, where("courage", 50, 2))).toEqual({ kind: "rest" });
  });

  it("goes out when mood is below +1, and answers events and repairs first", () => {
    expect(carefulPolicy(v2, where("agility", 0, 0))).toEqual({ kind: "outing" });
    expect(carefulPolicy(v2, where("agility", 0, 1))).toEqual({ kind: "train:agility" });
    expect(
      carefulPolicy(v2, { ...where("agility", 90, -2), pendingEvent: { eventId: "x", turn: 1 } }),
    ).toEqual({ kind: "event:choose", option: 0 });
    expect(carefulPolicy(v2, worn(where("agility", 90, -2), 0))).toEqual({
      kind: "workshop",
      ops: [{ op: "repair" }],
    });
  });

  it("is the reference of v2; v1 keeps the lowest-stat policy", () => {
    const tired = where("technique", 70, 0);
    expect(referencePolicy(v2, tired)).toEqual(carefulPolicy(v2, tired));
    const s1 = { ...start("cernicala"), fatigue: 70 };
    expect(referencePolicy(ctx, s1)).toEqual(lowestStatPolicy(ctx, s1));
    expect(referencePolicy(ctx, start("caracara"))).toEqual(
      lowestStatPolicy(ctx, start("caracara")),
    );
  });
});
