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
import {
  describeInput,
  headerLine,
  moodLabel,
  pmPercent,
  trainingMenu,
  turnSummary,
  vigorBar,
} from "./render.js";
import { runSeason } from "./sim.js";

const content = loadContent();
const V2: SimContext = { ruleset: RULESET_V2, content };
const V1: SimContext = { ruleset: RULESET_V1, content };
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
  it("shows vigor as a bar that drains, never fatigue, and each training's risk from the sim", () => {
    const s = { ...startSeason(V2, "menu", START), fatigue: 80 };
    expect(headerLine(V2, s)).toContain(`vigor ${vigorBar(V2, 80)}`);
    expect(vigorBar(V2, 80)).toBe("██░░░░░░░░ 20/100");
    expect(headerLine(V2, s)).not.toContain("fatiga");
    const menu = trainingMenu(V2, s);
    expect(menu).toHaveLength(5);
    const agility = trainingRisk(RULESET_V2, 80, "train:agility");
    expect(menu[0]).toContain(`fallo ${pmPercent(agility.failPm)}`);
    expect(menu[0]).toContain(`lesión ${pmPercent(agility.injuryPm)}`);
    expect(menu[0]).toContain("vigor -20");
    // the simulator gives a little vigor back in v2 (study §9), read from the ruleset
    expect(menu[4]).toContain(`vigor +${-RULESET_V2.season.fatigueCost["train:simulator"]}`);
    expect(menu[4]).toContain("vigor +5");
    expect(menu[3]).toContain(
      `fallo ${pmPercent(trainingRisk(RULESET_V2, 80, "train:risk-flight").failPm)}`,
    );
  });

  it("draws the vigor bar from the sim's vigor: full, empty and rounded down", () => {
    expect(vigorBar(V2, 0)).toBe("██████████ 100/100");
    expect(vigorBar(V2, 100)).toBe("░░░░░░░░░░ 0/100");
    expect(vigorBar(V2, 41)).toBe("█████░░░░░ 59/100");
    expect(vigorBar(V1, 41)).toBe("█████░░░░░ 59/100");
  });

  it("names the mood with what it does to training, per ruleset", () => {
    expect(moodLabel(V2, 1)).toBe(`${content.t("mood.1")} (entrenar ×1.10)`);
    expect(moodLabel(V2, -2)).toBe(`${content.t("mood.-2")} (entrenar ×0.80)`);
    expect(moodLabel(V1, 1)).toBe(`${content.t("mood.1")} (entrenar ×1.05)`);
    const s = { ...startSeason(V2, "mood", START), mood: 2 as const };
    expect(headerLine(V2, s)).toContain(`ánimo ${moodLabel(V2, 2)}`);
  });

  it("prints the week: the action, then mood and vigor with where they ended and why", () => {
    const s0 = { ...startSeason(V2, "week", START), fatigue: 50, mood: 0 as const };
    const s1 = advanceSeason(V2, s0, { kind: "outing" });
    const lines = turnSummary(V2, s1, s0);
    expect(lines[0]).toBe(`  → ${content.t("log.outing")}`);
    expect(lines).toContain(`  ánimo +1 → ${moodLabel(V2, 1)}: ${content.t("log.mood.outing")}`);
    expect(lines).toContain(`  vigor +20 → ${vigorBar(V2, 30)}`);
  });

  it("puts a luck event on its own line with its texts and stats, apart from the action's", () => {
    // a training week in weeks 2-11, until one rolls the tailwind (agility +10, technique +6)
    for (let i = 0; i < 400; i++) {
      const s0 = { ...startSeason(V2, `luck-${i}`, START), turn: 5 };
      const s1 = advanceSeason(V2, s0, { kind: "train:stamina" });
      const week = s1.log.at(-1);
      if (week?.event?.id !== "luck-tailwind") continue;
      expect(week.event.auto).toBe(true);
      const lines = turnSummary(V2, s1, s0);
      const luck = lines.find((l) => l.startsWith("  🎲 "));
      expect(luck).toBe(
        `  🎲 ${content.t("ev.luck-tailwind")} ${content.t("ev.luck-tailwind.opt0")} · ${content.t("stat.agility")} +10 · ${content.t("stat.technique")} +6`,
      );
      const action = lines[0] ?? "";
      expect(action).toContain(content.t("stat.stamina"));
      expect(action).not.toContain(content.t("ev.luck-tailwind"));
      expect(action).not.toContain(content.t("stat.agility"));
      return;
    }
    throw new Error("no tailwind in 400 seeds");
  });

  it("lists a luck event's mood and vigor on its line, as the web does", () => {
    // weeks 2-11: the stormy night (vigor −15) and the lost goggles (mood −1)
    const want = new Map([
      ["luck-stormy-night", `${content.t("ui.turn.vigor")} -15`],
      ["luck-lost-goggles", `${content.t("ui.turn.mood")} -1`],
    ]);
    for (let i = 0; i < 600 && want.size > 0; i++) {
      const s0 = { ...startSeason(V2, `luck-fx-${i}`, START), turn: 5, mood: 1 as const };
      const s1 = advanceSeason(V2, s0, { kind: "train:stamina" });
      const id = s1.log.at(-1)?.event?.id ?? "";
      const effect = want.get(id);
      if (effect === undefined) continue;
      const luck = turnSummary(V2, s1, s0).find((l) => l.startsWith("  🎲 "));
      expect(luck).toBe(`  🎲 ${content.t(`ev.${id}`)} ${content.t(`ev.${id}.opt0`)} · ${effect}`);
      want.delete(id);
    }
    expect([...want.keys()], "events never rolled").toEqual([]);
  });

  it("after an event choice prints the option and its outcome, not the question again", () => {
    for (let i = 0; i < 200; i++) {
      let s = startSeason(V2, `choice-${i}`, START);
      while (!s.pendingEvent && s.status === "active") s = advanceSeason(V2, s, { kind: "rest" });
      if (!s.pendingEvent) continue;
      const e = content.getEvent(s.pendingEvent.eventId);
      const opt = e.options[0];
      if (!opt) continue;
      expect(describeInput(content, { kind: "event:choose", option: 0 }, s)).toBe(
        `elige: ${content.t(opt.textKey)}`,
      );
      const s1 = advanceSeason(V2, s, { kind: "event:choose", option: 0 });
      for (const l of turnSummary(V2, s1, s)) expect(l).not.toContain(content.t(e.textKey));
      return;
    }
    throw new Error("no event to answer");
  });

  it("formats per-mille chances as percents", () => {
    expect(pmPercent(0)).toBe("0 %");
    expect(pmPercent(16)).toBe("1.6 %");
    expect(pmPercent(120)).toBe("12 %");
    expect(pmPercent(1000)).toBe("100 %");
  });
});
