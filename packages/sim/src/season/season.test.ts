import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RULESET_V1 } from "../rulesets/index.js";
import { lowestStat } from "../stats.js";
import { advanceSeason, InvalidInputError } from "./advance.js";
import type { SimContext } from "./context.js";
import { blackBoxFor, replaySeason } from "./replay.js";
import { startSeason } from "./start.js";
import { trainingGain } from "./training.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
type StartInput = Extract<RunInput, { kind: "start" }>;
const START: StartInput = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** Reference policy: train the lowest stat, rest when tired, always take option 0. */
function lowestStatPolicy(state: SeasonState): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  if (state.fatigue >= 60) return { kind: "rest" };
  const stat = lowestStat(state.stats);
  switch (stat) {
    case "agility":
      return { kind: "train:agility" };
    case "stamina":
      return { kind: "train:stamina" };
    case "technique":
      return { kind: "train:technique" };
    case "courage":
      return { kind: "train:risk-flight" };
    case "intelligence":
      return { kind: "train:simulator" };
  }
}

function playSeason(
  seed: string,
  start: RunInput = START,
  policy = lowestStatPolicy,
): { state: SeasonState; inputs: RunInput[] } {
  if (start.kind !== "start") throw new Error("bad start");
  let state = startSeason(ctx, seed, start);
  const inputs: RunInput[] = [start];
  let guard = 0;
  while (state.status === "active") {
    const input = policy(state);
    inputs.push(input);
    state = advanceSeason(ctx, state, input);
    if (++guard > 400) throw new Error("season did not end");
  }
  return { state, inputs };
}

describe("startSeason", () => {
  it("equips the frame matching the preferred style and rolls quirks for Boneyard frames", () => {
    const s = startSeason(ctx, "42", START);
    expect(s.turn).toBe(1);
    expect(s.equippedFrame).toBe("shiden");
    expect(s.frameQuirks.mule).toHaveLength(2);
    expect(new Set(s.frameQuirks.mule).size).toBe(2);
    expect(s.frameQuirks.shiden).toBeUndefined();
    expect(s.frameDurability.mule).toBeGreaterThanOrEqual(100);
    expect(s.learnedSkills).toEqual(["stoop-strike"]);
    expect(Object.keys(s.crewPresence)).toHaveLength(5);
  });

  it("rejects unknown frames and duplicate hangar entries", () => {
    expect(() => startSeason(ctx, "1", { ...START, hangar: ["nope"] })).toThrow(/unknown frame/);
    expect(() => startSeason(ctx, "1", { ...START, hangar: ["mule", "mule"] })).toThrow(
      /duplicate/,
    );
  });

  it("applies inheritance from parents deterministically", () => {
    const parent = {
      id: "p",
      rulesetVersion: "v1",
      falconessId: "caracara",
      grade: "A" as const,
      factors: {
        stat: { stat: "stamina" as const, stars: 3 as const },
        aptitude: {
          kind: "biome" as const,
          key: "tundra" as const,
          letter: "S" as const,
          stars: 3 as const,
        },
        skills: [],
        frameAffinity: "boneyard",
      },
      seed: "x",
      inputsHash: "00000000",
    };
    const a = startSeason(ctx, "7", { ...START, parents: [parent] });
    const b = startSeason(ctx, "7", { ...START, parents: [parent] });
    expect(a.stats.stamina).toBe(80 + 21);
    expect(a).toEqual(b);
  });
});

