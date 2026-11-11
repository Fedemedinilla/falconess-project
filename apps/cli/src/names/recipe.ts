import { z } from "zod";
import { normalize } from "./normalize.js";
import type { WordStats } from "./score.js";

/**
 * A recipe says how to build a world from Datamuse (https://www.datamuse.com/api/): which queries
 * to run and which words to keep. Importing is a one-off network step that writes a normal world
 * file; generating names never touches the network.
 */
const Query = z
  .string()
  .regex(/^[a-z_]+=[^&=]+(&[a-z_]+=[^&=]+)*$/, "use Datamuse query syntax, e.g. rel_gen=wind")
  .refine((q) => !/(^|&)(md|max)=/.test(q), "md and max are set by the importer");

export const RecipeFile = z
  .object({
    name: z.string().min(1),
    lang: z.string().min(2),
    role: z.enum(["word", "house"]).default("word"),
    queries: z.array(Query).min(1),
    /** Keep words used at most this often (occurrences per million words). Lower = rarer. */
    maxFreq: z.number().positive().default(5),
    /** Drop words rarer than this; below ~0.01 they are mostly taxonomy or typos. */
    minFreq: z.number().nonnegative().default(0.01),
    syllables: z.tuple([z.number().int().positive(), z.number().int().positive()]).default([1, 3]),
    minLength: z.number().int().positive().default(3),
    maxLength: z.number().int().positive().default(10),
    /** Parts of speech to keep (Datamuse tags: n, v, adj, adv). */
    pos: z
      .array(z.enum(["n", "v", "adj", "adv"]))
      .min(1)
      .default(["n"]),
    /** Words reviewed by hand and rejected: wrong sense, ugly, too close to a real name. */
    deny: z.array(z.string().min(1)).default([]),
    /** Results per query requested from Datamuse. */
    perQuery: z.number().int().positive().max(1000).default(200),
  })
  .strict();
export type Recipe = z.infer<typeof RecipeFile>;

export function parseRecipe(id: string, raw: unknown): Recipe {
  const parsed = RecipeFile.safeParse(raw);
  if (!parsed.success) throw new Error(`Recipe "${id}": ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

const DatamuseWord = z.object({
  word: z.string(),
  numSyllables: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
});
export const DatamuseResponse = z.array(DatamuseWord);
export type DatamuseWord = z.infer<typeof DatamuseWord>;

export function datamuseUrl(query: string, perQuery: number): string {
  return `https://api.datamuse.com/words?${query}&md=fsp&max=${perQuery}`;
}

export type Dropped = { readonly word: string; readonly reason: string };

export type ImportedWorld = {
  readonly world: {
    name: string;
    lang: string;
    role?: "house";
    provisional: true;
    source: string;
    words: string[];
    stats: Record<string, WordStats>;
  };
  readonly dropped: readonly Dropped[];
};

function capitalize(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * Pure part of the import: filters the raw Datamuse results of every query (in recipe order) into
 * a world. Words come out sorted so re-imports give clean diffs.
 */
export function buildWorld(
  id: string,
  recipe: Recipe,
  results: readonly (readonly DatamuseWord[])[],
  worn: readonly string[],
): ImportedWorld {
  const deny = new Set(recipe.deny.map(normalize));
  const wornSet = new Set(worn.map(normalize));
  const kept = new Map<string, WordStats>();
  const dropped: Dropped[] = [];
  const seen = new Set<string>();
  const [minSyl, maxSyl] = recipe.syllables;

  for (const list of results) {
    for (const item of list) {
      const key = normalize(item.word);
      if (seen.has(key)) continue;
      seen.add(key);
      const tags = item.tags ?? [];
      const freqTag = tags.find((t) => t.startsWith("f:"));
      const freq = freqTag ? Number(freqTag.slice(2)) : Number.NaN;
      const syllables = item.numSyllables ?? 0;
      const reason = !/^[a-z]+$/.test(item.word)
        ? "not a single plain word"
        : deny.has(key)
          ? "denied"
          : wornSet.has(key)
            ? "worn"
            : !tags.some((t) => (recipe.pos as readonly string[]).includes(t))
              ? `part of speech not in ${recipe.pos.join("/")}`
              : !(freq <= recipe.maxFreq)
                ? `too common (f ${freq})`
                : freq < recipe.minFreq
                  ? `too rare (f ${freq})`
                  : syllables < minSyl || syllables > maxSyl
                    ? `${syllables} syllables`
                    : item.word.length > recipe.maxLength
                      ? "too long"
                      : item.word.length < recipe.minLength
                        ? "too short"
                        : undefined;
      if (reason) dropped.push({ word: item.word, reason });
      else kept.set(capitalize(item.word), { freq, syllables });
    }
  }

  const words = [...kept.keys()].sort();
  const stats: Record<string, WordStats> = {};
  for (const w of words) {
    const s = kept.get(w);
    if (s) stats[w] = s;
  }
  return {
    world: {
      name: recipe.name,
      lang: recipe.lang,
      ...(recipe.role === "house" ? { role: "house" as const } : {}),
      provisional: true,
      source: `datamuse:recipes/${id}.json`,
      words,
      stats,
    },
    dropped,
  };
}

export type FetchJson = (url: string) => Promise<unknown>;

/** Network part: runs each query in order; `fetchJson` is injectable so tests stay offline. */
export async function fetchRecipe(recipe: Recipe, fetchJson: FetchJson): Promise<DatamuseWord[][]> {
  const out: DatamuseWord[][] = [];
  for (const q of recipe.queries) {
    const url = datamuseUrl(q, recipe.perQuery);
    const parsed = DatamuseResponse.safeParse(await fetchJson(url));
    if (!parsed.success) throw new Error(`Unexpected Datamuse response for ${url}`);
    out.push(parsed.data);
  }
  return out;
}
