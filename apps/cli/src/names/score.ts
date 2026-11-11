import { normalize } from "./normalize.js";

/** Per-word data an importer may attach to a world (Datamuse gives both). */
export type WordStats = {
  /** Occurrences per million words of English text. */
  readonly freq: number;
  readonly syllables: number;
};

export type Alliteration = "prefer" | "avoid" | "neutral";

export type ScoreInput = {
  readonly first: string;
  readonly second: string;
  readonly firstSyllables: number;
  readonly secondSyllables: number;
  /** Full name, house prefix included. */
  readonly name: string;
  readonly worn: ReadonlySet<string>;
  readonly alliteration: Alliteration;
};

export type ScoreReason = { readonly rule: string; readonly points: number };

/**
 * Rough English syllable count: vowel groups, minus a silent final "e". Only used when a world has
 * no imported stats for the word; good enough to tell "Jet" from "Duralumin".
 */
export function guessSyllables(word: string): number {
  const w = normalize(word).replace(/[^a-z]/g, "");
  if (w === "") return 1;
  const groups = w.match(/[aeiouy]+/g)?.length ?? 0;
  // "Gale" has a silent e; "Babble" keeps its "-ble" syllable (consonant before "le").
  const syllabicLe = /[^aeiouy]le$/.test(w);
  const silentE = groups > 1 && w.endsWith("e") && !syllabicLe ? 1 : 0;
  return Math.max(1, groups - silentE);
}

/**
 * Integer score for a candidate; higher sounds more like a racer's name. Rules follow the
 * handoff's notes on Umamusume names: short and pronounceable, a short or strong first element
 * and a second one that closes (Twin Turbo, Gold Ship), no sing-song echoes, no worn words.
 */
export function scoreName(input: ScoreInput): { score: number; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = [];
  const add = (rule: string, points: number) => {
    if (points !== 0) reasons.push({ rule, points });
  };

  const total = input.firstSyllables + input.secondSyllables;
  add("syllables", total <= 4 ? 2 : total === 5 ? 1 : total === 6 ? 0 : -2);

  if (input.firstSyllables <= input.secondSyllables) add("short-first", 1);
  else if (input.firstSyllables > input.secondSyllables + 1) add("long-first", -1);

  const a = normalize(input.first);
  const b = normalize(input.second);
  if (a.length >= 3 && b.length >= 3 && a.slice(-3) === b.slice(-3)) add("echo", -2);

  if (a[0] === b[0])
    add(
      "alliteration",
      input.alliteration === "prefer" ? 1 : input.alliteration === "avoid" ? -1 : 0,
    );

  for (const t of normalize(input.name).split(" ")) if (input.worn.has(t)) add(`worn:${t}`, -3);

  if (input.name.length <= 12) add("compact", 1);

  return { score: reasons.reduce((s, r) => s + r.points, 0), reasons };
}
