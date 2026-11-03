import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Position, RaceEntry, RaceLog, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V2 } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed, simulateRaceReversed } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { FLIGHT_OFF_R5, RULESET_V3, rulesetV3 } from "./flight.js";
import { ibps } from "./state.js";

/**
 * Round 5 of the v3 prototype (design7 measure/final.md): the design review F1-F11 of 4f9b899.
 * F2 the dive is felt in the air, F3 a won line pays, F5 flying keeps dry, F7 band 1 is climbed
 * too, F8 the Turbina skims, F9 the nerve, F10 the rivals keep v2's agility.
 */

const content = loadContent();
const ORDER: Style[] = ["glide", "ground", "hover", "dive"];
const DEFAULT: Record<Style, Position> = {
  glide: "lead",
  ground: "pack",
  hover: "stalk",
  dive: "closer",
};
const stats = (st: number) => ({
  agility: st,
  stamina: st,
  technique: st,
  courage: st,
  intelligence: st,
});
function field(
  st = 600,
  pick?: (lane: number) => { style: Style; position: Position },
): RaceEntry[] {
  return Array.from({ length: 8 }, (_, lane) => {
    const style = ORDER[lane % 4] ?? "glide";
    const p = pick?.(lane) ?? { style, position: DEFAULT[style] };
    return neutralFixtureEntry({ runnerId: `r${lane}`, laneIndex: lane, ...p, stats: stats(st) });
  });
}
const events = <K extends NonNullable<RaceLog["events"]>[number]["kind"]>(log: RaceLog, kind: K) =>
  (log.events ?? []).filter(
    (e): e is Extract<NonNullable<RaceLog["events"]>[number], { kind: K }> => e.kind === kind,
  );

describe("round 5: the dive is felt in the air (F2)", () => {
  it("her speed rises band by band between diveStart and the touchdown; the rest lands on touchdown", () => {
    const entries = field();
    const course = content.getCourse("sprint");
    // vOut of every lane at every tick, read by the probe
    const vOut: number[][] = entries.map(() => []);
    const log = simulateRaceProbed(RULESET_V3, entries, course, "dive-air", (t, A) => {
      vOut.forEach((row, i) => {
        row[t] = A.state.vOut[i] ?? 0;
      });
    });
    const dives = events(log, "dive");
    expect(dives.length).toBeGreaterThan(0);
    for (const d of dives) {
      const start = events(log, "diveStart").find(
        (e) => e.lane === d.lane && e.tick < d.tick && e.fromBand === d.fromBand,
      );
      expect(start).toBeDefined();
      expect(d.airMms ?? 0).toBeGreaterThan(0);
      expect(d.airMms ?? 0).toBeLessThan(d.gainMms);
      // the share of the bands dropped before the touchdown: Δv × (fromBand − 1) / fromBand (a held
      // nerve test multiplies the Δv only on touchdown, after the air share)
      const nerve = events(log, "nerve").some((e) => e.lane === d.lane && e.tick === d.tick);
      if (!nerve)
        expect(
          Math.abs((d.airMms ?? 0) - Math.floor((d.gainMms * (d.fromBand - 1)) / d.fromBand)),
        ).toBeLessThanOrEqual(2);
      const v = vOut[d.lane] ?? [];
      // the tick before the touchdown she is faster than on the tick the wings folded
      expect(v[d.tick - 1] ?? 0).toBeGreaterThan(v[start?.tick ?? 0] ?? 0);
    }
  });

  it("each wing falls at its own pace: Lanza 2, Columna 3, Rampa 4 ticks per band", () => {
    const E = field(600, (lane) => ({ style: ORDER[lane % 4] ?? "glide", position: "closer" }));
    const log = simulateRace(RULESET_V3, E, content.getCourse("sprint"), "descent");
    const per: Record<string, number> = {};
    for (const t of events(log, "touchdown")) {
      const s = events(log, "diveStart").find((e) => e.lane === t.lane && e.tick < t.tick);
      if (s === undefined) continue;
      per[E[t.lane]?.style ?? "?"] = (t.tick - s.tick) / s.fromBand;
    }
    expect(per).toMatchObject({ dive: 2, hover: 3, glide: 4 });
    const old = simulateRace(
      rulesetV3(1, FLIGHT_OFF_R5),
      E,
      content.getCourse("sprint"),
      "descent",
    );
    for (const t of events(old, "touchdown")) {
      const s = events(old, "diveStart").find((e) => e.lane === t.lane && e.tick < t.tick);
      if (s !== undefined) expect((t.tick - s.tick) / s.fromBand).toBe(3);
    }
    for (const d of events(old, "dive")) expect(d.airMms).toBeUndefined();
  });
});

