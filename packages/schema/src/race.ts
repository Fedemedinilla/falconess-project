import { z } from "zod";
import {
  Aptitude,
  DistanceAptitudes,
  FalconessStats,
  Mood,
  Position,
  PositionAptitudes,
  RacePhase,
  RulesetVersion,
  SegmentType,
  Slug,
  Style,
  Version,
} from "./core.js";
import { ManufacturerRule } from "./manufacturer.js";

/**
 * Race engine v1 data formats (docs/race-engine.md sections 3, 16 and 20). Everything here is an
 * integer in public units: mm, mm/s, mm/s², milli-units of energy, heat and durability, milli-hp,
 * per-mille (1000 = ×1.0), ticks (1/15 s) and milli-ticks. No decimals are stored (property P8);
 * zod's `int()` also rejects unsafe integers. Internal engine units (pu, vu, µhp) never appear.
 */

const Int = z.number().int();
const Nat = Int.min(0);
const Pm = Int.min(0).max(1000);
const Lane = Int.min(0).max(7);
const Triple = z.tuple([Int, Int, Int]);
/** One integer per segment type, indexed in `SEGMENT_TYPES` order. */
const PerSegmentType = z.array(Int).length(7);

/**
 * The rule a race entry runs: a manufacturer rule, or "none" for the neutral fixture of
 * docs/race-engine.md 3.4 (tests and batch only; ADR-0003 D42). `Manufacturer.rule` stays
 * `ManufacturerRule`: content never says "none".
 */
export const RaceRule = z.enum([...ManufacturerRule.options, "none"]);
export type RaceRule = z.infer<typeof RaceRule>;
export const RACE_RULES = RaceRule.options;

export const RunnerKind = z.enum(["player", "rival", "ghost"]);
export type RunnerKind = z.infer<typeof RunnerKind>;

/** What `freezeEntry` turns into a `RaceEntry` (3.1); built by the season and the batch. */
export const EntryInput = z.strictObject({
  /** "player", "rival-1".."rival-7", batch ids. */
  runnerId: z.string().min(1),
  kind: RunnerKind,
  falconessId: Slug.nullable(),
  baseStats: FalconessStats,
  mood: Mood,
  positionAptitude: PositionAptitudes,
  /** v3 draft (owner 2026-11-09): her letter per distance; absent = no letter (v1, v2, flags off). */
  distanceAptitude: DistanceAptitudes.optional(),
  /** The race position (ADR-0008); absent = the default of her frame's style (`DEFAULT_POSITION`). */
  position: Position.optional(),
  frameId: Slug,
  parts: z.array(Slug).max(4),
  quirks: z.array(Slug).max(2),
  learnedSkills: z.array(Slug),
  /** Season `frameDurability`; null = full. */
  durability: Nat.nullable(),
});
export type EntryInput = z.infer<typeof EntryInput>;

/** Effective stat after mood, aptitude and `falconess-stat` deltas (3.1). */
const EffectiveStat = Int.min(1).max(2000);
export const RaceStats = z.strictObject({
  agility: EffectiveStat,
  stamina: EffectiveStat,
  technique: EffectiveStat,
  courage: EffectiveStat,
  intelligence: EffectiveStat,
});
export type RaceStats = z.infer<typeof RaceStats>;

export const RaceSkillTrigger = z
  .strictObject({
    phase: RacePhase,
    segment: SegmentType.nullable(),
    /** Position range as per-mille of the field (0 = leader, 1000 = last), inclusive. */
    posLoPm: Pm.nullable(),
    posHiPm: Pm.nullable(),
    heatAboveMilli: Int.nullable(),
    energyBelowMilli: Int.nullable(),
    once: z.boolean(),
  })
  .refine((t) => (t.posLoPm === null) === (t.posHiPm === null), {
    message: "posLoPm and posHiPm are both null or both set",
    path: ["posHiPm"],
  });
