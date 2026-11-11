import { Rng } from "@falconess/rng";
import type { StatName } from "@falconess/schema";
import { STAT_ORDER } from "../stats.js";
import { addDelta, type Draft, note, type SimContext } from "./context.js";
import { statCap } from "./difficulty.js";

/**
 * ADR-0013, the inspirations: on each of the ruleset's inspiration weeks, as the week begins, each
 * parent inspires her with the chance of her box's stars and adds `stars × statInheritPerStar` to
 * the box's stat (up to the season's cap; at the cap it notes `log.inherit.capped`). Draws from its own `Rng(`${seed}/inspiration/${turn}`)`,
 * one per parent in order, so no other draw of the season moves. Notes `log.inherit.inspiration`
 * once per parent that inspires her, `log.inherit.none` when none did.
 */
export function inspire(ctx: SimContext, d: Draft): void {
  const I = ctx.ruleset.season.inheritance;
  const parents = d.inheritance;
  if (I === undefined || parents === undefined || parents.length === 0) return;
  if (!I.inspirationTurns.includes(d.turn)) return;
  const rng = new Rng(`${d.seed}/inspiration/${d.turn}`);
  let any = false;
  for (const p of parents) {
    const chance = I.inspirationChancePm[p.stars - 1] ?? 0;
    if (!rng.chancePermille("training", chance)) continue;
    any = true;
    const before = d.stats[p.stat];
    const after = Math.min(
      statCap(ctx.ruleset, d),
      before + p.stars * ctx.ruleset.season.statInheritPerStar,
    );
    d.stats[p.stat] = after;
    if (after !== before) addDelta(d, p.stat, after - before);
    // at the season's cap the inspiration has nothing to add: say so, not «le pasa Agilidad»
    note(d, after === before ? "log.inherit.capped" : `log.inherit.inspiration.${p.stat}`);
  }
  if (!any) note(d, "log.inherit.none");
}

/**
 * ADR-0013, a box's stat factor with luck: the stat drawn among the five, each weighted by how far
 * it is above `statFloor` (at least 1), then its stars by the drawn stat's value. Draws from its
 * own `Rng(`${seed}/box/${inputsHash}`)`: the same season always leaves the same box.
 */
export function rollBoxStat(
  ctx: SimContext,
  stats: Readonly<Record<StatName, number>>,
  seed: string,
  inputsHash: string,
): { stat: StatName; stars: 1 | 2 | 3 } | undefined {
  const I = ctx.ruleset.season.inheritance;
  if (I === undefined) return undefined;
  const rng = new Rng(`${seed}/box/${inputsHash}`);
  const weights = STAT_ORDER.map((s) => Math.max(1, stats[s] - I.statFloor));
  const stat = STAT_ORDER[rng.pickWeighted("training", weights)] ?? "agility";
  const v = stats[stat];
  let row: readonly [number, number, number] = [1000, 0, 0];
  for (const [from, pm] of I.starsByValue) if (v >= from) row = pm;
  const stars = (rng.pickWeighted("training", row) + 1) as 1 | 2 | 3;
  return { stat, stars };
}
