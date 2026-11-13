/**
 * What the week did, shown instead of told (owner 2026-11-13): how she slept, a new injury, the
 * mood that moved, the crews she bonded with, the skill points a race paid and the skills she
 * learned, as stamps with chevrons like a training's result. Pure: read from the step's log notes
 * (`stepLog`, as «Lo que pasó» reads them) and its two states.
 */
import { stepLog } from "@falconess/race-view";
import type { Ruleset } from "@falconess/sim";
import type { WeekStep } from "../screens/model/week";

export type WeekFxKind =
  | "sleep-great"
  | "sleep-normal"
  | "sleep-poor"
  | "injury"
  | "mood-up"
  | "mood-down"
  | "bond"
  | "points"
  | "skills";

/**
 * One effect: whether it is good news (gold, rising) or bad (blue, falling); the crews of a bond
 * (manufacturer ids), the points a race paid, the skills learned.
 */
export type WeekFx = {
  readonly kind: WeekFxKind;
  readonly good: boolean;
  readonly crews?: readonly string[];
  readonly amount?: number;
  readonly skills?: readonly string[];
};

/**
 * Which effects of a race week (owner 2026-11-13): `action` before the race mode (sleep, injury,
 * bonds, skills: what the action did), `race` back on the menu after it (the mood and the points);
 * `all` on any other week.
 */
export type WeekFxPart = "all" | "action" | "race";

/** The week's effects, in the order they play. */
export function weekFx(step: WeekStep, ruleset?: Ruleset, part: WeekFxPart = "all"): WeekFx[] {
  const all = weekFxAll(step, ruleset);
  if (part === "all") return all;
  const raceKind = (e: WeekFx) => e.kind === "points" || e.kind.startsWith("mood-");
  return all.filter((e) => raceKind(e) === (part === "race"));
}

function weekFxAll(step: WeekStep, ruleset?: Ruleset): WeekFx[] {
  const { before, after } = step;
  const out: WeekFx[] = [];
  const keys = new Set(stepLog(before, after).notes);
  if (keys.has("log.vigor.rest.great")) out.push({ kind: "sleep-great", good: true });
  else if (keys.has("log.vigor.rest.normal")) out.push({ kind: "sleep-normal", good: true });
  else if (keys.has("log.vigor.rest.poor")) out.push({ kind: "sleep-poor", good: false });
  if (keys.has("log.train.injury") || keys.has("log.vigor.exhausted"))
    out.push({ kind: "injury", good: false });
  const mood = after.mood - before.mood;
  if (mood > 0) out.push({ kind: "mood-up", good: true });
  else if (mood < 0) out.push({ kind: "mood-down", good: false });
  const crews = Object.keys(after.bond)
    .filter((id) => (after.bond[id] ?? 0) > (before.bond[id] ?? 0))
    .sort();
  // a training's bonds show on its own result (the training screen), with its other «+N»
  const trained = step.input.kind.startsWith("train:");
  if (crews.length > 0 && !trained) out.push({ kind: "bond", good: true, crews });
  // a goal race pays points by place (the Simulator's show on the training screen already)
  const race =
    after.raceResults.length > before.raceResults.length ? after.raceResults.at(-1) : undefined;
  const paid = race ? (ruleset?.season.skillPointsByPlace?.[race.place - 1] ?? 0) : 0;
  if (paid > 0) out.push({ kind: "points", good: true, amount: paid });
  const learned = after.learnedSkills.filter((id) => !before.learnedSkills.includes(id));
  if (learned.length > 0) out.push({ kind: "skills", good: true, skills: learned });
  return out;
}
