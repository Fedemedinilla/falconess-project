import { loadContent } from "@falconess/content";
import { EventEffects, type RunInput, type SeasonState } from "@falconess/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { simulateRace } from "../race/engine.js";
import { goalRaceSetup } from "../race/field.js";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import { lowestStat } from "../stats.js";
import { advanceSeason, goalRaceState, InvalidInputError } from "./advance.js";
import { draft, type SimContext } from "./context.js";
import { applyEffects } from "./events.js";
import { goalForTurn } from "./goals.js";
import { blackBoxFor, replaySeason } from "./replay.js";
import { startSeason } from "./start.js";
import { trainingGain } from "./training.js";
import { learnCap, maxDurability, WorkshopError } from "./workshop.js";

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
          kind: "style" as const,
          key: "ground" as const,
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

/** Every goal race of a season: the input that ran it and the states around it. */
function goalRaces(seed: string, start: RunInput = START, policy = lowestStatPolicy) {
  if (start.kind !== "start") throw new Error("bad start");
  let state = startSeason(ctx, seed, start);
  const out: { before: SeasonState; input: RunInput; after: SeasonState }[] = [];
  while (state.status === "active") {
    const input = policy(state);
    const after = advanceSeason(ctx, state, input);
    if (after.raceResults.length > state.raceResults.length)
      out.push({ before: state, input, after });
    state = after;
  }
  return out;
}

