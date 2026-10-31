import type { Rng } from "@falconess/rng";
import type { Aptitude, BlackBox, RunInput, SeasonState, TrainingKind } from "@falconess/schema";
import { resolveFrameBuild } from "../frame-build.js";
import { upgradeAptitude } from "../stats.js";
import { type Draft, note, rngForInput, type SimContext } from "./context.js";
import { rollCrewPresence } from "./hangar.js";
import { rollQuirks } from "./workshop.js";

type StartInput = Extract<RunInput, { kind: "start" }>;

const TRAINING_KINDS: readonly TrainingKind[] = [
  "train:agility",
  "train:stamina",
  "train:technique",
  "train:risk-flight",
  "train:simulator",
];

/** Apply up to two parents' factors (BRIEF §8). Resolved once, at turn 0, with stream `training`. */
function applyInheritance(ctx: SimContext, d: Draft, parents: readonly BlackBox[], rng: Rng): void {
  const S = ctx.ruleset.season;
  for (const p of parents) {
    const { stat, stars } = p.factors.stat;
    d.stats[stat] = Math.min(S.statMax, d.stats[stat] + stars * S.statInheritPerStar);
    const apt = p.factors.aptitude;
    const chance = S.aptitudeInheritChance[apt.stars - 1] ?? 300;
    if (rng.chancePermille("training", chance)) {
      d.styleAptitude[apt.key] = upgradeAptitude(d.styleAptitude[apt.key] as Aptitude);
    }
  }
}

/**
 * Build the turn-1 state from the `start` input. Boneyard frames get their quirks rolled here
 * (stream `quirks`), durability starts full, and the first crew presence is rolled so the player
 * sees who is around before choosing.
 */
export function startSeason(ctx: SimContext, seed: string, input: StartInput): SeasonState {
  const falconess = ctx.content.getFalconess(input.falconessId);
  for (const f of input.hangar) ctx.content.getFrame(f);
  if (new Set(input.hangar).size !== input.hangar.length)
    throw new Error("hangar has duplicate frames");

  const rng = rngForInput(seed, 0);
  const preferred = input.hangar.find(
    (f) => ctx.content.getFrame(f).style === falconess.preferredStyle,
  );
  const equipped = preferred ?? input.hangar[0];
  if (!equipped) throw new Error("hangar is empty");

  const frameQuirks: Record<string, string[]> = {};
  for (const f of input.hangar) {
    const slots = ctx.content.getFrame(f).quirkSlots;
    if (slots > 0) frameQuirks[f] = rollQuirks(ctx, rng, slots);
  }
  const frameDurability: Record<string, number> = {};
  for (const f of input.hangar)
    frameDurability[f] = resolveFrameBuild(ctx.content, f, [], frameQuirks[f] ?? []).durabilityMax;

  const facilityUses = Object.fromEntries(TRAINING_KINDS.map((k) => [k, 0])) as Record<
    TrainingKind,
    number
  >;

  const d: Draft = {
    rulesetVersion: ctx.ruleset.version,
    seed,
    inputsApplied: 1,
    status: "active",
    turn: 1,
    falconessId: falconess.id,
    stats: { ...falconess.baseStats },
    styleAptitude: { ...falconess.styleAptitude },
    mood: 0,
    fatigue: 0,
    injuryTurns: 0,
    skillPoints: 0,
    learnedSkills: [...falconess.uniqueSkills],
    bond: {},
    hangar: [...input.hangar],
    equippedFrame: equipped,
    installedParts: [],
    frameQuirks,
    frameDurability,
    rerollsThisSeason: 0,
    wallet: { feathers: 0, scrap: 0 },
    facilityUses,
    crewPresence: {},
    eventHistory: {},
    raceResults: [],
    log: [],
  };
  applyInheritance(ctx, d, input.parents, rng);
  rollCrewPresence(ctx, d, rng);
  note(d, "log.season.start");
  return d;
}
