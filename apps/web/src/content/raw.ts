/**
 * The browser twin of `loadRawContent` (packages/content/src/node.ts): it turns the JSON modules
 * that Vite's `import.meta.glob` gathers from packages/content into a `RawContent`, in the same
 * order the Node loader reads them (file names sorted, `_`-prefixed files skipped). The order
 * matters: content maps keep insertion order, and the season walks some of them (events) when it
 * draws, so a run replays identically in the CLI and in the browser.
 */
import type { RawContent } from "@falconess/schema";

const ENTITY_DIRS = [
  "falconess",
  "manufacturers",
  "frames",
  "parts",
  "skills",
  "events",
  "courses",
] as const;
type EntityDir = (typeof ENTITY_DIRS)[number];

const MARKER = "packages/content/";

/** A module path relative to packages/content ("frames/kite.json"), or undefined if outside it. */
export function contentPath(modulePath: string): string | undefined {
  const at = modulePath.lastIndexOf(MARKER);
  return at < 0 ? undefined : modulePath.slice(at + MARKER.length);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Group the glob's modules into `RawContent`. Not validated: pass it to buildContentIndex. */
export function rawContentFromModules(
  modules: Readonly<Record<string, unknown>>,
  lang = "es",
): RawContent {
  const byPath = new Map<string, unknown>();
  for (const [path, value] of Object.entries(modules)) {
    const rel = contentPath(path);
    if (rel !== undefined) byPath.set(rel, value);
  }
  const required = (rel: string): unknown => {
    if (!byPath.has(rel)) throw new Error(`content file ${rel} is missing from the bundle`);
    return byPath.get(rel);
  };
  const dir = (name: EntityDir): unknown[] =>
    [...byPath.keys()]
      .filter((rel) => {
        const [folder, file, ...rest] = rel.split("/");
        return (
          folder === name && rest.length === 0 && file?.endsWith(".json") && !file.startsWith("_")
        );
      })
      .sort()
      .map((rel) => byPath.get(rel));

  const text = required(`text/${lang}.json`);
  if (!isObject(text)) throw new Error(`text/${lang}.json must be an object`);
  return {
    falconess: dir("falconess"),
    manufacturers: dir("manufacturers"),
    frames: dir("frames"),
    parts: dir("parts"),
    quirks: required("quirks.json"),
    skills: dir("skills"),
    events: dir("events"),
    courses: dir("courses"),
    economy: required("gacha.json"),
    text,
  };
}
