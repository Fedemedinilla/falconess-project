import { loadCatalogueCourses, loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import type {
  BlackBox,
  Course,
  EntryInput,
  Position,
  RaceEntry,
  RaceLog,
  Style,
} from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V2 } from "../rulesets/index.js";
import { boxDistanceFactor, seasonDistanceAptitudes, startSeason } from "../season/start.js";
import { simulateRace } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { generateField } from "./field.js";
import { neutralFixtureEntry } from "./fixtures.js";
import {
  distanceOfLength,
  FLIGHT_OFF_STAMINA,
  FLIGHT_V3_E1,
  RULESET_V3,
  rulesetV3,
} from "./flight.js";
import { buildCourseGeometry } from "./geometry.js";
import { buildTables, createRaceArena, drawRaceBlock } from "./state.js";

/**
 * Stamina pays effort and the four distances (owner, 2026-11-09): maneuvers cost hp (Resistencia
 * shrinks each hit like the drain), an exhausted runner starts no new maneuver, a letter per
 * distance acts on flight, and a black box lifts at most one distance letter one step, never above
 * B. FLIGHT_OFF_STAMINA is the neutral wings (9bfaf58) byte for byte (.work/design7/stamina/inv10.ts).
 */
const content = loadContent();
const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));
const courseOf = (id: string): Course => catalogue.get(id) ?? content.getCourse(id);
const lengthMm = (c: Course) => c.segments.reduce((a, s) => a + s.length, 0) * 1000;
const S = (v: number) => ({ agility: v, stamina: v, technique: v, courage: v, intelligence: v });
const ORDER: readonly [Style, Position][] = [
  ["glide", "lead"],
  ["ground", "pack"],
  ["hover", "stalk"],
  ["dive", "closer"],
];

function field(stamina = 450, letter?: "A" | "B" | "C"): RaceEntry[] {
  return Array.from({ length: 8 }, (_, j) => {
    const [style, position] = ORDER[j % 4] ?? ["glide", "lead"];
    const e = neutralFixtureEntry({
      runnerId: `r${j}`,
      laneIndex: j,
      style,
      position,
      stats: { ...S(450), stamina },
    });
    return letter === undefined ? e : { ...e, distanceAptitude: letter };
  });
}

function input(falconessId: string, extra: Partial<EntryInput> = {}): EntryInput {
  const f = content.getFalconess(falconessId);
  return {
    runnerId: "player",
    kind: "player",
    falconessId,
    baseStats: S(600),
    mood: 0,
    positionAptitude: { ...f.positionAptitude },
    ...(f.distanceAptitude ? { distanceAptitude: { ...f.distanceAptitude } } : {}),
    frameId: "mule",
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
    ...extra,
  };
}

const hits = (log: RaceLog) => (log.events ?? []).filter((e) => e.kind === "hpHit");