describe("advanceSeason", () => {
  it("is deterministic: same seed and inputs give byte-identical state", () => {
    const a = playSeason("42");
    const b = playSeason("42");
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.inputs).toEqual(b.inputs);
  });

  it("different seeds diverge", () => {
    expect(JSON.stringify(playSeason("1").state)).not.toBe(JSON.stringify(playSeason("2").state));
  });

  it("replaySeason rebuilds the exact final state from seed + inputs", () => {
    const { state, inputs } = playSeason("replay-me");
    const replayed = replaySeason(ctx, "replay-me", inputs);
    expect(replayed).toEqual(state);
  });

  it("does not mutate the input state", () => {
    const s0 = startSeason(ctx, "immut", START);
    const frozen = JSON.stringify(s0);
    advanceSeason(ctx, s0, { kind: "train:agility" });
    expect(JSON.stringify(s0)).toBe(frozen);
  });

  it("training raises the primary and secondary stat (or lowers them on failure) and costs fatigue", () => {
    const s0 = startSeason(ctx, "train", START);
    const s1 = advanceSeason(ctx, s0, { kind: "train:stamina" });
    expect(s1.fatigue).toBe(20);
    expect(s1.stats.stamina).not.toBe(s0.stats.stamina);
    expect(s1.stats.courage).not.toBe(s0.stats.courage);
    expect(Math.sign(s1.stats.courage - s0.stats.courage)).toBe(
      Math.sign(s1.stats.stamina - s0.stats.stamina),
    );
    expect(s1.facilityUses["train:stamina"]).toBe(1);
    expect(s1.log.at(-1)?.turn).toBe(1);
    expect(s1.turn === 2 || s1.pendingEvent !== undefined).toBe(true);
  });

  it("trainingGain grows with crew presence, mood and growth", () => {
    const s = startSeason(ctx, "gain", START);
    const d = JSON.parse(JSON.stringify(s)) as SeasonState & { log: SeasonState["log"] };
    d.crewPresence = {
      "train:agility": [],
      "train:stamina": [],
      "train:technique": [],
      "train:risk-flight": [],
      "train:simulator": [],
    };
    d.mood = 0;
    const plain = trainingGain(ctx, d, "train:stamina", "stamina");
    expect(plain).toBe(44);
    const withGrowth = trainingGain(ctx, d, "train:agility", "agility"); // peregrina growth 0.2
    expect(withGrowth).toBe(52);
    d.crewPresence["train:stamina"] = ["steinhaus"];
    expect(trainingGain(ctx, d, "train:stamina", "stamina")).toBe(50);
    d.mood = 2;
    expect(trainingGain(ctx, d, "train:stamina", "stamina")).toBe(55);
  });

  it("forces rest at fatigue ≥ 80", () => {
    let s = startSeason(ctx, "tired", START);
    for (let i = 0; i < 4; i++) {
      if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
      s = advanceSeason(ctx, s, { kind: "train:technique" });
    }
    if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
    expect(s.fatigue).toBe(80);
    const before = s.stats.technique;
    const r = advanceSeason(ctx, s, { kind: "train:technique" });
    expect(r.stats.technique).toBe(before);
    expect(r.fatigue).toBe(40);
    expect(r.log.at(-1)?.notes).toContain("log.rest.forced");
  });

  it("rejects inputs out of protocol", () => {
    const s = startSeason(ctx, "proto", START);
    expect(() => advanceSeason(ctx, s, START)).toThrow(InvalidInputError);
    expect(() => advanceSeason(ctx, s, { kind: "event:choose", option: 0 })).toThrow(
      InvalidInputError,
    );
    const ended = playSeason("proto").state;
    expect(() => advanceSeason(ctx, ended, { kind: "rest" })).toThrow(InvalidInputError);
  });

  it("workshop: equip from hangar, install parts, repair, reroll quirks with scrap", () => {
    let s = startSeason(ctx, "shop", START);
    const scrapBefore = 200;
    s = { ...s, wallet: { ...s.wallet, scrap: scrapBefore } };
    const quirksBefore = s.frameQuirks.mule;
    s = advanceSeason(ctx, s, {
      kind: "workshop",
      ops: [
        { op: "equip-frame", frameId: "mule" },
        { op: "install-part", partId: "steinhaus-turbine" },
        { op: "install-part", partId: "altair-battery" },
        { op: "reroll-quirks", frameId: "mule" },
        { op: "repair" },
      ],
    });
    expect(s.equippedFrame).toBe("mule");
    expect(s.installedParts).toEqual(["steinhaus-turbine", "altair-battery"]);
    expect(s.wallet.scrap).toBe(scrapBefore - 40);
    expect(s.rerollsThisSeason).toBe(1);
    expect(s.frameQuirks.mule).toHaveLength(2);
    expect(s.frameQuirks.mule).not.toEqual(quirksBefore);
    expect(s.frameDurability.mule).toBeGreaterThanOrEqual(170);
    expect(s.fatigue).toBe(5);
    expect(() =>
      advanceSeason(ctx, s, { kind: "workshop", ops: [{ op: "equip-frame", frameId: "etoile" }] }),
    ).toThrow(/not in the hangar/);
  });

  it("learn-skill spends points and refuses other Falconess' unique skills", () => {
    let s = startSeason(ctx, "learn", START);
    s = { ...s, skillPoints: 100 };
    const ok = advanceSeason(ctx, s, {
      kind: "workshop",
      ops: [{ op: "learn-skill", skillId: "clean-start" }],
    });
    expect(ok.learnedSkills).toContain("clean-start");
    expect(ok.skillPoints).toBe(40);
    expect(() =>
      advanceSeason(ctx, s, {
        kind: "workshop",
        ops: [{ op: "learn-skill", skillId: "wind-hover" }],
      }),
    ).toThrow(/unique/);
    expect(() =>
      advanceSeason(ctx, s, {
        kind: "workshop",
        ops: [{ op: "learn-skill", skillId: "last-gasp" }],
      }),
    ).toThrow(/skill points/);
  });

  it("story events fire on their fixed turn and block until answered", () => {
    let s = startSeason(ctx, "story", START);
    // turn 1 and 2: any action; peregrina-first-dive is fixed at turn 3
    while (s.turn < 3) {
      if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
      else s = advanceSeason(ctx, s, { kind: "rest" });
    }
    if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
    expect(s.turn).toBe(3);
    const after = advanceSeason(ctx, s, { kind: "rest" });
    expect(after.pendingEvent?.eventId).toBe("peregrina-first-dive");
    expect(after.turn).toBe(3);
    expect(() => advanceSeason(ctx, after, { kind: "rest" })).toThrow(/pending/);
    const chosen = advanceSeason(ctx, after, { kind: "event:choose", option: 1 });
    expect(chosen.turn).toBe(4);
    expect(chosen.eventHistory["peregrina-first-dive"]).toBe(1);
    expect(chosen.mood).toBe(after.mood + 1 > 2 ? 2 : after.mood + 1);
  });

  it("a full season with the reference policy ends within 48 turns, with races at goal turns", () => {
    const { state } = playSeason("full");
    expect(state.status).toBe("ended");
    expect(state.turn).toBeLessThanOrEqual(48);
    const goals = ctx.content.getFalconess("peregrina").seasonGoals;
    expect(state.raceResults.length).toBeGreaterThanOrEqual(1);
    for (const r of state.raceResults)
      expect(goals.some((g) => g.turn === r.turn && g.courseId === r.courseId)).toBe(true);
    expect(state.grade).toBeDefined();
    if (state.endReason === "completed") expect(state.turn).toBe(48);
  });

  it("produces a black box at season end", () => {
    const { state, inputs } = playSeason("bb");
    const bb = blackBoxFor(ctx, state, inputs);
    expect(bb.falconessId).toBe("peregrina");
    expect(bb.factors.stat.stars).toBeGreaterThanOrEqual(1);
    expect(["koryu", "boneyard", "altair", "steinhaus"]).toContain(bb.factors.frameAffinity);
    expect(bb.inputsHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("property: resources stay within bounds for any seed and any Falconess", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.constantFrom("peregrina", "cernicala", "caracara"),
        (seed, who) => {
          const start: RunInput = {
            kind: "start",
            falconessId: who,
            hangar: ["mule", "kite", "shiden", "nimbus"],
            parents: [],
          };
          const { state } = playSeason(seed, start);
          const S = ctx.ruleset.season;
          for (const v of Object.values(state.stats))
            if (v < S.statMin || v > S.statMax) return false;
          if (state.fatigue < 0 || state.fatigue > S.fatigueMax) return false;
          if (state.mood < -2 || state.mood > 2) return false;
          if (state.wallet.scrap < 0 || state.skillPoints < 0) return false;
          for (const b of Object.values(state.bond)) if (b < 0 || b > S.bondMax) return false;
          return state.status === "ended";
        },
      ),
      { numRuns: 60 },
    );
  });

  it("property: the UI never touching the RNG is guaranteed — identical inputs, identical states, across Falconess", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
        const a = playSeason(seed, {
          kind: "start",
          falconessId: "cernicala",
          hangar: ["nimbus", "kite"],
          parents: [],
        });
        const b = replaySeason(ctx, seed, a.inputs);
        return JSON.stringify(a.state) === JSON.stringify(b);
      }),
      { numRuns: 25 },
    );
  });
});
