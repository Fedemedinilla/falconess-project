import type { Rng } from "@falconess/rng";
import type {
  Aptitude,
  BlackBox,
  Distance,
  DistanceAptitudes,
  Falconess,
  RunInput,
  SeasonState,
  TrainingKind,
} from "@falconess/schema";
import { DEFAULT_POSITION, DISTANCES } from "@falconess/schema";
import { resolveFrameBuild } from "../frame-build.js";
import { flightOf } from "../race/flight.js";
import type { Ruleset } from "../rulesets/index.js";
import { aptitudeRank, upgradeAptitude } from "../stats.js";
import { type Draft, logInspiration, note, rngForInput, type SimContext } from "./context.js";
import { statCap } from "./difficulty.js";
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
  parents.forEach((p, parent) => {
    const { stat, stars } = p.factors.stat;
    const before = d.stats[stat];
    d.stats[stat] = Math.min(statCap(ctx.ruleset, d), before + stars * S.statInheritPerStar);
    const apt = p.factors.aptitude;
    const chance = S.aptitudeInheritChance[apt.stars - 1] ?? 300;
    const from = d.positionAptitude[apt.key] as Aptitude;
    let lifted = false;
    if (rng.chancePermille("training", chance)) {
      d.positionAptitude[apt.key] = upgradeAptitude(from);
      lifted = d.positionAptitude[apt.key] !== from;
    }
    // ADR-0013 (v3): what each box gave, for the game's inheritance card
    if (S.inheritance !== undefined)
      logInspiration(d, {
        parent,
        stars,
        inspired: true,
        stat,
        gain: d.stats[stat] - before,
        ...(lifted
          ? {
              letter: {
                position: apt.key,
                from,
                to: d.positionAptitude[apt.key] as Aptitude,
              },
            }
          : {}),
      });
  });
}

/** A distance a black box can lift: up to B, never to a specialist's A (owner 2026-11-09). */
const BOX_DISTANCE_CAP: Aptitude = "B";

/**
 * v3 (owner 2026-11-09): her letters per distance for a season, before it starts and with
 * no draw, so the pre-season screen can show them. Birth letters, then the first parent (input
 * order) whose box names a distance she has below B lifts that one letter one step (C → B, D → C):
 * at most one letter per season, never above B, so a box never turns a C into a specialist's A
 * and a B stays B. Undefined with the distance letters off (v1, v2, the flag off) or when the
 * Falconess has no letters.
 */
export function seasonDistanceAptitudes(
  ruleset: Ruleset,
  falconess: Falconess,
  parents: readonly BlackBox[],
): { letters: DistanceAptitudes; boost?: Distance } | undefined {
  const F = flightOf(ruleset);
  if (F === null || !F.distanceLetters || falconess.distanceAptitude === undefined)
    return undefined;
  const letters: DistanceAptitudes = { ...falconess.distanceAptitude };
  for (const p of parents) {
    const key = p.factors.distance?.key;
    if (key === undefined) continue;
    const cur = letters[key];
    if (aptitudeRank(cur) >= aptitudeRank(BOX_DISTANCE_CAP)) continue;
    letters[key] = upgradeAptitude(cur);
    return { letters, boost: key };
  }
  return { letters };
}

/** Her best birth distance letter (ties in `DISTANCES` order): the factor her black box passes on. */
export function boxDistanceFactor(
  falconess: Falconess,
): { key: Distance; letter: Aptitude } | undefined {
  const d = falconess.distanceAptitude;
  if (d === undefined) return undefined;
  let best: Distance | undefined;
  for (const k of DISTANCES)
    if (best === undefined || aptitudeRank(d[k]) > aptitudeRank(d[best])) best = k;
  return best === undefined ? undefined : { key: best, letter: d[best] };
}

/**
 * Build the turn-1 state from the `start` input. She starts on the first hangar wings whose
 * default position is her preferred one (ADR-0008; the first wings if none). Boneyard frames get
 * their quirks rolled here (stream `quirks`), durability starts full, and the first crew presence
 * is rolled so the player sees who is around before choosing.
 */
export function startSeason(ctx: SimContext, seed: string, input: StartInput): SeasonState {
  const falconess = ctx.content.getFalconess(input.falconessId);
  for (const f of input.hangar) ctx.content.getFrame(f);
  if (new Set(input.hangar).size !== input.hangar.length)
    throw new Error("hangar has duplicate frames");

  if (input.difficulty === "exigente" && ctx.ruleset.season.statCapByDifficulty === undefined)
    throw new Error(`ruleset ${ctx.ruleset.version} has no Exigente difficulty`);
  const rng = rngForInput(seed, 0);
  const preferred = input.hangar.find(
    (f) => DEFAULT_POSITION[ctx.content.getFrame(f).style] === falconess.preferredPosition,
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
    ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
    stats: { ...falconess.baseStats },
    positionAptitude: { ...falconess.positionAptitude },
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
  // ADR-0013: the parents come back at the inspiration weeks (no draw here)
  if (ctx.ruleset.season.inheritance !== undefined && input.parents.length > 0)
    d.inheritance = input.parents.map((p) => ({ ...p.factors.stat }));
  // v3: the distance letters (no draw: the training stream above is untouched)
  const dist = seasonDistanceAptitudes(ctx.ruleset, falconess, input.parents);
  if (dist !== undefined) {
    d.distanceAptitude = dist.letters;
    if (dist.boost !== undefined) d.distanceBoost = dist.boost;
  }
  rollCrewPresence(ctx, d, rng);
  note(d, "log.season.start");
  return d;
}
