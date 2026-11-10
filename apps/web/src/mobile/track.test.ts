import { getRuleset, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent, seasonCalendar, seasonContent } from "../content/load";
import { MIN_PIECE_PM, trackCard, trackDemands, trackFeatures, trackStrip } from "./track";

const v3: SimContext = { ruleset: getRuleset("v3"), content: seasonContent("v3") };

describe("track card view model", () => {
  it("draws every segment as wide as its length, the short ones at least MIN_PIECE_PM", () => {
    const crossing = v3.content.getCourse("crossing");
    const strip = trackStrip(crossing);
    expect(strip).toHaveLength(crossing.segments.length);
    expect(strip.reduce((sum, p) => sum + p.widthPm, 0)).toBe(1000);
    expect(strip[0]?.fromPm).toBe(0);
    strip.forEach((p, i) => {
      expect(p.widthPm).toBeGreaterThanOrEqual(MIN_PIECE_PM - 1);
      if (i > 0) expect(p.fromPm).toBe((strip[i - 1]?.fromPm ?? 0) + (strip[i - 1]?.widthPm ?? 0));
    });
    // the 900 m home straight is the widest piece, and the only final one
    const widest = [...strip].sort((a, b) => b.widthPm - a.widthPm)[0];
    expect(widest?.final).toBe(true);
    expect(strip.filter((p) => p.final)).toHaveLength(1);
  });

  it("keeps a 60 m Salto visible on a long track", () => {
    const strip = trackStrip({
      segments: [
        { type: "flat", length: 3000 },
        { type: "jump", length: 60, liftRequired: 10 },
        { type: "flat", length: 540 },
      ],
    });
    expect(strip[1]?.widthPm).toBe(MIN_PIECE_PM);
    expect(strip.reduce((sum, p) => sum + p.widthPm, 0)).toBe(1000);
  });

  it("lists the features in order with their count; no straight when it ends in the Pasillo", () => {
    expect(trackFeatures(v3.content.getCourse("steps"))).toEqual([
      { kind: "jump", count: 3 },
      { kind: "curves", count: 1 },
      { kind: "final", count: 1 },
    ]);
    const breakaway = trackFeatures(v3.content.getCourse("breakaway"));
    expect(breakaway.map((f) => f.kind)).toEqual(["jump", "climb", "curves", "canyon"]);
    expect(trackStrip(v3.content.getCourse("breakaway")).some((p) => p.final)).toBe(false);
  });

  it("reads the demands from the v3 calendar: Agility first, letters only", () => {
    const cal = seasonCalendar("v3");
    for (const id of cal?.catalogue ?? []) {
      const ds = trackDemands("v3", id);
      expect(ds.length, id).toBeGreaterThanOrEqual(2);
      expect(ds.length, id).toBeLessThanOrEqual(3);
      expect(ds[0]?.stat, id).toBe("agility");
      for (const d of ds) expect(Object.keys(d).sort()).toEqual(["letter", "stat"]);
    }
    // the long tracks ask for Stamina, the short ones do not
    expect(trackDemands("v3", "crossing").map((d) => d.stat)).toContain("stamina");
    expect(trackDemands("v3", "sprint").map((d) => d.stat)).not.toContain("stamina");
    // v1 and v2 have no calendar: nothing to ask
    expect(seasonCalendar("v2")).toBeUndefined();
    expect(trackDemands("v2", "sprint")).toEqual([]);
  });

  it("puts the track's class, profile and flavor on one card", () => {
    const card = trackCard(v3, "open-sky");
    expect(card.distance).toBe("long");
    expect(card.lengthM).toBe(2800);
    expect(card.nameKey).toBe("course.open-sky");
    expect(v3.content.text.has(card.flavorKey)).toBe(true);
    expect(card.demands).toEqual(trackDemands("v3", "open-sky"));
    // without flight (v1) there is no distance class
    const v1: SimContext = { ruleset: getRuleset("v1"), content: getContent() };
    expect(trackCard(v1, "sprint").distance).toBeUndefined();
  });

  it("has a flavor line for every catalogue track", () => {
    for (const id of seasonCalendar("v3")?.catalogue ?? [])
      expect(v3.content.text.has(`course.${id}.flavor`), id).toBe(true);
  });
});
