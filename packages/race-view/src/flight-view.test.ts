import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCatalogueCourses, loadContent } from "@falconess/content";
import { type RaceLog, RaceLog as RaceLogSchema } from "@falconess/schema";
import { GOLDEN_V3_SCENARIOS, RULESET_V3, simulateRace } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import {
  activeOverlays,
  flightAhead,
  flightMoments,
  flightOverlays,
  insetEvent,
  slowWindows,
} from "./flight-story.js";
import {
  altitudeAt,
  FLIGHT_PHASE,
  flightModel,
  flightTrackProblems,
  hopAt,
  isFlightLog,
  orderAt,
  positionAt,
} from "./flight-view.js";

/** The twelve v3 golden races (tests/golden/v3): real logs of the engine, frames one per second. */
const DIR = fileURLToPath(new URL("../../../tests/golden/v3/", import.meta.url));
const goldens: [string, RaceLog][] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => [f, RaceLogSchema.parse(JSON.parse(readFileSync(DIR + f, "utf8")))]);

const content = loadContent();
const courses = new Map(content.courses);
for (const c of loadCatalogueCourses()) courses.set(c.id, c);

/** The same golden race with a frame row every tick (only the log's sampling changes). */
function dense(name: string): { real: RaceLog; dense: RaceLog } {
  const sc = GOLDEN_V3_SCENARIOS.find((s) => s.name.startsWith(name));
  const course = sc && courses.get(sc.courseId);
  if (!sc || !course) throw new Error(name);
  const entries = sc.entries(content, course, sc.seed);
  const R = RULESET_V3;
  const R1 = { ...R, race: { ...R.race, log: { ...R.race.log, sampleEveryTicks: 1 } } };
  return {
    real: simulateRace(R, entries, course, sc.seed, { detail: "full" }),
    dense: simulateRace(R1, entries, course, sc.seed, { detail: "full" }),
  };
}

describe("flightModel (the side view of a v3 race, from the log only)", () => {
  it("reads the twelve golden logs as v3 flights", () => {
    expect(goldens).toHaveLength(12);
    for (const [, log] of goldens) {
      expect(isFlightLog(log)).toBe(true);
      expect(flightModel(log)).not.toBeNull();
    }
  });

  it("rebuilds every row's band and line from the events: they match each frame row's flags", () => {
    for (const [name, log] of goldens) {
      const m = flightModel(log);
      expect(m && flightTrackProblems(log, m), name).toEqual([]);
    }
  });

  it("matches a dense log row by row (bands, lines) and its positions within 2.5 m", () => {
    for (const name of ["v3-01", "v3-04", "v3-08", "v3-12"]) {
      const { real, dense: d } = dense(name);
      const m = flightModel(real);
      if (m === null) throw new Error(name);
      expect(flightTrackProblems(d, m), name).toEqual([]);
      for (const t of m.tracks) {
        const col = d.frames?.runners[t.lane]?.posMm ?? [];
        d.frames?.tick.forEach((row, j) => {
          if (row <= t.finishRow)
            expect(Math.abs(positionAt(t, row) - (col[j] ?? 0))).toBeLessThan(2500);
        });
      }
    }
  });

  it("draws the takeoff, the bands and the dive as the log dates them", () => {
    for (const [name, log] of goldens) {
      const m = flightModel(log);
      if (m === null) throw new Error(name);
      for (const t of m.tracks)
        for (const e of t.events) {
          if (e.kind === "bandReached")
            expect(altitudeAt(t, e.tick + 1), name).toBeCloseTo(e.band, 5);
          if (e.kind === "touchdown") expect(t.band[e.tick + 1]).toBe(0);
          if (e.kind === "diveStart" && e.cause === "plan")
            expect(t.phase[e.tick + 1]).toBe(FLIGHT_PHASE.dive);
        }
    }
  });

  it("puts ground hops only on boosting ground rows, never closer than 12 ticks", () => {
    let hops = 0;
    for (const [, log] of goldens) {
      const m = flightModel(log);
      for (const t of m?.tracks ?? []) {
        for (let k = 0; k < t.hops.length; k++) {
          const [a, b] = t.hops[k] ?? [0, 0];
          expect(t.boosting[a]).toBe(1);
          for (let r = a; r <= b - 1; r++) expect(t.band[r]).toBe(0);
          if (k > 0) expect(a - (t.hops[k - 1]?.[0] ?? 0)).toBeGreaterThanOrEqual(12);
          expect(hopAt(t, a + 4)).toBeGreaterThan(0);
        }
        hops += t.hops.length;
      }
    }
    expect(hops).toBeGreaterThan(100);
  });

  it("orders the field: finishers by their finish, as the results say", () => {
    for (const [, log] of goldens) {
      const m = flightModel(log);
      if (m === null) continue;
      expect(orderAt(m, m.rows)).toEqual(log.results.map((r) => r.lane));
    }
  });
});

