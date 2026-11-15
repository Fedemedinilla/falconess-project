import { readdirSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_ROOT } from "@falconess/content";
import { seasonGoalsOf, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { testContext, testScenes } from "./content";

describe("the flow tests' content, read from disk as the app reads it", () => {
  it("every story scene, validated, in file order (as `allScenes()`)", () => {
    const files = readdirSync(join(CONTENT_ROOT, "story"))
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect(testScenes().map((s) => `${s.id}.json`)).toEqual(files);
    expect(testScenes()).toBe(testScenes());
  });
  it("a v3 season races the calendar's goals (the catalogue tracks joined)", () => {
    const ctx = testContext("v3");
    const s = startSeason(ctx, "testing-1", {
      kind: "start",
      falconessId: "peregrina",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
    });
    const goals = seasonGoalsOf(ctx, s);
    expect(goals.length).toBe(5);
    for (const g of goals) expect(ctx.content.courses.has(g.courseId)).toBe(true);
  });
});
