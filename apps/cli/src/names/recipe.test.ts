import { describe, expect, it } from "vitest";
import { buildWorld, type DatamuseWord, datamuseUrl, fetchRecipe, parseRecipe } from "./recipe.js";
import { parseWorld } from "./worlds.js";

const w = (word: string, f: number, syl: number, pos = "n"): DatamuseWord => ({
  word,
  numSyllables: syl,
  tags: [pos, `f:${f}`],
});

const recipe = parseRecipe("winds", {
  name: "Winds",
  lang: "en",
  queries: ["rel_gen=wind", "rel_gen=storm"],
  maxFreq: 3,
  deny: ["Kazoo"],
});

describe("parseRecipe", () => {
  it("fills defaults", () => {
    expect(recipe).toMatchObject({ minFreq: 0.01, syllables: [1, 3], pos: ["n"], role: "word" });
  });

  it("rejects malformed queries and importer-owned params", () => {
    expect(() => parseRecipe("x", { name: "x", lang: "en", queries: ["wind"] })).toThrow();
    expect(() => parseRecipe("x", { name: "x", lang: "en", queries: ["ml=wind&max=5"] })).toThrow(
      /set by the importer/,
    );
  });
});

describe("buildWorld", () => {
  const results = [
    [
      w("squall", 0.42, 1),
      w("air", 148, 1), // too common
      w("kazoo", 0.04, 2), // denied
      w("south wind", 0.3, 2), // two words
      w("samiel", 0.005, 2), // too rare
      w("circumvolute", 0.01, 4, "v"), // verb
      w("storm", 1, 1), // worn
      w("ocarina", 0.5, 4), // 4 syllables
      w("by", 1, 1), // too short
    ],
    [w("zephyr", 0.25, 2), w("Squall", 0.42, 1), w("harmattan", 0.2, 3)],
  ];
  const { world, dropped } = buildWorld("winds", recipe, results, ["storm"]);

  it("keeps rare single nouns, capitalized and sorted, with their stats", () => {
    expect(world.words).toEqual(["Harmattan", "Squall", "Zephyr"]);
    expect(world.stats.Zephyr).toEqual({ freq: 0.25, syllables: 2 });
    expect(world.source).toBe("datamuse:recipes/winds.json");
  });

  it("records why each word was dropped", () => {
    const reasons = Object.fromEntries(dropped.map((d) => [d.word, d.reason]));
    expect(reasons).toEqual({
      air: "too common (f 148)",
      kazoo: "denied",
      "south wind": "not a single plain word",
      samiel: "too rare (f 0.005)",
      circumvolute: "part of speech not in n",
      storm: "worn",
      ocarina: "4 syllables",
      by: "too short",
    });
  });

  it("produces a file the world loader accepts", () => {
    expect(parseWorld("winds", JSON.parse(JSON.stringify(world))).words).toHaveLength(3);
  });
});

describe("fetchRecipe", () => {
  it("runs every query in order with the importer's params", async () => {
    const urls: string[] = [];
    const out = await fetchRecipe(recipe, async (url) => {
      urls.push(url);
      return [w("gust", 0.9, 1)];
    });
    expect(urls).toEqual([datamuseUrl("rel_gen=wind", 200), datamuseUrl("rel_gen=storm", 200)]);
    expect(urls[0]).toBe("https://api.datamuse.com/words?rel_gen=wind&md=fsp&max=200");
    expect(out).toHaveLength(2);
  });

  it("fails loudly on an unexpected response", async () => {
    await expect(fetchRecipe(recipe, async () => ({ error: "x" }))).rejects.toThrow(/Unexpected/);
  });
});