export type RaceSkillTrigger = z.infer<typeof RaceSkillTrigger>;

export const RaceSkillEffect = z.strictObject({
  speedMms: Int.min(-3000).max(3000),
  accelMms2: Int.min(-1000).max(1000),
  energyRefundMilli: Int.min(0).max(60_000),
  heatCoolMilli: Int.min(0).max(60_000),
  durabilityGuard: z.boolean(),
  durationTicks: Int.min(0).max(300),
});
export type RaceSkillEffect = z.infer<typeof RaceSkillEffect>;

/** A frozen active skill (3.2). */
export const RaceSkill = z.strictObject({
  id: Slug,
  uniqueTo: Slug.nullable(),
  activationBasePm: Pm,
  trigger: RaceSkillTrigger,
  effect: RaceSkillEffect,
  /** Batch ablation switch (15.2, ADR-0003 D49): p = 0, draws and slots unchanged. */
  disabled: z.boolean(),
});
export type RaceSkill = z.infer<typeof RaceSkill>;

/** Passive modifiers compiled into integers (section 16); arrays of 7 follow `SEGMENT_TYPES`. */
export const RaceTraits = z.strictObject({
  /** 0 = no override, else the max of the override values. */
  segOverridePm: z.array(z.union([z.literal(0), Int.min(500).max(1500)])).length(7),
  segMultiplyPm: PerSegmentType,
  curvesScalePm: Nat,
  heatImmune: z.boolean(),
  /** null = the whole race (or no immunity). */
  heatImmuneUntilMm: Nat.nullable(),
  obstacleArmor: z.boolean(),
  obstacleArmorExtraTicks: Nat,
  /** me per non-boost tick, on top of the rule's regen. */
  regenMe: Nat,
  packRegenMultPm: Nat,
  /** Bit k = `SEGMENT_TYPES[k]`. */
  freeFirstBoostMask: Int.min(0).max(127),
  /** 0 = none. */
  pulseChainIndex: Nat,
  pulseChainBonusPm: Nat,
  /** Pulse cooldown ticks per segment type; 0 = none. */
  pulseCooldown: z.array(Nat).length(7),
  activationBonusPm: z.strictObject({ start: Nat, middle: Nat, final: Nat, any: Nat }),
  heatToEnergyPm: Pm,
  liftBonusPm: Nat,
  noPulse: z.boolean(),
  randomSkillGuaranteed: z.boolean(),
});
export type RaceTraits = z.infer<typeof RaceTraits>;

/** A frozen runner (3.1): everything `simulateRace` reads about her, integers only. */
export const RaceEntry = z
  .strictObject({
    runnerId: z.string().min(1),
    kind: RunnerKind,
    falconessId: Slug.nullable(),
    laneIndex: Lane,
    frameId: Slug,
    manufacturer: Slug,
    rule: RaceRule,
    /** The wings' style: their physics (9.8). */
    style: Style,
    /** The race position: how she spends energy (9.4, ADR-0008). */
    position: Position,
    /** Sources of the traits, for the "why" panel; the engine reads only `traits`. */
    passive: Slug.nullable(),
    parts: z.array(Slug).max(4),
    quirks: z.array(Slug).max(2),
    mood: Mood,
    /** The letter actually applied: the race position's (ADR-0008). */
    positionAptitude: Aptitude,
    /** v3 draft (owner 2026-11-09): the letter of this course's distance; absent = none (±0). */
    distanceAptitude: Aptitude.optional(),
    stats: RaceStats,
    /** Per-mille, after caps and clamps. */
    powerToWeight: Int.min(500).max(1600),
    energy: Int.min(20).max(200),
    dissipation: Int.min(20).max(120),
    durabilityMax: Int.min(20).max(260),
    durabilityStart: Nat,
    /** Id-sorted, unique. */
    skills: z.array(RaceSkill).max(8),
    traits: RaceTraits,
  })
  .superRefine((e, ctx) => {
    if (e.durabilityStart > e.durabilityMax)
      ctx.addIssue({
        code: "custom",
        message: "durabilityStart exceeds durabilityMax",
        path: ["durabilityStart"],
      });
    for (let j = 1; j < e.skills.length; j++) {
      const prev = e.skills[j - 1];
      const cur = e.skills[j];
      if (prev && cur && !(prev.id < cur.id))
        ctx.addIssue({
          code: "custom",
          message: "skills must be unique and sorted by id",
          path: ["skills", j],
        });
    }
  });
