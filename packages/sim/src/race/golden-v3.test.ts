import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogueCourses, loadContent } from "@falconess/content";
import { RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { canonicalJson, goldenDiffHint } from "./golden.js";
import { GOLDEN_V3_SCENARIOS, runGoldenV3Scenario } from "./golden-v3.js";

/**
 * The v3 golden logs (ADR-0011 §8): each scenario of `golden-v3.ts` runs with detail "full" and
 * its canonical JSON must equal `tests/golden/v3/<name>.json` byte for byte. The lead writes them
 * with `pnpm golden:update -- --set v3 --yes` and an ADR.
 */
const content = loadContent();
const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));
const courseOf = (id: string) => catalogue.get(id) ?? content.getCourse(id);
const DIR = fileURLToPath(new URL("../../../../tests/golden/v3/", import.meta.url));
const run = (s: (typeof GOLDEN_V3_SCENARIOS)[number]) =>
  canonicalJson(runGoldenV3Scenario(content, courseOf, s));

describe("v3 golden scenarios (ADR-0011)", () => {
  it("are twelve, one per catalogue track plus three equal fields, with unique seeds", () => {
    expect(GOLDEN_V3_SCENARIOS).toHaveLength(12);
    const names = GOLDEN_V3_SCENARIOS.map((s) => s.name);
    expect([...names].sort()).toEqual(names);
    expect(new Set(GOLDEN_V3_SCENARIOS.map((s) => s.seed)).size).toBe(12);
    for (const id of catalogue.keys())
      expect(GOLDEN_V3_SCENARIOS.some((s) => s.courseId === id)).toBe(true);
  });

  it("log valid v3 logs with flight: takeoffs, dives and line moves", () => {
    const kinds = new Set<string>();
    for (const s of GOLDEN_V3_SCENARIOS) {
      const log = RaceLog.parse(JSON.parse(run(s)));
      expect(log.rulesetVersion).toBe("v3");
      for (const e of log.events ?? []) kinds.add(e.kind);
    }
    for (const k of ["takeoff", "diveStart", "dive", "touchdown", "lineSwitch", "hpHit"])
      expect(kinds, k).toContain(k);
  });

  it("run twice to the same bytes", () => {
    for (const s of GOLDEN_V3_SCENARIOS) expect(run(s)).toBe(run(s));
  });

  describe.skipIf(!existsSync(DIR))("match tests/golden/v3 byte for byte", () => {
    it("has a file for every scenario and no stale file", () => {
      const files = readdirSync(DIR)
        .filter((f) => f.endsWith(".json"))
        .sort();
      expect(files).toEqual(GOLDEN_V3_SCENARIOS.map((s) => `${s.name}.json`).sort());
    });
    for (const s of GOLDEN_V3_SCENARIOS)
      it(s.name, () => {
        const want = readFileSync(join(DIR, `${s.name}.json`), "utf8");
        const got = run(s);
        if (got !== want) expect.fail(`${s.name}: ${goldenDiffHint(want, got)}`);
      });
  });
});
