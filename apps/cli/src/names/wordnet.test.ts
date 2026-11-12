import { describe, expect, it } from "vitest";
import { cmuSyllables } from "./lexicon.js";
import { filterCandidates, fromWordNet, parseRecipe, type WordData } from "./recipe.js";
import { WordNet, walk } from "./wordnet.js";

// Same layout as WordNet 3.1 index.noun / data.noun (https://wordnet.princeton.edu/documentation/wndb5wn).
const INDEX = [
  "  1 This software and database is being provided to you, the LICENSEE, by",
  "wind n 2 2 @ ~ 2 1 11000001 11000009 ",
  "gust n 1 1 @ 1 0 11000003 ",
].join("\n");
const DATA = [
  "  1 This software and database is being provided to you, the LICENSEE, by",
  "11000001 19 n 03 wind 0 air_current 0 current_of_air 0 004 @ 10999999 n 0000 ~ 11000002 n 0000 ~ 11000003 n 0000 ~i 11000005 n 0000 | air moving from high to low pressure",
  "11000002 19 n 02 chinook 0 chinook_wind 0 002 @ 11000001 n 0000 ~ 11000004 n 0000 | a warm dry wind",
  "11000003 19 n 01 gust 0 001 @ 11000001 n 0000 | a strong current of air",
  "11000004 19 n 01 snow_eater 0 001 @ 11000002 n 0000 | a chinook that melts snow",
  "11000005 19 n 01 Boreas 0 000 | the north wind personified",
  "11000009 04 n 01 wind 0 000 | a tendency that influences events",
].join("\n");

const wn = WordNet.parse(INDEX, DATA);

describe("WordNet reader", () => {
  it("lists noun senses in WordNet order with glosses", () => {
    expect(wn.senses("wind").map((s) => [s.ref, s.gloss])).toEqual([
      ["wind.n.01", "air moving from high to low pressure"],
      ["wind.n.02", "a tendency that influences events"],
    ]);
    expect(wn.senses("Wind")[0]?.words).toEqual(["wind", "air current", "current of air"]);
  });

  it("walks hyponyms breadth-first, without the root's own lemmas", () => {
    const words = (d: number, i: boolean) => wn.descendants(["wind.n.01"], d, i).map((h) => h.word);
    expect(words(1, true)).toEqual(["chinook", "chinook wind", "gust", "Boreas"]);
    expect(words(2, true)).toEqual(["chinook", "chinook wind", "gust", "Boreas", "snow eater"]);
    expect(words(2, false)).toEqual(["chinook", "chinook wind", "gust", "snow eater"]);
    expect(wn.descendants(["wind.n.01"], 2, true).at(-1)).toMatchObject({
      depth: 2,
      gloss: "a chinook that melts snow",
    });
  });

  it("explains bad references", () => {
    expect(() => wn.resolve("wind")).toThrow(/sense reference/);
    expect(() => wn.resolve("wind.n.07")).toThrow(/--senses wind/);
  });
});

