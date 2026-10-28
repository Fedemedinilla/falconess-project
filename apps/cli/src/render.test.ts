import { loadContent } from "@falconess/content";
import type { RunInput } from "@falconess/schema";
import {
  advanceSeason,
  CURRENT_RULESET,
  RULESET_V1,
  RULESET_V2,
  type SimContext,
  startSeason,
  trainingRisk,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { argRuleset, parseArgs } from "./args.js";
import { headerLine, pmPercent, trainingMenu, turnSummary } from "./render.js";
import { runSeason } from "./sim.js";

const content = loadContent();
const V2: SimContext = { ruleset: RULESET_V2, content };
const START: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

describe("--ruleset (ADR-0006)", () => {
  it("defaults to the ruleset new runs start on and accepts any known version", () => {
    expect(argRuleset(parseArgs([]))).toBe(CURRENT_RULESET);
    expect(argRuleset(parseArgs(["--ruleset", "v1"]))).toBe(RULESET_V1);
    expect(() => argRuleset(parseArgs(["--ruleset", "v9"]))).toThrow(/unknown ruleset/);
  });

  it("pnpm sim plays a v2 season to the end and says which ruleset", () => {
    const { lines, state } = runSeason(V2, "42", START);
    expect(lines[0]).toBe("seed 42  ruleset v2");
    expect(state.status).toBe("ended");
    expect(state.rulesetVersion).toBe("v2");
  });
});

describe("v2 in the text season", () => {
  it("shows vigor, not fatigue, and each training's risk from the sim", () => {
    const s = { ...startSeason(V2, "menu", START), fatigue: 80 };
    expect(headerLine(V2, s)).toContain("vigor 20");
    expect(headerLine(V2, s)).not.toContain("fatiga");
    const menu = trainingMenu(V2, s);
    expect(menu).toHaveLength(5);
    const agility = trainingRisk(RULESET_V2, 80, "train:agility");
    expect(menu[0]).toContain(`fallo ${pmPercent(agility.failPm)}`);
    expect(menu[0]).toContain(`lesión ${pmPercent(agility.injuryPm)}`);
    expect(menu[0]).toContain("vigor -20");
    expect(menu[3]).toContain(
      `fallo ${pmPercent(trainingRisk(RULESET_V2, 80, "train:risk-flight").failPm)}`,
    );
  });

  it("prints the week's mood and vigor change after its notes", () => {
    const s0 = { ...startSeason(V2, "week", START), fatigue: 50, mood: 0 };
    const s1 = advanceSeason(V2, s0, { kind: "outing" });
    const [line] = turnSummary(V2, s1, s0);
    expect(line).toContain(content.t("log.outing"));
    expect(line).toContain(content.t("log.mood.outing"));
    expect(line).toContain("ánimo +1");
    expect(line).toContain("vigor +20");
  });

  it("formats per-mille chances as percents", () => {
    expect(pmPercent(0)).toBe("0 %");
    expect(pmPercent(16)).toBe("1.6 %");
    expect(pmPercent(120)).toBe("12 %");
    expect(pmPercent(1000)).toBe("100 %");
  });
});
