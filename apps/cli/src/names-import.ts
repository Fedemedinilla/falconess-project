/**
 * Builds world files from Datamuse recipes (dev tool, needs network once per import):
 *
 *   pnpm names:import -- --recipe winds --dry-run --show-dropped
 *   pnpm names:import -- --all
 *
 * Recipes live in apps/cli/names/recipes/<id>.json and write apps/cli/names/worlds/<id>.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argString, parseArgs } from "./args.js";
import { buildWorld, fetchRecipe, parseRecipe } from "./names/recipe.js";
import { loadExcluded } from "./names/worlds.js";

const ROOT = fileURLToPath(new URL("../names/", import.meta.url));

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const recipesDir = join(ROOT, "recipes");
  const worldsDir = argString(args, "worlds", join(ROOT, "worlds"));
  const wornFile = argString(args, "worn", join(ROOT, "worn.txt"));
  const worn = wornFile === "none" ? [] : loadExcluded(wornFile);

  const ids = args.all
    ? readdirSync(recipesDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => basename(f, ".json"))
        .sort()
    : [argString(args, "recipe", "")].filter(Boolean);
  if (ids.length === 0) throw new Error("Pass --recipe <id> or --all");

  for (const id of ids) {
    const raw: unknown = JSON.parse(readFileSync(join(recipesDir, `${id}.json`), "utf8"));
    const recipe = parseRecipe(id, raw);
    const { world, dropped } = buildWorld(id, recipe, await fetchRecipe(recipe, fetchJson), worn);

    console.log(`\n${id}: ${world.words.length} kept, ${dropped.length} dropped`);
    console.log(world.words.map((w) => `${w} (f ${world.stats[w]?.freq.toFixed(2)})`).join(", "));
    if (args["show-dropped"]) {
      const byReason = new Map<string, string[]>();
      for (const d of dropped) byReason.set(d.reason, [...(byReason.get(d.reason) ?? []), d.word]);
      for (const [reason, words] of byReason) console.log(`  - ${reason}: ${words.join(", ")}`);
    }
    if (world.words.length === 0) throw new Error(`Recipe "${id}" kept no words; loosen it`);
    if (!args["dry-run"]) {
      const file = join(worldsDir, `${id}.json`);
      writeFileSync(file, `${JSON.stringify(world, null, 2)}\n`);
      console.log(`Wrote ${file}`);
    }
  }
}

const isMain =
  process.argv[1]?.endsWith("names-import.ts") || process.argv[1]?.endsWith("names-import.js");
if (isMain) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
