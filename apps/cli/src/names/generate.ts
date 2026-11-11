import { Rng, type StreamName } from "@falconess/rng";
import { normalize } from "./normalize.js";
import {
  type Alliteration,
  guessSyllables,
  type ScoreReason,
  scoreName,
  type WordStats,
} from "./score.js";

export { normalize } from "./normalize.js";

/**
 * A "world" is a themed list of words. Names come from joining one word of world A with one word
 * of world B ("Special" + "Week"), optionally after a house word (a family prefix like "Mejiro").
 */
export type World = {
  readonly id: string;
  readonly name: string;
  readonly lang: string;
  /** "house" worlds only act as a prefix and are left out of "any with any" pairing. */
  readonly role: "word" | "house";
  readonly provisional: boolean;
  readonly words: readonly string[];
  readonly source?: string | undefined;
  /** Imported per-word data, keyed by the word as written in `words`. */
  readonly stats?: Readonly<Record<string, WordStats>> | undefined;
};

export type GenerateOptions = {
  readonly seed: string;
  readonly count: number;
  /** World id for the first word; undefined means any "word" world. */
  readonly a: string | undefined;
  /** World id for the second word; undefined means any "word" world other than the first. */
  readonly b: string | undefined;
  /** World id for an optional prefix (school, manufacturer). */
  readonly house: string | undefined;
  /** Maximum length of the whole name, spaces included. */
  readonly maxChars: number;
  /** Maximum number of words in the whole name; undefined means no limit. */
  readonly maxWords: number | undefined;
  /** "fixed": world A always goes first. "free": the two words may swap. */
  readonly order: "fixed" | "free";
  /**
   * Excluded entries. A single-word entry bans that word anywhere in the name; a multi-word entry
   * bans that exact name. Case and accents are ignored.
   */
  readonly excluded: readonly string[];
  /** Draw budget before giving up; defaults to 200 per requested name. */
  readonly maxAttempts?: number;
  /**
   * Ranking. When set, the generator gathers `pool` × count valid candidates, scores them and keeps
   * the best `count` (ties keep draw order). When undefined, names come out in draw order.
   */
  readonly rank?: RankOptions | undefined;
};

export type RankOptions = {
  /** Normalized single words that sound worn out; each costs points. */
  readonly worn: readonly string[];
  readonly alliteration: Alliteration;
  /** Candidates gathered per requested name; defaults to 8. */
  readonly pool?: number;
  /** How many names in the list may share one word (house words excluded); defaults to 2. */
  readonly maxRepeat?: number;
  /** Favorite names; every word in them earns +1 when it shows up again. */
  readonly favorites?: readonly string[];
};

export type GeneratedName = {
  readonly name: string;
  readonly house: string | undefined;
  readonly first: string;
  readonly second: string;
  readonly firstWorld: string;
  readonly secondWorld: string;
  /** Present when ranking is on. */
  readonly score?: number | undefined;
  readonly reasons?: readonly ScoreReason[] | undefined;
};

export type GenerateResult = {
  readonly names: readonly GeneratedName[];
  readonly attempts: number;
  /** True when the draw budget ran out before reaching `count` (filters too strict). */
  readonly exhausted: boolean;
};

/**
 * The game's streams belong to the simulation; this dev tool lives outside it, so it borrows one
 * stream from an Rng seeded under its own "names:" prefix and never shares state with a season.
 */
const STREAM: StreamName = "events";

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.nextInt(STREAM, items.length)];
  if (item === undefined) throw new Error("pick: empty list");
  return item;
}

function findWorld(worlds: readonly World[], id: string): World {
  const w = worlds.find((x) => x.id === id);
  if (!w) {
    const known = worlds.map((x) => x.id).join(", ");
    throw new Error(`Unknown world "${id}". Known worlds: ${known}`);
  }
  if (w.words.length === 0) throw new Error(`World "${id}" has no words`);
  return w;
}