export type RaceEntry = z.infer<typeof RaceEntry>;

/** Per-segment row of the explanation table (intact PW table). */
export const DerivedSegment = z.strictObject({
  fPm: Int,
  cruiseMms: Triple,
  accelMms2: Int,
  vMinMms: Triple,
  /** me */
  jumpReserve: Nat,
});
export type DerivedSegment = z.infer<typeof DerivedSegment>;

/** The explanation table of one runner (20.3), lane order. */
export const RunnerDerived = z.strictObject({
  lane: Lane,
  /** milli-hp */
  hpMax: Nat,
  /** milli-hp: hpMax × stamDiv / 1.2e6 */
  effectiveReserve: Nat,
  stamDiv: Nat,
  fatiguePm: Nat,
  tolerancePm: Nat,
  heatCap: Nat,
  capLim: Nat,
  coolTick: Nat,
  dmgTick: Nat,
  pAct: Pm,
  /** Per skill in id order; 0 for a disabled skill. */
  pSkill: z.array(Pm),
  u: z.array(z.tuple([Pm.max(999), Pm.max(999), Pm.max(999)])),
  luckySkill: Slug.nullable(),
  paceHalfWidthPm: Nat,
  paceCentrePm: Int,
  pace: Triple,
  planErrWindowPm: Nat,
  planErrPm: Int,
  landPm: Nat,
  /** 0 if not ground. */
  detourPm: Nat,
  /** `kickAt = reserveAt` or earlier (9.4); 0 on a course shorter than 60 m (ADR-0003 D53). */
  kickAtMm: Nat,
  /** 1000 if not dive. */
  stoopPm: Nat,
  /** Per segment; 1000 if not a pulse frame. */
  airPm: z.array(Nat),
  boostMms: Nat,
  /** 0 if not a pulse frame. */
  pulseMms: Nat,
  chainMms: Nat,
  liftPm: Nat,
  /** me per jump, course order. */
  jumpNeed: z.array(Nat),
  /** me */
  capFinal: Nat,
  /**
   * The even level of the pack position (9.3), 0 in any other position. The name keeps the wing
   * style whose row the pack position reuses (Rasante, ADR-0008).
   */
  groundLevelMms: Nat,
  /**
   * ‰ of cruise, acceleration, vMin and thrust kept once the wings break (8.4, ADR-0003 D56), on
   * top of the `durabilityBroken` event's PW; `segments` and the thrusts above are the intact table.
   */
  brokenSpeedPm: Pm,
  segments: z.array(DerivedSegment).min(1).max(24),
  /** Ruleset v3, detail full only: the planned flights (the pre-race card). */
  flightPlan: z
    .array(
      z.strictObject({
        aMm: Nat,
        bMm: Nat,
        band: Int.min(1).max(3),
        cornisa: z.boolean(),
      }),
    )
    .max(8)
    .optional(),
});
export type RunnerDerived = z.infer<typeof RunnerDerived>;

/**
 * Bits of `RaceFrames.runners[].flags` (20.4). Part of the log format: viewers read them.
 */
