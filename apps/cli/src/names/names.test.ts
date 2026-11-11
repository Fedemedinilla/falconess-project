import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type GenerateOptions, generateNames, normalize, type World } from "./generate.js";
import { toCsv, toMarkdown } from "./output.js";
import { loadWorlds, parseExcluded, parseWorld } from "./worlds.js";

const world = (id: string, words: string[], role: World["role"] = "word"): World => ({
  id,
  name: id,
  lang: "en",
  role,
  provisional: true,
  words,
});

const WORLDS: World[] = [
  world("sky", ["Storm", "Gale", "Cloud", "Dawn", "Comet", "Nova"]),
  world("forge", ["Turbo", "Gear", "Piston", "Bolt", "Iron", "Rivet"]),
  world("bloom", ["Rose", "Lily", "Ruby", "Jade", "Opal", "Iris"]),
  world("house", ["Koryu", "Altair"], "house"),
];

const base: GenerateOptions = {
  seed: "1",
  count: 10,
  a: "sky",
  b: "forge",
  house: undefined,
  maxChars: 30,
  maxWords: undefined,
  order: "fixed",
  excluded: [],
};

const names = (opts: Partial<GenerateOptions>, worlds: World[] = WORLDS) =>
  generateNames(worlds, { ...base, ...opts }).names.map((n) => n.name);

describe("determinism", () => {
  it("returns the same list for the same seed", () => {
    expect(names({ seed: "42" })).toEqual(names({ seed: "42" }));
    expect(names({ seed: "42", a: undefined, b: undefined, order: "free" })).toEqual(
      names({ seed: "42", a: undefined, b: undefined, order: "free" }),
    );
  });

  it("returns a different list for a different seed", () => {
    expect(names({ seed: "1" })).not.toEqual(names({ seed: "2" }));
  });

  it("does not depend on Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random called");
    };
    try {
      expect(names({ seed: "7" })).toHaveLength(10);
    } finally {
      Math.random = original;
    }
  });
});

describe("pairing", () => {
  it("fixed order puts world A first", () => {
    const out = generateNames(WORLDS, base).names;
    for (const n of out) {
      expect(n.firstWorld).toBe("sky");
      expect(n.secondWorld).toBe("forge");
      expect(n.name).toBe(`${n.first} ${n.second}`);
    }
  });

  it("free order lets world B go first sometimes", () => {
    const out = generateNames(WORLDS, { ...base, count: 30, order: "free" }).names;
    expect(out.some((n) => n.firstWorld === "forge")).toBe(true);
    expect(out.some((n) => n.firstWorld === "sky")).toBe(true);
  });

  it("any with any never pairs a world with itself and never uses house worlds", () => {
    const out = generateNames(WORLDS, { ...base, a: undefined, b: undefined, count: 30 }).names;
    for (const n of out) {
      expect(n.firstWorld).not.toBe(n.secondWorld);
      expect([n.firstWorld, n.secondWorld]).not.toContain("house");
    }
  });

  it("prefixes a house word when asked", () => {
    for (const n of generateNames(WORLDS, { ...base, house: "house" }).names) {
      expect(["Koryu", "Altair"]).toContain(n.house);
      expect(n.name.startsWith(`${n.house} `)).toBe(true);
    }
  });

  it("rejects unknown worlds", () => {
    expect(() => names({ a: "nope" })).toThrow(/Unknown world "nope"/);
  });
});

describe("filters", () => {
  it("respects the maximum length in characters", () => {
    const out = names({ maxChars: 10, count: 20 });
    expect(out.length).toBeGreaterThan(0);
    for (const n of out) expect(n.length).toBeLessThanOrEqual(10);
  });

  it("respects the maximum number of words", () => {
    const multi = [world("a", ["Rice", "Twin Turbo"]), world("b", ["Shower", "Week"])];
    const out = names({ a: "a", b: "b", maxWords: 2, count: 4 }, multi);
    expect(out.sort()).toEqual(["Rice Shower", "Rice Week"]);
  });

  it("never repeats a word inside a name, ignoring case and accents", () => {
    const echo = [world("a", ["Kōryū", "Star"]), world("b", ["koryu", "STAR", "Moon"])];
    const out = names({ a: "a", b: "b", count: 10 }, echo);
    expect(out.sort()).toEqual(["Kōryū Moon", "Kōryū STAR", "Star Moon", "Star koryu"]);
  });

  it("drops excluded names and excluded words", () => {
    const out = names({ count: 36, excluded: ["storm turbo", "Gear"] });
    expect(out).not.toContain("Storm Turbo");
    expect(out.filter((n) => n.includes("Gear"))).toEqual([]);
    expect(out).toContain("Storm Bolt");
  });

  it("never returns the same name twice and reports when it runs out", () => {
    const tiny = [world("a", ["Gold"]), world("b", ["Ship", "Bar"])];
    const result = generateNames(tiny, { ...base, a: "a", b: "b", count: 5 });
    expect(result.names.map((n) => n.name).sort()).toEqual(["Gold Bar", "Gold Ship"]);
    expect(result.exhausted).toBe(true);
  });
});

describe("world files", () => {
  it("loads the bundled worlds", () => {
    const dir = fileURLToPath(new URL("../../names/worlds/", import.meta.url));
    const worlds = loadWorlds(dir);
    expect(worlds.map((w) => w.id)).toEqual(expect.arrayContaining(["sky", "forge", "bloom"]));
    expect(worlds.find((w) => w.id === "makers")?.role).toBe("house");
  });

  it("rejects duplicate words and unknown fields", () => {
    expect(() => parseWorld("x", { name: "x", lang: "en", words: ["Star", "star"] })).toThrow(
      /duplicate word/,
    );
    expect(() => parseWorld("x", { name: "x", lang: "en", words: ["A"], extra: 1 })).toThrow();
  });

  it("parses the excluded list ignoring comments and blanks", () => {
    expect(parseExcluded("# comment\n\nGold Ship\r\n  Rice  \n")).toEqual(["Gold Ship", "Rice"]);
  });

  it("normalizes case, accents and spacing", () => {
    expect(normalize("  Kōryū   LUMIÈRE ")).toBe("koryu lumiere");
  });
});

describe("output", () => {
  const out = generateNames(WORLDS, { ...base, count: 2 }).names;

  it("writes a CSV with an empty favorite column", () => {
    const lines = toCsv(out).trim().split("\n");
    expect(lines[0]).toBe("favorite,name,house,first,second,first_world,second_world,score");
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith(`,${out[0]?.name},`)).toBe(true);
  });

  it("writes a Markdown checklist", () => {
    expect(toMarkdown(out, "T")).toContain(`- [ ] ${out[0]?.name} _(sky + forge)_`);
  });
});
