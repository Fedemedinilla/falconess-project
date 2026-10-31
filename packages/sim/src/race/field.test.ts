import { loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import {
  type EntryInput,
  type FalconessStats,
  RaceEntry,
  type SeasonGoal,
} from "@falconess/schema";
import { describe, expect, it } from "vitest";
import type { FieldConstants, Ruleset } from "../rulesets/index.js";
import type { SimContext } from "../season/context.js";
import { startSeason } from "../season/start.js";
import { STAT_ORDER } from "../stats.js";
import { freezeEntry } from "./entry.js";
import { generateField, goalRaceSetup, PLAYER_RUNNER_ID, rivalPool } from "./field.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";

const content = loadContent();
const R = SPEC_RULESET;
const ctx: SimContext = { ruleset: R, content };
const SPRINT = content.getCourse("sprint");
const CANYON = content.getCourse("canyon");

function withField(field: Partial<FieldConstants>): Ruleset {
  return { ...R, field: { ...R.field, ...field } };
}

function player(frameId: string, over: Partial<EntryInput> = {}): EntryInput {
  const f = content.getFalconess("peregrina");
  return {
    runnerId: PLAYER_RUNNER_ID,
    kind: "player",
    falconessId: f.id,
    baseStats: { agility: 400, stamina: 400, technique: 400, courage: 400, intelligence: 400 },
    mood: 1,
    styleAptitude: f.styleAptitude,
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: ["stoop-strike"],
    durability: null,
    ...over,
  };
}

/**
 * Section 21.1 written out a second time, step by step, as the oracle of the draw order: player
 * lane; per rival lane ascending: frame, total noise, five stat jitters, the skill shuffle.
 */
function fieldByHand(
  ruleset: Ruleset,
  args: { courseId: string; turn: number; raceSeed: string; player: EntryInput },
): RaceEntry[] {
  const F = ruleset.field;
  const course = content.getCourse(args.courseId);
  const rng = new Rng(`${args.raceSeed}/field`);
  const pool = rivalPool(ruleset, content, args.player.frameId);
  const skills = [...content.skills.values()]
    .filter((s) => s.kind === "active" && s.uniqueTo === undefined)
    .map((s) => s.id)
    .sort();
  const n = course.entries;
  const lane0 = rng.nextInt("race", n);
  const out: RaceEntry[] = [];
  let k = 0;
  for (let lane = 0; lane < n; lane++) {
    if (lane === lane0) {
      out.push(freezeEntry(ruleset, content, args.player, course, lane));
      continue;
    }
    k++;
    const frame = pool[rng.nextInt("race", pool.length)];
    if (!frame) throw new Error("pool");
    const mu = F.rivalBase + F.rivalPerTurn * args.turn;
    const total = Math.floor(
      (5 * mu * (1000 + rng.nextRange("race", -F.rivalNoise, F.rivalNoise))) / 1000,
    );
    const w = F.rivalWeights[frame.style];
    const base = [0, 1, 2, 3, 4].map((i) =>
      Math.min(
        1200,
        Math.max(
          1,
          Math.floor(
            (total *
              (w[i] ?? 0) *
              (1000 + rng.nextRange("race", -F.rivalStatJitter, F.rivalStatJitter))) /
              1_000_000,
          ),
        ),
      ),
    );
    const m = Math.min(F.rivalMaxSkills, Math.floor(args.turn / F.rivalTurnsPerSkill));
    const learned = rng.shuffle("race", skills).slice(0, m);
    const baseStats: FalconessStats = {
      agility: base[0] ?? 0,
      stamina: base[1] ?? 0,
      technique: base[2] ?? 0,
      courage: base[3] ?? 0,
      intelligence: base[4] ?? 0,
    };
    out.push(
      freezeEntry(
        ruleset,
        content,
        {
          runnerId: `rival-${k}`,
          kind: "rival",
          falconessId: null,
          baseStats,
          mood: 0,
          styleAptitude: {
            dive: frame.style === "dive" ? "A" : "B",
            hover: frame.style === "hover" ? "A" : "B",
            glide: frame.style === "glide" ? "A" : "B",
            ground: frame.style === "ground" ? "A" : "B",
          },
          frameId: frame.id,
          parts: [],
          quirks: [],
          learnedSkills: learned,
          durability: null,
        },
        course,
        lane,
      ),
    );
  }
  return out;
}

const basePwOf = (frameId: string) =>
  Math.round(content.getFrame(frameId).stats.powerToWeight * 1000);

describe("rivalPool (21.1 relative band)", () => {
  it("gives the class pools of the spec for every signature frame and PW class", () => {
    const pool = (frameId: string, ruleset: Ruleset = R) =>
      rivalPool(ruleset, content, frameId).map((f) => f.id);
    expect(pool("peregrina-signature")).toEqual(["etoile", "shiden"]);
    expect(pool("hayate")).toEqual(["hayate", "sylphe"]);
    expect(pool("falke")).toEqual(["erzherzog", "falke", "horizon"]);
    expect(pool("cernicala-signature")).toEqual(["nimbus"]);
    expect(pool("caracara-signature")).toEqual(["kite", "mule"]);
  });

  it("widens to the rivalMinPool nearest frames, ties by id, and opens up at 2000 ‰", () => {
    const narrow = withField({ rivalPwBandPm: 0, rivalMinPool: 2 });
    // nimbus 0.85 alone in band 0; the next nearest are 0.7 and 1.0 (both 150 ‰): id order
    expect(rivalPool(narrow, content, "cernicala-signature").map((f) => f.id)).toEqual([
      "nimbus",
      "erzherzog",
    ]);
    const open = withField({ rivalPwBandPm: 2000 });
    const generic = [...content.frames.values()].filter((f) => f.signatureOf === undefined);
    expect(rivalPool(open, content, "caracara-signature")).toHaveLength(generic.length);
  });

  it("matches on the player's base PW: parts never pull a faster class into the field", () => {
    const plain = generateField(R, content, {
      course: SPRINT,
      turn: 24,
      raceSeed: "band",
      player: player("caracara-signature"),
    });
    const turbo = generateField(R, content, {
      course: SPRINT,
      turn: 24,
      raceSeed: "band",
      player: player("caracara-signature", { parts: ["steinhaus-turbine"] }),
    });
    const rivals = (es: RaceEntry[]) => es.filter((e) => e.kind === "rival");
    expect(rivals(turbo)).toEqual(rivals(plain));
    expect(turbo.find((e) => e.kind === "player")?.powerToWeight).toBe(800);
  });
});

describe("generateField (21.1)", () => {
  it("is deterministic and follows the exact draw order of the spec", () => {
    for (const [courseId, frameId, turn] of [
      ["sprint", "peregrina-signature", 12],
      ["ridge", "falke", 24],
      ["canyon", "caracara-signature", 46],
      ["canyon", "cernicala-signature", 0],
    ] as const) {
      const args = { course: content.getCourse(courseId), turn, raceSeed: `s/${courseId}` };
      const p = player(frameId);
      const a = generateField(R, content, { ...args, player: p });
      const b = generateField(R, content, { ...args, player: p });
      expect(a).toEqual(b);
      expect(a).toEqual(fieldByHand(R, { courseId, turn, raceSeed: args.raceSeed, player: p }));
      for (const e of a) RaceEntry.parse(e);
    }
  });

  it("puts the player on the field Rng's first lane draw, rivals on the others in lane order", () => {
    const raceSeed = "lanes";
    const entries = generateField(R, content, {
      course: CANYON,
      turn: 36,
      raceSeed,
      player: player("shiden"),
    });
    const lane = new Rng(`${raceSeed}/field`).nextInt("race", CANYON.entries);
    expect(entries.map((e) => e.laneIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(entries.filter((e) => e.kind === "player").map((e) => e.laneIndex)).toEqual([lane]);
    expect(entries.filter((e) => e.kind === "rival").map((e) => e.runnerId)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((k) => `rival-${k}`),
    );
    expect(entries.find((e) => e.kind === "player")).toEqual(
      freezeEntry(R, content, player("shiden"), CANYON, lane),
    );
  });

  it("never shifts with the player: other seeds move the field, the player's build does not", () => {
    const args = { course: SPRINT, turn: 24, raceSeed: "same" };
    const rivals = (p: EntryInput, seed = args.raceSeed) =>
      generateField(R, content, { ...args, raceSeed: seed, player: p }).filter(
        (e) => e.kind === "rival",
      );
    const base = rivals(player("shiden"));
    expect(rivals(player("shiden", { mood: -2, learnedSkills: [] }))).toEqual(base);
    expect(rivals(player("shiden"), "other")).not.toEqual(base);
  });

  it("rivals: band frames, no parts or quirks, A on their style, generic actives", () => {
    for (const turn of [0, 11, 12, 24, 36, 46, 48]) {
      for (let s = 0; s < 6; s++) {
        const p = player("peregrina-signature");
        const entries = generateField(R, content, {
          course: SPRINT,
          turn,
          raceSeed: `rivals/${turn}/${s}`,
          player: p,
        });
        const pw0 = basePwOf(p.frameId);
        for (const e of entries.filter((x) => x.kind === "rival")) {
          expect(Math.abs(basePwOf(e.frameId) - pw0) * 1000).toBeLessThanOrEqual(50 * pw0);
          expect(e.parts).toEqual([]);
          expect(e.quirks).toEqual([]);
          expect(e.mood).toBe(0);
          expect(e.styleAptitude).toBe("A");
          expect(e.falconessId).toBeNull();
          expect(e.durabilityStart).toBe(e.durabilityMax);
          expect(e.skills).toHaveLength(Math.min(3, Math.floor(turn / 12)));
          const ids = e.skills.map((k) => k.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const k of e.skills) expect(k.uniqueTo).toBeNull();
        }
      }
    }
  });

  it("rival stats follow the curve: exact without noise, inside the ±20 % / ±10 % envelope with it", () => {
    const flat = withField({ rivalNoise: 0, rivalStatJitter: 0 });
    for (const turn of [12, 24, 36, 46]) {
      const mu = 95 + 9 * turn;
      const exact = generateField(flat, content, {
        course: SPRINT,
        turn,
        raceSeed: `curve/${turn}`,
        player: player("falke"),
      });
      const noisy = generateField(R, content, {
        course: SPRINT,
        turn,
        raceSeed: `curve/${turn}`,
        player: player("falke"),
      });
      for (const e of exact) {
        if (e.kind !== "rival") continue;
        const w = R.field.rivalWeights[e.style];
        const want = STAT_ORDER.map((_, k) => Math.floor((5 * mu * (w[k] ?? 0)) / 1000));
        // effective stats: mood 0, agility as is; intelligence × A (1.05) on the frame's own style
        expect(e.stats).toEqual({
          agility: want[0],
          stamina: want[1],
          technique: want[2],
          courage: want[3],
          intelligence: Math.floor(((want[4] ?? 0) * 1050) / 1000),
        });
      }
      // with noise (a zero-width range takes no draw, so the noisy field picks its own frames)
      for (const n of noisy) {
        if (n.kind !== "rival") continue;
        const w = R.field.rivalWeights[n.style];
        STAT_ORDER.forEach((stat, k) => {
          const mean = (5 * mu * (w[k] ?? 0)) / 1000;
          const scale = stat === "intelligence" ? 1.05 : 1;
          expect(n.stats[stat]).toBeGreaterThanOrEqual(Math.floor(mean * 0.8 * 0.9 * scale) - 1);
          expect(n.stats[stat]).toBeLessThanOrEqual(Math.ceil(mean * 1.2 * 1.1 * scale) + 1);
        });
      }
    }
  });

  it("clamps rival base stats to [1, 1200] at extreme turns", () => {
    const entries = generateField(R, content, {
      course: SPRINT,
      turn: 400,
      raceSeed: "clamp",
      player: player("falke"),
    });
    for (const e of entries.filter((x) => x.kind === "rival")) {
      expect(e.stats.agility).toBeLessThanOrEqual(1200);
      expect(e.stats.intelligence).toBeLessThanOrEqual(1260);
    }
  });
});

describe("goalRaceSetup (21.2)", () => {
  const goal: SeasonGoal = { turn: 12, courseId: "sprint", minPlace: 5 };

  it("freezes the season state as the player against generateField's rivals", () => {
    const s0 = startSeason(ctx, "setup", {
      kind: "start",
      falconessId: "caracara",
      hangar: ["mule", "kite", "shiden", "nimbus"],
      parents: [],
    });
    const state = {
      ...s0,
      turn: 12,
      mood: -1 as const,
      installedParts: ["steinhaus-turbine"],
      frameDurability: { ...s0.frameDurability, [s0.equippedFrame]: 37 },
    };
    expect(state.equippedFrame).toBe("mule");
    const setup = goalRaceSetup(ctx, state, goal);
    expect(setup.course).toEqual(content.getCourse("sprint"));
    expect(setup.raceSeed).toBe("setup/race/12");
    const input: EntryInput = {
      runnerId: "player",
      kind: "player",
      falconessId: "caracara",
      baseStats: state.stats,
      mood: -1,
      styleAptitude: state.styleAptitude,
      frameId: "mule",
      parts: ["steinhaus-turbine"],
      quirks: state.frameQuirks.mule ?? [],
      learnedSkills: state.learnedSkills,
      durability: 37,
    };
    expect(setup.entries).toEqual(
      generateField(R, content, {
        course: setup.course,
        turn: 12,
        raceSeed: "setup/race/12",
        player: input,
      }),
    );
    const me = setup.entries.find((e) => e.runnerId === "player");
    expect(me?.durabilityStart).toBe(37);
    expect(me?.quirks).toEqual(state.frameQuirks.mule);
    expect(goalRaceSetup(ctx, state, goal)).toEqual(setup);
  });
});