export const RACE_FRAME_FLAGS = {
  boosting: 1,
  pulseBurst: 2,
  pulseCooldown: 4,
  overheated: 8,
  exhausted: 16,
  airborne: 32,
  detour: 64,
  stalled: 128,
  broken: 256,
  planSpurt: 512,
  kick: 1024,
  skillActive: 2048,
  finished: 4096,
  dnf: 8192,
  drafting: 16384,
  /**
   * Altitude band, two bits (ruleset v3 draft, design7 R1): band = altLow + 2 × altHigh, 0 ground,
   * 1 low, 2 high, 3 ceiling. v1 and v2 never set them.
   */
  altLow: 32768,
  altHigh: 65536,
  /**
   * Dirty air (ruleset v3 stage 1.2, L3): another runner in her band ahead while she holds. Round 4:
   * anywhere in the wake (`dirtyM` 11 m, `dirtyHighM` 24 m in the high band); round 5 (F6): only
   * within `fightM`, the rest of the wake tows her (`drafting`).
   */
  dirtyAir: 131072,
  /**
   * Two lines per band (ruleset v3, owner 2026-11-08): she flies the outside line of her band (clear
   * = inside). Only in the air; on the ground there are no lines.
   */
  lineOut: 262144,
} as const;

const Column = z.array(Int);

/** Race-wide samples (20.4): row T is the state after tick T − 1; T = 0 before tick 0. */
export const RaceFrames = z
  .strictObject({
    tick: z.array(Nat),
    runners: z.array(
      z.strictObject({
        posMm: Column,
        vMms: Column,
        hp: Column,
        energy: Column,
        heat: Column,
        durability: Column,
        /** On-ticks since the previous row: the exact duty between sparse rows. */
        boost: Column,
        flags: Column,
      }),
    ),
  })
  .superRefine((f, ctx) => {
    for (let j = 1; j < f.tick.length; j++) {
      const prev = f.tick[j - 1];
      const cur = f.tick[j];
      if (prev !== undefined && cur !== undefined && !(prev < cur))
        ctx.addIssue({
          code: "custom",
          message: "frame ticks strictly increase",
          path: ["tick", j],
        });
    }
    f.runners.forEach((r, i) => {
      for (const [name, col] of Object.entries(r))
        if (col.length !== f.tick.length)
          ctx.addIssue({
            code: "custom",
            message: `column ${name} has ${col.length} rows, tick has ${f.tick.length}`,
            path: ["runners", i, name],
          });
    });
  });
export type RaceFrames = z.infer<typeof RaceFrames>;

/**
 * Why boost was on (9.4); `boostMode` events carry it. The log keeps a (mode, level) only if it
 * holds at least `R.log.sampleEveryTicks` ticks (1 s) and differs from the runner's last logged
 * pair, stamped with the tick it began (ADR-0003 D54); shorter spans show only in the frame
 * `boost` counts. Every runner starts in ("off", 0) without an event.
 */
export const BoostMode = z.enum([
  "off",
  "kick",
  "plan",
  "hold",
  "preheat",
  "surplus",
  "regen-overflow",
  "dive-descent",
  "hover-catchup",
  "glide-chase",
  "ground-constant",
]);
export type BoostMode = z.infer<typeof BoostMode>;
export const BOOST_MODES = BoostMode.options;

export const SprintPlanCause = z.enum(["phase", "refund", "jump", "broken"]);
export type SprintPlanCause = z.infer<typeof SprintPlanCause>;

export const SprintPlanReason = z.enum([
  "planned",
  "hp-limited",
  "past-reserve",
  "no-energy",
  "no-thrust",
  "exhausted",
  "no-candidate",
]);
export type SprintPlanReason = z.infer<typeof SprintPlanReason>;

/** Every event carries the tick, the lane and the runner's position in mm. */
function raceEvent<K extends string, S extends z.ZodRawShape>(kind: K, shape: S) {
  return z.strictObject({ kind: z.literal(kind), tick: Nat, lane: Lane, posMm: Nat, ...shape });
}

