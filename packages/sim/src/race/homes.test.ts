import { loadContent } from "@falconess/content";
import { type EntryInput, PassiveSkill, RaceEntry, type RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, RULESET_V2, RULESET_V3 } from "../rulesets/index.js";
import { FLIGHT_OFF_HOMES, FLIGHT_OFF_POLISH, rulesetV3With } from "../rulesets/v3/switches.js";
import { simulateRace } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";

/**
 * Homes per track and the weak's own kit (owner 2026-11-09, .work/design7/measure/homes-final.md):
 * ADR-0009 (draft) gives a passive a flight effect in ruleset v3. Garra fija (talon-lock) dives
 * 500 ‰ harder from the high band up. v1 and v2 never read it; FLIGHT_OFF_HOMES is the balance
 * polish (6e98e90) byte for byte (homes/inv13.ts).
 */
const content = loadContent();
const S = (v: number) => ({ agility: v, stamina: v, technique: v, courage: v, intelligence: v });

function peregrina(frameId: string): EntryInput {
  const f = content.getFalconess("peregrina");
  return {
    runnerId: "player",
    kind: "player",
    falconessId: "peregrina",
    baseStats: S(600),
    mood: 0,
    positionAptitude: f.positionAptitude,
    distanceAptitude: f.distanceAptitude,
    position: "closer",
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
  };
}

/** Peregrina in lane 0 among 7 neutral closers of her stats (Garra fija is hers alone). */
function mirror(R: typeof RULESET_V3, course: string): RaceEntry[] {
  const c = content.getCourse(course);
  const me = freezeEntry(R, content, peregrina("shiden"), c, 0);
  const rest = Array.from({ length: 7 }, (_, j) => ({
    ...neutralFixtureEntry({
      runnerId: `r${j + 1}`,
      laneIndex: j + 1,
      style: "dive",
      position: "closer",
      stats: me.stats,
    }),
    distanceAptitude: "B" as const,
  }));
  return [me, ...rest];
}

const myDives = (log: RaceLog) =>
  (log.events ?? []).flatMap((e) => (e.kind === "dive" && e.lane === 0 ? [e] : []));

describe("homes: Garra fija dives harder (ADR-0009 draft)", () => {
  it("talon-lock carries a v3 flight effect: from band 2, +500 ‰ Δv (trim: less in the Sprint and the Milla)", () => {
    const s = content.getPassive("talon-lock");
    expect(PassiveSkill.parse(s)).toEqual(s);
    expect(s.flight?.diveFromBand).toBe(2);
    expect(s.flight?.diveVPm).toBe(500);
  });

  it("v1, v2 and v3 with the flag off freeze no dive trait; v3 freezes it", () => {
    const c = content.getCourse("ridge");
    for (const R of [RULESET_V1, RULESET_V2, rulesetV3With(FLIGHT_OFF_HOMES)]) {
      const e = freezeEntry(R, content, peregrina("peregrina-signature"), c, 0);
      expect(e.traits.diveSkill).toBeUndefined();
      expect("diveSkill" in e.traits).toBe(false);
    }
    const on = freezeEntry(RULESET_V3, content, peregrina("shiden"), c, 0);
    expect(on.traits.diveSkill).toEqual({ fromBand: 2, pm: 500 });
    expect(RaceEntry.parse(on)).toEqual(on);
  });

  it("her dives from band 2 and 3 gain half again, and the log names the passive", () => {
    const log = simulateRace(
      RULESET_V3,
      mirror(RULESET_V3, "ridge"),
      content.getCourse("ridge"),
      "homes-1",
    );
    const d = myDives(log);
    expect(d.length).toBeGreaterThan(0);
    for (const e of d) {
      expect(e.skillId).toBe("talon-lock");
      // gain = base × 1.5 (floored): the skill's part is a third of the gain
      expect(Math.abs((e.skillMms ?? 0) * 3 - e.gainMms)).toBeLessThanOrEqual(3);
    }
    for (const e of log.events ?? [])
      if (e.kind === "dive" && e.lane !== 0) expect(e.skillMms).toBeUndefined();
  });

  it("the flag off: no skill fields in the log, and the race is the polish's", () => {
    const off = rulesetV3With(FLIGHT_OFF_HOMES);
    const c = content.getCourse("ridge");
    const log = simulateRace(off, mirror(off, "ridge"), c, "homes-1");
    for (const e of myDives(log)) expect(e.skillMms).toBeUndefined();
    // FLIGHT_OFF_POLISH carries the homes flag too (INV-12 keeps measuring the kick on low hp)
    expect(FLIGHT_OFF_POLISH.skillFlight).toBe(false);
  });

  it("is deterministic and draws nothing more", () => {
    const c = content.getCourse("ridge");
    const a = simulateRace(RULESET_V3, mirror(RULESET_V3, "ridge"), c, "homes-2");
    const b = simulateRace(RULESET_V3, mirror(RULESET_V3, "ridge"), c, "homes-2");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
