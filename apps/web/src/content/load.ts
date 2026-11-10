/**
 * Content for the browser: Vite inlines every JSON file of packages/content at build time (the
 * single-file page fetches nothing), and the index is built and validated once, on first use.
 */
import {
  buildContentIndex,
  Calendar,
  type ContentIndex,
  Course,
  withCalendar,
} from "@falconess/schema";
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

/** The ruleset v3 catalogue tracks, outside the content index (ADR-0011 §6). */
const CATALOGUE: Record<string, unknown> = import.meta.glob<unknown>(
  "../../../../packages/content/courses-v3/*.json",
  { eager: true, import: "default" },
);

/** The season calendars by ruleset (`calendars/<version>.json`, ADR-0011 §6). */
const CALENDARS: Record<string, unknown> = import.meta.glob<unknown>(
  "../../../../packages/content/calendars/*.json",
  { eager: true, import: "default" },
);

let cached: ContentIndex | undefined;
const seasonCache = new Map<string, ContentIndex>();
let catalogue: readonly Course[] | undefined;

/**
 * The catalogue tracks of ruleset v3 (`courses-v3/`), validated, by id: the free race offers them
 * on a ruleset that flies, like `pnpm sim:race`.
 */
export function catalogueCourses(): readonly Course[] {
  catalogue ??= Object.keys(CATALOGUE)
    .sort()
    .map((k) => Course.parse(CATALOGUE[k]));
  return catalogue;
}

/** The validated content index (throws ContentError once, at first use, if content is broken). */
export function getContent(): ContentIndex {
  cached ??= buildContentIndex(rawContentFromModules(MODULES));
  return cached;
}

const calendarCache = new Map<string, Calendar | null>();

/**
 * The season calendar of a ruleset (`calendars/<version>.json`, validated), or undefined when the
 * ruleset has none (v1, v2). The track card reads its `trackDemands`.
 */
export function seasonCalendar(rulesetVersion: string): Calendar | undefined {
  let hit = calendarCache.get(rulesetVersion);
  if (hit === undefined) {
    const key = Object.keys(CALENDARS).find((k) => k.endsWith(`/calendars/${rulesetVersion}.json`));
    hit = key === undefined ? null : Calendar.parse(CALENDARS[key]);
    calendarCache.set(rulesetVersion, hit);
  }
  return hit ?? undefined;
}

/**
 * The content a season of `rulesetVersion` plays on, like `loadSeasonContent` in the CLI: with a
 * calendar (v3) the catalogue tracks join the courses and each Falconess races the calendar's
 * goals; v1 and v2 get `getContent()` unchanged.
 */
export function seasonContent(rulesetVersion: string): ContentIndex {
  const hit = seasonCache.get(rulesetVersion);
  if (hit) return hit;
  const calendar = seasonCalendar(rulesetVersion);
  const idx =
    calendar === undefined
      ? getContent()
      : withCalendar(getContent(), calendar, catalogueCourses());
  seasonCache.set(rulesetVersion, idx);
  return idx;
}

/**
 * The simulation context of a ruleset; v1 by default, the ruleset of `pnpm sim:race`, which the
 * free race mirrors (v2 changes the season, not the race engine). Season screens take theirs from
 * the run (`GameController.context`). Throws on an unknown version.
 */
export function simContext(rulesetVersion: string = RULESET_V1.version): SimContext {
  return { ruleset: getRuleset(rulesetVersion), content: seasonContent(rulesetVersion) };
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
