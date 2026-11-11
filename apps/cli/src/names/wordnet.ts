/**
 * Minimal reader for the Princeton WordNet 3.1 files (index.<pos>, data.<pos>), enough to walk
 * three kinds of tree: noun hyponyms ("kinds of wind"), verb troponyms ("ways to move fast") and
 * adjective clusters ("similar to fast": fleet, meteoric). Pure: takes file contents, no I/O.
 * File format: https://wordnet.princeton.edu/documentation/wndb5wn
 */

/** WordNet's part-of-speech letters: noun, verb, adjective. */
export type Pos = "n" | "v" | "a";

/** Child pointers followed per part of speech: "~" hyponym/troponym, "&" similar-to adjective. */
const CHILD_POINTERS: Record<Pos, readonly string[]> = { n: ["~"], v: ["~"], a: ["&"] };
const POS_NAME: Record<Pos, string> = { n: "a noun", v: "a verb", a: "an adjective" };
/** Pointer target letters that belong to each file ("s" is an adjective satellite). */
const SAME_FILE: Record<Pos, readonly string[]> = { n: ["n"], v: ["v"], a: ["a", "s"] };

export type Synset = {
  readonly offset: string;
  /** Lemmas as written in WordNet, spaces restored ("north_wind" → "north wind"). */
  readonly words: readonly string[];
  /** Kinds of this synset (nouns, verbs) or similar adjectives. */
  readonly hyponyms: readonly string[];
  /** Pointer "~i": named instances (stars, places). */
  readonly instances: readonly string[];
  readonly gloss: string;
};

export type WordNetHit = {
  readonly word: string;
  readonly depth: number;
  readonly root: string;
  readonly gloss: string;
  readonly pos: Pos;
};

/**
 * Sense reference in NLTK style: "wind.n.01" is the first noun sense of "wind", "dart.v.01" the
 * first verb sense of "dart", "fast.a.01" the first adjective sense of "fast".
 */
