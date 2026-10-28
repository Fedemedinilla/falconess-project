// TEMPORARY: replace with z.infer types from @falconess/schema (race.ts) when the engine lands.
//
// Structural copy of the RaceLog fields that `pnpm sim:race` reads, transcribed from
// docs/race-engine.md section 20 (20.1 top level, 20.2 entries / 3.1 RaceEntry, 20.3 derived,
// 20.4 frames and events, 20.5 results and ledger). Only the fields the renderer and the field
// builder read are listed; names, units and shapes are the spec's, so the swap is a re-export:
//   export type { RaceEntry, RaceLog, ... } from "@falconess/schema";
// Units are the log's public integers: mm, mm/s, milli-units (me, mh, md), milli-hp, ‰, ticks,
// milli-ticks.
import type { SegmentType, Slug, Style } from "@falconess/schema";

/** 20.4 `BoostMode`. */
export type BoostMode =
  | "off"
  | "kick"
  | "plan"
  | "hold"
  | "preheat"
  | "surplus"
  | "regen-overflow"
  | "dive-descent"
  | "hover-catchup"
  | "glide-chase"
  | "ground-constant";

/** 3.1 `RaceEntry` (frozen entry), the fields shown in the classification. */
export type RaceEntry = {
  runnerId: string;
  kind: "player" | "rival" | "ghost";
  falconessId: Slug | null;
  laneIndex: number;
  /** `"fixture-neutral"` for the neutral fixtures of 3.4. */
  frameId: Slug;
  /** `"none"` for the neutral fixtures of 3.4. */
  manufacturer: Slug;
  style: Style;
  /** Effective stats, 1..2000 (also the `stats` argument of `neutralFixtureEntry`). */
  stats: {
    agility: number;
    stamina: number;
    technique: number;
    courage: number;
    intelligence: number;
  };
};

/** 20.1 `geometry.segments[]` (`param` is not read). */
export type RaceSegment = { type: SegmentType; startMm: number; endMm: number };

/** 20.1 `geometry`. */
export type RaceGeometry = {
  lengthMm: number;
  startEndMm: number;
  finalStartMm: number;
  segments: RaceSegment[];
};

/** 20.3 `RunnerDerived` (the explanation table, one per runner, lane order). */
export type RunnerDerived = {
  lane: number;
  /** Pace judgement per phase (start, middle, final), ‰ added to 1000. */
  pace: [number, number, number];
  planErrWindowPm: number;
  planErrPm: number;
  landPm: number;
  /** 0 if not ground. */
  detourPm: number;
  /** 1000 if not dive. */
  stoopPm: number;
  /** Per segment, 1000 if not a pulse frame. */
  airPm: number[];
  /** 0 if not a pulse frame. */
  pulseMms: number;
  /** Intact PW table, one row per segment. */
  segments: { fPm: number; cruiseMms: [number, number, number] }[];
};

/** 20.4 `RaceFrames`: race-wide sampling, columns aligned with `tick`, runners in lane order. */
export type RaceFrames = {
  /** Ticks elapsed at the sample: row T is the state after tick T − 1; T = 0 before tick 0. */
  tick: number[];
  runners: {
    posMm: number[];
    /** On-ticks since the previous row (exact duty between sparse rows). */
    boost: number[];
    /** Bit set, see `FRAME_FLAG`. */
    flags: number[];
  }[];
};

/** 20.4 frame flag bits. */
export const FRAME_FLAG = {
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
  skillEffect: 2048,
  finished: 4096,
  dnf: 8192,
  drafting: 16384,
} as const;

type EventBase = { tick: number; lane: number; posMm: number };

/** 20.4 `RaceEvent`, discriminated on `kind`, ordered by emission. */
export type RaceEvent = EventBase &
  (
    | { kind: "boostMode"; mode: BoostMode; levelMms: number }
    | { kind: "pulse"; chain: number; free: boolean }
    | { kind: "freeBoost"; segment: SegmentType }
    | {
        kind: "sprintPlan";
        cause: "phase" | "refund" | "jump" | "broken";
        index: number;
        reason:
          | "planned"
          | "hp-limited"
          | "past-reserve"
          | "no-energy"
          | "no-thrust"
          | "exhausted"
          | "no-candidate";
        energy: number;
        energyPerceived: number;
        hp: number;
        hpPerceived: number;
        startMm: number;
        endMm: number;
        levelMms: number;
        candidates: number;
        clean: boolean;
      }
    | { kind: "skill"; skillId: Slug; p: number; u: number; activation: number }
    | { kind: "skillMiss"; skillId: Slug; p: number; u: number }
    | { kind: "jumpOk"; lift: number; required: number }
    | { kind: "jumpFail"; lift: number; required: number; damage: number; stallTicks: number }
    | { kind: "detour"; segment: number }
    | { kind: "waterHit"; damage: number }
    | { kind: "overheat"; on: boolean; heat: number }
    | { kind: "hpEmpty" }
    | { kind: "durabilityBroken"; powerToWeight: number }
    | { kind: "landing"; speedLossMms: number }
    | { kind: "repair"; amount: number }
    | { kind: "heatToEnergy"; heat: number; energy: number }
    | { kind: "finish"; place: number }
    | { kind: "dnf" }
  );

/** 20.5 `ledger`. */
export type RaceLedger = {
  phaseTicks: [number, number, number];
  boostTicks: [number, number, number];
  pulses: number;
  stallTicks: number;
  energySpent: number;
  energyRegen: number;
  energyRefunded: number;
  energyFromHeat: number;
  energyLift: number;
  energyLeft: number;
  overheatTicks: number;
  durabilityLost: number;
  durabilityRepaired: number;
  hpEmptyMm: number | null;
  draftTicks: number;
  landingLossMms: number;
  jumpsOk: number;
  jumpsFailed: number;
  detours: number;
  skillsActivated: Slug[];
  skillsMissed: Slug[];
};

/** 20.5 `RaceResult` (place order). */
export type RaceResult = {
  lane: number;
  place: number;
  /** Milli-ticks; null when DNF. */
  finishMilli: number | null;
  /** mm behind the previous finisher when it crossed; 0 for the winner and dead heats. */
  marginMm: number | null;
  deadHeat: boolean;
  dnf: boolean;
  /** milli-hp */
  hpEnd: number;
  /** milli */
  durabilityEnd: number;
  ledger: RaceLedger;
};

/** 20.1 `RaceLog`. */
export type RaceLog = {
  rulesetVersion: string;
  engine: "v1";
  seed: string;
  courseId: Slug;
  /** Ticks simulated (tickHz is the literal 15). */
  ticks: number;
  geometry: RaceGeometry;
  /** Lane order. */
  entries: RaceEntry[];
  /** Lane order. */
  derived: RunnerDerived[];
  /** Absent with detail "results". */
  frames?: RaceFrames | undefined;
  /** Absent with detail "results". */
  events?: RaceEvent[] | undefined;
  /** Place order. */
  results: RaceResult[];
};
