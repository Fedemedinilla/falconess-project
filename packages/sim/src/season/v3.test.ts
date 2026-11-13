import { loadContent, loadSeasonContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import {
  goalRaceSetup,
  MIRROR_RUNNER_ID,
  mirrorRivalInput,
  playerEntryInput,
} from "../race/field.js";
import { canonicalJson } from "../race/golden.js";
import { CURRENT_RULESET, RULESET_V2, RULESET_V3 } from "../rulesets/index.js";
import { advanceSeason } from "./advance.js";
import { type SimContext, seasonContext } from "./context.js";
import { seasonGoalsOf } from "./difficulty.js";
import { rollBoxStat } from "./inheritance.js";
import { blackBoxFor, replaySeason } from "./replay.js";
import { startSeason } from "./start.js";
import { softenedGain, trainingGains } from "./training.js";

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

  it("pays skill points by place in a goal race (v3); v2 pays none", () => {
    const S = RULESET_V3.season;
    expect(S.simulatorSkillPoints).toBe(15);
    expect(S.skillPointsByPlace).toHaveLength(8);
    expect(RULESET_V2.season.skillPointsByPlace).toBeUndefined();
    for (const [ctx, pays] of [
      [V3, true],
      [V2, false],
    ] as const) {
      let s = startSeason(ctx, "pts", START("peregrina"));
      const goal = content.getFalconess("peregrina").seasonGoals[0]?.turn ?? 12;
      while (s.turn < goal) s = advanceSeason(ctx, s, step(s));
      if (s.pendingEvent) s = advanceSeason(ctx, s, step(s));
      const before = s.skillPoints;
      const after = advanceSeason(ctx, s, { kind: "rest" });
      const place = after.raceResults.at(-1)?.place ?? 0;
      expect(place).toBeGreaterThan(0);
      expect(after.skillPoints - before).toBe(pays ? (S.skillPointsByPlace?.[place - 1] ?? -1) : 0);
    }
  });

  it("softens a gain band by band (v3: 750 ‰ from 600, 500 ‰ from 900); v2 keeps every point", () => {
    expect(RULESET_V2.season.growthBands).toBeUndefined();
    expect(softenedGain(V2, 1000, 80)).toBe(80);
    expect(softenedGain(V3, 100, 80)).toBe(80); // below 600: full
    expect(softenedGain(V3, 600, 80)).toBe(60); // 80 × 0.75
    expect(softenedGain(V3, 580, 80)).toBe(65); // 20 full, then 60 × 0.75 = 45
    expect(softenedGain(V3, 900, 80)).toBe(40); // 80 × 0.5
    expect(softenedGain(V3, 880, 80)).toBe(46); // 26.67 raw reach 900 at 0.75, 53.33 × 0.5 = 26.67
    expect(softenedGain(V3, 1199, 1)).toBe(1); // at least 1
  });

  it("shows the softened gains: a secondary at 200 ‰ and the main stat's diminishing returns", () => {
    // Exigente: Normal's cap (900, ADR-0012) would stop the stat at 950 below
    const s = startSeason(V3, "gains", { ...START("peregrina"), difficulty: "exigente" });
    const [main, second] = trainingGains(V3, s, "train:agility");
    expect(main?.stat).toBe("agility");
    expect(second).toEqual({
      stat: "technique",
      gain: Math.floor(((main?.gain ?? 0) * 200) / 1000),
    });
    const high = { ...s, stats: { ...s.stats, agility: 950 } };
    const [soft] = trainingGains(V3, high, "train:agility");
    expect(soft?.gain).toBe(Math.max(1, Math.floor((main?.gain ?? 0) / 2)));
    // the week adds what the preview said
    const after = advanceSeason(V3, high, { kind: "train:agility" });
    // fresh vigor: no failure chance
    expect(after.log.at(-1)?.notes).toContain("log.train.ok");
    expect(after.stats.agility - 950).toBe(soft?.gain);
  });

  describe("difficulties (ADR-0012)", () => {
    const at = (s: SeasonState, agility: number): SeasonState => ({
      ...s,
      stats: { ...s.stats, agility },
    });
    it("Normal stops every stat at 900; Exigente goes on to statMax", () => {
      const normal = startSeason(V3, "cap", START("peregrina"));
      expect(normal.difficulty).toBeUndefined();
      const n = advanceSeason(V3, at(normal, 895), { kind: "train:agility" });
      expect(n.stats.agility).toBe(900);
      const hard = startSeason(V3, "cap", { ...START("peregrina"), difficulty: "exigente" });
      expect(hard.difficulty).toBe("exigente");
      const h = advanceSeason(V3, at(hard, 895), { kind: "train:agility" });
      expect(h.stats.agility).toBeGreaterThan(900);
    });
    it("a save made before the difficulties replays as Normal, byte for byte", () => {
      const a = startSeason(V3, "old", START("cernicala"));
      const b = startSeason(V3, "old", { ...START("cernicala"), difficulty: "normal" });
      const { difficulty, ...rest } = b;
      expect(difficulty).toBe("normal");
      expect(canonicalJson(rest)).toBe(canonicalJson(a));
    });
    it("v1 and v2 have no Exigente", () => {
      expect(() =>
        startSeason(V2, "v2", { ...START("peregrina"), difficulty: "exigente" }),
      ).toThrow(/no Exigente/);
    });
  });
});

