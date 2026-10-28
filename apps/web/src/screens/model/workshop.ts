/**
 * The workshop as a plan: the frame to equip, the parts to have installed, a repair, Boneyard
 * rerolls and skills to learn, turned into ONE `workshop` input (its ops in an order the sim
 * accepts). The numbers the panel shows come from the sim: builds from `resolveFrameBuild`,
 * the part slots from `installPart`, durability from `maxDurability`, the learn cap from
 * `learnCap` and the reroll costs from `rerollCost`, each asked about the planned state.
 *
 * The checks here only grey out what the sim would refuse; the sim still validates the input and
 * its WorkshopError is shown if it does.
 */
import type { ActiveSkill, PartType, SeasonState, Skill, WorkshopOp } from "@falconess/schema";
import {
  type FrameBuild,
  installPart,
  learnCap,
  maxDurability,
  rerollCost,
  resolveFrameBuild,
  type SimContext,
} from "@falconess/sim";

/** Most ops one workshop input carries (RunInput schema). */
export const MAX_WORKSHOP_OPS = 8;

export const PART_TYPE_ORDER: readonly PartType[] = [
  "turbine",
  "battery",
  "stabilizer",
  "firmware",
];

export type WorkshopPlan = {
  /** The frame to have equipped. */
  readonly frameId: string;
  /** The parts to have installed, at most one per type. */
  readonly parts: readonly string[];
  readonly repair: boolean;
  /** Boneyard frames to reroll, in order (a frame can appear more than once). */
  readonly rerolls: readonly string[];
  /** Skills to learn, in order. */
  readonly learn: readonly string[];
};

/** The plan that changes nothing: the state as it is. */
export function emptyPlan(state: SeasonState): WorkshopPlan {
  return {
    frameId: state.equippedFrame,
    parts: [...state.installedParts],
    repair: false,
    rerolls: [],
    learn: [],
  };
}

/** The installed part of a type, if any. */
export function partOfType(
  ctx: SimContext,
  parts: readonly string[],
  type: PartType,
): string | undefined {
  return parts.find((id) => ctx.content.getPart(id).type === type);
}

/** Set (or clear, with undefined) the part of one type in a plan, through the sim's `installPart`. */
export function withPart(
  ctx: SimContext,
  plan: WorkshopPlan,
  type: PartType,
  partId: string | undefined,
): WorkshopPlan {
  const kept = plan.parts.filter((id) => ctx.content.getPart(id).type !== type);
  const parts =
    partId === undefined
      ? kept
      : installPart(ctx.content, kept, partId, ctx.ruleset.season.maxParts);
  return { ...plan, parts };
}

/**
 * The plan as workshop ops: equip, removed parts, installed parts (one op replaces a part of the
 * same type), rerolls, repair, skills. Build changes and rerolls come before the repair and the
 * learning, so the repair fills the build as it ends up and the learn cap counts the planned
 * firmware.
 */
export function planOps(ctx: SimContext, state: SeasonState, plan: WorkshopPlan): WorkshopOp[] {
  const ops: WorkshopOp[] = [];
  if (plan.frameId !== state.equippedFrame) ops.push({ op: "equip-frame", frameId: plan.frameId });
  for (const type of PART_TYPE_ORDER) {
    const before = partOfType(ctx, state.installedParts, type);
    const after = partOfType(ctx, plan.parts, type);
    if (before !== undefined && after === undefined)
      ops.push({ op: "remove-part", partId: before });
  }
  for (const type of PART_TYPE_ORDER) {
    const before = partOfType(ctx, state.installedParts, type);
    const after = partOfType(ctx, plan.parts, type);
    if (after !== undefined && after !== before) ops.push({ op: "install-part", partId: after });
  }
  for (const frameId of plan.rerolls) ops.push({ op: "reroll-quirks", frameId });
  if (plan.repair) ops.push({ op: "repair" });
  for (const skillId of plan.learn) ops.push({ op: "learn-skill", skillId });
  return ops;
}

/** The state as the plan's build would leave it (for the sim's build functions only). */
function plannedState(state: SeasonState, plan: WorkshopPlan): SeasonState {
  return { ...state, equippedFrame: plan.frameId, installedParts: [...plan.parts] };
}

/** A frame's build with given parts (parts only count on the equipped frame). */
export function buildOf(
  ctx: SimContext,
  state: SeasonState,
  frameId: string,
  parts: readonly string[],
): FrameBuild {
  return resolveFrameBuild(ctx.content, frameId, parts, state.frameQuirks[frameId] ?? []);
}

