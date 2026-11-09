import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course, Position, RaceEntry, RaceLog, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { simulateRace } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { FLIGHT_OFF_KICK, FLIGHT_V3_E1, RULESET_V3, rulesetV3 } from "./flight.js";
import { KICK_OFF, kickPm } from "./sprint.js";

/**
 * The kick on low hp (owner, 2026-11-09): the hp she holds beyond the cruise to the line, in ‰ of
 * her bar, decides the share of her energy the spurt and the kick may spend (a straight line from 0
 * to `kickHiPm`); the traffic's hits shrink by her Resistencia twice. FLIGHT_OFF_KICK is stamina
 * pays effort (31f801b) byte for byte (.work/design7/kick/inv11.ts).
 */
const content = loadContent();
const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));
const courseOf = (id: string): Course => catalogue.get(id) ?? content.getCourse(id);
const S = (v: number) => ({ agility: v, stamina: v, technique: v, courage: v, intelligence: v });
const ORDER: readonly [Style, Position][] = [
  ["glide", "lead"],
  ["ground", "pack"],
  ["hover", "stalk"],
  ["dive", "closer"],
];
function field(stamina: number): RaceEntry[] {
  return Array.from({ length: 8 }, (_, j) => {
    const [style, position] = ORDER[j % 4] ?? ["glide", "lead"];
    const e = neutralFixtureEntry({
      runnerId: `r${j}`,
      laneIndex: j,
      style,
      position,
      stats: { ...S(450), stamina },
    });
    return { ...e, distanceAptitude: "B" as const };
  });
}
const plans = (log: RaceLog) =>
  (log.events ?? []).flatMap((e) => (e.kind === "sprintPlan" ? [e] : []));

describe("the kick on low hp", () => {
  it("kick(h) is 1000 from hi up, 0 at lo and below, a monotone straight line between", () => {
    const K = { hiPm: 150, loPm: 0, pace: false, paceMinPm: 0 };
    expect(kickPm(K, 150)).toBe(1000);
    expect(kickPm(K, 900)).toBe(1000);
    expect(kickPm(K, 0)).toBe(0);
    expect(kickPm(K, -40)).toBe(0);
    expect(kickPm(K, 75)).toBe(500);
    let prev = -1;
    for (let h = -10; h <= 160; h++) {
      const k = kickPm(K, h);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k - Math.max(0, prev)).toBeLessThanOrEqual(7);
      prev = k;
    }
    expect(kickPm(KICK_OFF, 0)).toBe(1000);
  });

  it("only the sprint's plans carry it, and a low bar spends less of the tank", () => {
    const sprint = courseOf("sprint");
    let low = 0;
    let lowLeft = 0;
    let fullLeft = 0;
    let full = 0;
    for (let k = 0; k < 6; k++) {
      const log = simulateRace(RULESET_V3, field(300), sprint, `kick/${k}`, { detail: "full" });
      for (const p of plans(log)) {
        expect(p.kickPm).toBeGreaterThanOrEqual(0);
        expect(p.kickPm).toBeLessThanOrEqual(1000);
      }
      const last = new Map<number, number>();
      for (const p of plans(log)) last.set(p.lane, p.kickPm ?? 1000);
      for (const r of log.results) {
        const kp = last.get(r.lane) ?? 1000;
        const left = r.energyEnd;
        if (kp < 500) {
          low++;
          lowLeft += left;
        } else if (kp === 1000) {
          full++;
          fullLeft += left;
        }
      }
    }
    expect(low).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(0);
    expect(lowLeft / low).toBeGreaterThan(fullLeft / full);
    const ridge = simulateRace(RULESET_V3, field(450), courseOf("ridge"), "kick/ridge", {
      detail: "full",
    });
    for (const p of plans(ridge)) expect(p.kickPm).toBeUndefined();
  });

  it("the traffic's hits shrink by her Resistencia twice; the plan's once", () => {
    expect(FLIGHT_V3_E1.hpTrafficSq).toBe(true);
    const log = (st: number) =>
      simulateRace(RULESET_V3, field(st), courseOf("sprint"), "kick/sq", { detail: "full" });
    const per = (l: RaceLog, cause: string) =>
      (l.events ?? []).flatMap((e) => (e.kind === "hpHit" && e.cause === cause ? [e.hp] : []));
    const a = per(log(300), "takeoff");
    const b = per(log(750), "takeoff");
    expect(a.length).toBeGreaterThan(0);
    // takeoff 30 hp at stamina 0: × 1.2e6 / (1.2e6 + 1200 × St) once
    expect(Math.max(...a)).toBe(Math.floor((30e6 * 1_200_000) / 1_560_000 / 1000));
    expect(Math.max(...b)).toBe(Math.floor((30e6 * 1_200_000) / 2_100_000 / 1000));
  });

  it("off: no kickPm in the log", () => {
    const off = rulesetV3(1, FLIGHT_OFF_KICK);
    const l = simulateRace(off, field(300), courseOf("sprint"), "kick/off", { detail: "full" });
    for (const p of plans(l)) {
      expect(p.kickPm).toBeUndefined();
      expect(p.pacePm).toBeUndefined();
    }
  });
});
