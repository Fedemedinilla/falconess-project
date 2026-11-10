import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../race/golden.js";
import { CURRENT_RULESET, RULESET_V2, RULESET_V3 } from "../rulesets/index.js";
import { advanceSeason } from "./advance.js";
import { type SimContext, seasonContext } from "./context.js";
import { blackBoxFor, replaySeason } from "./replay.js";
import { startSeason } from "./start.js";

/**
 * Ruleset v3 as the season new runs start on (ADR-0011): v2's season with the flight race, the
 * distance letters, the black box's distance step and no wear.
 */
const content = loadContent();
const V3: SimContext = { ruleset: RULESET_V3, content };
const V2: SimContext = { ruleset: RULESET_V2, content };
const START = (falconessId: string): Extract<RunInput, { kind: "start" }> => ({
  kind: "start",
  falconessId,
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
});

/** A plain policy: the first option of an event, two trainings then a rest. */
function step(s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  return s.turn % 3 === 2 ? { kind: "rest" } : { kind: "train:agility" };
}

function play(ctx: SimContext, seed: string, falconessId: string) {
  const inputs: RunInput[] = [START(falconessId)];
  let s = startSeason(ctx, seed, START(falconessId));
  while (s.status === "active") {
    const input = step(s);
    inputs.push(input);
    s = advanceSeason(ctx, s, input);
  }
  return { state: s, inputs };
}

describe("season on ruleset v3 (ADR-0011)", () => {
  it("is the ruleset new runs start on", () => {
    expect(CURRENT_RULESET).toBe(RULESET_V3);
    expect(seasonContext(content).ruleset).toBe(RULESET_V3);
    expect(startSeason(V3, "v3", START("peregrina")).rulesetVersion).toBe("v3");
  });

  it("plays a whole season per Falconess and replays it byte for byte", () => {
    for (const f of ["peregrina", "cernicala", "caracara"]) {
      const { state, inputs } = play(V3, `v3/${f}`, f);
      expect(state.status).toBe("ended");
      expect(state.raceResults.length).toBeGreaterThanOrEqual(1);
      expect(state.distanceAptitude).toEqual(content.getFalconess(f).distanceAptitude);
      const again = replaySeason(V3, `v3/${f}`, inputs);
      expect(canonicalJson(again)).toBe(canonicalJson(state));
      // the box passes on her best birth distance letter
      const box = blackBoxFor(V3, state, inputs);
      expect(box.factors.distance).toBeDefined();
    }
  });

  it("wings never wear: durability never moves and the workshop has nothing to repair", () => {
    const start = startSeason(V3, "v3/wear", START("caracara"));
    const { state } = play(V3, "v3/wear", "caracara");
    expect(state.raceResults.length).toBeGreaterThan(0);
    expect(state.frameDurability).toEqual(start.frameDurability);
    const s = startSeason(V3, "v3/repair", START("peregrina"));
    expect(() => advanceSeason(V3, s, { kind: "workshop", ops: [{ op: "repair" }] })).toThrow(
      /never wear/,
    );
    // learning a skill and swapping wings (only their look and gesture in v3) stay
    const swap = advanceSeason(V3, s, {
      kind: "workshop",
      ops: [{ op: "equip-frame", frameId: "mule" }],
    });
    expect(swap.equippedFrame).toBe("mule");
    // v2 keeps its repair
    const s2 = startSeason(V2, "v2/repair", START("peregrina"));
    expect(() =>
      advanceSeason(V2, s2, { kind: "workshop", ops: [{ op: "repair" }] }),
    ).not.toThrow();
  });

  it("a v2 run keeps its ruleset: the same inputs replay on v2", () => {
    const { state, inputs } = play(V2, "v2/keep", "peregrina");
    expect(state.rulesetVersion).toBe("v2");
    expect(state.distanceAptitude).toBeUndefined();
    expect(canonicalJson(replaySeason(V2, "v2/keep", inputs))).toBe(canonicalJson(state));
  });
});
