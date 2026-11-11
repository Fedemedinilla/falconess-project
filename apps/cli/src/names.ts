/**
 * Name generator (dev tool, not part of the game): joins one word from world A with one from
 * world B, optionally after a house word. Worlds are JSON files in apps/cli/names/worlds/.
 *
 *   pnpm names -- --a sky --b forge --n 30 --seed 1
 *   pnpm names -- --list
 */
import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { argString, parseArgs } from "./args.js";
import { generateNames } from "./names/generate.js";
import { toCsv, toMarkdown } from "./names/output.js";
import { loadExcluded, loadWorlds } from "./names/worlds.js";

const DEFAULT_WORLDS = fileURLToPath(new URL("../names/worlds/", import.meta.url));
const DEFAULT_EXCLUDED = fileURLToPath(new URL("../names/excluded.txt", import.meta.url));
const DEFAULT_WORN = fileURLToPath(new URL("../names/worn.txt", import.meta.url));

function intArg(args: Record<string, string | true>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  const n = Number(v);
  if (typeof v !== "string" || !Number.isInteger(n) || n <= 0)
    throw new Error(`--${key} needs a positive integer`);
  return n;
}

function worldArg(args: Record<string, string | true>, key: string): string | undefined {
  const v = args[key];
  if (v === true) throw new Error(`--${key} needs a world id (or "any")`);
  return v === undefined || v === "any" ? undefined : v;
}

function main(argv: readonly string[]): void {
  const args = parseArgs(argv);
  const worlds = loadWorlds(argString(args, "worlds", DEFAULT_WORLDS));

  if (args.list) {
    for (const w of worlds) {
      const tags = [w.lang, w.role === "house" ? "house" : "", w.provisional ? "provisional" : ""];
      console.log(`${w.id.padEnd(12)} ${w.name} [${tags.filter(Boolean).join(", ")}]`);
      console.log(`${"".padEnd(12)} ${w.words.length} words: ${w.words.slice(0, 6).join(", ")}…`);
    }
    return;
  }

  const order = argString(args, "order", "fixed");
  if (order !== "fixed" && order !== "free") throw new Error("--order must be fixed or free");
  const exclude = argString(args, "exclude", DEFAULT_EXCLUDED);
  const house = worldArg(args, "house");
  const seed = argString(args, "seed", "1");
  const rankOn = argString(args, "rank", "on");
  if (rankOn !== "on" && rankOn !== "off") throw new Error("--rank must be on or off");
  const alliteration = argString(args, "alliteration", "neutral");
  if (alliteration !== "prefer" && alliteration !== "avoid" && alliteration !== "neutral")
    throw new Error("--alliteration must be prefer, avoid or neutral");
  const worn = argString(args, "worn", DEFAULT_WORN);
  const pool = intArg(args, "pool");

  const result = generateNames(worlds, {
    seed,
    count: intArg(args, "n") ?? 30,
    a: worldArg(args, "a"),
    b: worldArg(args, "b"),
    house,
    maxChars: intArg(args, "max-chars") ?? (house ? 26 : 16),
    maxWords: intArg(args, "max-words"),
    order,
    excluded: exclude === "none" ? [] : loadExcluded(exclude),
    rank:
      rankOn === "off"
        ? undefined
        : {
            worn: worn === "none" ? [] : loadExcluded(worn),
            alliteration,
            ...(pool === undefined ? {} : { pool }),
          },
  });

  result.names.forEach((n, i) => {
    const score = n.score === undefined ? "" : `${String(n.score).padStart(3)}  `;
    console.log(
      `${String(i + 1).padStart(3)}. ${score}${n.name.padEnd(28)} ${n.firstWorld} + ${n.secondWorld}`,
    );
    if (args.explain && n.reasons)
      console.log(
        `${"".padEnd(10)}${n.reasons.map((r) => `${r.rule} ${r.points > 0 ? "+" : ""}${r.points}`).join(", ")}`,
      );
  });
  if (result.exhausted)
    console.error(
      `Only ${result.names.length} names after ${result.attempts} draws: loosen the filters or add words.`,
    );

  const out = args.out;
  if (typeof out === "string") {
    const ext = extname(out).toLowerCase();
    const text =
      ext === ".csv"
        ? toCsv(result.names)
        : ext === ".md"
          ? toMarkdown(result.names, `Names (seed ${seed})`)
          : undefined;
    if (text === undefined) throw new Error("--out must end in .csv or .md");
    writeFileSync(out, text);
    console.log(`\nWrote ${result.names.length} names to ${out}`);
  }
}

const isMain = process.argv[1]?.endsWith("names.ts") || process.argv[1]?.endsWith("names.js");
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