export function generateNames(worlds: readonly World[], opts: GenerateOptions): GenerateResult {
  if (!Number.isInteger(opts.count) || opts.count <= 0)
    throw new Error(`count must be a positive integer, got ${opts.count}`);
  if (!Number.isInteger(opts.maxChars) || opts.maxChars <= 0)
    throw new Error(`maxChars must be a positive integer, got ${opts.maxChars}`);
  if (opts.maxWords !== undefined && (!Number.isInteger(opts.maxWords) || opts.maxWords <= 0))
    throw new Error(`maxWords must be a positive integer, got ${opts.maxWords}`);

  const fixedA = opts.a === undefined ? undefined : findWorld(worlds, opts.a);
  const fixedB = opts.b === undefined ? undefined : findWorld(worlds, opts.b);
  const house = opts.house === undefined ? undefined : findWorld(worlds, opts.house);
  const pool = worlds.filter((w) => w.role === "word" && w.words.length > 0);
  if ((!fixedA || !fixedB) && pool.length === 0)
    throw new Error('No "word" worlds available to pick from');

  const bannedWords = new Set<string>();
  const bannedNames = new Set<string>();
  for (const entry of opts.excluded) {
    const t = tokens(entry);
    if (t.length === 1 && t[0]) bannedWords.add(t[0]);
    else if (t.length > 1) bannedNames.add(t.join(" "));
  }

  const rng = new Rng(`names:${opts.seed}`);
  const rank = opts.rank;
  const wanted = rank ? opts.count * (rank.pool ?? 8) : opts.count;
  const worn = new Set((rank?.worn ?? []).map(normalize));
  const liked = new Set((rank?.favorites ?? []).flatMap((f) => tokens(f)));
  const syllables = (w: World, word: string) => w.stats?.[word]?.syllables ?? guessSyllables(word);
  const maxAttempts = opts.maxAttempts ?? opts.count * 200;
  const seen = new Set<string>();
  const names: GeneratedName[] = [];
  let attempts = 0;

  while (names.length < wanted && attempts < maxAttempts) {
    attempts++;
    const wa = fixedA ?? pick(rng, pool);
    const others = pool.length > 1 ? pool.filter((w) => w.id !== wa.id) : pool;
    const wb = fixedB ?? pick(rng, others);

    let first = { word: pick(rng, wa.words), world: wa };
    let second = { word: pick(rng, wb.words), world: wb };
    if (opts.order === "free" && rng.nextInt(STREAM, 2) === 1) [first, second] = [second, first];
    const houseWord = house ? pick(rng, house.words) : undefined;

    const name = [houseWord, first.word, second.word].filter((x) => x !== undefined).join(" ");
    const t = tokens(name);
    const key = t.join(" ");

    if (new Set(t).size !== t.length) continue;
    if (opts.maxWords !== undefined && t.length > opts.maxWords) continue;
    if (name.length > opts.maxChars) continue;
    if (bannedNames.has(key) || t.some((x) => bannedWords.has(x))) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    const scored = rank
      ? scoreName({
          first: first.word,
          second: second.word,
          firstSyllables: syllables(first.world, first.word),
          secondSyllables: syllables(second.world, second.word),
          name,
          worn,
          alliteration: rank.alliteration,
          liked,
        })
      : undefined;
    names.push({
      name,
      house: houseWord,
      first: first.word,
      second: second.word,
      firstWorld: first.world.id,
      secondWorld: second.world.id,
      score: scored?.score,
      reasons: scored?.reasons,
    });
  }

  // Array.prototype.sort is stable, so equal scores keep their (seeded) draw order.
  const chosen = rank ? pickBest(names, opts.count, rank.maxRepeat ?? 2) : names;
  return { names: chosen, attempts, exhausted: chosen.length < opts.count };
}

/** Best scores first, skipping names whose words already appear `maxRepeat` times in the list. */
function pickBest(names: GeneratedName[], count: number, maxRepeat: number): GeneratedName[] {
  const uses = new Map<string, number>();
  const out: GeneratedName[] = [];
  for (const n of [...names].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))) {
    if (out.length === count) break;
    const words = [normalize(n.first), normalize(n.second)];
    if (words.some((w) => (uses.get(w) ?? 0) >= maxRepeat)) continue;
    for (const w of words) uses.set(w, (uses.get(w) ?? 0) + 1);
    out.push(n);
  }
  return out;
}
