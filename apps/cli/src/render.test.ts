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
  positionMenu,
  raceWings,
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

  it("gives the drift's chance of costing mood only while mood can still go down", () => {
    const s = startSeason(V2, "drift", START);
    expect(trainingMenu(V2, { ...s, mood: -1 })[0]).toContain("ánimo -1 2 %");
    expect(trainingMenu(V2, { ...s, mood: -2 })[0]).not.toContain("ánimo -1");
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

  it("keeps the vigor line when a luck event's vigor cancels the training's", () => {
    // weeks 13-23: the long sleep (vigor +20) after a stamina training (vigor −20) from full vigor
    for (let i = 0; i < 600; i++) {
      const s0 = { ...startSeason(V2, `luck-zero-${i}`, START), turn: 15 };
      const s1 = advanceSeason(V2, s0, { kind: "train:stamina" });
      if (s1.log.at(-1)?.event?.id !== "luck-long-sleep") continue;
      expect(s1.fatigue).toBe(s0.fatigue);
      const lines = turnSummary(V2, s1, s0);
      const vigor = lines.find((l) => l.startsWith("  vigor "));
      expect(vigor).toMatch(new RegExp(`^  vigor 0 → ${vigorBar(V2, s1.fatigue)}`));
      expect(lines.find((l) => l.startsWith("  🎲 "))).toContain(
        `${content.t("ui.turn.vigor")} +20`,
      );
      return;
    }
    throw new Error("no long sleep in 600 seeds");
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

describe("the race position in the text season (ADR-0008)", () => {
  /** Peregrina at her first goal race (turn 12), resting through every week. */
  function atGoal(ctx: SimContext) {
    let s = startSeason(ctx, "pos", START);
    while (s.turn < 12)
      s = advanceSeason(
        ctx,
        s,
        s.pendingEvent ? { kind: "event:choose", option: 0 } : { kind: "rest" },
      );
    return s;
  }

  it("asks for the position on a race week with her letters, the default being her wings'", () => {
    const s = atGoal(V2);
    expect(positionMenu(V2, s, s.equippedFrame)).toEqual([
      "  🏁 Carrera objetivo: Sprint. ¿En qué posición corre? (Enter: Remate, la de sus alas)",
      `    1. Punta B · ${content.t("position.lead.brief")}`,
      `    2. Pelotón E · ${content.t("position.pack.brief")}`,
      `    3. Acecho C · ${content.t("position.stalk.brief")}`,
      `    4. Remate A (alas) · ${content.t("position.closer.brief")}`,
    ]);
    // wings equipped in the same week's workshop give the default
    const workshop: RunInput = {
      kind: "workshop",
      ops: [{ op: "equip-frame", frameId: "mule" }],
    };
    expect(raceWings(s, workshop)).toBe("mule");
    expect(raceWings(s, { kind: "rest" })).toBe(s.equippedFrame);
    expect(positionMenu(V2, s, "mule")[0]).toContain("(Enter: Pelotón, la de sus alas)");
    expect(positionMenu(V2, startSeason(V2, "pos", START), "shiden")).toEqual([]);
  });

  it("names the position she raced in on the week's race line", () => {
    const s = atGoal(V2);
    const after = advanceSeason(V2, s, { kind: "rest", position: "stalk" });
    expect(turnSummary(V2, after, s).find((l) => l.includes("🏁"))).toMatch(/ en Acecho {2}\(/);
  });
});