describe("ruleset v3 draft: stamina pays effort (owner 2026-11-09)", () => {
  it("maneuvers cost hp, logged as hpHit and in the ledger; Resistencia shrinks every hit", () => {
    const sprint = courseOf("sprint");
    const lo = simulateRace(RULESET_V3, field(300), sprint, "hits/1", { detail: "full" });
    const hi = simulateRace(RULESET_V3, field(900), sprint, "hits/1", { detail: "full" });
    const causes = new Set(hits(lo).map((e) => (e.kind === "hpHit" ? e.cause : "")));
    expect(causes.has("takeoff")).toBe(true);
    expect(causes.has("dive")).toBe(true);
    for (const r of lo.results) expect(r.ledger.flight?.hpCost ?? -1).toBeGreaterThan(0);
    const firstTakeoff = (log: RaceLog) =>
      log.events?.find((e) => e.kind === "hpHit" && e.cause === "takeoff" && e.lane === 0);
    const a = firstTakeoff(lo);
    const b = firstTakeoff(hi);
    expect(a?.kind === "hpHit" && b?.kind === "hpHit" && a.hp > b.hp).toBe(true);
  });

  it("an exhausted runner starts no new maneuver (no switch, no over, no door, no takeoff)", () => {
    let emptied = 0;
    for (const id of ["ridge", "canyon", "crossing"])
      for (let k = 0; k < 6; k++) {
        const log = simulateRace(RULESET_V3, field(200), courseOf(id), `still/${id}/${k}`, {
          detail: "full",
        });
        const empty = new Map<number, number>();
        for (const e of log.events ?? []) {
          if (e.kind === "hpEmpty" && !empty.has(e.lane)) empty.set(e.lane, e.tick);
          const t = empty.get(e.lane);
          if (t === undefined || e.tick <= t) continue;
          emptied += 1;
          const move =
            (e.kind === "lineSwitch" && e.cause !== "door") ||
            e.kind === "doorClosed" ||
            (e.kind === "lineChange" && e.cause === "over") ||
            (e.kind === "takeoff" && e.fromBand === 0);
          expect(move, `${id}/${k} lane ${e.lane} ${e.kind} after exhaustion`).toBe(false);
        }
      }
    expect(emptied).toBeGreaterThan(0);
  });

  it("the bar budgets the plan's hits at hpPlanRefStamina: hpMax grows by her planned hits", () => {
    const course = courseOf("sprint");
    const G = buildCourseGeometry(RULESET_V3, course);
    const entries = field(600);
    const hpMax = (R: typeof RULESET_V3) => {
      const A = createRaceArena().reset(entries.length, G);
      drawRaceBlock(R, entries, new Rng("same"), A);
      buildTables(R, entries, G, A);
      return Array.from({ length: 8 }, (_, i) => A.tables.hpMax[i] ?? 0);
    };
    const on = hpMax(RULESET_V3);
    const off = hpMax(rulesetV3(1, { hpPlanRefStamina: 0 }));
    for (const [i, v] of on.entries()) expect(v, `lane ${i}`).toBeGreaterThan(off[i] ?? 0);
  });

  it("off (FLIGHT_OFF_STAMINA): no hit, no hpCost, no letter", () => {
    const off = rulesetV3(1, FLIGHT_OFF_STAMINA);
    const log = simulateRace(off, field(450, "C"), courseOf("sprint"), "off/1", { detail: "full" });
    expect(hits(log)).toEqual([]);
    for (const r of log.results) expect(r.ledger.flight?.hpCost).toBeUndefined();
    const e = freezeEntry(off, content, input("caracara"), courseOf("sprint"), 0);
    expect(e.distanceAptitude).toBeUndefined();
  });
});

describe("ruleset v3 draft: the four distances (owner 2026-11-09)", () => {
  it("a course's distance comes from its length (sprint ≤ 1400, mile ≤ 1800, medium ≤ 2400)", () => {
    const F = FLIGHT_V3_E1;
    const got = Object.fromEntries(
      ["sprint", "steps", "overlook", "ridge", "circuit", "open-sky", "canyon", "crossing"].map(
        (id) => [id, distanceOfLength(F, lengthMm(courseOf(id)))],
      ),
    );
    expect(got).toEqual({
      sprint: "sprint",
      steps: "mile",
      overlook: "mile",
      ridge: "medium",
      circuit: "medium",
      "open-sky": "long",
      canyon: "long",
      crossing: "long",
    });
    expect(distanceOfLength(F, 1_400_000)).toBe("sprint");
    expect(distanceOfLength(F, 1_450_000)).toBe("mile");
  });

  it("freezeEntry writes the letter of the course's distance; v2 never does", () => {
    const sprint = courseOf("sprint");
    const canyon = courseOf("canyon");
    expect(freezeEntry(RULESET_V3, content, input("caracara"), sprint, 0).distanceAptitude).toBe(
      "C",
    );
    expect(freezeEntry(RULESET_V3, content, input("caracara"), canyon, 0).distanceAptitude).toBe(
      "A",
    );
    expect(freezeEntry(RULESET_V3, content, input("peregrina"), sprint, 0).distanceAptitude).toBe(
      "A",
    );
    expect(
      freezeEntry(RULESET_V2, content, input("caracara"), sprint, 0).distanceAptitude,
    ).toBeUndefined();
  });

  it("rivals are B at every distance", () => {
    const entries = generateField(RULESET_V3, content, {
      course: courseOf("sprint"),
      turn: 24,
      raceSeed: "rivals/24",
      player: input("caracara"),
    });
    for (const e of entries)
      if (e.kind === "rival") expect(e.distanceAptitude, e.runnerId).toBe("B");
  });

  it("a letter acts on flight: off her distance the sprint's dive gives less and the climb costs more", () => {
    const course = courseOf("sprint");
    const G = buildCourseGeometry(RULESET_V3, course);
    const tables = (letter: "A" | "C") => {
      const entries = field(450, letter);
      const A = createRaceArena().reset(entries.length, G);
      drawRaceBlock(RULESET_V3, entries, new Rng("same"), A);
      buildTables(RULESET_V3, entries, G, A);
      return { dive: A.tables.diveV[3 * 4 + 3] ?? 0, climb: A.tables.climbMe[3] ?? 0 };
    };
    const a = tables("A");
    const c = tables("C");
    expect(c.dive).toBeLessThan(a.dive);
    expect(c.climb).toBeGreaterThan(a.climb);
  });
});