export type Durability = { readonly current: number; readonly max: number };

/** A hangar frame's durability now (a stored value above the maximum counts as the maximum). */
export function durabilityOf(ctx: SimContext, state: SeasonState, frameId: string): Durability {
  const max = maxDurability(ctx, state, frameId);
  return { current: Math.min(max, state.frameDurability[frameId] ?? max), max };
}

export type PlanReport = {
  readonly ops: readonly WorkshopOp[];
  /** More ops than one workshop input takes. */
  readonly tooMany: boolean;
  /** Build now and as planned. */
  readonly before: FrameBuild;
  readonly after: FrameBuild;
  /**
   * The planned frame's durability before the repair, and its maximum on the planned build with
   * its current quirks (a planned reroll of that frame changes the maximum: see `rerollsFrame`).
   */
  readonly durability: Durability;
  /** The plan rerolls the planned frame's quirks: its build is only known after the order. */
  readonly rerollsFrame: boolean;
  /** Scrap each planned reroll costs, in order (each reroll makes the next dearer). */
  readonly rerollCosts: readonly number[];
  readonly scrapLeft: number;
  readonly skillPointsLeft: number;
  /** Skills the build holds now, the planned build can hold, and how many it would hold. */
  readonly capNow: number;
  readonly cap: number;
  readonly learnedAfter: number;
  /** Learned skills that no longer fit the planned build (e.g. removing Altair's firmware). */
  readonly overCap: boolean;
  /** Something the sim would refuse: too many ops, too little scrap or points, over the cap. */
  readonly blocked: boolean;
};

export function planReport(ctx: SimContext, state: SeasonState, plan: WorkshopPlan): PlanReport {
  const ops = planOps(ctx, state, plan);
  const planned = plannedState(state, plan);
  const rerollCosts = plan.rerolls.map((_, k) =>
    rerollCost(ctx, { ...state, rerollsThisSeason: state.rerollsThisSeason + k }),
  );
  const scrapLeft = state.wallet.scrap - rerollCosts.reduce((a, b) => a + b, 0);
  const skillPointsLeft =
    state.skillPoints - plan.learn.reduce((sum, id) => sum + ctx.content.getSkill(id).cost, 0);
  const cap = learnCap(ctx, planned);
  const learnedAfter = state.learnedSkills.length + plan.learn.length;
  const overCap = learnedAfter > cap;
  const stored = state.frameDurability[plan.frameId];
  const max = maxDurability(ctx, planned, plan.frameId);
  const tooMany = ops.length > MAX_WORKSHOP_OPS;
  return {
    ops,
    tooMany,
    before: buildOf(ctx, state, state.equippedFrame, state.installedParts),
    after: buildOf(ctx, state, plan.frameId, plan.parts),
    durability: { current: Math.min(max, stored ?? max), max },
    rerollsFrame: plan.rerolls.includes(plan.frameId),
    rerollCosts,
    scrapLeft,
    skillPointsLeft,
    capNow: learnCap(ctx, state),
    cap,
    learnedAfter,
    overCap,
    blocked: tooMany || scrapLeft < 0 || skillPointsLeft < 0 || overCap,
  };
}

/** The scrap the next reroll in this plan would cost. */
export function nextRerollCost(ctx: SimContext, state: SeasonState, plan: WorkshopPlan): number {
  return rerollCost(ctx, {
    ...state,
    rerollsThisSeason: state.rerollsThisSeason + plan.rerolls.length,
  });
}

function isActive(skill: Skill): skill is ActiveSkill {
  return skill.kind === "active";
}

/**
 * Skills this Falconess can still learn in the workshop: actives, not unique to someone else,
 * not learned yet; cheapest first.
 */
export function learnableSkills(ctx: SimContext, state: SeasonState): ActiveSkill[] {
  return [...ctx.content.skills.values()]
    .filter(isActive)
    .filter((s) => s.uniqueTo === undefined || s.uniqueTo === state.falconessId)
    .filter((s) => !state.learnedSkills.includes(s.id))
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
}

/** Hangar frames whose quirks can be rerolled (Boneyard). */
export function rerollableFrames(ctx: SimContext, state: SeasonState): string[] {
  return state.hangar.filter((id) => ctx.content.getFrame(id).quirkSlots > 0);
}
