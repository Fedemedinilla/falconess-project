import { loadContent } from "@falconess/content";
import { CURRENT_RULESET, RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { runSeason } from "./sim.js";

const content = loadContent();

// new runs start on the current ruleset (ADR-0006); v1 stays playable for every saved run
describe.each([CURRENT_RULESET, RULESET_V1])("pnpm sim on ruleset $version", (ruleset) => {
  const ctx: SimContext = { ruleset, content };

  it("prints an identical season for the same seed, twice", () => {
    const start = {
      kind: "start" as const,
      falconessId: "peregrina",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
    };
    const a = runSeason(ctx, "42", start).lines.join("\n");
    const b = runSeason(ctx, "42", start).lines.join("\n");
    expect(a).toBe(b);
    expect(a).toContain("T01/48");
    expect(a).toContain(`ruleset ${ruleset.version}`);
    expect(a).toMatch(/grade [A-G]|grade SS?/);
  });

  it("plays every Falconess to the end", () => {
    for (const who of ["peregrina", "cernicala", "caracara"]) {
      const { state } = runSeason(ctx, "pt0", {
        kind: "start",
        falconessId: who,
        hangar: ["mule", "kite", "sylphe", "horizon"],
        parents: [],
      });
      expect(state.status).toBe("ended");
      expect(state.rulesetVersion).toBe(ruleset.version);
    }
  });
});

describe("pnpm sim on v2", () => {
  it("plays the careful reference policy: it goes on outings, which v1's never does", () => {
    const start = {
      kind: "start" as const,
      falconessId: "cernicala",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
    };
    const outings = (ctx: SimContext) =>
      runSeason(ctx, "7", start).inputs.filter((i) => i.kind === "outing").length;
    expect(outings({ ruleset: CURRENT_RULESET, content })).toBeGreaterThan(0);
    expect(outings({ ruleset: RULESET_V1, content })).toBe(0);
  });
});
