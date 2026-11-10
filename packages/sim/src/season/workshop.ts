import type { Rng } from "@falconess/rng";
import type { WorkshopOp } from "@falconess/schema";
import { installPart, resolveFrameBuild } from "../frame-build.js";
import { flightOf } from "../race/flight.js";
import { changeFatigue, type Draft, note, type SimContext } from "./context.js";

export function rerollCost(ctx: SimContext, d: Draft): number {
  const base = ctx.content.economy?.rerollBaseScrap ?? ctx.ruleset.season.rerollBaseScrap;
  return base * (1 + d.rerollsThisSeason);
}

/** Draw `slots` distinct quirks for a frame. Uses stream `quirks` so rerolls never shift training. */
export function rollQuirks(ctx: SimContext, rng: Rng, slots: number): string[] {
  const ids = [...ctx.content.quirks.keys()].sort();
  return rng.shuffle("quirks", ids).slice(0, slots);
}

export function maxDurability(ctx: SimContext, d: Draft, frameId: string): number {
  const parts = frameId === d.equippedFrame ? d.installedParts : [];
  return resolveFrameBuild(ctx.content, frameId, parts, d.frameQuirks[frameId] ?? []).durabilityMax;
}

/**
 * How many skills the Falconess can hold (ADR-0003 D36): `maxLearnedSkills` plus the equipped
 * build's `skillSlots` (altair-firmware), at most the race's `maxSkills` actives per entry (8).
 */
export function learnCap(ctx: SimContext, d: Draft): number {
  const build = resolveFrameBuild(
    ctx.content,
    d.equippedFrame,
    d.installedParts,
    d.frameQuirks[d.equippedFrame] ?? [],
  );
  return Math.min(
    ctx.ruleset.race.maxSkills,
    ctx.ruleset.season.maxLearnedSkills + build.skillSlots,
  );
}

/**
 * A workshop input the season rejects (the whole input, with the state unchanged): an id that is
 * not in the content or the hangar, a missing resource, or a limit.
 */
export class WorkshopError extends Error {}

/**
 * After an op that changes the build (frame or parts): the skills already learned must still fit
 * the learn cap (ADR-0003 D36), else removing or replacing `altair-firmware` would keep its extra
 * skill on a build without the slot (and free the firmware slot for a second firmware).
 */
function checkSkillsFit(ctx: SimContext, d: Draft, op: string): void {
  const cap = learnCap(ctx, d);
  if (d.learnedSkills.length > cap)
    throw new WorkshopError(
      `${op}: ${d.learnedSkills.length} skills learned and the build would hold ${cap} (skill slots in use)`,
    );
}

export function applyWorkshop(
  ctx: SimContext,
  d: Draft,
  ops: readonly WorkshopOp[],
  rng: Rng,
): void {
  const S = ctx.ruleset.season;
  for (const op of ops) {
    switch (op.op) {
      case "equip-frame": {
        if (!d.hangar.includes(op.frameId))
          throw new WorkshopError(`frame ${op.frameId} is not in the hangar`);
        d.equippedFrame = op.frameId;
        checkSkillsFit(ctx, d, `equip ${op.frameId}`);
        break;
      }
      case "install-part": {
        if (!ctx.content.parts.has(op.partId)) throw new WorkshopError(`unknown part ${op.partId}`);
        d.installedParts = installPart(ctx.content, d.installedParts, op.partId, S.maxParts);
        checkSkillsFit(ctx, d, `install ${op.partId}`);
        break;
      }
      case "remove-part": {
        if (!d.installedParts.includes(op.partId))
          throw new WorkshopError(`part ${op.partId} is not installed`);
        d.installedParts = d.installedParts.filter((p) => p !== op.partId);
        checkSkillsFit(ctx, d, `remove ${op.partId}`);
        break;
      }
      case "repair": {
        // ADR-0011: wings never wear in v3, so there is nothing to repair
        if (flightOf(ctx.ruleset)?.noWear === true)
          throw new WorkshopError("repair: wings never wear on this ruleset");
        d.frameDurability[d.equippedFrame] = maxDurability(ctx, d, d.equippedFrame);
        break;
      }
      case "reroll-quirks": {
        if (!d.hangar.includes(op.frameId))
          throw new WorkshopError(`frame ${op.frameId} is not in the hangar`);
        const frame = ctx.content.getFrame(op.frameId);
        if (frame.quirkSlots === 0)
          throw new WorkshopError(`frame ${op.frameId} has no quirk slots`);
        const cost = rerollCost(ctx, d);
        if (d.wallet.scrap < cost)
          throw new WorkshopError(`need ${cost} scrap, have ${d.wallet.scrap}`);
        d.wallet.scrap -= cost;
        d.rerollsThisSeason += 1;
        d.frameQuirks[op.frameId] = rollQuirks(ctx, rng, frame.quirkSlots);
        break;
      }
      case "learn-skill": {
        const skill = ctx.content.skills.get(op.skillId);
        if (skill === undefined) throw new WorkshopError(`unknown skill ${op.skillId}`);
        if (skill.kind !== "active")
          throw new WorkshopError(`${op.skillId} is a passive; it comes with a frame`);
        if (skill.uniqueTo !== undefined && skill.uniqueTo !== d.falconessId)
          throw new WorkshopError(`${op.skillId} is unique to ${skill.uniqueTo}`);
        if (d.learnedSkills.includes(op.skillId))
          throw new WorkshopError(`${op.skillId} already learned`);
        const limit = learnCap(ctx, d);
        if (d.learnedSkills.length >= limit)
          throw new WorkshopError(`skill limit ${limit} reached`);
        if (d.skillPoints < skill.cost)
          throw new WorkshopError(`need ${skill.cost} skill points, have ${d.skillPoints}`);
        d.skillPoints -= skill.cost;
        d.learnedSkills.push(op.skillId);
        break;
      }
    }
  }
  note(d, "log.workshop");
  changeFatigue(ctx, d, S.fatigueCost.workshop);
}
