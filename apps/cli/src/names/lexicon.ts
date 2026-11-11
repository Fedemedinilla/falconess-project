import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { dictionary } from "cmu-pronouncing-dictionary";
import type { WordData } from "./recipe.js";
import { WordNet } from "./wordnet.js";

/**
 * Loads the offline word sources from their npm packages (devDependencies of apps/cli):
 * WordNet 3.1 (wordnet-db), SUBTLEX-US frequencies (subtlex-word-frequencies) and the CMU
 * pronouncing dictionary for syllables. Takes about half a second; only `pnpm names:import` uses it.
 */
const require = createRequire(import.meta.url);

/** SUBTLEX-US counts come from a corpus of about 51 million words of film and TV subtitles. */
const SUBTLEX_CORPUS_MILLIONS = 51;

export function loadWordNet(): WordNet {
  const dict = join(dirname(require.resolve("wordnet-db/package.json")), "dict");
  return WordNet.parse(
    readFileSync(join(dict, "index.noun"), "utf8"),
    readFileSync(join(dict, "data.noun"), "utf8"),
  );
}

function loadFrequencies(): Map<string, number> {
  const raw: unknown = JSON.parse(
    readFileSync(require.resolve("subtlex-word-frequencies/index.json"), "utf8"),
  );
  if (!Array.isArray(raw)) throw new Error("subtlex-word-frequencies: expected an array");
  const out = new Map<string, number>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const word: unknown = Reflect.get(entry, "word");
    const count: unknown = Reflect.get(entry, "count");
    if (typeof word !== "string" || typeof count !== "number") continue;
    const key = word.toLowerCase();
    out.set(key, (out.get(key) ?? 0) + count / SUBTLEX_CORPUS_MILLIONS);
  }
  return out;
}

/** Syllables from CMU phones: one per vowel, and every CMU vowel carries a stress digit. */
export function cmuSyllables(phones: string): number {
  return phones.split(" ").filter((p) => /\d$/.test(p)).length;
}

export function loadWordData(): WordData {
  const freqs = loadFrequencies();
  return {
    freq: (w) => {
      const f = freqs.get(w.toLowerCase());
      return f === undefined ? undefined : Math.round(f * 1000) / 1000;
    },
    syllables: (w) => {
      const phones = dictionary[w.toLowerCase()];
      return phones === undefined ? undefined : cmuSyllables(phones);
    },
  };
}
