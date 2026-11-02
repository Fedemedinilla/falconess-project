/**
 * The free race form (#carrera-libre): what a tester can set, its defaults, and the race it runs.
 * The field is built exactly like `pnpm sim:race` builds it (`buildField` of @falconess/race-view:
 * generateField, freezeEntry, neutralFixtureEntry) and the race is `simulateRace` with detail
 * "full"; the form only picks ids and numbers from content and the ruleset.
 */
import {
  buildField,
  FIELD_LIMITS,
  type FieldSpec,
  learnableSkills,
  signatureFrameOf,
} from "@falconess/race-view";
import type { ContentIndex, RaceLog } from "@falconess/schema";
import {
  freezeEntry,
  generateField,
  neutralFixtureEntry,
  type SimContext,
  simulateRace,
} from "@falconess/sim";

export type FreeRaceForm = {
  readonly courseId: string;
  readonly seed: string;
  /** The player against class-matched rivals, or eight neutral fixtures (two per style). */
  readonly field: "player" | "neutral";
  readonly falconessId: string;
  /** "" = her signature frame. */
  readonly frameId: string;
  readonly parts: readonly string[];
  readonly skills: readonly string[];
  /** Her base stats, or the same value in every stat. */
  readonly statsMode: "base" | "uniform";
  readonly stats: number;
  /** Sets the rivals' level: 95 + 9 × week per stat (spec 21.1). */
  readonly turn: number;
  readonly neutralStats: number;
};

/** Parts a frame takes at most (schema `EntryInput.parts`). */
export const MAX_PARTS = 4;

/** Content ids, sorted so lists are stable. */
const ids = (map: ReadonlyMap<string, unknown>) => [...map.keys()].sort();

/** A sensible race at rest: Peregrina on her signature frame against season-start rivals. */
export function defaultForm(content: ContentIndex): FreeRaceForm {
  const falconessId = content.falconess.has("peregrina")
    ? "peregrina"
    : (ids(content.falconess)[0] ?? "");
  const courseId = content.courses.has("ridge") ? "ridge" : (ids(content.courses)[0] ?? "");
  return {
    courseId,
    seed: "1",
    field: "player",
    falconessId,
    frameId: "",
    parts: [],
    skills: [],
    statsMode: "base",
    stats: 300,
    turn: 1,
    neutralStats: FIELD_LIMITS.neutralStats,
  };
}

/** Frames she can race: her signature frame first, then every generic frame. */
export function frameChoices(content: ContentIndex, falconessId: string): string[] {
  const signature = signatureFrameOf(content, falconessId);
  const generic = [...content.frames.values()]
    .filter((f) => f.signatureOf === undefined)
    .map((f) => f.id)
    .sort();
  return signature === undefined ? generic : [signature, ...generic];
}

/** Every part in content. */
export function partChoices(content: ContentIndex): string[] {
  return ids(content.parts);
}

/** Active skills she can carry: generic ones and her own. */
export function skillChoices(content: ContentIndex, falconessId: string): string[] {
  return learnableSkills(content, falconessId).sort();
}

/** An integer in `[min, max]` from a form field; `fallback` for anything else. */
export function intField(text: string, min: number, max: number, fallback: number): number {
  if (!/^\s*\d+\s*$/.test(text)) return fallback;
  const n = Number.parseInt(text, 10);
  return Math.max(min, Math.min(max, n));
}

/**
 * The form with every choice valid for the Falconess it names (a frame, skills or parts left over
 * from another one are dropped), stats and turn inside the field limits.
 */
export function normalizeForm(ctx: SimContext, form: FreeRaceForm): FreeRaceForm {
  const { content } = ctx;
  const frames = frameChoices(content, form.falconessId);
  const skills = new Set(skillChoices(content, form.falconessId));
  const parts = new Set(partChoices(content));
  const L = FIELD_LIMITS;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  return {
    ...form,
    courseId: content.courses.has(form.courseId)
      ? form.courseId
      : (ids(content.courses)[0] ?? form.courseId),
    seed: form.seed.trim() === "" ? "1" : form.seed.trim(),
    frameId: frames.includes(form.frameId) ? form.frameId : "",
    parts: [...new Set(form.parts)].filter((p) => parts.has(p)).slice(0, MAX_PARTS),
    skills: [...new Set(form.skills)]
      .filter((s) => skills.has(s))
      .slice(0, ctx.ruleset.race.maxSkills),
    stats: clamp(form.stats, L.minStat, L.maxStat),
    turn: clamp(form.turn, L.minTurn, L.maxTurn),
    neutralStats: clamp(form.neutralStats, L.minStat, L.maxStat),
  };
}

/** The `sim:race` field the form asks for. */
export function fieldSpecOf(form: FreeRaceForm): FieldSpec {
  if (form.field === "neutral") return { kind: "neutral", stats: form.neutralStats };
  return {
    kind: "player",
    falconessId: form.falconessId,
    frameId: form.frameId === "" ? null : form.frameId,
    parts: [...form.parts],
    skills: [...form.skills],
    stats: form.statsMode === "base" ? null : form.stats,
    turn: form.turn,
    // the pre-race position card is the web's own stage (ADR-0008): her wings' default until then
    position: null,
  };
}

/** The field and the race, run by the sim; throws what the sim throws for an impossible field. */
export function runFreeRace(ctx: SimContext, form: FreeRaceForm): RaceLog {
  const course = ctx.content.getCourse(form.courseId);
  const engine = { generateField, freezeEntry, neutralFixtureEntry };
  const entries = buildField(engine, ctx, course, form.seed, fieldSpecOf(form));
  return simulateRace(ctx.ruleset, entries, course, form.seed, { detail: "full" });
}

/** The same race as `pnpm sim:race` arguments, so a tester can rerun it in a terminal. */
export function cliArgs(form: FreeRaceForm): string {
  const args = ["--seed", form.seed, "--course", form.courseId];
  if (form.field === "neutral") args.push("--neutral", "--stats", String(form.neutralStats));
  else {
    args.push("--falconess", form.falconessId);
    if (form.frameId !== "") args.push("--frame", form.frameId);
    if (form.parts.length > 0) args.push("--parts", form.parts.join(","));
    if (form.skills.length > 0) args.push("--skills", form.skills.join(","));
    if (form.statsMode === "uniform") args.push("--stats", String(form.stats));
    args.push("--turn", String(form.turn));
  }
  const quote = (a: string) => (/^[\w.,:/-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
  return `pnpm sim:race -- ${args.map(quote).join(" ")}`;
}
