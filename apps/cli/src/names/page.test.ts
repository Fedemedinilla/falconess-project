import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type GenerateOptions, generateNames } from "./generate.js";
import { loadExcluded, loadWorlds } from "./worlds.js";

/**
 * The Gatera de nombres page (apps/cli/names/page/gatera.html) carries its own copy of the
 * generator, between GEN-START and GEN-END, and of the worlds. These tests fail when either
 * drifts from the repo, so a change here reminds you to update and republish the page.
 */
const root = (p: string) => fileURLToPath(new URL(`../../names/${p}`, import.meta.url));
const page = readFileSync(root("page/gatera.html"), "utf8");
const worlds = loadWorlds(root("worlds"));

const genCode = /\/\/ GEN-START[\s\S]*?\/\/ GEN-END/.exec(page)?.[0] ?? "";
const PageResult = z.object({
  names: z.array(z.object({ name: z.string(), score: z.number().optional() })),
});
// The page's generator is plain browser JavaScript; run it as such and validate what comes back.
const pageGenerate: unknown = new Function(`${genCode}\nreturn generateNames;`)();

function runPage(opts: GenerateOptions) {
  if (typeof pageGenerate !== "function") throw new Error("GEN block not found in the page");
  return PageResult.parse(pageGenerate(worlds, opts)).names;
}

const base: GenerateOptions = {
  seed: "1",
  count: 30,
  a: undefined,
  b: undefined,
  house: undefined,
  maxChars: 16,
  maxWords: undefined,
  order: "fixed",
  excluded: loadExcluded(root("excluded.txt")),
};
const rank = {
  worn: loadExcluded(root("worn.txt")),
  alliteration: "neutral" as const,
  maxRepeat: 2,
  favorites: loadExcluded(root("favorites.txt")),
};

describe("Gatera de nombres page", () => {
  it.each([
    ["winds + alloys, fixed, ranked", { a: "winds", b: "alloys", rank }],
    ["any + any, free, ranked", { order: "free" as const, rank }],
    [
      "raptors + traits with a house",
      {
        a: "raptors",
        b: "traits",
        house: "makers",
        maxChars: 26,
        rank: { ...rank, alliteration: "prefer" as const },
      },
    ],
    ["moves + any, free", { a: "moves", order: "free" as const, seed: "3", rank }],
    ["unranked", { order: "free" as const, seed: "5" }],
  ])("generates the same list as the CLI: %s", (_label, over) => {
    const opts: GenerateOptions = { ...base, ...over };
    const cli = generateNames(worlds, opts).names.map((n) => ({ name: n.name, score: n.score }));
    expect(runPage(opts)).toEqual(cli);
  });

  it("embeds the repo's worlds (republish the page after pnpm names:import)", () => {
    const line = /const DEFAULT_WORLDS = (\[.*\]);\n/.exec(page)?.[1];
    const Embedded = z.array(
      z.object({
        id: z.string(),
        role: z.string(),
        position: z.string(),
        words: z.array(z.string()),
      }),
    );
    const embedded = Embedded.parse(JSON.parse(line ?? "null"));
    expect(embedded.map((w) => [w.id, w.role, w.position, w.words])).toEqual(
      worlds.map((w) => [w.id, w.role, w.position ?? "any", w.words]),
    );
  });
});