describe("round 5: takeoff from the ground (F7), the Turbina (F8) and the pack's Pasillo (F1)", () => {
  it("from the ground band 1 takes climbTicks too: a bandReached for band 1 at takeoff + climbTicks", () => {
    const log = simulateRace(RULESET_V3, field(), content.getCourse("canyon"), "climb");
    const takeoffs = events(log, "takeoff").filter((e) => e.fromBand === 0);
    expect(takeoffs.length).toBeGreaterThan(0);
    for (const t of takeoffs) {
      const b1 = events(log, "bandReached").find(
        (e) => e.lane === t.lane && e.tick > t.tick && e.band === 1,
      );
      expect(b1?.tick).toBe(t.tick + t.climbTicks);
    }
  });

  it("the Pelotón skims the canyon's Pasillos at band 1; a ground wing flies only band-1 plans", () => {
    const course = content.getCourse("canyon");
    const E = field(600, (lane) => ({
      style: "ground",
      position: (["lead", "pack", "stalk", "closer"] as const)[lane % 4] ?? "pack",
    }));
    const log = simulateRace(RULESET_V3, E, course, "turbine");
    const t = events(log, "takeoff");
    expect(t.length).toBeGreaterThan(0);
    for (const e of t) {
      expect(e.style).toBe("turbine");
      expect(e.band).toBe(1);
      expect(E[e.lane]?.position).toBe("pack");
    }
    // the Pasillos are 600 + 400 m: the pack's plan is those two flights
    expect(
      log.derived
        .filter((d) => (d.flightPlan ?? []).length > 0)
        .every((d) => (d.flightPlan ?? []).length === 2),
    ).toBe(true);
    // with groundFlies off (round 4) no ground wing leaves the ground
    const off = simulateRace(rulesetV3(1, { groundFlies: false }), E, course, "turbine");
    expect(events(off, "takeoff")).toHaveLength(0);
  });
});

describe("round 5: flying keeps dry (F5)", () => {
  it("a flight over the Terreno líquido takes no water hit; the air pays less of its drag", () => {
    const course = loadCatalogueCourses().find((c) => c.id === "crossing");
    expect(course).toBeDefined();
    if (course === undefined) return;
    const entries = field();
    let wetInAir = 0;
    const altAt: number[][] = entries.map(() => []);
    const log = simulateRaceProbed(RULESET_V3, entries, course, "dry", (t, A) => {
      altAt.forEach((row, i) => {
        row[t] = A.state.flPhase[i] ?? 0;
      });
    });
    for (const w of events(log, "waterHit"))
      if ((altAt[w.lane]?.[w.tick] ?? 0) !== 0 && (altAt[w.lane]?.[w.tick - 1] ?? 0) !== 0)
        wetInAir++;
    expect(wetInAir).toBe(0);
    const old = simulateRace(rulesetV3(1, FLIGHT_OFF_R5), entries, course, "dry");
    expect(events(old, "waterHit").length).toBeGreaterThan(events(log, "waterHit").length);
    // the tables: vCAirHi (no drag, from airTerrainFreeBand) ≥ vCAir (airTerrainPm of the drag)
    simulateRaceProbed(RULESET_V3, entries, course, "dry", (t, A) => {
      if (t > 0) return;
      for (let s = 0; s < 24; s++) {
        const x = ibps(0, 0, 1, s);
        expect(A.tables.vCAirHi[x] ?? 0).toBeGreaterThanOrEqual(A.tables.vCAir[x] ?? 0);
      }
    });
  });
});