/** Events in emission order (20.4): per tick, step-B events in lane order, then finishes. */
export const RaceEvent = z.discriminatedUnion("kind", [
  /** A (mode, level) that held at least 1 s, at the tick it began (ADR-0003 D54). */
  raceEvent("boostMode", { mode: BoostMode, levelMms: Nat }),
  raceEvent("pulse", { chain: Int.min(1), thrustMms: Nat, free: z.boolean(), cooldown: Nat }),
  raceEvent("freeBoost", { segment: SegmentType }),
  raceEvent("sprintPlan", {
    cause: SprintPlanCause,
    index: Nat,
    reason: SprintPlanReason,
    energy: Int,
    energyPerceived: Int,
    hp: Int,
    hpPerceived: Int,
    jumpReserve: Nat,
    startMm: Nat,
    endMm: Nat,
    levelMms: Nat,
    candidates: Nat,
    onTicks: Nat,
    clean: z.boolean(),
  }),
  raceEvent("skill", {
    skillId: Slug,
    p: Pm,
    u: Pm.max(999),
    activation: Nat,
    /** Ruleset v3 (L7): it fired in the air and was held this many ticks, then released whole. */
    heldTicks: Nat.optional(),
  }),
  raceEvent("skillMiss", { skillId: Slug, p: Pm, u: Pm.max(999) }),
  raceEvent("jumpOk", { lift: Nat, required: Nat, energyBefore: Nat }),
  raceEvent("jumpFail", {
    lift: Nat,
    required: Nat,
    energyBefore: Nat,
    damage: Nat,
    stallTicks: Nat,
  }),
  /** Segment index. */
  raceEvent("detour", { segment: Nat }),
  raceEvent("waterHit", { damage: Nat }),
  raceEvent("overheat", { on: z.boolean(), heat: Nat }),
  raceEvent("hpEmpty", {}),
  raceEvent("durabilityBroken", { powerToWeight: Nat }),
  raceEvent("landing", { speedLossMms: Nat }),
  raceEvent("repair", { amount: Nat }),
  raceEvent("heatToEnergy", { heat: Nat, energy: Nat }),
  raceEvent("finish", { finishMilli: Nat, place: Int.min(1) }),
  raceEvent("dnf", {}),
  // ruleset v3 draft (design7 «Despegar y caer»): v1 and v2 never emit these
  /**
   * A planned flight left the ground (or a jump, or a lower band of a chained flight) for `band`,
   * paying `cost` me: from `fromBand`, one band every `climbTicks`, body speed `vMms` before and
   * `vAfterMms` after the launch (S1), the flight's own air `airPm` (L1) and the wing's `style`.
   */
  raceEvent("takeoff", {
    band: Int.min(1).max(3),
    cost: Nat,
    fromBand: Int.min(0).max(2),
    climbTicks: Int.min(1),
    vMms: Nat,
    vAfterMms: Nat,
    airPm: Int,
    style: z.enum(["lance", "column", "ramp", "turbine", "neutral"]),
  }),
  /** The climb reached `band` (one event per band gained after the takeoff's first). */
  raceEvent("bandReached", { band: Int.min(1).max(3) }),
  /** The wings fold: the descent starts from `fromBand` at body speed `vMms`. */
  raceEvent("diveStart", {
    fromBand: Int.min(1).max(3),
    vMms: Nat,
    cause: z.enum(["plan", "energy", "knock"]),
  }),
  /**
   * The flight ended in a dive from `fromBand` (≥ 2): `gainMms` on top of the body speed
   * `vBeforeMms` (the peak is their sum), decaying over `surgeTicks` ticks, `surgeMm` nominal mm.
   */
  raceEvent("dive", {
    fromBand: Int.min(2).max(3),
    gainMms: Nat,
    vBeforeMms: Nat,
    surgeTicks: Nat,
    surgeMm: Nat,
    /**
     * Round 5 (F2): the part of `gainMms` she gained band by band in the air before touching down
     * (her speed just before the touchdown is `vBeforeMms + airMms`), and the mm it carried her.
     */
    airMms: Nat.optional(),
    airMm: Nat.optional(),
  }),
  /**
   * Every end of a flight; `cause` plan (planned point), energy (could not pay to hold: no dive,
   * the landing loss `lossMms`), knock (knocked down to the low band, the dive was lost) or nerve.
   */
  raceEvent("touchdown", {
    fromBand: Int.min(1).max(3),
    lossMms: Nat,
    cause: z.enum(["plan", "energy", "knock", "nerve"]),
  }),
  /**
   * She passed `otherLane` in the air (`band` ≥ 1) or in her dive surge, and the new order held
   * 8 ticks; the event carries the tick the pass happened.
   */
  raceEvent("pass", { otherLane: Lane, band: Int.min(0).max(3), otherBand: Int.min(0).max(3) }),
  /**
   * Round 5 (F9): a dive's touchdown into traffic is a nerve test: `held` (the dive × 1.15,
   * `gainMms`) or she flinched (no dive, touchdown cause nerve); `pPm` her flinch chance.
   */
  raceEvent("nerve", { held: z.boolean(), pPm: Nat, gainMms: Nat }),
  /** Dirty air on (held ≥ 15 ticks, at the tick it began) or off (L3). */
  raceEvent("airDirty", { on: z.boolean() }),
  /** L4: she went over the runner ahead (`over`) or was knocked a band down (`knock`). */
  raceEvent("lineChange", {
    fromBand: Int.min(1).max(3),
    toBand: Int.min(1).max(3),
    cause: z.enum(["over", "knock"]),
    /** Ticks of dirty air in a row before the change. */
    ticks: Nat,
  }),
  /**
   * Two lines per band (2026-11-08): she moved from line `from` to `to` (0 inside, 1 outside) of
   * `band`: to pass the one ahead (pass), to close the door on one passing her (door) or back to
   * the shorter inside line once clear (escape); `diagonal` = in the same move as a band up (over).
   */
  raceEvent("lineSwitch", {
    from: Int.min(0).max(1),
    to: Int.min(0).max(1),
    cause: z.enum(["pass", "door", "escape"]),
    band: Int.min(1).max(3),
    diagonal: z.literal(true).optional(),
  }),
  /** Two lines: she wants to move out of dirty air and `otherLane` is alongside (`aheadLane` ahead). */
  raceEvent("boxedIn", { band: Int.min(1).max(3), otherLane: Lane, aheadLane: Lane }),
  /** Two lines: she moved into `line` in front of `otherLane`, who had just moved there to pass. */
  raceEvent("doorClosed", { otherLane: Lane, band: Int.min(1).max(3), line: Int.min(0).max(1) }),
  /**
   * Two lines: a `pass` in the same band from the other line, by the outside or the inside (`by`;
   * `line` her line); it held 8 ticks like the `pass`, and carries the same tick.
   */
  raceEvent("passSide", {
    otherLane: Lane,
    by: z.enum(["outside", "inside"]),
    band: Int.min(1).max(3),
    line: Int.min(0).max(1),
  }),
  /** A planned takeoff the tank (or an exhausted body) could not afford: she stays on the ground. */
  raceEvent("noLift", { need: Nat, have: Nat }),
  /**
   * Stamina pays effort (owner 2026-11-09): a maneuver cost her body `hp` milli-hp (after her
   * Resistencia), leaving `hpLeft`: a takeoff, a dive pulled out, a line switch, a line fight
   * (over or knock) or the door closed on her. Drips (dirty air, boxed in) only go to the ledger.
   */
  raceEvent("hpHit", {
    cause: z.enum(["takeoff", "dive", "switch", "fight", "door"]),
    hp: Nat,
    hpLeft: Nat,
  }),
]);
export type RaceEvent = z.infer<typeof RaceEvent>;
export type RaceEventKind = RaceEvent["kind"];