describe("the Copa's rival (ADR-0012)", () => {
  const ctx: SimContext = { ruleset: RULESET_V3, content: loadSeasonContent("v3") };
  it("runs only in a mirror goal, in rival-1's lane, built on the player's shares", () => {
    const s = startSeason(ctx, "copa", { ...START("cernicala"), difficulty: "exigente" });
    const strong = {
      ...s,
      stats: { agility: 900, stamina: 600, technique: 500, courage: 400, intelligence: 700 },
    };
    const goals = seasonGoalsOf(ctx, strong);
    const final = goals.find((g) => g.cup === "final");
    const first = goals[0];
    expect(final?.mirrorRival).toBe(true);
    if (!final || !first) throw new Error("no goals");
    const plain = goalRaceSetup(ctx, strong, first);
    expect(plain.entries.some((e) => e.runnerId === MIRROR_RUNNER_ID)).toBe(false);
    const cup = goalRaceSetup(ctx, { ...strong, turn: final.turn }, final);
    const without = goalRaceSetup(
      ctx,
      { ...strong, turn: final.turn },
      { ...final, mirrorRival: false },
    );
    const mirror = cup.entries.find((e) => e.runnerId === MIRROR_RUNNER_ID);
    const rival1 = without.entries.find((e) => e.runnerId === "rival-1");
    expect(mirror?.laneIndex).toBe(rival1?.laneIndex);
    // the other lanes are the same runners
    expect(
      cup.entries.filter((e) => e.runnerId !== MIRROR_RUNNER_ID).map((e) => e.runnerId),
    ).toEqual(without.entries.filter((e) => e.runnerId !== "rival-1").map((e) => e.runnerId));
    const input = mirrorRivalInput(
      ctx,
      { ...playerEntryInput(strong), position: "stalk" },
      final.turn,
      "falke",
    );
    // her shares are the player's: Agility first, Courage last
    const b = input.baseStats;
    expect(b.agility).toBeGreaterThan(b.intelligence);
    expect(b.intelligence).toBeGreaterThan(b.stamina);
    expect(b.courage).toBeLessThan(b.technique);
    expect(input.position).toBe("stalk");
    // she follows the player: 80 % of the excess over the floor
    const M = RULESET_V3.season.mirrorRival;
    const F = RULESET_V3.field;
    if (!M) throw new Error("no mirror constants");
    const floor = Math.floor((5 * (F.rivalBase + F.rivalPerTurn * final.turn) * M.floorPm) / 1000);
    const total = Object.values(b).reduce((n, v) => n + v, 0);
    const expected = floor + Math.floor(((3100 - floor) * M.excessPm) / 1000);
    expect(Math.abs(total - expected)).toBeLessThanOrEqual(5);
  });
});

