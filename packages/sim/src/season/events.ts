import type { Rng } from "@falconess/rng";
import type { EventEffects, GameEvent } from "@falconess/schema";
import { STAT_ORDER } from "../stats.js";
import { addDelta, type Draft, note, type SimContext } from "./context.js";
import { addBond, hangarManufacturers } from "./hangar.js";
import { learnCap, maxDurability } from "./workshop.js";

function sourceMatches(ctx: SimContext, d: Draft, e: GameEvent): boolean {
  switch (e.source.kind) {
    case "random":
      return true;
    case "falconess":
      return e.source.falconess === d.falconessId;
    case "crew":
      return (
        hangarManufacturers(ctx, d).includes(e.source.manufacturer) &&
        (d.bond[e.source.manufacturer] ?? 0) >= e.source.minBond
      );
    case "race-result":
      return d.lastRace?.turn === d.turn && d.lastRace.outcome === e.source.result;
  }
}

function conditionsMet(d: Draft, e: GameEvent): boolean {
  const [lo, hi] = e.conditions.turnRange;
  if (d.turn < lo || d.turn > hi) return false;
  if ((d.eventHistory[e.id] ?? 0) >= e.conditions.maxOccurrences) return false;
  return e.conditions.requires.every((r) => (d.eventHistory[r] ?? 0) > 0);
}

/** Events eligible this turn, sorted by id for a stable draw order. */
export function eligibleEvents(
  ctx: SimContext,
  d: Draft,
): { story: GameEvent[]; weighted: GameEvent[] } {
  const story: GameEvent[] = [];
  const weighted: GameEvent[] = [];
  for (const e of [...ctx.content.events.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!sourceMatches(ctx, d, e) || !conditionsMet(d, e)) continue;
    if (e.weight === null) {
      if (e.fixedTurn === d.turn) story.push(e);
    } else weighted.push(e);
  }
  return { story, weighted };
}

/** Pick at most one event for this turn. Story events always fire; weighted ones roll `eventChance`. */
export function rollEvent(ctx: SimContext, d: Draft, rng: Rng): void {
  const { story, weighted } = eligibleEvents(ctx, d);
  const first = story[0];
  if (first) {
    d.pendingEvent = { eventId: first.id, turn: d.turn };
    return;
  }
  if (weighted.length === 0) return;
  if (!rng.chancePermille("events", ctx.ruleset.season.eventChance)) return;
  const i = rng.pickWeighted(
    "events",
    weighted.map((e) => e.weight ?? 0),
  );
  const chosen = weighted[i];
  if (chosen) d.pendingEvent = { eventId: chosen.id, turn: d.turn };
}

/**
 * Apply one effect block. Durability moves within [0, the equipped build's maximum] from the
 * value a race would start with (a stored value above the maximum counts as the maximum): durability
 * persists between races (ADR-0003 D35), so an excess would be a hidden buffer against later damage.
 * `learnSkill` respects the learn cap (ADR-0003 D36): at the cap the skill is not learned.
 */
export function applyEffects(ctx: SimContext, d: Draft, fx: EventEffects): void {
  const S = ctx.ruleset.season;
  for (const stat of STAT_ORDER) {
    const delta = fx.stats[stat];
    if (delta === undefined || delta === 0) continue;
    const before = d.stats[stat];
    d.stats[stat] = Math.max(S.statMin, Math.min(S.statMax, before + delta));
    if (d.stats[stat] !== before) addDelta(d, stat, d.stats[stat] - before);
  }
  d.mood = Math.max(-2, Math.min(2, d.mood + fx.mood));
  d.fatigue = Math.max(0, Math.min(S.fatigueMax, d.fatigue + fx.fatigue));
  for (const [m, delta] of Object.entries(fx.bond)) addBond(ctx, d, m, delta);
  d.skillPoints = Math.max(0, d.skillPoints + fx.skillPoints);
  d.wallet.scrap = Math.max(0, d.wallet.scrap + fx.scrap);
  d.wallet.feathers = Math.max(0, d.wallet.feathers + fx.feathers);
  if (fx.durability !== 0) {
    const max = maxDurability(ctx, d, d.equippedFrame);
    const cur = Math.min(max, d.frameDurability[d.equippedFrame] ?? max);
    d.frameDurability[d.equippedFrame] = Math.max(0, Math.min(max, cur + fx.durability));
  }
  if (fx.injuryTurns > 0) d.injuryTurns = Math.max(d.injuryTurns, fx.injuryTurns);
  if (
    fx.learnSkill !== undefined &&
    !d.learnedSkills.includes(fx.learnSkill) &&
    d.learnedSkills.length < learnCap(ctx, d)
  )
    d.learnedSkills.push(fx.learnSkill);
}

export function resolveEvent(ctx: SimContext, d: Draft, optionIndex: number, rng: Rng): void {
  const pending = d.pendingEvent;
  if (!pending) throw new Error("no pending event");
  const e = ctx.content.getEvent(pending.eventId);
  const opt = e.options[optionIndex];
  if (!opt) throw new Error(`event ${e.id} has no option ${optionIndex}`);
  applyEffects(ctx, d, opt.effects);
  if (opt.chance) {
    const weights = opt.chance.map((b) => Math.round(b.p * 1000));
    const branch = opt.chance[rng.pickWeighted("events", weights)];
    if (branch) applyEffects(ctx, d, branch.effects);
  }
  d.eventHistory[e.id] = (d.eventHistory[e.id] ?? 0) + 1;
  note(d, e.textKey);
  delete d.pendingEvent;
}