describe("season v3 draft: distance letters and the black box (owner 2026-11-09)", () => {
  const box = (key: "sprint" | "mile" | "medium" | "long"): BlackBox => ({
    id: `box-${key}`,
    rulesetVersion: "v3",
    falconessId: "peregrina",
    grade: "B",
    factors: {
      stat: { stat: "agility", stars: 1 },
      aptitude: { kind: "position", key: "closer", letter: "A", stars: 2 },
      distance: { key, letter: "A" },
      skills: [],
      frameAffinity: "koryu",
    },
    seed: "s",
    inputsHash: "h",
  });
  const caracara = content.getFalconess("caracara");

  it("a box lifts one distance one step, C → B, never to a specialist's A", () => {
    expect(seasonDistanceAptitudes(RULESET_V3, caracara, [])).toEqual({
      letters: { sprint: "C", mile: "C", medium: "B", long: "A" },
    });
    expect(seasonDistanceAptitudes(RULESET_V3, caracara, [box("sprint")])).toEqual({
      letters: { sprint: "B", mile: "C", medium: "B", long: "A" },
      boost: "sprint",
    });
    // a B stays B, an A stays A; two boxes lift at most one letter
    expect(seasonDistanceAptitudes(RULESET_V3, caracara, [box("medium")])?.boost).toBeUndefined();
    expect(seasonDistanceAptitudes(RULESET_V3, caracara, [box("long")])?.boost).toBeUndefined();
    expect(
      seasonDistanceAptitudes(RULESET_V3, caracara, [box("sprint"), box("mile")])?.letters,
    ).toEqual({ sprint: "B", mile: "C", medium: "B", long: "A" });
    expect(seasonDistanceAptitudes(RULESET_V2, caracara, [box("sprint")])).toBeUndefined();
  });

  it("the season starts with the letters (no draw) and the box names her best birth letter", () => {
    const ctx = { ruleset: RULESET_V3, content };
    const hangar = ["kite", "mule", "falke", "nimbus"];
    const s = startSeason(ctx, "dist/1", {
      kind: "start",
      falconessId: "caracara",
      hangar,
      parents: [box("sprint")],
    });
    expect(s.distanceAptitude?.sprint).toBe("B");
    expect(s.distanceBoost).toBe("sprint");
    const v2 = startSeason({ ruleset: RULESET_V2, content }, "dist/1", {
      kind: "start",
      falconessId: "caracara",
      hangar,
      parents: [],
    });
    expect(v2.distanceAptitude).toBeUndefined();
    expect(boxDistanceFactor(content.getFalconess("peregrina"))).toEqual({
      key: "sprint",
      letter: "A",
    });
    expect(boxDistanceFactor(caracara)).toEqual({ key: "long", letter: "A" });
  });
});
