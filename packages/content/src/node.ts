import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentIndex, type ContentIndex, Course, type RawContent } from "@falconess/schema";

/** Root of packages/content, resolved from this file so it works from any cwd. */
export const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readDir(dir: string): unknown[] {
  const full = join(CONTENT_ROOT, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => readJson(join(full, f)));
}

/** Read every content file from disk. Not validated: pass it to buildContentIndex. */
export function loadRawContent(lang = "es"): RawContent {
  const text = readJson(join(CONTENT_ROOT, "text", `${lang}.json`));
  if (typeof text !== "object" || text === null || Array.isArray(text))
    throw new Error(`text/${lang}.json must be an object`);
  return {
    falconess: readDir("falconess"),
    manufacturers: readDir("manufacturers"),
    frames: readDir("frames"),
    parts: readDir("parts"),
    quirks: readJson(join(CONTENT_ROOT, "quirks.json")),
    skills: readDir("skills"),
    events: readDir("events"),
    courses: readDir("courses"),
    economy: readJson(join(CONTENT_ROOT, "gacha.json")),
    text: text as Record<string, unknown>,
  };
}

let cached: ContentIndex | undefined;

/** Validated, reference-checked content index. Loaded once per process. */
export function loadContent(): ContentIndex {
  if (!cached) cached = buildContentIndex(loadRawContent());
  return cached;
}

/**
 * The five new tracks of the ruleset v3 draft's catalogue (design7 §6), validated. They live in
 * `courses-v3/`, outside the content index, so v1 and v2 (their season, field, policy and batch)
 * never see them; they become real content with their goals in stage 5.
 */
export function loadCatalogueCourses(): Course[] {
  return readDir("courses-v3").map((raw) => Course.parse(raw));
}