export const SENSE_REF = /^([a-z0-9_'-]+)\.([nva])\.(\d{2})$/;

export class WordNet {
  private constructor(
    readonly pos: Pos,
    private readonly index: ReadonlyMap<string, readonly string[]>,
    private readonly data: ReadonlyMap<string, Synset>,
  ) {}

  static parse(indexText: string, dataText: string, pos: Pos = "n"): WordNet {
    const index = new Map<string, string[]>();
    for (const line of indexText.split("\n")) {
      if (line === "" || line.startsWith("  ")) continue; // license header lines start with two spaces
      const f = line.trim().split(" ");
      const lemma = f[0];
      const pCnt = Number(f[3]);
      const synsetCnt = Number(f[2]);
      if (!lemma || !Number.isInteger(pCnt) || !Number.isInteger(synsetCnt)) continue;
      // lemma pos synset_cnt p_cnt [ptr_symbol × p_cnt] sense_cnt tagsense_cnt [offset × synset_cnt]
      index.set(lemma, f.slice(6 + pCnt, 6 + pCnt + synsetCnt));
    }

    const filePos = pos;
    const data = new Map<string, Synset>();
    for (const line of dataText.split("\n")) {
      if (line === "" || line.startsWith("  ")) continue;
      const bar = line.indexOf(" | ");
      const head = (bar === -1 ? line : line.slice(0, bar)).trim().split(" ");
      const gloss = bar === -1 ? "" : line.slice(bar + 3).trim();
      const offset = head[0];
      if (!offset) continue;
      // offset lex_filenum ss_type w_cnt(hex) [word lex_id × w_cnt] p_cnt [sym offset pos st × p_cnt]
      const wCnt = Number.parseInt(head[3] ?? "", 16);
      const words: string[] = [];
      // Adjectives may carry a syntactic marker: "galore(ip)", "awake(p)".
      for (let i = 0; i < wCnt; i++)
        words.push((head[4 + i * 2] ?? "").replace(/\([a-z]+\)$/, "").replace(/_/g, " "));
      let p = 4 + wCnt * 2;
      const pCnt = Number(head[p]);
      p++;
      const hyponyms: string[] = [];
      const instances: string[] = [];
      for (let i = 0; i < pCnt; i++, p += 4) {
        const sym = head[p];
        const target = head[p + 1];
        const pos = head[p + 2];
        if (!target || !pos || !SAME_FILE[filePos].includes(pos)) continue;
        if (sym && CHILD_POINTERS[filePos].includes(sym)) hyponyms.push(target);
        else if (sym === "~i") instances.push(target);
      }
      data.set(offset, { offset, words, hyponyms, instances, gloss });
    }
    return new WordNet(pos, index, data);
  }

  /** All senses of a lemma in this part of speech, in WordNet's order, as "lemma.<pos>.NN". */
  senses(lemma: string): { ref: string; words: readonly string[]; gloss: string }[] {
    const key = lemma.toLowerCase().replace(/ /g, "_");
    return (this.index.get(key) ?? []).map((offset, i) => {
      const s = this.data.get(offset);
      return {
        ref: `${key}.${this.pos}.${String(i + 1).padStart(2, "0")}`,
        words: s?.words ?? [],
        gloss: s?.gloss ?? "",
      };
    });
  }

  resolve(ref: string): Synset {
    const m = SENSE_REF.exec(ref);
    if (!m) throw new Error(`"${ref}" is not a sense reference like "wind.n.01"`);
    const [, lemma = "", pos = "", num = ""] = m;
    if (pos !== this.pos) throw new Error(`"${ref}" is not ${POS_NAME[this.pos]} sense`);
    const offset = this.index.get(lemma)?.[Number(num) - 1];
    const synset = offset === undefined ? undefined : this.data.get(offset);
    if (!synset) throw new Error(`WordNet has no sense "${ref}"; try --senses ${lemma}`);
    return synset;
  }

  /**
   * Breadth-first walk below each root, in root order. The roots' own lemmas are left out (they
   * are the generic word); a lemma is reported once, at its first (shallowest) appearance.
   */
  descendants(
    roots: readonly string[],
    depth: number,
    instances: boolean,
    includeRoots = false,
  ): WordNetHit[] {
    const hits: WordNetHit[] = [];
    const seenSynsets = new Set<string>();
    const seenWords = new Set<string>();
    for (const root of roots) {
      const start = this.resolve(root);
      seenSynsets.add(start.offset);
      if (includeRoots)
        for (const word of start.words) {
          const key = word.toLowerCase();
          if (seenWords.has(key)) continue;
          seenWords.add(key);
          hits.push({ word, depth: 0, root, gloss: start.gloss, pos: this.pos });
        }
      let frontier: Synset[] = [start];
      for (let d = 1; d <= depth && frontier.length > 0; d++) {
        const next: Synset[] = [];
        for (const s of frontier) {
          for (const off of instances ? [...s.hyponyms, ...s.instances] : s.hyponyms) {
            if (seenSynsets.has(off)) continue;
            seenSynsets.add(off);
            const child = this.data.get(off);
            if (!child) continue;
            next.push(child);
            for (const word of child.words) {
              const key = word.toLowerCase();
              if (seenWords.has(key)) continue;
              seenWords.add(key);
              hits.push({ word, depth: d, root, gloss: child.gloss, pos: this.pos });
            }
          }
        }
        frontier = next;
      }
    }
    return hits;
  }
}

/** The three WordNet files a recipe can walk. */
export type WordNets = Readonly<Record<Pos, WordNet>>;

export function posOf(ref: string): Pos {
  const pos = SENSE_REF.exec(ref)?.[2];
  if (pos !== "n" && pos !== "v" && pos !== "a")
    throw new Error(`"${ref}" is not a sense reference like "wind.n.01"`);
  return pos;
}

/** Walks each root in its own part of speech, in root order; a word is reported once. */
export function walk(
  nets: WordNets,
  roots: readonly string[],
  depth: number,
  instances: boolean,
  includeRoots = false,
): WordNetHit[] {
  const seen = new Set<string>();
  const out: WordNetHit[] = [];
  for (const root of roots) {
    for (const hit of nets[posOf(root)].descendants([root], depth, instances, includeRoots)) {
      const key = `${hit.pos}:${hit.word.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out;
}