describe("inheritance with luck (ADR-0013)", () => {
  const ctx: SimContext = { ruleset: RULESET_V3, content: loadSeasonContent("v3") };
  const box = (stat: "agility" | "stamina", stars: 1 | 2 | 3) => ({
    id: `b-${stat}-${stars}`,
    rulesetVersion: "v3",
    falconessId: "cernicala",
    grade: "B" as const,
    factors: {
      stat: { stat, stars },
      aptitude: {
        kind: "position" as const,
        key: "stalk" as const,
        letter: "B" as const,
        stars: 1 as const,
      },
      skills: [],
      frameAffinity: "altair",
    },
    seed: "x",
    inputsHash: "0",
  });
  const withParents = (seed: string) =>
    startSeason(ctx, seed, {
      ...START("peregrina"),
      difficulty: "exigente",
      parents: [box("agility", 2), box("stamina", 1)],
    });
  /** From week `turn` - 1, one rest (and any event): the inspirations land as week `turn` begins. */
  const to = (s: SeasonState, turn: number) => {
    let x: SeasonState = { ...s, turn: turn - 1 };
    while (x.status === "active" && x.turn < turn)
      x = advanceSeason(
        ctx,
        x,
        x.pendingEvent ? { kind: "event:choose", option: 0 } : { kind: "rest" },
      );
    return x;
  };
  it("the start always pays 20 per star; the parents are kept for the inspirations", () => {
    const bare = startSeason(ctx, "inh", { ...START("peregrina"), difficulty: "exigente" });
    const s = withParents("inh");
    expect(s.stats.agility - bare.stats.agility).toBe(40);
    expect(s.stats.stamina - bare.stats.stamina).toBe(20);
    expect(s.inheritance).toEqual([
      { stat: "agility", stars: 2 },
      { stat: "stamina", stars: 1 },
    ]);
    expect(bare.inheritance).toBeUndefined();
    // the log says what each box gave, for the game's card
    const rec = s.log[0]?.inspirations;
    expect(rec?.map((r) => [r.parent, r.stat, r.gain, r.inspired])).toEqual([
      [0, "agility", 40, true],
      [1, "stamina", 20, true],
    ]);
    expect(bare.log[0]?.inspirations).toBeUndefined();
  });
  it("inspires at weeks 24 and 40 by chance, the same way on every replay", () => {
    let inspired = 0;
    let none = 0;
    for (let i = 0; i < 12; i++) {
      const s = to(withParents(`insp-${i}`), 24);
      const again = to(withParents(`insp-${i}`), 24);
      expect(canonicalJson(again)).toBe(canonicalJson(s));
      const notes = s.log.flatMap((e) => e.notes);
      // one record per parent, inspired or not, on the week that begins
      const recs = s.log.find((e) => e.turn === 24)?.inspirations ?? [];
      expect(recs.map((r) => r.parent)).toEqual([0, 1]);
      inspired += notes.filter((n) => n.startsWith("log.inherit.inspiration.")).length;
      none += notes.filter((n) => n === "log.inherit.none").length;
      // nothing before week 24
      const early = to(withParents(`insp-${i}`), 23).log.flatMap((e) => e.notes);
      expect(early.some((n) => n.startsWith("log.inherit"))).toBe(false);
    }
    expect(inspired).toBeGreaterThan(0);
    expect(inspired + none).toBeGreaterThanOrEqual(12);
  });
  it("an inspiration on a stat at the cap says so and adds nothing", () => {
    for (let i = 0; i < 12; i++) {
      const s = withParents(`cap-${i}`);
      const capped = { ...s, stats: { ...s.stats, agility: 1200 } };
      const after = to(capped, 24);
      const notes = after.log.flatMap((e) => e.notes);
      expect(notes).not.toContain("log.inherit.inspiration.agility");
      expect(after.stats.agility).toBe(1200);
      if (notes.includes("log.inherit.capped")) return;
    }
    throw new Error("no capped inspiration in 12 seasons");
  });
  it("a box draws its stat and stars; Normal (cap 900) never leaves 3 stars", () => {
    const stats = { agility: 900, stamina: 640, technique: 500, courage: 420, intelligence: 700 };
    const seen = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const r = rollBoxStat(ctx, stats, `box-${i}`, "h");
      if (!r) throw new Error("v3 rolls its boxes");
      expect(r.stars).toBeLessThan(3);
      seen.set(r.stat, (seen.get(r.stat) ?? 0) + 1);
    }
    // the best stat is the likeliest, not the only one
    expect(seen.get("agility") ?? 0).toBeGreaterThan(seen.get("intelligence") ?? 0);
    expect(seen.size).toBeGreaterThan(2);
    expect(rollBoxStat(ctx, stats, "same", "h")).toEqual(rollBoxStat(ctx, stats, "same", "h"));
    expect(rollBoxStat({ ...ctx, ruleset: RULESET_V2 }, stats, "v2", "h")).toBeUndefined();
  });
});

describe("ADR-0015: Milana and the field of specialists in Peregrina's Larga", () => {
  const ctx: SimContext = { ruleset: RULESET_V3, content: loadSeasonContent("v3") };
  const s0 = startSeason(ctx, "larga", START("peregrina"));
  const state = { ...s0, turn: 48 };
  const larga = ctx.content.getFalconess("peregrina").seasonGoals.find((g) => g.turn === 48);
  it("runs Milana by name, in her shares, position and letter; every other rival is a specialist", () => {
    expect(larga?.namedRival?.id).toBe("milana");
    if (!larga?.namedRival || !larga.field) return;
    const { entries } = goalRaceSetup(ctx, state, larga);
    const milana = entries.find((e) => e.runnerId === "named-milana");
    expect(milana?.position).toBe("stalk");
    expect(milana?.distanceAptitude).toBe("A");
    expect(milana?.stats.stamina).toBeGreaterThan(milana?.stats.agility ?? 0);
    const rivals = entries.filter((e) => e.kind === "rival" && e.runnerId !== "named-milana");
    expect(rivals).toHaveLength(6);
    for (const r of rivals) expect(r.distanceAptitude).toBe("A");
    // same draws as without them: the lanes and the frames of the field do not move
    const plain = goalRaceSetup(ctx, state, { ...larga, field: undefined, namedRival: undefined });
    expect(entries.map((e) => [e.laneIndex, e.frameId])).toEqual(
      plain.entries.map((e) => [e.laneIndex, e.frameId]),
    );
  });
  it("leaves the other Falconess's goals without a named rival or a specialist field", () => {
    for (const id of ["cernicala", "caracara"])
      for (const g of ctx.content.getFalconess(id).seasonGoals)
        expect([g.namedRival, g.field]).toEqual([undefined, undefined]);
  });
});
