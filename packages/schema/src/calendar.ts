import { z } from "zod";
import { ContentError, type ContentIndex } from "./content-index.js";
import { Aptitude, RulesetVersion, Slug, StatName } from "./core.js";
import type { Course } from "./course.js";
import { type Falconess, SeasonGoal } from "./falconess.js";

/**
 * One stat a track asks for, as a letter (owner 2026-11-10: what a track asks is shown with
 * letters, never with numbers). Derived from engine measurements by `pnpm content:track-demands`
 * (docs/formulas.md «Lo que pide una pista»).
 */
export const TrackDemand = z.strictObject({ stat: StatName, letter: Aptitude });
export type TrackDemand = z.infer<typeof TrackDemand>;

/**
 * ADR-0011 §6: a ruleset's season calendar. The goal races come from each Falconess's
 * `seasonGoals`; the optional races (T3) are offered on `offerWeeks` weeks, `offersPerWeek` tracks
 * a week, and every month has a «track of the month» (`monthTrack`, one per month) that fills
 * `monthTrackWeeks` of its offers; the other offers rotate evenly over the `catalogue`. The
 * season does not offer optional races yet (T3): today the calendar weighs the tracks of B3
 * (ADR-0010) as `optionalRunsPerSeason` runs spread like the offers.
 */
export const Calendar = z
  .strictObject({
    id: Slug,
    rulesetVersion: RulesetVersion,
    catalogue: z.array(Slug).min(1),
    offerWeeks: z.number().int().min(1).max(48),
    offersPerWeek: z.number().int().min(1).max(8),
    monthTrackWeeks: z.number().int().min(0).max(4),
    monthTrack: z.array(Slug).length(12),
    optionalRunsPerSeason: z.number().int().min(0).max(48),
    /**
     * Each Falconess's goal races on this ruleset (balance lever «calendario/metas», ADR-0010),
     * by Falconess id; they replace her `seasonGoals` (which v1 and v2 keep) and may run on any
     * catalogue track. A Falconess absent here keeps her `seasonGoals`.
     */
    goals: z.record(Slug, z.array(SeasonGoal).min(1).max(8)).optional(),
    /**
     * What each catalogue track asks for (ADR-0011 §8, 2026-11-10): its 2-3 stats that matter
     * most, the most important first, each with a letter. Generated, never written by hand
     * (`pnpm content:track-demands`); shown by the game's track card. When present, every
     * catalogue track has one.
     */
    trackDemands: z.record(Slug, z.array(TrackDemand).min(2).max(3)).optional(),
  })
  .superRefine((c, ctx) => {
    for (const t of c.monthTrack)
      if (!c.catalogue.includes(t))
        ctx.addIssue({ code: "custom", message: `month track ${t} is not in the catalogue` });
    if (new Set(c.catalogue).size !== c.catalogue.length)
      ctx.addIssue({ code: "custom", message: "catalogue repeats a track" });
    if (c.monthTrackWeeks * c.monthTrack.length > c.offerWeeks * c.offersPerWeek)
      ctx.addIssue({
        code: "custom",
        message: "the tracks of the month need more offers than exist",
      });
    for (const [f, goals] of Object.entries(c.goals ?? {})) {
      for (const g of goals)
        if (!c.catalogue.includes(g.courseId))
          ctx.addIssue({
            code: "custom",
            message: `goal ${f} T${g.turn}: ${g.courseId} is not in the catalogue`,
          });
      const turns = goals.map((g) => g.turn);
      if (turns.some((t, i) => i > 0 && t <= (turns[i - 1] ?? 0)))
        ctx.addIssue({ code: "custom", message: `goals of ${f}: turns must go up` });
    }
    if (c.trackDemands) {
      for (const t of c.catalogue)
        if (!c.trackDemands[t])
          ctx.addIssue({ code: "custom", message: `trackDemands: no demands for track ${t}` });
      for (const [t, ds] of Object.entries(c.trackDemands)) {
        if (!c.catalogue.includes(t))
          ctx.addIssue({ code: "custom", message: `trackDemands: ${t} is not in the catalogue` });
        if (new Set(ds.map((d) => d.stat)).size !== ds.length)
          ctx.addIssue({ code: "custom", message: `trackDemands: ${t} repeats a stat` });
      }
    }
  });
export type Calendar = z.infer<typeof Calendar>;

/**
 * Expected optional runs per season on each catalogue track: `optionalRunsPerSeason` spread like
 * the offer slots (track of the month `monthTrackWeeks` per month, the rest even).
 */
export function calendarOptionalRuns(c: Calendar): Record<string, number> {
  const slots = c.offerWeeks * c.offersPerWeek;
  const even = (slots - c.monthTrackWeeks * c.monthTrack.length) / c.catalogue.length;
  const out: Record<string, number> = {};
  for (const t of c.catalogue) {
    const months = c.monthTrack.filter((x) => x === t).length;
    out[t] = (c.optionalRunsPerSeason * (even + c.monthTrackWeeks * months)) / slots;
  }
  return out;
}

/**
 * The content index a season of the calendar's ruleset plays on: the catalogue tracks join the
 * courses, and each Falconess named in `calendar.goals` races those goals instead of her
 * `seasonGoals`. Pure; the base index is not changed. Throws ContentError if a goal names an
 * unknown Falconess or track, or a catalogue track has no text.
 */
export function withCalendar(
  base: ContentIndex,
  calendar: Calendar,
  catalogue: readonly Course[],
): ContentIndex {
  const problems: string[] = [];
  const courses = new Map(base.courses);
  for (const c of catalogue) {
    if (!courses.has(c.id)) courses.set(c.id, c);
    if (!base.text.has(c.textKey)) problems.push(`courses-v3/${c.id}: missing text "${c.textKey}"`);
  }
  const falconess = new Map<string, Falconess>();
  for (const [id, f] of base.falconess) {
    const goals = calendar.goals?.[id];
    falconess.set(id, goals === undefined ? f : { ...f, seasonGoals: goals });
  }
  for (const [id, goals] of Object.entries(calendar.goals ?? {})) {
    if (!base.falconess.has(id))
      problems.push(`calendars/${calendar.id}: unknown falconess "${id}"`);
    for (const g of goals)
      if (!courses.has(g.courseId))
        problems.push(
          `calendars/${calendar.id}: goal ${id} T${g.turn}: unknown course "${g.courseId}"`,
        );
  }
  if (problems.length > 0) throw new ContentError(problems);
  const getter =
    <T>(map: ReadonlyMap<string, T>, kind: string) =>
    (id: string): T => {
      const v = map.get(id);
      if (v === undefined) throw new Error(`unknown ${kind} "${id}"`);
      return v;
    };
  return {
    ...base,
    falconess,
    courses,
    getFalconess: getter(falconess, "falconess"),
    getCourse: getter(courses, "course"),
  };
}
