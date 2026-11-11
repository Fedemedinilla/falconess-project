/**
 * Builds world files from recipes that combine Datamuse (network) and WordNet (offline):
 *
 *   pnpm names:import -- --senses wind
 *   pnpm names:import -- --recipe winds --dry-run --show-dropped --glosses
 *   pnpm names:import -- --all
 *
 * Recipes live in apps/cli/names/recipes/<id>.json and write apps/cli/names/worlds/<id>.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argString, parseArgs } from "./args.js";
import { loadWordData, loadWordNets } from "./names/lexicon.js";
import {
  type Candidate,
  fetchRecipe,
  filterCandidates,
  fromDatamuse,
  fromWordNet,
  parseRecipe,
  type WordData,
} from "./names/recipe.js";
import { type WordNets, walk } from "./names/wordnet.js";
import { loadExcluded } from "./names/worlds.js";

const ROOT = fileURLToPath(new URL("../names/", import.meta.url));

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

let offline: { wordnet: WordNets; data: WordData } | undefined;
function lexicon(): { wordnet: WordNets; data: WordData } {
  offline ??= { wordnet: loadWordNets(), data: loadWordData() };
  return offline;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);

  const senses = args.senses;
  if (typeof senses === "string") {
    const nets = lexicon().wordnet;
    const found = [...nets.n.senses(senses), ...nets.v.senses(senses), ...nets.a.senses(senses)];
    if (found.length === 0) console.log(`WordNet has no "${senses}".`);
    for (const s of found)
      console.log(`${s.ref.padEnd(22)} ${s.words.join(", ")}\n${"".padEnd(22)} ${s.gloss}`);
    return;
  }

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
  if (ids.length === 0) throw new Error("Pass --recipe <id>, --all or --senses <word>");

  for (const id of ids) {
    const raw: unknown = JSON.parse(readFileSync(join(recipesDir, `${id}.json`), "utf8"));
    const recipe = parseRecipe(id, raw);
    const candidates: Candidate[] = [];
    if (recipe.queries.length > 0)
      candidates.push(...fromDatamuse(await fetchRecipe(recipe, fetchJson)));
    if (recipe.wordnet) {
      const { wordnet, data } = lexicon();
      const { roots, depth, instances, includeRoots } = recipe.wordnet;
      candidates.push(...fromWordNet(walk(wordnet, roots, depth, instances, includeRoots), data));
    }
    const { world, dropped, kept } = filterCandidates(id, recipe, candidates, worn);

    const fromWn = kept.filter((k) => k.origin === "wordnet").length;
    console.log(
      `\n${id}: ${world.words.length} kept (${world.words.length - fromWn} Datamuse, ${fromWn} WordNet), ${dropped.length} dropped`,
    );
    if (args.glosses)
      for (const k of kept)
        console.log(
          `  ${k.word.padEnd(12)} ${k.origin === "wordnet" ? "wn" : "dm"}  ${k.note ?? ""}`,
        );
    else
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
