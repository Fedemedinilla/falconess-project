import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import type { World } from "./generate.js";
import { normalize } from "./normalize.js";

/** One file per world: `<id>.json`. The id is the file name, so adding a world is adding a file. */
export const WorldFile = z
  .object({
    name: z.string().min(1),
    lang: z.string().min(2),
    role: z.enum(["word", "house"]).default("word"),
    provisional: z.boolean().default(false),
    words: z.array(z.string().trim().min(1)).min(1),
    /** Where the words came from, e.g. "datamuse:recipes/winds.json". */
    source: z.string().min(1).optional(),
    stats: z
      .record(
        z.string(),
        z
          .object({ freq: z.number().nonnegative(), syllables: z.number().int().positive() })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((w, ctx) => {
    for (const key of Object.keys(w.stats ?? {}))
      if (!w.words.includes(key))
        ctx.addIssue({ code: "custom", message: `stats for "${key}", which is not in words` });
    const seen = new Set<string>();
    for (const word of w.words) {
      const key = normalize(word);
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: `duplicate word "${word}"` });
      seen.add(key);
    }
  });

export function parseWorld(id: string, raw: unknown): World {
  const parsed = WorldFile.safeParse(raw);
  if (!parsed.success) throw new Error(`World "${id}": ${z.prettifyError(parsed.error)}`);
  return { id, ...parsed.data };
}

export function loadWorlds(dir: string): World[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => {
    const id = basename(f, ".json");
    const raw: unknown = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return parseWorld(id, raw);
  });
}

/** Plain text, one entry per line; blank lines and lines starting with `#` are ignored. */
export function parseExcluded(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

export function loadExcluded(file: string): string[] {
  return parseExcluded(readFileSync(file, "utf8"));
}
