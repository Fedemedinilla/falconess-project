import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, CURRENT_RULESET, type SimContext, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent, simContext } from "../content/load";
import { trainingPreview, vigorOf } from "../screens/model/actions";
import {
  crewInitials,
  failPercent,
  moodTone,
  riskTone,
  statTier,
  trainingCards,
  vigorView,
  weekMenu,
} from "./model";

const ctx: SimContext = { ruleset: CURRENT_RULESET, content: getContent() };

function start(falconessId = "peregrina", seed = "mobile-1"): SeasonState {
  const input: Extract<RunInput, { kind: "start" }> = {
    kind: "start",
    falconessId,
    hangar: ["shiden", "mule", "nimbus", "falke"],
    parents: [],
  };
  return startSeason(ctx, seed, input);
}

/** Train until the week of `turn` (answering any event with its first option). */
function playTo(state: SeasonState, turn: number, kind: RunInput["kind"] = "rest"): SeasonState {
  let s = state;
  while (s.status === "active" && (s.turn < turn || s.pendingEvent)) {
    const input: RunInput = s.pendingEvent
      ? { kind: "event:choose", option: 0 }
      : ({ kind } as RunInput);
    s = advanceSeason(ctx, s, input);
  }
  return s;
}

describe("risk colors (owner: 0 % light blue, 1-19 green, 20-39 yellow, 40+ red)", () => {
  it("bands a per-mille chance at the approved edges", () => {
    expect(riskTone(0)).toBe("zero");
    expect(riskTone(1)).toBe("low");
    expect(riskTone(199)).toBe("low");
    expect(riskTone(200)).toBe("mid");
    expect(riskTone(399)).toBe("mid");
    expect(riskTone(400)).toBe("high");
    expect(riskTone(1000)).toBe("high");
  });

  it("says a chance in whole percent and never 0 when she can fail", () => {
    expect(failPercent(0)).toBe(0);
    expect(failPercent(3)).toBe(1);
    expect(failPercent(125)).toBe(13);
    expect(failPercent(600)).toBe(60);
  });
});

describe("stat medal tiers (stone … platinum)", () => {
  it("follows the approved thresholds", () => {
    expect([0, 149, 150, 299, 300, 449, 450, 649, 650, 849, 850, 1199, 1200].map(statTier)).toEqual(
      [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
    );
  });
});

describe("week menu", () => {
  it("reads the week, the goal, her stats and points from the state", () => {
    const s = start();
    const m = weekMenu(ctx, s);
    expect(m.turn).toBe(s.turn);
    expect(m.turns).toBe(ctx.ruleset.season.turns);
    expect(m.turnsLeft).toBe(ctx.ruleset.season.turns - s.turn);
    expect(m.stats.map((c) => c.value)).toEqual([
      s.stats.agility,
      s.stats.stamina,
      s.stats.technique,
      s.stats.courage,
      s.stats.intelligence,
    ]);
    expect(m.skillPoints).toBe(s.skillPoints);
    const goal = ctx.content.getFalconess("peregrina").seasonGoals[0];
    expect(m.goal?.turn).toBe(goal?.turn);
    expect(m.goal?.minPlace).toBe(goal?.minPlace);
    expect(m.goal?.weeksLeft).toBe((goal?.turn ?? 0) - s.turn);
    // v3: the goal card carries the distance and her letter there
    expect(m.goal?.distance?.letter).toBe(
      s.distanceAptitude?.[m.goal?.distance?.distance ?? "sprint"],
    );
    expect(m.raceWeek).toBe(false);
  });

  it("is a race week on the goal's week", () => {
    const goal = ctx.content.getFalconess("peregrina").seasonGoals[0];
    const s = playTo(start(), goal?.turn ?? 12);
    const m = weekMenu(ctx, s);
    expect(m.raceWeek).toBe(true);
    expect(m.goal?.weeksLeft).toBe(0);
  });

  it("calls boosted exactly the trainings with a crew this week", () => {
    const s = start();
    const m = weekMenu(ctx, s);
    const withCrew = Object.entries(s.crewPresence)
      .filter(([, crews]) => crews.length > 0)
      .map(([kind]) => kind);
    expect([...m.boosted].sort()).toEqual(withCrew.sort());
  });
});

describe("training cards", () => {
  it("are the sim's previews: gains, failure, vigor and crews", () => {
    let s = start();
    // tire her so the failure chances are not all zero
    s = playTo(s, 4, "train:risk-flight");
    for (const card of trainingCards(ctx, s)) {
      const t = trainingPreview(ctx, s, card.kind);
      expect(card.gains).toEqual(t.gains);
      expect(card.failPm).toBe(t.failPm);
      expect(card.risk).toBe(riskTone(t.failPm));
      expect(card.vigor).toBe(t.vigor);
      expect(card.crews.map((c) => c.manufacturer).sort()).toEqual(
        t.crews.map((c) => c.manufacturer).sort(),
      );
      for (const c of card.crews) expect(c.bond).toBeLessThanOrEqual(c.bondMax);
    }
  });

  it("previews the vigor a training leaves, as the sim applies it", () => {
    const s = start();
    const v = vigorView(ctx, s, "train:agility");
    const after = advanceSeason(ctx, s, { kind: "train:agility" });
    expect(v.value).toBe(vigorOf(ctx, s));
    // an auto event can move vigor too; with none logged, the preview is exact
    const event = after.log.some((e) => e.turn === s.turn && e.event);
    if (!event) expect(v.after?.min).toBe(vigorOf(ctx, after));
    expect(vigorView(ctx, s, undefined).after).toBeUndefined();
  });
});

describe("small words", () => {
  it("tones the mood and makes crew initials", () => {
    expect([-2, -1, 0, 1, 2].map(moodTone)).toEqual(["lo", "lo", "mid", "hi", "hi"]);
    expect(crewInitials("Kōryū Racing")).toBe("KR");
    expect(crewInitials("Boneyard")).toBe("BO");
  });
});

describe("difficulties (ADR-0012)", () => {
  const v3 = simContext(CURRENT_RULESET.version);
  const begin = (difficulty?: "normal" | "exigente") =>
    startSeason(v3, "diff", {
      kind: "start",
      falconessId: "cernicala",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
      ...(difficulty === undefined ? {} : { difficulty }),
    });
  it("marks a stat at the season's cap: 900 on Normal, never below 1200 on Exigente", () => {
    const at900 = (s: SeasonState) => ({ ...s, stats: { ...s.stats, agility: 900 } });
    const normal = weekMenu(v3, at900(begin()));
    expect(normal.stats.find((c) => c.stat === "agility")?.capped).toBe(true);
    expect(normal.stats.filter((c) => c.capped)).toHaveLength(1);
    const hard = weekMenu(v3, at900(begin("exigente")));
    expect(hard.stats.some((c) => c.capped)).toBe(false);
  });
  it("names the Copa's rounds and Gerifalte on Exigente's last goals", () => {
    const s = begin("exigente");
    // every goal before the final passed
    const raceResults = [12, 24, 36, 44, 46].map((turn) => ({
      courseId: "steps",
      turn,
      place: 1,
      fieldSize: 8,
      timeTicks: 1000,
      frameId: s.equippedFrame,
      position: "stalk" as const,
      engine: "v1" as const,
    }));
    const final = { ...s, turn: 47, raceResults };
    const menu = weekMenu(v3, final);
    expect(menu.goal?.cup).toBe("final");
    expect(menu.goal?.mirror).toBe(true);
    expect(menu.goal?.minPlace).toBe(1);
    expect(weekMenu(v3, begin()).goal?.cup).toBeUndefined();
  });
});
