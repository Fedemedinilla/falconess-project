import { loadCatalogueCourses, loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import type { Course, Position, RaceEntry, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, RULESET_V2, RULESET_V3 } from "../rulesets/index.js";
import {
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_ALLFLY,
  FLIGHT_OFF_NEUTRAL,
  FLIGHT_OFF_R5,
  rulesetV3With,
} from "../rulesets/v3/switches.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { flightOf } from "./flight.js";
import { buildCourseGeometry } from "./geometry.js";
import { buildTables, createRaceArena, drawRaceBlock, FLIGHTS_MAX } from "./state.js";

/**
 * The ruleset v3 draft (design7 «Despegar y caer», stage 1): flight plans by position, energy
 * paid to climb and hold, rest in the air and the dive. v1 and v2 never fly. The tests of the
 * round-2 rules run with `FLIGHT_OFF_1_2` (steps 1.2 and 1.3 off); stage1.test.ts covers those.
 */
const R2 = rulesetV3With(FLIGHT_OFF_1_2);

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

function plan(course: Course, entries: RaceEntry[], R = RULESET_V3) {
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
    // everyone flies (2026-11-08): the lead skims early (L/6 to L/2) and the jump before the final;
    // the pack skims the 400 m flat between the Saltos (800-1200 m)
    expect(at("ridge", "lead")).toEqual([1, 333, 1000, 1, 0]);
    // neutral wings (2026-11-08): the pack skims the first Salto too, from 20 m before it, in one skim
    expect(at("ridge", "pack")).toEqual([1, 680, 1200, 1, 0]);
    const packLane = defaultField().find((e) => e.position === "pack")?.laneIndex ?? 0;
    const noJumps = plan(
      content.getCourse("ridge"),
      defaultField(),
      rulesetV3With({ packJumps: false }),
    );
    expect(noJumps.T.flA[packLane * FLIGHTS_MAX]).toBe(800 * M);
    // with allFly off (two lines, 84dc112) lead and pack keep the ground row of stage 1
    const off = (position: Position) => {
      const entries = defaultField();
      const lane = entries.find((e) => e.position === position)?.laneIndex ?? 0;
      return plan(content.getCourse("ridge"), entries, rulesetV3With(FLIGHT_OFF_ALLFLY)).T.flN[
        lane
      ];
    };
    expect(off("lead")).toBe(0);
    expect(off("pack")).toBe(0);
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

  it("every tick: altitude 0-3, no boost in the air, no wing above its maxBand, energy never below 0", () => {
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
            // round 5 (F8): no wing flies above its row's maxBand (neutral wings: all fly to 3)
            const row = RULESET_V3.flight.wings[A.tables.style[i] ?? 0];
            if (alt > (row?.maxBand ?? 0))
              bad ||= `${entries[i]?.style} wing rose to ${alt}, lane ${i} tick ${t}`;
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
    const R = rulesetV3With({ ...FLIGHT_OFF_1_2, climbE: 250 }); // more than any tank (≤ 200)
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
      // round 5: without the nerve (F9) and the won line (F3), which multiply the dive on top
      const d = (log.events ?? []).find(
        (e) => e.kind === "dive" && e.fromBand === 3 && log.entries[e.lane]?.style === "dive",
      );
      return d?.kind === "dive" ? d.gainMms : -1;
    };
    const L5 = { nerveM: 0, overDivePm: 0, diveVMms: [0, 0, 5_400, 6_000] as const };
    const L5old = rulesetV3With({ ...FLIGHT_OFF_NEUTRAL, ...L5 });
    expect(run(R2, 1)).toBe(5100);
    expect(run(R2, 1200)).toBe(6900);
    // L5 and the Lanza's dive ×1.25 (S1): 6000 × 0.7 × 1.25 and 6000 × 1.3 × 1.25
    expect(run(L5old, 1)).toBe(5250);
    expect(run(L5old, 1200)).toBe(9750);
    // neutral wings (owner 2026-11-08): every wing dives the same Δv, 6000 × 0.7 and 6000 × 1.3
    expect(run(rulesetV3With({ ...L5, diveCourRel: false }), 1)).toBe(4200);
    expect(run(rulesetV3With({ ...L5, diveCourRel: false }), 1200)).toBe(7800);
    // polish (diveCourRel): η reads 600 + C − mean of her five stats (others 600): 121 and 1080
    expect(run(rulesetV3With(L5), 1)).toBe(4560);
    expect(run(rulesetV3With(L5), 1200)).toBe(7440);
  });

  it("round 4: the hover draft reaches a flight; round 5 tows by band (F6)", () => {
    const drafting = RACE_FRAME_FLAGS.drafting;
    const rows = (R: typeof RULESET_V3) => {
      const log = simulateRace(R, defaultField(), content.getCourse("canyon"), "draft-air");
      const hover = log.entries.filter((e) => e.style === "hover").map((e) => e.laneIndex);
      return (log.frames?.runners ?? [])
        .filter((_, lane) => hover.includes(lane))
        .flatMap((r) => r.flags.filter((f) => (f & FLAGS_ALT) !== 0 && (f & drafting) !== 0));
    };
    const r4 = rulesetV3With(FLIGHT_OFF_R5);
    expect(rows(r4).length).toBeGreaterThan(0);
    // F6: in the air the tow reads only her band and the metres to the one ahead (step A2): every
    // tick she is towed in the air, at the end of the previous tick another runner was ahead of
    // her in her band within the wake, never a runner on the ground
    const entries = defaultField();
    const prevPos = new Float64Array(8);
    const prevAlt = new Int32Array(8);
    const F = RULESET_V3.flight;
    let towed = 0;
    let bad = "";
    simulateRaceProbed(RULESET_V3, entries, content.getCourse("canyon"), "draft-air", (t, A) => {
      const S = A.state;
      for (let i = 0; i < entries.length; i++) {
        const air = (S.alt[i] ?? 0) > 0;
        if (air && ((S.tickFlags[i] ?? 0) & drafting) !== 0) {
          towed++;
          const band = prevAlt[i] ?? 0;
          const reachMm = (band === 2 ? F.dirtyHighM : F.dirtyM) * 1000;
          const ok = Array.from({ length: entries.length }, (_, j) => j).some((j) => {
            if (j === i || (prevAlt[j] ?? 0) !== band) return false;
            const gapMm = ((prevPos[j] ?? 0) - (prevPos[i] ?? 0)) / 225;
            return gapMm > F.fightM * 1000 && gapMm <= reachMm;
          });
          if (!ok) bad ||= `lane ${i} towed at ${t} with nobody in band ${band} ahead`;
        }
      }
      for (let i = 0; i < entries.length; i++) {
        prevPos[i] = S.pos[i] ?? 0;
        prevAlt[i] = S.alt[i] ?? 0;
      }
    });
    expect(bad).toBe("");
    expect(towed).toBeGreaterThan(0);
  });

  it("the catalogue tracks validate and keep their lengths (design7 §6)", () => {
    const len = (c: Course) => c.segments.reduce((q, s) => q + s.length, 0);
    const got = Object.fromEntries(loadCatalogueCourses().map((c) => [c.id, len(c)]));
    expect(got).toEqual({
      breakaway: 2400,
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
