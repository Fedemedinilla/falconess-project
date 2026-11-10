import { loadCatalogueCourses } from "@falconess/content";
import type { Course, RaceEntry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { simulateRace } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";
import {
  FLIGHT_OFF_JUMPSKIM,
  FLIGHT_OFF_TRIM,
  FLIGHT_V3_E1,
  RULESET_V3,
  rulesetV3,
} from "./flight.js";

/**
 * Engine bug (barandas-balance.md §2 and §8, trim-final.md): the Punta's planned skim (band 1) that
 * starts inside a Salto she jumps on her legs was lost. The jump already holds band 1, so the
 * takeoff found no band above it, logged `noLift` and never retried: she ran the whole race on the
 * ground. With `jumpHoldsSkim` she keeps the jump's band 1 as her skim (no climb); off, v3 is the
 * trim (f08bde5) byte for byte (.work/design7/fix/inv15.ts).
 */
const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));

/** The Escapada's first draft: its start Salto (100-160 m) runs straight into the first Colina. */
function draft(): Course {
  const c = catalogue.get("breakaway");
  if (c === undefined) throw new Error("breakaway is missing from the v3 catalogue");
  const segs = c.segments.filter((_, j) => j !== 2);
  return {
    ...c,
    id: "breakaway-draft",
    segments: [...segs.slice(0, -1), { type: "canyon", length: 820 }],
  };
}

function field(): RaceEntry[] {
  const S = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
  const plan = [
    ["lead", "glide"],
    ["lead", "hover"],
    ["pack", "ground"],
    ["pack", "dive"],
    ["stalk", "hover"],
    ["stalk", "glide"],
    ["closer", "dive"],
    ["closer", "ground"],
  ] as const;
  return plan.map(([position, style], lane) => ({
    ...neutralFixtureEntry({ runnerId: `r${lane}`, laneIndex: lane, style, position, stats: S }),
    distanceAptitude: "B" as const,
  }));
}

const leads = [0, 1];

describe("fix: a skim planned inside a Salto she jumps on her legs", () => {
  it("is flown: the Punta takes off once, never logs noLift, and spends a third of the race in the air", () => {
    const c = draft();
    for (const seed of ["jumpskim-1", "jumpskim-2", "jumpskim-3"]) {
      const log = simulateRace(RULESET_V3, field(), c, seed, { detail: "full" });
      for (const lane of leads) {
        const r = log.results.find((x) => x.runnerId === `r${lane}`);
        const f = r?.ledger.flight;
        expect(f?.flights).toBeGreaterThanOrEqual(1);
        expect(f?.noLift).toBe(0);
        const ticks = (r?.ledger.phaseTicks ?? [0, 0, 0]).reduce((a, b) => a + b, 0);
        expect((f?.airTicks ?? 0) / ticks).toBeGreaterThan(0.3);
        const first = (log.events ?? []).find((e) => e.kind === "takeoff" && e.lane === lane);
        // she takes off from the jump's band 1, with no climb to pay
        expect(first).toMatchObject({ band: 1, fromBand: 1, cost: 0 });
      }
    }
  });

  it("with the fix off the skim is lost, as on f08bde5 (the bug this pins)", () => {
    const c = draft();
    const log = simulateRace(rulesetV3(1, FLIGHT_OFF_JUMPSKIM), field(), c, "jumpskim-1");
    for (const lane of leads) {
      const f = log.results.find((x) => x.runnerId === `r${lane}`)?.ledger.flight;
      expect(f?.flights).toBe(0);
      expect(f?.noLift).toBe(1);
    }
  });

  it("FLIGHT_OFF_TRIM carries the fix's flag (INV-14 keeps measuring the homes engine)", () => {
    expect(FLIGHT_OFF_TRIM.jumpHoldsSkim).toBe(false);
    expect(FLIGHT_V3_E1.jumpHoldsSkim).toBe(true);
  });
});
