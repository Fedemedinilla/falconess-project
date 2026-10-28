import { loadContent } from "@falconess/content";
import type { SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, type SimContext, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { lowestStatPolicy, needsRepair, REFERENCE_HANGAR, REST_AT_FATIGUE } from "./policy.js";

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
