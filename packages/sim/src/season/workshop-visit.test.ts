import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../race/golden.js";
import { RULESET_V1, RULESET_V2, RULESET_V3 } from "../rulesets/index.js";
import { advanceSeason, goalRaceState, InvalidInputError } from "./advance.js";
import type { SimContext } from "./context.js";
import { replaySeason } from "./replay.js";
import { trainingStreak } from "./rules.js";
import { startSeason } from "./start.js";
import { WorkshopError } from "./workshop.js";

/** ADR-0018: on v3 the workshop is a visit that does not spend the week. */
const content = loadContent();
const V3: SimContext = { ruleset: RULESET_V3, content };
const START: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};
const LEARN: RunInput = {
  kind: "workshop:visit",
  ops: [{ op: "learn-skill", skillId: "clean-start" }],
};

const rich = (s: SeasonState): SeasonState => ({ ...s, skillPoints: 1000 });

/** The state without what a visit changes: its skills, its points and its own log entries. */
function weekOf(s: SeasonState): unknown {
  const { learnedSkills: _l, skillPoints: _p, log, ...rest } = s;
  return { ...rest, log: log.filter((e) => e.input?.kind !== "workshop:visit") };
}

describe("workshop visit (ADR-0018)", () => {
  it("is on only in v3", () => {
    expect(RULESET_V1.season.workshopVisit).toBe(false);
    expect(RULESET_V2.season.workshopVisit).toBe(false);
    expect(RULESET_V3.season.workshopVisit).toBe(true);
  });

  it("learns and equips without closing the week, spending vigor or moving the mood", () => {
    const s0 = rich(startSeason(V3, "visit", START));
    const s1 = advanceSeason(V3, s0, {
      kind: "workshop:visit",
      ops: [
        { op: "equip-frame", frameId: "mule" },
        { op: "learn-skill", skillId: "clean-start" },
      ],
    });
    expect(s1.learnedSkills).toEqual([...s0.learnedSkills, "clean-start"]);
    expect(s1.skillPoints).toBe(s0.skillPoints - 60);
    expect(s1.equippedFrame).toBe("mule");
    for (const k of [
      "turn",
      "inputsApplied",
      "fatigue",
      "mood",
      "injuryTurns",
      "stats",
      "bond",
      "crewPresence",
      "status",
    ] as const)
      expect(s1[k], k).toEqual(s0[k]);
    expect(s1.pendingEvent).toBeUndefined();
    expect(s1.log.slice(0, -1)).toEqual(s0.log);
    expect(s1.log.at(-1)).toEqual({
      turn: s0.turn,
      input: {
        kind: "workshop:visit",
        ops: [
          { op: "equip-frame", frameId: "mule" },
          { op: "learn-skill", skillId: "clean-start" },
        ],
      },
      notes: ["log.workshop"],
      deltas: {},
    });
  });

  it("leaves the week's draws as they were: the same week with and without a visit", () => {
    for (const week of [
      { kind: "train:agility" },
      { kind: "train:risk-flight" },
      { kind: "rest" },
      { kind: "outing" },
    ] as const) {
      let plain = rich(startSeason(V3, `draws/${week.kind}`, START));
      let visited = plain;
      for (let t = 0; t < 6 && plain.status === "active"; t++) {
        const input: RunInput = plain.pendingEvent ? { kind: "event:choose", option: 0 } : week;
        if (t === 0) visited = advanceSeason(V3, visited, LEARN);
        plain = advanceSeason(V3, plain, input);
        visited = advanceSeason(V3, visited, input);
        expect(canonicalJson(weekOf(visited)), `${week.kind} ${t}`).toBe(
          canonicalJson(weekOf(plain)),
        );
      }
      expect(visited.learnedSkills).toContain("clean-start");
    }
  });

  it("does not cut the training streak", () => {
    let s = rich(startSeason(V3, "streak", START));
    s = advanceSeason(V3, s, { kind: "train:agility" });
    if (s.pendingEvent) s = advanceSeason(V3, s, { kind: "event:choose", option: 0 });
    s = advanceSeason(V3, s, LEARN);
    expect(trainingStreak(s)).toBe(1);
  });

  it("is rejected on v1 and v2, with an event pending and once the season ended", () => {
    for (const ruleset of [RULESET_V1, RULESET_V2]) {
      const ctx: SimContext = { ruleset, content };
      const s = rich(startSeason(ctx, "old", START));
      expect(() => advanceSeason(ctx, s, LEARN), ruleset.version).toThrow(InvalidInputError);
    }
    const s = rich(startSeason(V3, "pending", START));
    const pending = { ...s, pendingEvent: { eventId: "x", turn: s.turn } };
    expect(() => advanceSeason(V3, pending, LEARN)).toThrow(InvalidInputError);
    const ended = { ...s, status: "ended" as const };
    expect(() => advanceSeason(V3, ended, LEARN)).toThrow(InvalidInputError);
  });

  it("rejects a bad op like the workshop does, and runs no goal race", () => {
    const s = startSeason(V3, "bad", START);
    expect(() => advanceSeason(V3, s, LEARN)).toThrow(WorkshopError); // no points
    expect(() =>
      advanceSeason(V3, s, {
        kind: "workshop:visit",
        ops: [{ op: "equip-frame", frameId: "etoile" }],
      }),
    ).toThrow(/not in the hangar/);
    expect(goalRaceState(V3, rich(s), LEARN)).toBeUndefined();
  });

  it("replays a run with visits to the same state", () => {
    const inputs: RunInput[] = [START];
    let s = startSeason(V3, "replay", START);
    while (s.status === "active") {
      const input: RunInput = s.pendingEvent
        ? { kind: "event:choose", option: 0 }
        : s.turn % 3 === 2
          ? { kind: "rest" }
          : { kind: "train:simulator" };
      // a visit as soon as the simulator's points pay for the next generic skill
      if (!s.pendingEvent && s.skillPoints >= 60 && !s.learnedSkills.includes("clean-start")) {
        inputs.push(LEARN);
        s = advanceSeason(V3, s, LEARN);
      }
      inputs.push(input);
      s = advanceSeason(V3, s, input);
    }
    expect(inputs.some((i) => i.kind === "workshop:visit")).toBe(true);
    expect(s.learnedSkills).toContain("clean-start");
    expect(canonicalJson(replaySeason(V3, "replay", inputs))).toBe(canonicalJson(s));
  });
});