/** Flight ledger of the ruleset v3 draft (design7 R1); absent in v1 and v2 logs. */
export const FlightLedger = z.strictObject({
  airTicks: Nat,
  flights: Nat,
  dives: Nat,
  grandDives: Nat,
  /** Nominal metres (mm) of the dives: Σ gain² / (2 kDecel). */
  diveGainMm: Nat,
  /** milli-hp the air saved against the ground drain. */
  hpRested: Nat,
  energyClimb: Nat,
  energyHold: Nat,
  noLift: Nat,
  jumpsCovered: Nat,
  // ruleset v3 stage 1 (diseno-v3-vuelo.md §6.1)
  /** `pass` events in the air and in the dive surge. */
  passesAir: Nat,
  passesDive: Nat,
  /** Highest peak of a dive (vBeforeMms + gainMms) and the highest band reached. */
  peakMms: Nat,
  apexMax: Int.min(0).max(3),
  /** L3: ticks in dirty air and the me it cost over a clean line. */
  dirtyTicks: Nat,
  holdExtraMe: Nat,
  /** L4: times she went over, times she was knocked down; L6: falls forced by the tank. */
  overs: Nat,
  knocks: Nat,
  falls: Nat,
  /** Planned flights flown below their plan: noLift, a lower band, knocked down or forced down. */
  belowPlan: Nat,
  /** S1: the takeoff style of her wings. */
  style: z.enum(["lance", "column", "ramp", "turbine", "neutral"]),
  /** Round 5: nerve tests taken and held (F9), ticks towed in another's wake in the air (F6). */
  nerveTests: Nat.optional(),
  nerveHeld: Nat.optional(),
  towTicks: Nat.optional(),
  /**
   * Two lines per band (2026-11-08): line switches, passes by the side, doors closed, ticks boxed
   * in and blocked behind in her line, and the mm the lateral moves and the outside line cost.
   */
  lineSwitches: Nat.optional(),
  passesSide: Nat.optional(),
  doorsClosed: Nat.optional(),
  boxedTicks: Nat.optional(),
  blockedTicks: Nat.optional(),
  lineMm: Nat.optional(),
  /** Stamina pays effort (2026-11-09): milli-hp the maneuvers cost (hits and drips). */
  hpCost: Nat.optional(),
});
export type FlightLedger = z.infer<typeof FlightLedger>;

