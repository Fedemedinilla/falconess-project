import { z } from "zod";
import { normalize } from "./normalize.js";
import { guessSyllables, type WordStats } from "./score.js";
import { SENSE_REF, type WordNetHit } from "./wordnet.js";

/**
 * A recipe says how to build a world from two sources: Datamuse (https://www.datamuse.com/api/,
 * needs network) and WordNet 3.1 (offline, from the wordnet-db package). It lists what to ask each
 * source and which words to keep. Importing writes a normal world file; generating names never
 * touches either source.
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
    /** Copied to the world: "first" for adjectives and colors. */
    position: z.enum(["first", "second", "any"]).default("any"),
    /** Datamuse queries, run in order. */
    queries: z.array(Query).default([]),
    /**
     * WordNet walk below these senses, down to `depth` levels: kinds of a noun ("wind.n.01"),
     * ways of doing a verb ("dart.v.01") or adjectives similar to one ("fast.a.01").
     */
    wordnet: z
      .object({
        roots: z
          .array(
            z.string().regex(SENSE_REF, 'use a sense reference like "wind.n.01" or "fast.a.01"'),
          )
          .min(1),
        depth: z.number().int().min(1).max(6).default(3),
        /** Include named instances (stars, places), not only kinds. */
        instances: z.boolean().default(true),
      })
      .strict()
      .optional(),
    /** Keep words used at most this often (occurrences per million words). Lower = rarer. */
    maxFreq: z.number().positive().default(5),
    /** Drop words rarer than this; below ~0.01 they are mostly taxonomy or typos. */
    minFreq: z.number().nonnegative().default(0.01),
    /**
     * What to do with words the frequency list does not know (rare WordNet lemmas such as
     * "khamsin"): keep them (stored with freq 0) or drop them.
     */
    unknownFreq: z.enum(["keep", "drop"]).default("keep"),
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
  .strict()
  .refine((r) => r.queries.length > 0 || r.wordnet !== undefined, {
    message: "a recipe needs Datamuse queries, a wordnet block, or both",
  });
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
    position?: "first" | "second";
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

/** One word offered by a source, before the recipe's filters. */
export type Candidate = {
  readonly word: string;
  /** Occurrences per million words; undefined when the source does not know it. */
  readonly freq: number | undefined;
  readonly syllables: number | undefined;
  readonly pos: readonly string[];
  readonly origin: "datamuse" | "wordnet";
  /** WordNet gloss, shown when reviewing a recipe. */
  readonly note?: string | undefined;
};

export function fromDatamuse(results: readonly (readonly DatamuseWord[])[]): Candidate[] {
  return results.flatMap((list) =>
    list.map((item) => {
      const tags = item.tags ?? [];
      const freqTag = tags.find((t) => t.startsWith("f:"));
      return {
        word: item.word,
        freq: freqTag ? Number(freqTag.slice(2)) : undefined,
        syllables: item.numSyllables,
        pos: tags,
        origin: "datamuse" as const,
      };
    }),
  );
}

/** Offline word data used to enrich WordNet lemmas (SUBTLEX-US frequency, CMU syllables). */
export type WordData = {
  freq(word: string): number | undefined;
  syllables(word: string): number | undefined;
};

/** WordNet's letters to the tags recipes filter on (Datamuse's: n, v, adj). */
const POS_TAG = { n: "n", v: "v", a: "adj" } as const;

export function fromWordNet(hits: readonly WordNetHit[], data: WordData): Candidate[] {
  return hits.map((h) => ({
    word: h.word,
    freq: data.freq(h.word),
    syllables: data.syllables(h.word),
    pos: [POS_TAG[h.pos]],
    origin: "wordnet" as const,
    note: h.gloss,
  }));
}

export type Kept = {
  readonly word: string;
  readonly origin: Candidate["origin"];
  readonly note?: string | undefined;
};

/**
 * Pure part of the import: applies the recipe's filters to the candidates (first occurrence wins,
 * so Datamuse data beats WordNet data for a word both offer). Words come out sorted so re-imports
 * give clean diffs.
 */
export function filterCandidates(
  id: string,
  recipe: Recipe,
  candidates: readonly Candidate[],
  worn: readonly string[],
): ImportedWorld & { readonly kept: readonly Kept[] } {
  const deny = new Set(recipe.deny.map(normalize));
  const wornSet = new Set(worn.map(normalize));
  const kept = new Map<string, WordStats>();
  const keptInfo: Kept[] = [];
  const dropped: Dropped[] = [];
  const seen = new Set<string>();
  const origins = new Set<string>();
  const [minSyl, maxSyl] = recipe.syllables;

  for (const c of candidates) {
    const key = normalize(c.word);
    if (seen.has(key)) continue;
    seen.add(key);
    const freq = c.freq;
    const syllables = c.syllables ?? guessSyllables(c.word);
    const reason = !/^[A-Za-z]+$/.test(c.word)
      ? "not a single plain word"
      : deny.has(key)
        ? "denied"
        : wornSet.has(key)
          ? "worn"
          : !c.pos.some((t) => (recipe.pos as readonly string[]).includes(t))
            ? `part of speech not in ${recipe.pos.join("/")}`
            : freq === undefined
              ? recipe.unknownFreq === "drop"
                ? "frequency unknown"
                : undefined
              : !(freq <= recipe.maxFreq)
                ? `too common (f ${freq})`
                : freq < recipe.minFreq
                  ? `too rare (f ${freq})`
                  : undefined;
    const shape =
      reason ??
      (syllables < minSyl || syllables > maxSyl
        ? `${syllables} syllables`
        : c.word.length > recipe.maxLength
          ? "too long"
          : c.word.length < recipe.minLength
            ? "too short"
            : undefined);
    if (shape) {
      dropped.push({ word: c.word, reason: shape });
      continue;
    }
    const word = capitalize(c.word);
    kept.set(word, { freq: freq ?? 0, syllables });
    keptInfo.push({ word, origin: c.origin, note: c.note });
    origins.add(c.origin);
  }

  const words = [...kept.keys()].sort();
  const stats: Record<string, WordStats> = {};
  for (const w of words) {
    const st = kept.get(w);
    if (st) stats[w] = st;
  }
  const sourceKinds = ["datamuse", "wordnet"].filter((o) => origins.has(o)).join("+") || "none";
  return {
    world: {
      name: recipe.name,
      lang: recipe.lang,
      ...(recipe.role === "house" ? { role: "house" as const } : {}),
      ...(recipe.position === "any" ? {} : { position: recipe.position }),
      provisional: true,
      source: `${sourceKinds}:recipes/${id}.json`,
      words,
      stats,
    },
    dropped,
    kept: keptInfo.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0)),
  };
}

/** Datamuse-only shortcut, kept for callers that only have Datamuse results. */
export function buildWorld(
  id: string,
  recipe: Recipe,
  results: readonly (readonly DatamuseWord[])[],
  worn: readonly string[],
): ImportedWorld {
  const { world, dropped } = filterCandidates(id, recipe, fromDatamuse(results), worn);
  return { world, dropped };
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