describe("adjectives and verbs", () => {
  const adj = WordNet.parse(
    ["fast a 1 2 & ! 1 1 22000001 ", "fleet a 1 1 & 1 0 22000002 "].join("\n"),
    [
      "22000001 00 a 01 fast 0 003 & 22000002 s 0000 & 22000003 s 0000 ! 22000009 a 0101 | moving quickly",
      "22000002 00 s 02 fleet 0 swift 0 001 & 22000001 a 0000 | moving very fast",
      "22000003 00 s 01 breakneck(a) 0 001 & 22000001 a 0000 | dangerously fast",
      "22000009 00 a 01 slow 0 000 | not moving quickly",
    ].join("\n"),
    "a",
  );
  const verb = WordNet.parse(
    "rush v 1 1 ~ 1 1 33000001 ",
    [
      "33000001 38 v 01 rush 0 002 ~ 33000002 v 0000 ~ 33000003 v 0000 01 + 08 00 | move fast",
      "33000002 38 v 01 dart 0 000 01 + 08 00 | run or move very quickly",
      "33000003 38 v 01 hurtle 0 000 01 + 08 00 | move with great speed",
    ].join("\n"),
    "v",
  );

  it("follows similar-to links and strips adjective markers, not antonyms", () => {
    expect(adj.descendants(["fast.a.01"], 2, true).map((h) => [h.word, h.pos])).toEqual([
      ["fleet", "a"],
      ["swift", "a"],
      ["breakneck", "a"],
    ]);
  });

  it("can keep the roots' own lemmas", () => {
    expect(verb.descendants(["rush.v.01"], 1, true, true).map((h) => [h.word, h.depth])).toEqual([
      ["rush", 0],
      ["dart", 1],
      ["hurtle", 1],
    ]);
  });

  it("follows verb troponyms", () => {
    expect(verb.descendants(["rush.v.01"], 1, true).map((h) => h.word)).toEqual(["dart", "hurtle"]);
  });

  it("walks each root in its own part of speech and rejects a mismatched one", () => {
    const words = walk({ n: wn, v: verb, a: adj }, ["rush.v.01", "fast.a.01"], 1, true).map(
      (h) => h.word,
    );
    expect(words).toEqual(["dart", "hurtle", "fleet", "swift", "breakneck"]);
    expect(() => adj.resolve("rush.v.01")).toThrow(/is not an adjective sense/);
  });

  it("tags candidates with the recipe part of speech", () => {
    const none: WordData = { freq: () => undefined, syllables: () => undefined };
    const c = fromWordNet(adj.descendants(["fast.a.01"], 1, true), none);
    expect(c[0]?.pos).toEqual(["adj"]);
  });
});

describe("WordNet recipes", () => {
  const data: WordData = {
    freq: (w) => ({ gust: 9.8, chinook: 0.4 })[w.toLowerCase()],
    syllables: (w) => ({ boreas: 3, chinook: 2 })[w.toLowerCase()],
  };
  const recipe = parseRecipe("winds", {
    name: "Winds",
    lang: "en",
    wordnet: { roots: ["wind.n.01"] },
    maxFreq: 3,
  });

  it("accepts a WordNet-only recipe with defaults and rejects an empty one", () => {
    expect(recipe.wordnet).toEqual({
      roots: ["wind.n.01"],
      depth: 3,
      instances: true,
      includeRoots: false,
    });
    expect(() => parseRecipe("x", { name: "x", lang: "en" })).toThrow(/needs Datamuse queries/);
    expect(() =>
      parseRecipe("x", { name: "x", lang: "en", wordnet: { roots: ["wind"] } }),
    ).toThrow();
  });

  it("filters WordNet lemmas with offline frequency and syllables", () => {
    const hits = wn.descendants(["wind.n.01"], 2, true);
    const { world, dropped, kept } = filterCandidates("winds", recipe, fromWordNet(hits, data), []);
    expect(world.words).toEqual(["Boreas", "Chinook"]);
    expect(world.stats.Boreas).toEqual({ freq: 0, syllables: 3 }); // unknown frequency, kept
    expect(world.source).toBe("wordnet:recipes/winds.json");
    expect(kept.find((k) => k.word === "Chinook")?.note).toBe("a warm dry wind");
    expect(Object.fromEntries(dropped.map((d) => [d.word, d.reason]))).toEqual({
      "chinook wind": "not a single plain word",
      gust: "too common (f 9.8)",
      "snow eater": "not a single plain word",
    });
  });

  it("can drop words the frequency list does not know", () => {
    const strict = parseRecipe("w", {
      name: "w",
      lang: "en",
      wordnet: { roots: ["wind.n.01"] },
      unknownFreq: "drop",
    });
    const { world } = filterCandidates(
      "w",
      strict,
      fromWordNet(wn.descendants(["wind.n.01"], 1, true), data),
      [],
    );
    expect(world.words).toEqual(["Chinook"]);
  });
});

describe("cmuSyllables", () => {
  it("counts stressed vowel phones", () => {
    expect(cmuSyllables("HH AA1 R M AH0 T AE2 N")).toBe(3);
    expect(cmuSyllables("G AH1 S T")).toBe(1);
  });
});
