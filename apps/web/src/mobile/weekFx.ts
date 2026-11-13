/**
 * What the week did, shown instead of told (owner 2026-11-13): the mood that moved, a new injury
 * and how she slept, as stamps with chevrons like a training's result. Pure: read from the step's
 * log notes (`stepLog`, as «Lo que pasó» reads them) and its two states.
 */
import { stepLog } from "@falconess/race-view";
import type { WeekStep } from "../screens/model/week";

export type WeekFxKind =
  | "mood-up"
  | "mood-down"
  | "injury"
  | "sleep-great"
  | "sleep-normal"
  | "sleep-poor";

/** One effect: its stamp and whether it is good news (gold, rising) or bad (blue, falling). */
export type WeekFx = { readonly kind: WeekFxKind; readonly good: boolean };

/** The week's effects, in the order they play: how she slept, the injury, then the mood. */
export function weekFx(step: WeekStep): WeekFx[] {
  const out: WeekFx[] = [];
  const keys = new Set(stepLog(step.before, step.after).notes);
  if (keys.has("log.vigor.rest.great")) out.push({ kind: "sleep-great", good: true });
  else if (keys.has("log.vigor.rest.normal")) out.push({ kind: "sleep-normal", good: true });
  else if (keys.has("log.vigor.rest.poor")) out.push({ kind: "sleep-poor", good: false });
  if (keys.has("log.train.injury") || keys.has("log.vigor.exhausted"))
    out.push({ kind: "injury", good: false });
  const mood = step.after.mood - step.before.mood;
  if (mood > 0) out.push({ kind: "mood-up", good: true });
  else if (mood < 0) out.push({ kind: "mood-down", good: false });
  return out;
}
