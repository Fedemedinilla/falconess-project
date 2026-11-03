import { loadCatalogueCourses, loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import type { Course, Position, RaceEntry, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, RULESET_V2 } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { FLIGHT_OFF_1_2, flightOf, RULESET_V3, rulesetV3 } from "./flight.js";
import { buildCourseGeometry } from "./geometry.js";
import { buildTables, createRaceArena, drawRaceBlock, FLIGHTS_MAX } from "./state.js";

/**
 * The ruleset v3 draft (design7 «Despegar y caer», stage 1): flight plans by position, energy
 * paid to climb and hold, rest in the air and the dive. v1 and v2 never fly. The tests of the
 * round-2 rules run with `FLIGHT_OFF_1_2` (steps 1.2 and 1.3 off); stage1.test.ts covers those.
 */
const R2 = rulesetV3(1, FLIGHT_OFF_1_2);

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const ORDER: Style[] = ["glide", "ground", "hover", "dive"];
const DEFAULT: Record<Style, Position> = {
  glide: "lead",
  ground: "pack",
  hover: "stalk",
  dive: "closer",
};
const M = 225_000; // pu per metre

/** 8 runners, 2 per wing, each in her wings' default position. */
function defaultField(stats = S600): RaceEntry[] {
  return ORDER.flatMap((style, w) =>
    [0, 1].map((k) =>
      neutralFixtureEntry({
        runnerId: `${style}-${k}`,
        laneIndex: w + 4 * k,
        style,
        position: DEFAULT[style],
        stats,
      }),
    ),
  ).sort((a, b) => a.laneIndex - b.laneIndex);
}

function plan(course: Course, entries: RaceEntry[]) {
  const R = RULESET_V3;
  const G = buildCourseGeometry(R, course);
  const A = createRaceArena().reset(entries.length, G);
  drawRaceBlock(R, entries, new Rng("plan"), A);
  buildTables(R, entries, G, A);
  return { T: A.tables, G };
}

const FLAGS_ALT = RACE_FRAME_FLAGS.altLow | RACE_FRAME_FLAGS.altHigh;

describe("ruleset v3 draft: flight (design7 stage 1)", () => {
  it("v1 and v2 carry no flight constants and write no flight key, event or altitude bit", () => {
    expect(flightOf(RULESET_V1)).toBeNull();
    expect(flightOf(RULESET_V2)).toBeNull();
    for (const R of [RULESET_V1, RULESET_V2]) {
      const log = simulateRace(R, defaultField(), content.getCourse("ridge"), "v2-no-flight");
      expect(log.results.every((r) => !("flight" in r.ledger))).toBe(true);
      const kinds = new Set((log.events ?? []).map((e) => e.kind));
      for (const k of ["takeoff", "dive", "touchdown", "noLift"])
        expect(kinds.has(k as never)).toBe(false);
      for (const r of log.frames?.runners ?? [])
        expect(r.flags.every((f) => (f & FLAGS_ALT) === 0)).toBe(true);
    }
  });

  it("is deterministic and its log parses with the strict schema", () => {
    const a = simulateRace(RULESET_V3, defaultField(), content.getCourse("ridge"), "det");
    const b = simulateRace(RULESET_V3, defaultField(), content.getCourse("ridge"), "det");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(RaceLog.parse(a)).toEqual(a);
    expect(a.rulesetVersion).toBe("v3");
  });

  it("plans the stalk's high flight and the closer's ceiling from the geometry (§5 examples)", () => {
    const at = (cid: string, position: Position) => {
      const entries = defaultField();
      const lane = entries.find((e) => e.position === position)?.laneIndex ?? 0;
      const { T } = plan(content.getCourse(cid), entries);
      const x = lane * FLIGHTS_MAX;
      return [
        T.flN[lane],
        Math.round((T.flA[x] ?? 0) / M),
        Math.round((T.flB[x] ?? 0) / M),
        T.flBand[x],
        T.flCorn[x],
      ];
    };
    // round 1: the stalk flies from L/4; the closer holds ≥ max(100 m, L/30); round 2: 150 m before the final
    expect(at("sprint", "stalk")).toEqual([1, 300, 840, 2, 0]);
    expect(at("sprint", "closer")).toEqual([1, 650, 800, 3, 0]);
    expect(at("ridge", "stalk")).toEqual([1, 500, 1400, 2, 0]);
    expect(at("ridge", "closer")).toEqual([1, 1200, 1600, 3, 1]); // cornisa, covers jump 2
    expect(at("canyon", "closer")).toEqual([1, 1850, 2000, 3, 0]); // 150 m before the final
    // stage 1: lead and pack keep today's ground row
    expect(at("ridge", "lead")[0]).toBe(0);
    expect(at("ridge", "pack")[0]).toBe(0);
  });

  it("the plan reads only her own position: other runners' positions never move it", () => {
    const course = content.getCourse("ridge");
    const base = defaultField();
    const moved = base.map((e, i) => (i === 3 ? e : { ...e, position: "closer" as Position }));
    const a = plan(course, base).T;
    const b = plan(course, moved).T;
    for (let k = 0; k < FLIGHTS_MAX; k++) {
      expect(b.flA[3 * FLIGHTS_MAX + k]).toBe(a.flA[3 * FLIGHTS_MAX + k]);
      expect(b.flB[3 * FLIGHTS_MAX + k]).toBe(a.flB[3 * FLIGHTS_MAX + k]);
    }
    expect(b.flRes0[3]).toBe(a.flRes0[3]);
  });

  it("every tick: altitude 0-3, no boost in the air, ground wings never rise, energy never below 0", () => {
    const tracks = [
      ...["sprint", "ridge", "canyon"].map((c) => content.getCourse(c)),
      ...loadCatalogueCourses(),
    ];
    for (const course of tracks)
      for (const st of [300, 900]) {
        const stats = { agility: st, stamina: st, technique: st, courage: st, intelligence: st };
        const entries = defaultField(stats);
        let bad = "";
        simulateRaceProbed(RULESET_V3, entries, course, `inv/${course.id}/${st}`, (t, A) => {
          const S = A.state;
          for (let i = 0; i < entries.length; i++) {
            const alt = S.alt[i] ?? 0;
            if (alt < 0 || alt > 3) bad ||= `alt ${alt} at ${t}`;
            if (alt > 0 && S.boostOn[i] === 1) bad ||= `boost in the air, lane ${i} tick ${t}`;
            if (entries[i]?.style === "ground" && alt > 0)
              bad ||= `ground wing rose, lane ${i} tick ${t}`;
            if ((S.energy[i] ?? 0) < 0) bad ||= `negative energy lane ${i}`;
          }
        });
        expect(bad, `${course.id} ${st}`).toBe("");
      }
  });

  it("closers make the great dive and stalks dive from high; the ledger and events agree", () => {
    const log = simulateRace(R2, defaultField(), content.getCourse("sprint"), "dives");
    const ev = log.events ?? [];
    for (const e of log.entries) {
      const r = log.results.find((x) => x.lane === e.laneIndex);
      const f = r?.ledger.flight;
      expect(f, e.runnerId).toBeDefined();
      if (e.style === "ground" || e.position === "lead" || e.position === "pack") {
        expect(f?.flights, e.runnerId).toBe(0);
        continue;
      }
      expect(f?.flights, e.runnerId).toBe(1);
      expect(f?.dives, e.runnerId).toBe(1);
      expect(f?.grandDives, e.runnerId).toBe(e.position === "closer" ? 1 : 0);
      const dive = ev.find((x) => x.kind === "dive" && x.lane === e.laneIndex);
      expect(dive?.kind === "dive" && dive.fromBand).toBe(e.position === "closer" ? 3 : 2);
      // courage 600: η = 1000, the great dive adds 6 m/s
      if (e.position === "closer") expect(dive?.kind === "dive" && dive.gainMms).toBe(6000);
    }
    // the frames carry the band in two bits
    const bands = new Set(
      log.frames?.runners.flatMap((r) =>
        r.flags.map(
          (f) => (f & RACE_FRAME_FLAGS.altLow ? 1 : 0) + (f & RACE_FRAME_FLAGS.altHigh ? 2 : 0),
        ),
      ),
    );
    for (const b of [0, 2, 3]) expect(bands.has(b), `band ${b}`).toBe(true);
  });

  it("an empty tank cannot take off: noLift, no damage, she stays on the ground", () => {
    const R = rulesetV3(1, { ...FLIGHT_OFF_1_2, climbE: 250 }); // more than any tank (≤ 200)
    const log = simulateRace(R, defaultField(), content.getCourse("sprint"), "nolift");
    const closers = log.entries.filter((e) => e.position === "closer").map((e) => e.laneIndex);
    for (const lane of closers) {
      const r = log.results.find((x) => x.lane === lane);
      expect(r?.ledger.flight?.flights).toBe(0);
      expect(r?.ledger.flight?.noLift).toBe(1);
      expect(r?.ledger.jumpsFailed).toBe(0);
    }
    // the stalks cannot climb either: one noLift per planned flight, no takeoff at all
    const fliers = log.entries.filter(
      (e) => e.style !== "ground" && (e.position === "closer" || e.position === "stalk"),
    );
    expect((log.events ?? []).filter((e) => e.kind === "noLift")).toHaveLength(fliers.length);
    expect((log.events ?? []).filter((e) => e.kind === "takeoff")).toHaveLength(0);
  });

  it("courage sets the dive: η = 850 + 300·C/1200 ‰ in round 2, 700 + 600·C/1200 ‰ with L5", () => {
    const run = (R: typeof RULESET_V3, c: number) => {
      const stats = { ...S600, courage: c };
      const log = simulateRace(R, defaultField(stats), content.getCourse("sprint"), "eta");
      const d = (log.events ?? []).find(
        (e) => e.kind === "dive" && e.fromBand === 3 && log.entries[e.lane]?.style === "dive",
      );
      return d?.kind === "dive" ? d.gainMms : -1;
    };
    expect(run(R2, 1)).toBe(5100);
    expect(run(R2, 1200)).toBe(6900);
    // L5 and the Lanza's dive ×1.25 (S1): 6000 × 0.7 × 1.25 and 6000 × 1.3 × 1.25
    expect(run(RULESET_V3, 1)).toBe(5250);
    expect(run(RULESET_V3, 1200)).toBe(9750);
  });

  it("the hover draft reaches a flight only with draftGroundOnly off (round 1 default)", () => {
    const drafting = RACE_FRAME_FLAGS.drafting;
    const rows = (R: typeof RULESET_V3) => {
      const log = simulateRace(R, defaultField(), content.getCourse("canyon"), "draft-air");
      const hover = log.entries.filter((e) => e.style === "hover").map((e) => e.laneIndex);
      return (log.frames?.runners ?? [])
        .filter((_, lane) => hover.includes(lane))
        .flatMap((r) => r.flags.filter((f) => (f & FLAGS_ALT) !== 0 && (f & drafting) !== 0));
    };
    expect(RULESET_V3.flight.draftGroundOnly).toBe(false);
    expect(rows(RULESET_V3).length).toBeGreaterThan(0);
    expect(rows(rulesetV3(1, { draftGroundOnly: true }))).toHaveLength(0);
    expect(rows(rulesetV3(1, { ...FLIGHT_OFF_1_2, draftGroundOnly: true }))).toHaveLength(0);
  });

  it("the catalogue tracks validate and keep their lengths (design7 §6)", () => {
    const len = (c: Course) => c.segments.reduce((q, s) => q + s.length, 0);
    const got = Object.fromEntries(loadCatalogueCourses().map((c) => [c.id, len(c)]));
    expect(got).toEqual({
      circuit: 2200,
      crossing: 3600,
      "open-sky": 2800,
      overlook: 1800,
      steps: 1600,
    });
    // and they are not part of the v1/v2 content index
    for (const id of Object.keys(got)) expect(content.courses.has(id)).toBe(false);
  });
});

describe("ruleset v3 draft: stage 2 preview (design7 R2 lead/pack, R9, R10)", () => {
  const E2 = rulesetV3(2);

  it("everyone with flying wings has a plan; the stalk splits around the canyons", () => {
    const course = content.getCourse("canyon");
    const entries = defaultField();
    const { T } = (() => {
      const G = buildCourseGeometry(E2, course);
      const A = createRaceArena().reset(entries.length, G);
      drawRaceBlock(E2, entries, new Rng("plan"), A);
      buildTables(E2, entries, G, A);
      return { T: A.tables };
    })();
    const flights = (pos: Position) => {
      const lane = entries.find((e) => e.position === pos && e.style !== "ground")?.laneIndex ?? 0;
      return Array.from({ length: T.flN[lane] ?? 0 }, (_, k) => {
        const x = lane * FLIGHTS_MAX + k;
        return [
          Math.round((T.flA[x] ?? 0) / M),
          Math.round((T.flB[x] ?? 0) / M),
          T.flBand[x],
          T.flChain[x],
        ];
      });
    };
    // design7 §5, canyon (stalk from L/4 since round 1): high to 20 m before the first canyon,
    // low along it, high again to 1980, dive before the second
    expect(flights("stalk")).toEqual([
      [750, 880, 2, 1],
      [880, 1500, 1, 1],
      [1500, 1980, 2, 0],
    ]);
    // the lead flies low over the climb and the water, 20 m each side
    expect(flights("lead")).toEqual([
      [380, 920, 1, 0],
      [2380, 2620, 1, 0],
    ]);
    // the pack flies low along both canyons; the fan from the final joins the second
    expect(flights("pack").map((f) => f[2])).toEqual(flights("pack").map(() => 1));
  });

  it("nobody holds above band 1 inside a canyon, and ground wings still never rise", () => {
    for (const cid of ["canyon"]) {
      const course = content.getCourse(cid);
      const G = buildCourseGeometry(E2, course);
      const entries = defaultField();
      let bad = "";
      simulateRaceProbed(E2, entries, course, `ceil/${cid}`, (t, A) => {
        const S = A.state;
        for (let i = 0; i < entries.length; i++) {
          const s = S.seg[i] ?? 0;
          if (G.segType[s] === 5 && (S.alt[i] ?? 0) > 1 && (S.flPhase[i] ?? 0) !== 3)
            bad ||= `lane ${i} alt ${S.alt[i]} in canyon at ${t}`;
          if (entries[i]?.style === "ground" && (S.alt[i] ?? 0) > 0)
            bad ||= `ground rose lane ${i}`;
        }
      });
      expect(bad).toBe("");
    }
  });
});
