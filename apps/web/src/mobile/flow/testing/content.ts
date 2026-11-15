/**
 * The content the flow tests play on, read from disk in node (the native `web-flow` project has
 * no Vite, so no `import.meta.glob`): what `simContext` and `allScenes()` give the app.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_ROOT, loadSeasonContent } from "@falconess/content";
import { StoryScene } from "@falconess/schema";
import { getRuleset, type SimContext } from "@falconess/sim";

/** A ruleset's simulation context, as `simContext` gives it in the app (Spanish text). */
export function testContext(rulesetVersion: string): SimContext {
  return { ruleset: getRuleset(rulesetVersion), content: loadSeasonContent(rulesetVersion) };
}

let scenes: readonly StoryScene[] | undefined;

/** Every story scene, validated, in file order (as `allScenes()`). */
export function testScenes(): readonly StoryScene[] {
  const dir = join(CONTENT_ROOT, "story");
  scenes ??= readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => StoryScene.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
  return scenes;
}
