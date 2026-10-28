import type { SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  learnCap,
  maxDurability,
  RULESET_V1,
  startSeason,
  WorkshopError,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  durabilityOf,
  emptyPlan,
  learnableSkills,
  MAX_WORKSHOP_OPS,
  nextRerollCost,
  partOfType,
  planOps,
  planReport,
  rerollableFrames,
  withPart,
} from "./workshop";

const ctx = { ruleset: RULESET_V1, content: getContent() };

function rich(): SeasonState {
  const s = startSeason(ctx, "workshop", {
    kind: "start",
    falconessId: "peregrina",
    hangar: ["shiden", "mule", "nimbus", "falke"],
    parents: [],
  });
  // resources a season would earn, so every op is affordable
  return {
    ...s,
    skillPoints: 400,
    wallet: { ...s.wallet, scrap: 500 },
    frameDurability: { ...s.frameDurability, mule: 50 },
  };
}

describe("workshop plan", () => {
  it("changes nothing until something is chosen", () => {
    const s = rich();
    expect(planOps(ctx, s, emptyPlan(s))).toEqual([]);
    const report = planReport(ctx, s, emptyPlan(s));
    expect(report.blocked).toBe(false);
    expect(report.after).toEqual(report.before);
  });

  it("orders the ops so the sim builds, repairs and learns on the planned frame", () => {
    const s = rich();
    let plan = { ...emptyPlan(s), frameId: "mule", repair: true };
    plan = withPart(ctx, plan, "turbine", "steinhaus-turbine");
    plan = withPart(ctx, plan, "firmware", "altair-firmware");
    plan = { ...plan, rerolls: ["mule", "mule"], learn: ["clean-start", "hill-lungs"] };
    const ops = planOps(ctx, s, plan);
    expect(ops.map((o) => o.op)).toEqual([
      "equip-frame",
      "install-part",
      "install-part",
      "reroll-quirks",
      "reroll-quirks",
      "repair",
      "learn-skill",
      "learn-skill",
    ]);
    const report = planReport(ctx, s, plan);
    expect(report.blocked).toBe(false);
    expect(report.rerollsFrame).toBe(true);
    expect(report.rerollCosts).toEqual([40, 80]);

    const next = advanceSeason(ctx, s, { kind: "workshop", ops });
    expect(next.equippedFrame).toBe("mule");
    expect([...next.installedParts].sort()).toEqual([...plan.parts].sort());
    expect(next.wallet.scrap).toBe(report.scrapLeft + scrapEarned(s, next));
    expect(next.skillPoints).toBe(report.skillPointsLeft);
    expect(next.learnedSkills).toHaveLength(report.learnedAfter);
    expect(learnCap(ctx, next)).toBe(report.cap);
    expect(next.frameDurability.mule).toBe(maxAfter(next));
    expect(nextRerollCost(ctx, s, plan)).toBe(120);
  });

  it("replaces a part of the same type and removes one with a single op", () => {
    const s = { ...rich(), installedParts: ["lumiere-turbine", "altair-battery"] };
    let plan = withPart(ctx, emptyPlan(s), "turbine", "steinhaus-turbine");
    plan = withPart(ctx, plan, "battery", undefined);
    expect(partOfType(ctx, plan.parts, "turbine")).toBe("steinhaus-turbine");
    expect(planOps(ctx, s, plan)).toEqual([
      { op: "remove-part", partId: "altair-battery" },
      { op: "install-part", partId: "steinhaus-turbine" },
    ]);
  });

  it("flags what the sim would refuse: no scrap, no points, over the cap, too many ops", () => {
    const s = rich();
    const poor = { ...s, wallet: { ...s.wallet, scrap: 30 }, skillPoints: 10 };
    expect(planReport(ctx, poor, { ...emptyPlan(poor), rerolls: ["mule"] }).blocked).toBe(true);
    expect(planReport(ctx, poor, { ...emptyPlan(poor), learn: ["clean-start"] }).blocked).toBe(
      true,
    );

    // seven skills on Altair's firmware (cap 7): removing it leaves them over the cap
    const learned = learnableSkills(ctx, s)
      .slice(0, 6)
      .map((k) => k.id);
    const full = {
      ...s,
      installedParts: ["altair-firmware"],
      learnedSkills: [...s.learnedSkills, ...learned],
    };
    expect(learnCap(ctx, full)).toBe(full.learnedSkills.length);
    const remove = withPart(ctx, emptyPlan(full), "firmware", undefined);
    const report = planReport(ctx, full, remove);
    expect(report.overCap).toBe(true);
    expect(report.blocked).toBe(true);
    expect(() =>
      advanceSeason(ctx, full, { kind: "workshop", ops: [...planOps(ctx, full, remove)] }),
    ).toThrow(WorkshopError);

    const many = {
      ...emptyPlan(s),
      rerolls: Array.from({ length: MAX_WORKSHOP_OPS + 1 }, () => "mule"),
    };
    expect(planReport(ctx, { ...s, wallet: { ...s.wallet, scrap: 99_999 } }, many).tooMany).toBe(
      true,
    );
  });

  it("lists learnable actives and rerollable frames from content", () => {
    const s = rich();
    const skills = learnableSkills(ctx, s);
    expect(skills.every((k) => k.kind === "active" && !s.learnedSkills.includes(k.id))).toBe(true);
    expect(skills.some((k) => k.uniqueTo !== undefined && k.uniqueTo !== "peregrina")).toBe(false);
    expect(skills.map((k) => k.cost)).toEqual([...skills.map((k) => k.cost)].sort((a, b) => a - b));
    expect(rerollableFrames(ctx, s)).toEqual(["mule"]);
    expect(durabilityOf(ctx, s, "mule")).toEqual({
      current: 50,
      max: maxDurability(ctx, s, "mule"),
    });
    const repair = planReport(ctx, s, { ...emptyPlan(s), frameId: "mule", repair: true });
    const repaired = advanceSeason(ctx, s, { kind: "workshop", ops: [...repair.ops] });
    expect(repaired.frameDurability.mule).toBe(repair.durability.max);
  });
});

/** Scrap a goal race paid in the same step (none on turn 1). */
function scrapEarned(before: SeasonState, after: SeasonState): number {
  return after.raceResults.length > before.raceResults.length
    ? (RULESET_V1.season.scrapByPlace[(after.raceResults.at(-1)?.place ?? 1) - 1] ?? 0)
    : 0;
}

function maxAfter(s: SeasonState): number {
  return durabilityOf(ctx, s, s.equippedFrame).max;
}
