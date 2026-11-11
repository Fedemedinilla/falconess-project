import { describe, expect, it } from "vitest";
import { generateNames, type World } from "./generate.js";
import { guessSyllables, type ScoreInput, scoreName } from "./score.js";

const input = (over: Partial<ScoreInput>): ScoreInput => ({
  first: "Gold",
  second: "Ship",
  firstSyllables: 1,
  secondSyllables: 1,
  name: "Gold Ship",
  worn: new Set(),
  alliteration: "neutral",
  ...over,
});
const rules = (over: Partial<ScoreInput>) => scoreName(input(over)).reasons.map((r) => r.rule);

describe("guessSyllables", () => {
  it("counts vowel groups and drops a silent final e", () => {
    expect(guessSyllables("Jet")).toBe(1);
    expect(guessSyllables("Gale")).toBe(1);
    expect(guessSyllables("Kestrel")).toBe(2);
    expect(guessSyllables("Duralumin")).toBe(4);
    expect(guessSyllables("Babble")).toBe(2);
    expect(guessSyllables("Kōryū")).toBe(2);
  });
});

describe("scoreName", () => {
  it("rewards short names with a short first element", () => {
    expect(scoreName(input({})).score).toBe(4); // syllables +2, short-first +1, compact +1
  });

  it("penalizes long names and a long first element", () => {
    const r = scoreName(
      input({
        first: "Duralumin",
        second: "Jet",
        firstSyllables: 4,
        secondSyllables: 1,
        name: "Duralumin Jet",
      }),
    );
    expect(r.reasons).toEqual([
      { rule: "syllables", points: 1 },
      { rule: "long-first", points: -1 },
    ]);
  });

  it("penalizes sing-song endings", () => {
    expect(rules({ first: "Station", second: "Ration", name: "Station Ration" })).toContain("echo");
  });

  it("applies the alliteration preference", () => {
    const g = { first: "Gale", second: "Gyro", name: "Gale Gyro" };
    expect(scoreName(input({ ...g, alliteration: "prefer" })).score).toBe(5);
    expect(scoreName(input({ ...g, alliteration: "avoid" })).score).toBe(3);
    expect(rules({ ...g, alliteration: "neutral" })).not.toContain("alliteration");
  });

  it("costs 3 points per worn word, house included", () => {
    const worn = new Set(["storm", "altair"]);
    const r = scoreName(input({ first: "Storm", second: "Ship", name: "Altair Storm Ship", worn }));
    expect(r.reasons.filter((x) => x.rule.startsWith("worn:"))).toEqual([
      { rule: "worn:altair", points: -3 },
      { rule: "worn:storm", points: -3 },
    ]);
  });
});

describe("ranking in generateNames", () => {
  const worlds: World[] = [
    {
      id: "a",
      name: "a",
      lang: "en",
      role: "word",
      provisional: true,
      words: ["Storm", "Gold", "Twin", "Marmalade"],
    },
    {
      id: "b",
      name: "b",
      lang: "en",
      role: "word",
      provisional: true,
      words: ["Ship", "Turbo", "Week", "Constellation"],
      stats: { Constellation: { freq: 0.5, syllables: 4 } },
    },
  ];
  const opts = {
    seed: "9",
    count: 5,
    a: "a",
    b: "b",
    house: undefined,
    maxChars: 40,
    maxWords: undefined,
    order: "fixed" as const,
    excluded: [],
  };
  const rank = { worn: ["storm"], alliteration: "neutral" as const };

  it("returns names sorted by score, best first, and is deterministic", () => {
    const one = generateNames(worlds, { ...opts, rank }).names;
    const two = generateNames(worlds, { ...opts, rank }).names;
    expect(one).toEqual(two);
    const scores = one.map((n) => n.score ?? Number.NaN);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(one.some((n) => n.first === "Storm")).toBe(false);
  });

  it("uses imported syllable stats over the guess", () => {
    const all = generateNames(worlds, { ...opts, count: 16, rank }).names;
    const c = all.find((n) => n.name === "Twin Constellation");
    expect(c?.reasons).toContainEqual({ rule: "syllables", points: 1 }); // 1 + 4 imported = 5
  });

  it("leaves names unranked when rank is off", () => {
    const n = generateNames(worlds, opts).names[0];
    expect(n?.score).toBeUndefined();
  });
});