/** Where the time and the resources went (20.5). */
export const RaceLedger = z.strictObject({
  phaseTicks: Triple,
  boostTicks: Triple,
  pulses: Nat,
  stallTicks: Nat,
  energySpent: Nat,
  energyRegen: Nat,
  energyRefunded: Nat,
  energyFromHeat: Nat,
  energyLift: Nat,
  energyLeft: Nat,
  overheatTicks: Nat,
  durabilityLost: Nat,
  durabilityRepaired: Nat,
  hpEmptyMm: Nat.nullable(),
  draftTicks: Nat,
  landingLossMms: Nat,
  jumpsOk: Nat,
  jumpsFailed: Nat,
  detours: Nat,
  skillsActivated: z.array(Slug),
  skillsMissed: z.array(Slug),
  /** Ruleset v3 draft only (design7); never written by v1 or v2. */
  flight: FlightLedger.optional(),
});
export type RaceLedger = z.infer<typeof RaceLedger>;

/** One runner's result (20.5); `RaceLog.results` is in place order. */
export const RaceResult = z
  .strictObject({
    lane: Lane,
    runnerId: z.string().min(1),
    place: Int.min(1).max(8),
    finishMilli: Nat.nullable(),
    timeTicks: Nat.nullable(),
    marginMm: Nat.nullable(),
    vFinishMms: Nat.nullable(),
    deadHeat: z.boolean(),
    dnf: z.boolean(),
    /** milli-hp */
    hpEnd: Nat,
    energyEnd: Nat,
    /** milli-durability */
    durabilityEnd: Nat,
    exhausted: z.boolean(),
    broken: z.boolean(),
    ledger: RaceLedger,
  })
  .superRefine((r, ctx) => {
    const nulls = [r.finishMilli, r.timeTicks, r.marginMm, r.vFinishMms].filter((v) => v === null);
    if (r.dnf ? nulls.length !== 4 : nulls.length !== 0)
      ctx.addIssue({
        code: "custom",
        message: "finishMilli, timeTicks, marginMm and vFinishMms are null exactly for a DNF",
        path: ["dnf"],
      });
  });