describe("flight moments and overlays (text-free, one per event)", () => {
  it("lists takeoffs, the fight up high, dives and passes of the whole field", () => {
    const ids = new Set<string>();
    for (const [, log] of goldens) {
      const m = flightModel(log);
      if (m === null) continue;
      const list = flightMoments(m);
      for (let k = 1; k < list.length; k++)
        expect(list[k]?.tick ?? 0).toBeGreaterThanOrEqual(list[k - 1]?.tick ?? 0);
      for (const x of list) ids.add(x.id);
      // one takeoff moment per takeoff event, the winner's finish once
      const tk = (log.events ?? []).filter((e) => e.kind === "takeoff").length;
      expect(list.filter((x) => x.cat === "tk")).toHaveLength(tk);
      expect(list.filter((x) => x.id === "finish")).toHaveLength(1);
    }
    for (const id of [
      "takeoff",
      "takeoffLow",
      "grandDive",
      "impact",
      "knock",
      "doorClosed",
      "kickShort",
    ])
      expect(ids.has(id), id).toBe(true);
  });

  it("gives the followed runner her banners, a takeoff countdown and her dives in slow motion", () => {
    const [, log] = goldens.find(([n]) => n.startsWith("v3-04")) ?? [];
    if (!log) throw new Error("v3-04");
    const m = flightModel(log);
    if (m === null) throw new Error("model");
    const win = log.results[0]?.lane ?? 0;
    const ov = flightOverlays(log, m, win);
    expect(ov.some((o) => o.id === "takeoff" || o.id === "takeoffLow")).toBe(true);
    expect(ov.some((o) => o.id === "grandDive" || o.id === "dive")).toBe(true);
    expect(ov.find((o) => o.id === "finish")?.event.kind).toBe("finish");
    const dive = ov.find((o) => o.id === "peak");
    if (dive) expect(activeOverlays(ov, dive.t0).chip?.id).toBe("peak");
    expect(flightAhead(log, win).length).toBeGreaterThan(0);
    expect(slowWindows(m, win).length).toBeGreaterThan(0);
  });

  it("names Garra fija when Peregrina's dive carries her passive", () => {
    let seen = 0;
    for (const [, log] of goldens) {
      const m = flightModel(log);
      if (m === null) continue;
      for (const t of m.tracks) {
        const ov = flightOverlays(log, m, t.lane);
        for (const o of ov.filter((x) => x.id === "skillDive")) {
          expect(o.event.kind === "dive" && o.event.skillId).toBe("talon-lock");
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("finds the line event the «Desde arriba» inset draws", () => {
    for (const [, log] of goldens) {
      const ev = (log.events ?? []).find((e) => e.kind === "doorClosed");
      if (ev === undefined) continue;
      expect(insetEvent(log, ev.lane, ev.tick)?.kind).toBeDefined();
      return;
    }
    throw new Error("no doorClosed in the goldens");
  });
});
