import { loadSeasonContent } from "@falconess/content";
import type { SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  getRuleset,
  goalRaceState,
  type SimContext,
  startSeason,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { REFERENCE_HANGAR, referencePolicy } from "../policy.js";
import {
  advanceAtOwnerLevel,
  OWNER_LEVEL_SLACK,
  ownerRaceInput,
  scaleStats,
} from "./owner-level.js";

const R = getRuleset("v3");
const ctx: SimContext = { ruleset: R, content: loadSeasonContent("v3") };

describe("E1's owner level (ADR-0012, owner 2026-11-28)", () => {
  it("scales each stat × 1.2, rounded down, capped", () => {
    const s = { agility: 1001, stamina: 500, technique: 333, courage: 0, intelligence: 999 };
    expect(scaleStats(s, 1200, 1200)).toEqual({
      agility: 1200,
      stamina: 600,
      technique: 399,
      courage: 0,
      intelligence: 1198,
    });
  });

  it("only goal races see the scaled stats; she decides and goes on with her real ones", () => {
    let s: SeasonState = startSeason(ctx, "owner-level-test", {
      kind: "start",
      falconessId: "cernicala",
      hangar: [...REFERENCE_HANGAR],
      parents: [],
      difficulty: "exigente",
    });
    let goalWeeks = 0;
    while (s.status === "active" && goalWeeks < 2) {
      const input = referencePolicy(ctx, s);
      const plain = advanceSeason(ctx, s, input);
      const next = advanceAtOwnerLevel(ctx, s, input, 1200);
      const raced = goalRaceState(ctx, s, input);
      if (raced === undefined) expect(next).toEqual(plain);
      else {
        goalWeeks++;
        const o = ownerRaceInput(ctx, s, input, 1200);
        expect(goalRaceState(ctx, o?.offsetState ?? s, input)?.stats).toEqual(
          scaleStats(raced.stats, 1200, 1200),
        );
        expect(next.stats).toEqual(plain.stats);
        expect(next.turn).toBe(plain.turn);
      }
      s = next;
    }
    expect(goalWeeks).toBe(2);
  });

  it("when a failed training skips the exact scaled value, the closest one runs (e1v3a-168, week 24)", () => {
    let s: SeasonState = startSeason(ctx, "e1v3a-168", {
      kind: "start",
      falconessId: "cernicala",
      hangar: [...REFERENCE_HANGAR],
      parents: [],
      difficulty: "exigente",
    });
    while (s.status === "active" && s.turn < 24)
      s = advanceAtOwnerLevel(ctx, s, referencePolicy(ctx, s), 1200);
    expect(s.turn).toBe(24);
    const input = referencePolicy(ctx, s);
    const real = goalRaceState(ctx, s, input);
    const o = ownerRaceInput(ctx, s, input, 1200);
    expect(real && o).toBeTruthy();
    if (!real || !o) return;
    const target = scaleStats(real.stats, 1200, 1200);
    for (const k of Object.keys(target) as (keyof typeof target)[])
      expect(Math.abs(o.raced[k] - target[k])).toBeLessThanOrEqual(OWNER_LEVEL_SLACK);
    expect(advanceAtOwnerLevel(ctx, s, input, 1200).stats).toEqual(
      advanceSeason(ctx, s, input).stats,
    );
  }, 60_000);
});