export type RaceResult = z.infer<typeof RaceResult>;

/** Course geometry as logged (20.1); `param` is grade‰, drag‰, 0 (canyon), radius or liftRequired. */
export const RaceGeometry = z.strictObject({
  lengthMm: Nat,
  /**
   * The five boundaries of section 2 (20.1). `reserveAtMm = max(0, Lmm − 60 000)` is clamped at 0
   * on a course shorter than 60 m (ADR-0003 D53); `denseFromMm = Lmm − 25 000` stays Int.
   */
  startEndMm: Int,
  finalStartMm: Int,
  hoverAttackMm: Int,
  reserveAtMm: Nat,
  denseFromMm: Int,
  segments: z
    .array(z.strictObject({ type: SegmentType, startMm: Nat, endMm: Nat, param: Int }))
    .min(1)
    .max(24),
});
export type RaceGeometry = z.infer<typeof RaceGeometry>;

export const RaceDetail = z.enum(["full", "results"]);
export type RaceDetail = z.infer<typeof RaceDetail>;

/** The whole race (20.1): seed + entries + course reproduce it exactly. */
export const RaceLog = z
  .strictObject({
    rulesetVersion: RulesetVersion,
    engine: z.literal("v1"),
    seed: z.string().min(1),
    courseId: Slug,
    courseVersion: Version,
    tickHz: z.literal(15),
    detail: RaceDetail,
    /** Ticks simulated. */
    ticks: Nat,
    maxTicks: Int.min(1),
    geometry: RaceGeometry,
    /** Lane order. */
    entries: z.array(RaceEntry).min(1).max(8),
    /** Lane order. */
    derived: z.array(RunnerDerived),
    /** Absent with detail "results". */
    frames: RaceFrames.optional(),
    /** Absent with detail "results". */
    events: z.array(RaceEvent).optional(),
    /** Place order. */
    results: z.array(RaceResult),
  })
  .superRefine((log, ctx) => {
    const n = log.entries.length;
    log.entries.forEach((e, i) => {
      if (e.laneIndex !== i)
        ctx.addIssue({
          code: "custom",
          message: "entries are in lane order",
          path: ["entries", i, "laneIndex"],
        });
    });
    log.derived.forEach((d, i) => {
      if (d.lane !== i)
        ctx.addIssue({ code: "custom", message: "derived is in lane order", path: ["derived", i] });
    });
    if (log.derived.length !== n)
      ctx.addIssue({ code: "custom", message: "one derived row per entry", path: ["derived"] });
    if (log.results.length !== n)
      ctx.addIssue({ code: "custom", message: "one result per entry", path: ["results"] });
    log.results.forEach((r, k) => {
      if (r.place !== k + 1)
        ctx.addIssue({
          code: "custom",
          message: "results are in place order",
          path: ["results", k, "place"],
        });
    });
    const full = log.detail === "full";
    if (full !== (log.frames !== undefined) || full !== (log.events !== undefined))
      ctx.addIssue({
        code: "custom",
        message: 'frames and events are present exactly with detail "full"',
        path: ["detail"],
      });
    if (log.frames !== undefined && log.frames.runners.length !== n)
      ctx.addIssue({
        code: "custom",
        message: "one frame runner per entry",
        path: ["frames", "runners"],
      });
  });
export type RaceLog = z.infer<typeof RaceLog>;
