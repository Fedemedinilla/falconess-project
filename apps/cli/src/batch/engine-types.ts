// TEMPORARY: replace with z.infer types from @falconess/schema (race.ts) when the engine lands.
//
// Structural copies of the race types the balance batch builds or reads, taken from
// docs/race-engine.md §3.1, §3.2, §3.4, §20.5 and §23. Only the fields the batch touches are
// spelled out for the log side; entry-side types are complete because the batch spreads entries
// (S2 equal-PW variant). `RaceArena` and `CourseGeometry` are internal TS types of @falconess/sim
// (not data formats): replace them with `import type { RaceArena, CourseGeometry } from
// "@falconess/sim"`. The batch only passes them back to the engine, so `object` is enough here.
import type {
  Aptitude,
  BiomeAptitudes,
  FalconessStats,
  ManufacturerRule,
  Mood,
  RacePhase,
  SegmentType,
  Slug,
  Style,
  StyleAptitudes,
} from "@falconess/schema";

/** §3.4: a manufacturer rule, or `none` for the neutral fixture. */
export type RaceRule = ManufacturerRule | "none";

/** §16: compiled modifiers. Opaque to the batch, which never reads them. */
export type RaceTraits = { readonly [key: string]: unknown };

/** §3.1: effective stats, integers 1..2000. */
export type RaceStats = {
  agility: number;
  stamina: number;
  technique: number;
  courage: number;
  intelligence: number;
};

/** §3.2: frozen active skill. */
export type RaceSkill = {
  id: Slug;
  uniqueTo: Slug | null;
  activationBasePm: number;
  trigger: {
    phase: RacePhase;
    segment: SegmentType | null;
    posLoPm: number | null;
    posHiPm: number | null;
    heatAboveMilli: number | null;
    energyBelowMilli: number | null;
    once: boolean;
  };
  effect: {
    speedMms: number;
    accelMms2: number;
    energyRefundMilli: number;
    heatCoolMilli: number;
    durabilityGuard: boolean;
    durationTicks: number;
  };
  /** Ablation switch (D49): only `disableSkill` writes `true`. */
  disabled: boolean;
};

/** §3.1: frozen race entry. */
export type RaceEntry = {
  runnerId: string;
  kind: "player" | "rival" | "ghost";
  falconessId: Slug | null;
  laneIndex: number;
  frameId: Slug;
  manufacturer: Slug;
  rule: RaceRule;
  style: Style;
  passive: Slug | null;
  parts: Slug[];
  quirks: Slug[];
  mood: Mood;
  biomeAptitude: Aptitude;
  styleAptitude: Aptitude;
  stats: RaceStats;
  powerToWeight: number;
  energy: number;
  dissipation: number;
  durabilityMax: number;
  durabilityStart: number;
  skills: RaceSkill[];
  traits: RaceTraits;
};

/** §3.1: input of `freezeEntry` (and of `generateField`'s player). */
export type EntryInput = {
  runnerId: string;
  kind: "player" | "rival" | "ghost";
  falconessId: Slug | null;
  baseStats: FalconessStats;
  mood: Mood;
  biomeAptitude: BiomeAptitudes;
  styleAptitude: StyleAptitudes;
  frameId: Slug;
  parts: Slug[];
  quirks: Slug[];
  learnedSkills: Slug[];
  durability: number | null;
};

/** §3.4: parts and quirks applied to the neutral frame values. */
export type FixtureBuild = {
  parts: Slug[];
  quirks: Slug[];
  powerToWeight: number;
  energy: number;
  dissipation: number;
  durabilityMax: number;
  statDelta: RaceStats;
  traits: RaceTraits;
};

/** §20.5: the fields of one result row that the batch reads. */
export type RaceResult = {
  lane: number;
  runnerId: string;
  place: number;
  finishMilli: number | null;
  timeTicks: number | null;
  deadHeat: boolean;
  dnf: boolean;
  ledger: { phaseTicks: readonly number[] };
};

/** §20.1: the fields of the log that the batch reads (`detail: "results"`). */
export type RaceLog = {
  rulesetVersion: string;
  seed: string;
  courseId: Slug;
  detail: "full" | "results";
  results: RaceResult[];
};

/** §22/§23: reusable memory for `simulateRace`. */
export type RaceArena = object;

/** §2/§23: cached course geometry. */
export type CourseGeometry = object;

/** §23: options never change a result (P7), only what is materialised and reused. */
export type SimulateOptions = {
  detail?: "full" | "results";
  geometry?: CourseGeometry;
  arena?: RaceArena;
};
