import { loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import type { EntryInput, Position, RaceEntry, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V2, RULESET_V3 } from "../rulesets/index.js";
import { WINGS as WINGS_V3N } from "../rulesets/v3/constants.js";
import { FLIGHT_OFF_NEUTRAL, rulesetV3With } from "../rulesets/v3/switches.js";
import { simulateRace } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry } from "./geometry.js";
import { buildTables, createRaceArena, drawRaceBlock } from "./state.js";
import { STYLE_NEUTRAL } from "./units.js";

/**
 * Neutral wings (owner, 2026-11-08): in v3 the wings lose their stats. Every frame races on one
 * neutral profile with no manufacturer rule and no wear; the style is only its gesture; the
 * signature passive is the Falconess's own. FLIGHT_OFF_NEUTRAL is everyone flies (d3f5623) byte
 * for byte (.work/design7/neutral/inv9.ts).
 */
const content = loadContent();
const course = content.getCourse("ridge");
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

function input(frameId: string, falconessId: string | null, extra: Partial<EntryInput> = {}) {
  const base: EntryInput = {
    runnerId: falconessId ?? `rival-${frameId}`,
    kind: falconessId === null ? "rival" : "player",
    falconessId,
    baseStats: S600,
    mood: 0,
    positionAptitude: { lead: "B", pack: "B", stalk: "B", closer: "B" },
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
  };
  return { ...base, ...extra };
}

describe("ruleset v3: neutral wings (owner 2026-11-08)", () => {
  it("every frame races on the neutral profile, no rule, no part or quirk, her own passive", () => {
    const N = RULESET_V3.flight.neutralFrame;
    for (const frame of content.frames.values()) {
      const e = freezeEntry(RULESET_V3, content, input(frame.id, null), course, 0);
      expect([e.powerToWeight, e.energy, e.dissipation, e.durabilityMax], frame.id).toEqual([
        N.powerToWeight,
        N.energy,
        N.dissipation,
        N.durability,
      ]);
      expect(e.rule).toBe("none");
      expect(e.passive).toBeNull();
      expect(e.style).toBe(frame.style);
    }
    // the signature passive goes with the Falconess, on any wings
    const own = freezeEntry(RULESET_V3, content, input("kite", "caracara"), course, 0);
    expect(own.passive).toBe("scrap-armor");
    expect(own.traits.obstacleArmor).toBe(true);
    const sig = freezeEntry(RULESET_V3, content, input("shiden", null), course, 0);
    expect(sig.traits.obstacleArmor).toBe(false);
    // parts, quirks and a worn frame change nothing; v2 still reads the frame
    const worn = input("mule", "caracara", {
      quirks: ["hot-head", "mud-runner"],
      durability: 3,
    });
    const a = freezeEntry(RULESET_V3, content, worn, course, 0);
    expect(a.quirks).toEqual([]);
    expect(a.durabilityStart).toBe(a.durabilityMax);
    expect(a.stats).toEqual(own.stats);
    const v2 = freezeEntry(RULESET_V2, content, input("caracara-signature", "caracara"), course, 0);
    expect([v2.powerToWeight, v2.energy, v2.rule, v2.passive]).toEqual([
      700,
      140,
      "repairable",
      "scrap-armor",
    ]);
    const off = rulesetV3With(FLIGHT_OFF_NEUTRAL);
    expect(freezeEntry(off, content, input("etoile", null), course, 0).energy).toBe(60);
  });

  it("the style is only its gesture: every ground table is the same for the four wings", () => {
    const ORDER: Style[] = ["dive", "hover", "glide", "ground"];
    const entries: RaceEntry[] = ORDER.map((style, i) =>
      neutralFixtureEntry({
        runnerId: `r${i}`,
        laneIndex: i,
        style,
        position: "stalk" as Position,
        stats: S600,
      }),
    );
    const G = buildCourseGeometry(RULESET_V3, course);
    const A = createRaceArena().reset(entries.length, G);
    // the same pre-drawn block for all four (only the wing differs)
    drawRaceBlock(RULESET_V3, entries, new Rng("same"), A);
    const block = RULESET_V3.race.rngBlock;
    for (let i = 1; i < 4; i++) for (let k = 0; k < block; k++) A.U[i * block + k] = A.U[k] ?? 0;
    buildTables(RULESET_V3, entries, G, A);
    const T = A.tables;
    const per = (arr: Int32Array | Float64Array, i: number) => {
      const n = arr.length / 8;
      return Array.from(arr.slice(i * n, (i + 1) * n));
    };
    for (let i = 0; i < 4; i++) {
      expect(T.phys[i]).toBe(STYLE_NEUTRAL);
      expect(T.style[i]).toBe(i);
      for (const k of ["detour", "climbMe", "liftH", "Emax", "D", "dmgTick", "kickAt"] as const)
        expect(T[k][i], `${ORDER[i]} ${k}`).toBe(T[k][0]);
      for (const k of ["accStart", "acc", "vC", "stoop", "need", "jr"] as const)
        expect(per(T[k], i), `${ORDER[i]} ${k}`).toEqual(per(T[k], 0));
    }
    // every wing pays and dives the same; only the climb and fall ticks differ
    for (const w of WINGS_V3N)
      expect([w.climbCostPm, w.holdPm, w.liftSpeedPm, w.diveWingPm, w.maxBand]).toEqual([
        1000, 1000, 1000, 1000, 3,
      ]);
    expect(WINGS_V3N.map((w) => [w.climbTicks, w.diveTicks])).toEqual([
      [2, 2],
      [4, 3],
      [8, 4],
      [3, 3],
    ]);
  });

  it("no wear: durability never moves and nobody breaks, whatever the water and the jumps", () => {
    const seen = new Set<string>();
    for (const id of ["ridge", "canyon", "sprint"]) {
      const c = content.getCourse(id);
      const entries = [...content.frames.values()]
        .slice(0, 8)
        .map((f, lane) => freezeEntry(RULESET_V3, content, input(f.id, null), c, lane));
      for (const seed of ["w1", "w2", "w3"]) {
        const log = simulateRace(RULESET_V3, entries, c, seed);
        for (const r of log.results) expect(r.durabilityEnd, `${id} ${seed}`).toBe(100_000);
        for (const e of log.events ?? []) seen.add(e.kind);
      }
    }
    expect(seen.has("durabilityBroken")).toBe(false);
    expect(seen.has("waterHit")).toBe(false);
    expect(seen.has("repair")).toBe(false);
    expect(seen.has("pulse")).toBe(false);
  });
});
