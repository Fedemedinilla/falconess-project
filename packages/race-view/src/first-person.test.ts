import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type RaceLog, RaceLog as RaceLogSchema } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import {
  curvatureAt,
  FPV_EYE_M,
  FPV_FINISHED_ROWS,
  FPV_LINE_M,
  fpvCamera,
  fpvKeyRows,
  fpvRivals,
  fpvTrackAhead,
  fpvVisor,
  groundAt,
  groundProfile,
  impactAt,
} from "./first-person.js";
import { FLIGHT_PHASE, flightModel, orderAt, positionAt } from "./flight-view.js";

/** The twelve v3 golden races: real logs of the engine. */
const DIR = fileURLToPath(new URL("../../../tests/golden/v3/", import.meta.url));
const goldens: [string, RaceLog][] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => [f, RaceLogSchema.parse(JSON.parse(readFileSync(DIR + f, "utf8")))]);

function modelOf(name: string) {
  const log = goldens.find(([f]) => f.includes(name))?.[1];
  if (!log) throw new Error(name);
  const model = flightModel(log);
  if (!model) throw new Error(name);
  return { log, model };
}

describe("first-person view (from the v3 log only)", () => {
  it("her eyes rise with her bands; the nose is up in a climb and down in a dive", () => {
    let climbs = 0;
    let dives = 0;
    for (const [, log] of goldens) {
      const model = flightModel(log);
      if (!model) continue;
      for (const t of model.tracks)
        for (let r = 0; r <= model.rows; r += 1) {
          const cam = fpvCamera(model, t.lane, r);
          expect(cam.eyeM).toBeGreaterThanOrEqual(FPV_EYE_M);
          if (cam.band === 3 && cam.phase === FLIGHT_PHASE.hold)
            expect(cam.eyeM).toBeGreaterThan(FPV_EYE_M + 8);
          if (cam.phase === FLIGHT_PHASE.climb && cam.pitch > 0.3) climbs++;
          if (cam.phase === FLIGHT_PHASE.dive) {
            expect(cam.pitch).toBeLessThan(0);
            expect(cam.fovKick).toBe(1);
            dives++;
          }
          expect(Math.abs(cam.pitch)).toBeLessThanOrEqual(1);
          expect(cam.speedFx).toBeGreaterThanOrEqual(0);
          expect(cam.speedFx).toBeLessThanOrEqual(1);
        }
    }
    expect(climbs).toBeGreaterThan(50);
    expect(dives).toBeGreaterThan(20);
  });

  it("a touchdown or a landing jolts, and the jolt fades", () => {
    const { model } = modelOf("ridge-peregrina");
    let seen = 0;
    for (const t of model.tracks)
      for (const e of t.events) {
        if (e.kind !== "touchdown" && e.kind !== "landing") continue;
        expect(impactAt(t, e.tick + 1)).toBeGreaterThan(0.5);
        expect(impactAt(t, e.tick + 1)).toBeGreaterThan(impactAt(t, e.tick + 6));
        seen++;
      }
    expect(seen).toBeGreaterThan(4);
    const t = model.tracks[0];
    if (t) expect(impactAt(t, 0)).toBe(0);
  });

  it("rivals ahead: farthest first, in range, on their line up in the air", () => {
    for (const [, log] of goldens) {
      const model = flightModel(log);
      if (!model) continue;
      for (const r of [0, 100, Math.floor(model.rows / 2), model.rows - 30]) {
        for (const me of model.tracks) {
          const riv = fpvRivals(model, me.lane, r, 160);
          const mine = positionAt(me, r) / 1000;
          const expected = model.tracks.filter((o) => {
            const d = positionAt(o, r) / 1000 - mine;
            return o.lane !== me.lane && d > 0.4 && d <= 160 && r < o.finishRow + FPV_FINISHED_ROWS;
          });
          expect(riv.map((x) => x.lane).sort()).toEqual(expected.map((o) => o.lane).sort());
          for (let k = 1; k < riv.length; k++)
            expect(riv[k - 1]?.aheadM ?? 0).toBeGreaterThanOrEqual(riv[k]?.aheadM ?? 0);
          for (const x of riv)
            if (x.alt >= 1 && (x.line === 0 || x.line === 1))
              expect(x.lateralM).toBeCloseTo(FPV_LINE_M[x.line] ?? 0, 5);
        }
      }
    }
  });

  it("the track ahead is the logged segments, clipped to the window, end to end", () => {
    const { log } = modelOf("crossing-caracara");
    for (const pos of [0, 380, 1490, 3500]) {
      const ahead = fpvTrackAhead(log.geometry, pos, 200);
      expect(ahead[0]?.fromM).toBe(0);
      for (let k = 1; k < ahead.length; k++) expect(ahead[k]?.fromM).toBe(ahead[k - 1]?.toM);
      const end = Math.min(200, log.geometry.lengthMm / 1000 - pos);
      expect(ahead[ahead.length - 1]?.toM).toBeCloseTo(end, 6);
    }
    // the water at 1500-1650 shows 10 m ahead from 1490
    expect(fpvTrackAhead(log.geometry, 1490, 200).find((s) => s.type === "water")?.fromM).toBe(10);
  });

  it("a Colina rises and a Bajada falls; Curvas bend both ways, the rest is straight", () => {
    const { log } = modelOf("overlook-caracara"); // climb 700-950, descent 1000-1450
    const g = groundProfile(log.geometry);
    expect(groundAt(g, 700)).toBeCloseTo(0, 6);
    expect(groundAt(g, 950)).toBeGreaterThan(groundAt(g, 700) + 5);
    expect(groundAt(g, 975)).toBeCloseTo(groundAt(g, 950), 4);
    expect(groundAt(g, 1450)).toBeLessThan(groundAt(g, 1000) - 5);
    expect(curvatureAt(log.geometry, 100)).toBe(0);
    const bends = [310, 360, 410].map((m) => Math.sign(curvatureAt(log.geometry, m)));
    expect(bends).toEqual([bends[0], -(bends[0] ?? 0), bends[0]]);
    expect(bends[0]).not.toBe(0);
  });

  it("the visor: her place in the order, metres left, body and kick", () => {
    const { log, model } = modelOf("sprint-peregrina");
    const lane = log.results[0]?.lane ?? 0;
    let lastLeft = Number.POSITIVE_INFINITY;
    for (let r = 0; r <= model.rows; r += 15) {
      const v = fpvVisor(model, lane, r);
      expect(v.place).toBe(orderAt(model, r).indexOf(lane) + 1);
      expect(v.leftM).toBeLessThanOrEqual(lastLeft);
      lastLeft = v.leftM;
      expect(v.hpPct).toBeGreaterThanOrEqual(0);
      expect(v.hpPct).toBeLessThanOrEqual(100);
      expect(v.field).toBe(8);
    }
    const end = fpvVisor(model, lane, model.rows);
    expect(end.leftM).toBe(0);
    expect(end.finished).toBe(true);
    expect(end.place).toBe(1);
    expect(end.kickPct).not.toBeNull();
    expect(fpvVisor(model, lane, 0).kickPct).toBeNull();
  });

  it("key rows: a takeoff, a high hold, a dive and the finish of a runner who flies", () => {
    const { model } = modelOf("ridge-peregrina");
    const flier = model.tracks.find((t) => t.events.some((e) => e.kind === "dive"));
    expect(flier).toBeDefined();
    if (!flier) return;
    const k = fpvKeyRows(model, flier.lane);
    expect(k.takeoff).not.toBeNull();
    expect(k.dive).not.toBeNull();
    expect(fpvCamera(model, flier.lane, k.dive ?? 0).phase).toBe(FLIGHT_PHASE.dive);
    expect(fpvCamera(model, flier.lane, k.high ?? 0).band).toBeGreaterThanOrEqual(2);
    expect(k.finish).toBe(flier.finishRow);
  });
});