describe("round 5: a won line pays (F3) and the nerve (F9)", () => {
  it("after a won over the dive gains overDivePm ‰ of one band's share", () => {
    const crowd = field(600, () => ({ style: "hover", position: "stalk" }));
    let won = 0;
    for (const id of ["sprint", "ridge", "canyon"]) {
      const a = simulateRace(RULESET_V3, crowd, content.getCourse(id), "over");
      const b = simulateRace(rulesetV3(1, { overDivePm: 0 }), crowd, content.getCourse(id), "over");
      for (const lc of events(a, "lineChange").filter((e) => e.cause === "over")) {
        const knocked = events(a, "lineChange").some(
          (e) => e.lane === lc.lane && e.cause === "knock" && e.tick > lc.tick,
        );
        const da = events(a, "dive").find((e) => e.lane === lc.lane && e.tick > lc.tick);
        const db = events(b, "dive").find((e) => e.lane === lc.lane && e.tick > lc.tick);
        if (knocked || da === undefined || db === undefined || da.tick !== db.tick) continue;
        if (events(a, "nerve").some((e) => e.lane === lc.lane && e.tick === da.tick)) continue;
        won++;
        expect(da.gainMms).toBeGreaterThan(db.gainMms);
      }
    }
    expect(won).toBeGreaterThan(0);
  });

  it("the nerve test reads the start-of-tick snapshot and slot 29: bounded, of courage, lane-order free", () => {
    let tests = 0;
    let flinch = 0;
    for (const id of ["sprint", "ridge"])
      for (const st of [300, 600]) {
        const E = field(st);
        const log = simulateRace(RULESET_V3, E, content.getCourse(id), `nerve/${st}`);
        const rev = simulateRaceReversed(RULESET_V3, E, content.getCourse(id), `nerve/${st}`, {
          detail: "full",
        });
        expect(JSON.stringify(rev.results)).toBe(JSON.stringify(log.results));
        for (const r of log.results)
          expect(r.ledger.flight?.nerveTests ?? 0).toBeLessThanOrEqual(2);
        for (const n of events(log, "nerve")) {
          tests++;
          expect(n.pPm).toBe(Math.max(50, 400 - Math.floor((600 * st) / 1200)));
          const down = events(log, "touchdown").find((e) => e.lane === n.lane && e.tick === n.tick);
          if (!n.held) {
            flinch++;
            expect(down?.cause).toBe("nerve");
            expect(events(log, "dive").some((e) => e.lane === n.lane && e.tick === n.tick)).toBe(
              false,
            );
          } else
            expect(
              events(log, "dive").find((e) => e.lane === n.lane && e.tick === n.tick)?.gainMms,
            ).toBe(n.gainMms);
        }
        const off = simulateRace(
          rulesetV3(1, { nerveM: 0 }),
          E,
          content.getCourse(id),
          `nerve/${st}`,
        );
        expect(events(off, "nerve")).toHaveLength(0);
      }
    expect(tests).toBeGreaterThan(0);
    expect(flinch).toBeGreaterThan(0);
  });
});

describe("round 5: the rivals keep v2's agility (F10)", () => {
  it("v3's rival rows change technique, never agility", () => {
    const v2 = RULESET_V2.field.rivalWeights;
    const v3 = RULESET_V3.field.rivalWeights;
    for (const w of ["dive", "hover", "glide", "ground"] as const) {
      expect(v3[w][0]).toBe(v2[w][0]);
      expect(v3[w].reduce((p, q) => p + q, 0)).toBe(v2[w].reduce((p, q) => p + q, 0));
    }
  });
});
