import { loadContent } from "@falconess/content";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { runSeason } from "./sim.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };

describe("pnpm sim", () => {
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
    }
  });
});
