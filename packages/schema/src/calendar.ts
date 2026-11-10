import { z } from "zod";
import { RulesetVersion, Slug } from "./core.js";

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