describe("goal races on the race engine (docs/race-engine.md 21.2)", () => {
  it("records engine v1 results that a viewer rebuilds exactly from (seed, turn) and the state", () => {
    for (const who of ["peregrina", "cernicala", "caracara"]) {
      const races = goalRaces(`viewer-${who}`, { ...START, falconessId: who });
      expect(races.length).toBeGreaterThanOrEqual(1);
      for (const { before, input, after } of races) {
        const result = after.raceResults.at(-1);
        if (!result) throw new Error("no result");
        expect(result.engine).toBe("v1");
        expect(result.fieldSize).toBe(8);
        expect(result.frameId).toBe(before.equippedFrame);
        const at = goalRaceState(ctx, before, input);
        if (!at) throw new Error("no race state");
        const goal = goalForTurn(ctx, at);
        if (!goal) throw new Error("no goal");
        const { course, raceSeed, entries } = goalRaceSetup(ctx, at, goal);
        expect(raceSeed).toBe(`${before.seed}/race/${result.turn}`);
        // P7: detail "full" changes nothing in the results
        const log = simulateRace(ctx.ruleset, entries, course, raceSeed, { detail: "full" });
        const me = log.results.find((r) => r.runnerId === "player");
        if (!me) throw new Error("no player result");
        expect(me.dnf).toBe(false);
        expect(result.place).toBe(me.place);
        expect(result.timeTicks).toBe(me.timeTicks);
        // D35: the frame keeps the durability it ended the race with
        expect(after.frameDurability[result.frameId]).toBe(Math.floor(me.durabilityEnd / 1000));
        const entry = entries.find((e) => e.runnerId === "player");
        expect(entry?.durabilityStart).toBe(
          Math.min(entry?.durabilityMax ?? 0, at.frameDurability[at.equippedFrame] ?? 0),
        );
      }
    }
  });

  it("takes no season draw: the race-time state is the input applied, nothing else", () => {
    const [first] = goalRaces("no-draw");
    if (!first) throw new Error("no race");
    const at = goalRaceState(ctx, first.before, first.input);
    expect(at?.stats).toEqual(first.after.stats);
    expect(at?.learnedSkills).toEqual(first.after.learnedSkills);
    expect(at?.mood).toBe(first.after.mood);
    expect(goalRaceState(ctx, first.after, { kind: "rest" })).toBeUndefined();
  });

  it("persists durability between races: a worn frame starts its next race worn", () => {
    let s = startSeason(ctx, "worn", START);
    while (s.turn < 12) {
      if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
      else s = advanceSeason(ctx, s, { kind: "rest" });
    }
    s = { ...s, frameDurability: { ...s.frameDurability, [s.equippedFrame]: 3 } };
    const at = goalRaceState(ctx, s, { kind: "rest" });
    const goal = at && goalForTurn(ctx, at);
    if (!at || !goal) throw new Error("turn 12 has a goal");
    const player = goalRaceSetup(ctx, at, goal).entries.find((e) => e.kind === "player");
    expect(player?.durabilityStart).toBe(3);
    const after = advanceSeason(ctx, s, { kind: "rest" });
    expect(after.frameDurability[s.equippedFrame]).toBeLessThanOrEqual(3);
  });

  it("maps a DNF to last place with maxTicks, and fails the goal", () => {
    const tiny: Ruleset = {
      ...RULESET_V1,
      race: { ...RULESET_V1.race, dnfTicksPerMeter: 0, dnfTicksBase: 30 },
    };
    const dctx: SimContext = { ruleset: tiny, content: ctx.content };
    let s = startSeason(dctx, "dnf", START);
    while (s.turn < 12) {
      if (s.pendingEvent) s = advanceSeason(dctx, s, { kind: "event:choose", option: 0 });
      else s = advanceSeason(dctx, s, { kind: "rest" });
    }
    const after = advanceSeason(dctx, s, { kind: "rest" });
    expect(after.raceResults.at(-1)).toMatchObject({ place: 8, timeTicks: 30, engine: "v1" });
    expect(after.lastRace?.outcome).toBe("goal-failed");
    expect(after.wallet.scrap - s.wallet.scrap).toBe(RULESET_V1.season.scrapByPlace[7]);
  });

  it("caps learning at maxLearnedSkills + the build's skillSlots (ADR-0003 D36)", () => {
    const s0 = startSeason(ctx, "cap", START);
    const generic = [...ctx.content.skills.values()]
      .filter((k) => k.kind === "active" && k.uniqueTo === undefined)
      .map((k) => k.id)
      .sort();
    const learn = (s: SeasonState, ids: string[]) =>
      advanceSeason(ctx, s, {
        kind: "workshop",
        ops: ids.map((skillId) => ({ op: "learn-skill" as const, skillId })),
      });
    const rich = { ...s0, skillPoints: 10_000 };
    const cap = RULESET_V1.season.maxLearnedSkills;
    const six = learn(rich, generic.slice(0, cap - 1));
    expect(six.learnedSkills).toHaveLength(cap);
    expect(() => learn(rich, generic.slice(0, cap))).toThrow(/skill limit 6/);
    const firmware = advanceSeason(ctx, rich, {
      kind: "workshop",
      ops: [{ op: "install-part", partId: "altair-firmware" }],
    });
    const seven = learn(firmware, generic.slice(0, cap));
    expect(seven.learnedSkills).toHaveLength(cap + 1);
    expect(() => learn(firmware, generic.slice(0, cap + 1))).toThrow(/skill limit 7/);
  });

  it("never lets a build change drop the learn cap under the skills already learned (D36)", () => {
    const rich = { ...startSeason(ctx, "cap-swap", START), skillPoints: 10_000 };
    const generic = [...ctx.content.skills.values()]
      .filter((k) => k.kind === "active" && k.uniqueTo === undefined)
      .map((k) => k.id)
      .sort()
      .slice(0, RULESET_V1.season.maxLearnedSkills);
    const learnSix = generic.map((skillId) => ({ op: "learn-skill" as const, skillId }));
    // one input: altair-firmware, a 7th skill on its slot, then koryu-firmware in the same slot
    const swap: RunInput = {
      kind: "workshop",
      ops: [
        { op: "install-part", partId: "altair-firmware" },
        ...learnSix,
        { op: "install-part", partId: "koryu-firmware" },
      ],
    };
    expect(() => advanceSeason(ctx, rich, swap)).toThrow(WorkshopError);
    expect(() => advanceSeason(ctx, rich, swap)).toThrow(/7 skills learned .* hold 6/);
    const seven = advanceSeason(ctx, rich, {
      kind: "workshop",
      ops: [{ op: "install-part", partId: "altair-firmware" }, ...learnSix],
    });
    expect(seven.learnedSkills).toHaveLength(7);
    const remove: RunInput = {
      kind: "workshop",
      ops: [{ op: "remove-part", partId: "altair-firmware" }],
    };
    expect(() => advanceSeason(ctx, seven, remove)).toThrow(/skill slots in use/);
    // with a free slot the firmware swaps freely
    const six = advanceSeason(ctx, rich, {
      kind: "workshop",
      ops: [{ op: "install-part", partId: "altair-firmware" }, ...learnSix.slice(1)],
    });
    const swapped = advanceSeason(ctx, six, {
      kind: "workshop",
      ops: [{ op: "install-part", partId: "koryu-firmware" }],
    });
    expect(swapped.installedParts).toEqual(["koryu-firmware"]);
    expect(swapped.learnedSkills).toHaveLength(6);
  });

  it("an event's learnSkill respects the learn cap (D36)", () => {
    const d = draft(startSeason(ctx, "cap-event", START));
    const free = [...ctx.content.skills.values()]
      .filter((k) => k.kind === "active" && k.uniqueTo === undefined)
      .map((k) => k.id)
      .sort();
    const cap = learnCap(ctx, d);
    d.learnedSkills = free.slice(0, cap);
    applyEffects(ctx, d, EventEffects.parse({ learnSkill: free[cap] }));
    expect(d.learnedSkills).toHaveLength(cap);
    d.learnedSkills = free.slice(0, cap - 1);
    applyEffects(ctx, d, EventEffects.parse({ learnSkill: free[cap] }));
    expect(d.learnedSkills).toEqual([...free.slice(0, cap - 1), free[cap]]);
  });

  it("keeps event durability within [0, the build's maximum] (D35)", () => {
    const d = draft(startSeason(ctx, "dur-event", START));
    const frame = d.equippedFrame;
    const max = maxDurability(ctx, d, frame);
    expect(d.frameDurability[frame]).toBe(max);
    applyEffects(ctx, d, EventEffects.parse({ durability: 30 })); // boneyard-botch-1 at full
    expect(d.frameDurability[frame]).toBe(max);
    applyEffects(ctx, d, EventEffects.parse({ durability: -20 }));
    expect(d.frameDurability[frame]).toBe(max - 20);
    // a stored value above the maximum (a durability part removed) counts as the maximum
    d.frameDurability[frame] = max + 20;
    applyEffects(ctx, d, EventEffects.parse({ durability: -20 }));
    expect(d.frameDurability[frame]).toBe(max - 20);
    applyEffects(ctx, d, EventEffects.parse({ durability: -80 }));
    applyEffects(ctx, d, EventEffects.parse({ durability: -80 }));
    expect(d.frameDurability[frame]).toBe(0);
  });

  it("rejects unknown content ids in the workshop as a WorkshopError, the state unchanged", () => {
    const s = { ...startSeason(ctx, "typo", START), skillPoints: 10_000 };
    for (const op of [
      { op: "learn-skill", skillId: "typo-skill" },
      { op: "install-part", partId: "typo-part" },
      { op: "remove-part", partId: "typo-part" },
      { op: "equip-frame", frameId: "typo-frame" },
      { op: "reroll-quirks", frameId: "typo-frame" },
    ] as const) {
      const input: RunInput = { kind: "workshop", ops: [op] };
      expect(() => advanceSeason(ctx, s, input), op.op).toThrow(WorkshopError);
      expect(() => advanceSeason(ctx, s, input), op.op).toThrow(/typo-/);
    }
    expect(s.inputsApplied).toBe(1);
  });
});
