import { loadContent } from "@falconess/content";
import { RACE_FRAME_FLAGS } from "@falconess/schema";
import { neutralFixtureEntry, RULESET_V2, RULESET_V3, simulateRace } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { altitudeBand, altitudeColumn } from "./altitude.js";

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const entries = (["glide", "ground", "hover", "dive"] as const).map((style, lane) =>
  neutralFixtureEntry({ runnerId: `r${lane}`, laneIndex: lane, style, stats: S600 }),
);

describe("altitude band (ruleset v3 draft)", () => {
  it("reads the band only from the two flag bits", () => {
    expect(altitudeBand(0)).toBe(0);
    expect(altitudeBand(RACE_FRAME_FLAGS.altLow)).toBe(1);
    expect(altitudeBand(RACE_FRAME_FLAGS.altHigh)).toBe(2);
    expect(
      altitudeBand(RACE_FRAME_FLAGS.altLow | RACE_FRAME_FLAGS.altHigh | RACE_FRAME_FLAGS.airborne),
    ).toBe(3);
    expect(altitudeBand(RACE_FRAME_FLAGS.airborne | RACE_FRAME_FLAGS.boosting)).toBe(0);
  });

  it("a v2 log is all ground; a v3 log shows the closer at the ceiling", () => {
    const course = content.getCourse("sprint");
    const v2 = simulateRace(RULESET_V2, entries, course, "alt");
    expect(entries.every((e) => altitudeColumn(v2, e.laneIndex).every((b) => b === 0))).toBe(true);
    const v3 = simulateRace(RULESET_V3, entries, course, "alt");
    expect(Math.max(...altitudeColumn(v3, 3))).toBe(3); // dive wings: closer by default
    expect(Math.max(...altitudeColumn(v3, 1))).toBe(0); // ground wings never rise
  });
});
