/**
 * A training's result on the training screen (owner 2026-11-11, like Umamusume's): what it came
 * to, the stats it moved and the skill points, and when each «+N» lands. Pure and text-free
 * (flow/imports.test.ts): the training screen and MobileGame read it, the node tests too.
 */
import { resolveLoggedEvent, stepLog } from "@falconess/race-view";
import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import { inSync, type SimContext, STAT_ORDER, vigor } from "@falconess/sim";
import type { Step } from "../../game/controller";
import type { WeekActionInput } from "../../screens/model/position";
import type { TrainingCard } from "../model";

/** What a training came to: its stamp (and its sound). */
export type TrainOutcome = "success" | "boost" | "fail";

/** What a week's action sounds like: a training's result (a crew there makes it a boost), else a confirm. */
export type TrainingCue = TrainOutcome | "confirm";

/**
 * A training's result: what it came to, the stats it moved and the skill points, and where the
 * numbers count up from.
 */
export type TrainResult = {
  readonly kind: TrainingKind;
  readonly outcome: TrainOutcome;
  readonly gains: readonly { readonly stat: StatName; readonly delta: number }[];
  readonly points: number;
  readonly from: Readonly<Record<StatName, number>>;
  readonly fromPoints: number;
  /** owner 2026-11-13: the vigor it cost (or gave) and the crews it bonded with, with the rest. */
  readonly vigor: number;
  readonly bonds: readonly { readonly manufacturer: string; readonly delta: number }[];
  /** ADR-0016: the crews in sintonía she trained with (their +25 %). */
  readonly sync: readonly string[];
  /** Every crew that stood at this training (they come in with their bond). */
  readonly crews: readonly string[];
};

const DROP = 460;

/**
 * The result's clock (ms from the confirm tap). The stamp lands at `stamp`; the stats slide down
 * in `drop` (from 80 ms; Mobile.module.css `.stripDown`), then the crews come in from `crewIn`,
 * one every `crewStep`; the first «+N» lands at `firstPop` and each next one `popStep` later; the
 * result stays `hold` after its last «+N», then the week goes on (a tap goes sooner).
 */
export const RESULT = {
  stamp: 120,
  drop: DROP,
  crewIn: 80 + DROP,
  crewStep: 150,
  firstPop: 520,
  popStep: 300,
  hold: 1100,
} as const;

/**
 * When each «+N» of a result lands (ms): the stats, the skill points, the vigor, then one slot per
 * crew's bond; and when the result ends. «Ritmo» (owner 2026-11-14) shortens the steps, the crews'
 * stagger and the hold by `k` (`paceScale`), never the first pop, the drop or the stamp; `k` is
 * required, so no caller reads the module's pace by mistake.
 *
 * No «+N» shows on stage for a bond any more (the crews' cards carry it), yet the bonds keep their
 * slots: they hold the result long enough to read the crews' cards (a design call, map-dead D28).
 * The HUD's vigor bar reads `vigor`.
 */
export function resultTimeline(
  result: TrainResult,
  k: number,
): {
  readonly stats: Partial<Record<StatName, number>>;
  readonly points: number | undefined;
  readonly vigor: number | undefined;
  readonly bonds: Readonly<Record<string, number>>;
  readonly end: number;
} {
  let i = 0;
  const step = RESULT.popStep * k;
  const next = () => RESULT.firstPop + step * i++;
  const stats = Object.fromEntries(result.gains.map((g) => [g.stat, next()]));
  const points = result.points > 0 ? next() : undefined;
  const vigor = result.vigor !== 0 ? next() : undefined;
  const bonds = Object.fromEntries(result.bonds.map((b) => [b.manufacturer, next()]));
  const crewsIn =
    RESULT.crewIn + RESULT.crewStep * k * Math.max(0, result.crews.length - 1) + 450 * k;
  return {
    stats,
    points,
    vigor,
    bonds,
    end: Math.max(RESULT.firstPop + step * Math.max(0, i - 1), crewsIn) + RESULT.hold * k,
  };
}

/**
 * The stats the week's action moved: `after − before`, less a luck event's own (an event the sim
 * applied by itself that week lists its stats in its own block), in stat order, zeros left out.
 * The text-free twin of `weekSummary(ctx, step).stats` (trainResult.parity.test.ts).
 */
export function statGains(
  ctx: SimContext,
  step: { readonly before: SeasonState; readonly after: SeasonState },
): { readonly stat: StatName; readonly delta: number }[] {
  const { before, after } = step;
  const logged = stepLog(before, after).event;
  const own = logged?.auto === true ? resolveLoggedEvent(ctx.content, logged)?.stats : undefined;
  const luck = new Map((own ?? []).map(({ stat, delta }) => [stat, delta]));
  return STAT_ORDER.map((stat) => ({
    stat,
    delta: after.stats[stat] - before.stats[stat] - (luck.get(stat) ?? 0),
  })).filter((s) => s.delta !== 0);
}

const results = new WeakMap<Step, Map<string, TrainResult>>();

/**
 * The result of a training's `step`: what it came to and the skill points to count up (the step's
 * own, or a race week preview's Simulator points). The same object for the same step and
 * arguments (a step belongs to one run, so to one ruleset and its content).
 */
export function trainResultOf(
  ctx: SimContext,
  kind: TrainingKind,
  outcome: TrainOutcome,
  step: Step,
  points: number,
): TrainResult {
  const key = `${kind}|${outcome}|${points}`;
  let byKey = results.get(step);
  if (!byKey) {
    byKey = new Map();
    results.set(step, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const { before, after } = step;
  const crews = before.crewPresence[kind] ?? [];
  const result: TrainResult = {
    kind,
    outcome,
    gains: statGains(ctx, step),
    points,
    from: before.stats,
    fromPoints: before.skillPoints,
    vigor: vigor(ctx.ruleset, after.fatigue) - vigor(ctx.ruleset, before.fatigue),
    bonds: Object.keys(after.bond)
      .sort()
      .map((m) => ({ manufacturer: m, delta: (after.bond[m] ?? 0) - (before.bond[m] ?? 0) }))
      .filter((b) => b.delta > 0),
    crews,
    sync: crews.filter((m) => inSync(ctx, before.bond[m] ?? 0)),
  };
  byKey.set(key, result);
  return result;
}

/**
 * A week's sound: a training's result (a crew there makes it a boost), else a confirm. A training
 * that rested by rule (an injured week, a v1 forced rest) had no result: a confirm too (F4, O2).
 */
export function trainingCue(
  input: WeekActionInput,
  turn: number,
  after: SeasonState | undefined,
  cards: readonly Pick<TrainingCard, "kind" | "boosted">[],
): TrainingCue {
  const card = cards.find((c) => c.kind === input.kind);
  if (!card) return "confirm";
  const notes = after?.log.find((e) => e.turn === turn && e.input?.kind === input.kind)?.notes;
  if (notes?.includes("log.train.ok")) return card.boosted ? "boost" : "success";
  return notes?.includes("log.train.fail") || notes?.includes("log.train.injury")
    ? "fail"
    : "confirm";
}
