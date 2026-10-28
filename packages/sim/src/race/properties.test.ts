import { describe, expect, it } from "vitest";
import {
  frameEntry,
  noBoost,
  raceProperties,
  solo,
  testCourse,
} from "../../tests/support/race-properties.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";

/**
 * Properties of docs/race-engine.md 24.2 on the spec ruleset (the suite is
 * packages/sim/tests/support/race-properties.ts; properties-live.test.ts runs it on RULESET_V1),
 * plus the two measured counterexamples behind ADR-0003 D52, pinned to SPEC_RULESET.
 */

describe("SPEC_RULESET", () => raceProperties(SPEC_RULESET));

describe("P3 tier (a) with exhaustion: the measured counterexamples behind ADR-0003 D52", () => {
  it("erzherzog A 1003 → 1004 (St 133, T 50, C 354, I 50), 2456 m flat, no boost: +324 mt, as in the prototype", () => {
    const NO_BOOST = noBoost(SPEC_RULESET);
    const course = testCourse([{ type: "flat", length: 2456 }], "flat-mono");
    const base = { agility: 1003, stamina: 133, technique: 50, courage: 354, intelligence: 50 };
    const lo = solo(NO_BOOST, frameEntry(SPEC_RULESET, "erzherzog", base, course), course);
    const hi = solo(
      NO_BOOST,
      frameEntry(SPEC_RULESET, "erzherzog", { ...base, agility: 1004 }, course),
      course,
    );
    // the faster runner enters the final one tick earlier (one more tick at the final drain),
    // empties hp one tick earlier and crawls 1.5 m more at vMin
    expect([lo.milli, hi.milli, lo.exhausted, hi.exhausted]).toEqual([
      1_725_857,
      1_726_181,
      true,
      true,
    ]);
    expect(hi.milli * 1000).toBeLessThanOrEqual(lo.milli * 1005); // within tier (c), D52
  });

  it("caracara-signature A 1151 → 1152 (St 50, T 50, C 50, I 50), 2386 m flat, no boost: +1209 mt (more than a tick), as in the prototype", () => {
    // found by P3 (a) once the signature frames joined the pool; the prototype gives the same
    // 2 121 418 / 2 122 627 mt, hp empty at 1927.914 / 1924.566 m
    const NO_BOOST = noBoost(SPEC_RULESET);
    const course = testCourse([{ type: "flat", length: 2386 }], "flat-mono");
    const base = { agility: 1151, stamina: 50, technique: 50, courage: 50, intelligence: 50 };
    const lo = solo(NO_BOOST, frameEntry(SPEC_RULESET, "caracara-signature", base, course), course);
    const hi = solo(
      NO_BOOST,
      frameEntry(SPEC_RULESET, "caracara-signature", { ...base, agility: 1152 }, course),
      course,
    );
    expect([lo.milli, hi.milli, lo.exhausted, hi.exhausted]).toEqual([
      2_121_418,
      2_122_627,
      true,
      true,
    ]);
    expect(hi.milli * 1000).toBeLessThanOrEqual(lo.milli * 1005); // within tier (c), D52
  });
});
