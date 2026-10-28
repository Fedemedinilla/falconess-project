/**
 * Content for the browser: Vite inlines every JSON file of packages/content at build time (the
 * single-file page fetches nothing), and the index is built and validated once, on first use.
 */
import { buildContentIndex, type ContentIndex } from "@falconess/schema";
import { getRuleset, RULESET_V1, type SimContext } from "@falconess/sim";
import { rawContentFromModules } from "./raw";

const MODULES: Record<string, unknown> = import.meta.glob<unknown>(
  [
    "../../../../packages/content/{falconess,manufacturers,frames,parts,skills,events,courses}/*.json",
    "../../../../packages/content/{quirks,gacha}.json",
    "../../../../packages/content/text/*.json",
  ],
  { eager: true, import: "default" },
);

let cached: ContentIndex | undefined;

/** The validated content index (throws ContentError once, at first use, if content is broken). */
export function getContent(): ContentIndex {
  cached ??= buildContentIndex(rawContentFromModules(MODULES));
  return cached;
}

/** The simulation context of a ruleset (the current one by default). Throws on an unknown one. */
export function simContext(rulesetVersion: string = RULESET_V1.version): SimContext {
  return { ruleset: getRuleset(rulesetVersion), content: getContent() };
}

/**
 * A text straight from es.json, without validating the rest of the content: the crash screen
 * uses it when the index itself failed to build.
 */
export function rawText(key: string, lang = "es"): string | undefined {
  for (const [path, table] of Object.entries(MODULES)) {
    if (!path.endsWith(`/text/${lang}.json`)) continue;
    if (typeof table !== "object" || table === null || !(key in table)) return undefined;
    const value: unknown = Reflect.get(table, key);
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}
