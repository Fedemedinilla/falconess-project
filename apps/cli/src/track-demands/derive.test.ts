import { loadCalendar } from "@falconess/content";
import { getRuleset } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import {
  demandedStats,
  deriveTrackDemands,
  letterForLevel,
  referenceWeek,
  rivalLevels,
  statWeights,
} from "./derive.js";

const cal = loadCalendar("v3");
const field = getRuleset("v3").field;

describe("track demands (docs/formulas.md «Lo que pide una pista»)", () => {
  it("reads a level on the G … S stat scale", () => {
    expect(letterForLevel(50)).toBe("G");
    expect(letterForLevel(100)).toBe("F");
    expect(letterForLevel(399)).toBe("D");
    expect(letterForLevel(400)).toBe("C");
    expect(letterForLevel(799)).toBe("B");
    expect(letterForLevel(1000)).toBe("S");
  });

  it("weighs each stat against Agility and asks Agility first, then 1-2 heavy stats", () => {
    const w = statWeights({
      agility: 50,
      stamina: 42,
      technique: 5,
      courage: -1,
      intelligence: 7,
    });
    expect(w.agility).toBe(1);
    expect(w.courage).toBe(0);
    expect(demandedStats(w)).toEqual(["agility", "stamina", "intelligence"]);
    // nothing heavy: still two stats, the heaviest other one
    expect(
      demandedStats({ agility: 1, stamina: 0, technique: 0.05, courage: 0, intelligence: 0.01 }),
    ).toEqual(["agility", "technique"]);
  });

  it("reads a track at its latest goal, else at its latest month as track of the month", () => {
    expect(referenceWeek(cal, "overlook")).toBe(46); // Cernícala T12, Peregrina T46
    expect(referenceWeek(cal, "breakaway")).toBe(24);
    expect(referenceWeek(cal, "steps")).toBe(30); // month 8: weeks 29-32
    expect(referenceWeek(cal, "crossing")).toBe(46); // month 12
  });

  it("follows the rival curve: higher letters later in the season", () => {
    const early = rivalLevels(field, 12);
    const late = rivalLevels(field, 46);
    expect(late.agility).toBeGreaterThan(early.agility);
    const m = { agility: 40, stamina: 34, technique: 4, courage: 3, intelligence: 6 };
    const a = deriveTrackDemands("breakaway", m, cal, field); // T24
    const b = deriveTrackDemands("open-sky", m, cal, field); // T46
    const rank = (x: string) => ["G", "F", "E", "D", "C", "B", "A", "S"].indexOf(x);
    expect(rank(b.demands[0]?.letter ?? "G")).toBeGreaterThan(rank(a.demands[0]?.letter ?? "G"));
    // a secondary stat never asks more than Agility
    for (const d of b.demands) expect(d.level).toBeLessThanOrEqual(b.demands[0]?.level ?? 0);
  });

  it("matches what the calendar stores: every catalogue track, 2-3 stats, Agility first", () => {
    const td = cal.trackDemands ?? {};
    for (const t of cal.catalogue) {
      const ds = td[t];
      expect(ds, t).toBeDefined();
      expect(ds?.[0]?.stat, t).toBe("agility");
      expect(ds?.length ?? 0, t).toBeGreaterThanOrEqual(2);
    }
  });
});
