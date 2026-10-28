import { clamp, toPermille } from "@falconess/rng";
import type {
  ContentIndex,
  FrameMods,
  ManufacturerRule,
  RaceModifier,
  Style,
} from "@falconess/schema";
import { RULESET_V1 } from "./rulesets/index.js";

/**
 * A frame with its parts and quirks resolved into one flat, engine-ready description.
 * This is the "variety" seam: every way wings can differ (manufacturer rule, style controller,
 * four stats, passive, parts, quirks) ends up here, and the race engine reads only this.
 */
export type FrameBuild = {
  readonly frameId: string;
  readonly manufacturer: string;
  readonly rule: ManufacturerRule;
  readonly style: Style;
  /** Per-mille (1000 = ×1.0). */
  readonly powerToWeight: number;
  readonly energy: number;
  readonly dissipation: number;
  readonly durabilityMax: number;
  readonly skillSlots: number;
  readonly modifiers: readonly RaceModifier[];
  readonly parts: readonly string[];
  readonly quirks: readonly string[];
};

const LIMITS = {
  powerToWeight: [500, 1600],
  energy: [20, 200],
  dissipation: [20, 120],
  durability: [20, 260],
} as const;

/** PW cap of the telemetry rule, applied here so every consumer agrees (v1: 1100). */
const TELEMETRY_PW_CAP = RULESET_V1.race.telemetryPowerCap;

/** Frame values before parts and quirks; PW in per-mille, the rest in content units. */
export type BuildBase = {
  readonly powerToWeight: number;
  readonly energy: number;
  readonly dissipation: number;
  readonly durability: number;
};

/** A part or a quirk: additive mods plus race modifiers. */
export type BuildSource = {
  readonly mods: FrameMods;
  readonly modifiers: readonly RaceModifier[];
};

export type BuildValues = {
  readonly powerToWeight: number;
  readonly energy: number;
  readonly dissipation: number;
  readonly durabilityMax: number;
  readonly skillSlots: number;
  readonly modifiers: readonly RaceModifier[];
};

/**
 * The arithmetic shared by `resolveFrameBuild` and the race fixtures' `fixtureBuild`
 * (docs/race-engine.md 3.4): add part then quirk mods to the base, collect passive, part then quirk
 * modifiers, apply the rule PW cap (if any), then every `power-cap` modifier, then the clamps.
 * Internal to packages/sim.
 */
export function applyBuild(
  base: BuildBase,
  passiveModifiers: readonly RaceModifier[],
  parts: readonly BuildSource[],
  quirks: readonly BuildSource[],
  rulePowerCap: number | null,
): BuildValues {
  const modifiers: RaceModifier[] = [...passiveModifiers];
  let pw = base.powerToWeight;
  let energy = base.energy;
  let dissipation = base.dissipation;
  let durability = base.durability;
  let skillSlots = 0;

  for (const mods of [...parts.map((p) => p.mods), ...quirks.map((q) => q.mods)]) {
    pw += toPermille(mods.powerToWeight);
    energy += mods.energy;
    dissipation += mods.dissipation;
    durability += mods.durability;
    skillSlots += mods.skillSlots;
  }
  for (const p of parts) modifiers.push(...p.modifiers);
  for (const q of quirks) modifiers.push(...q.modifiers);

  // Manufacturer rules that cap a stat are applied here so every consumer sees the same number.
  if (rulePowerCap !== null) pw = Math.min(pw, rulePowerCap);
  for (const m of modifiers) if (m.kind === "power-cap") pw = Math.min(pw, toPermille(m.max));

  return {
    powerToWeight: clamp(pw, LIMITS.powerToWeight[0], LIMITS.powerToWeight[1]),
    energy: clamp(energy, LIMITS.energy[0], LIMITS.energy[1]),
    dissipation: clamp(dissipation, LIMITS.dissipation[0], LIMITS.dissipation[1]),
    durabilityMax: clamp(durability, LIMITS.durability[0], LIMITS.durability[1]),
    skillSlots,
    modifiers,
  };
}

export function resolveFrameBuild(
  content: ContentIndex,
  frameId: string,
  partIds: readonly string[],
  quirkIds: readonly string[],
): FrameBuild {
  const frame = content.getFrame(frameId);
  const manufacturer = content.getManufacturer(frame.manufacturer);
  const values = applyBuild(
    {
      powerToWeight: toPermille(frame.stats.powerToWeight),
      energy: frame.stats.energy,
      dissipation: frame.stats.dissipation,
      durability: frame.stats.durability,
    },
    frame.passive !== undefined ? content.getPassive(frame.passive).modifiers : [],
    partIds.map((id) => content.getPart(id)),
    quirkIds.map((id) => content.getQuirk(id)),
    manufacturer.rule === "telemetry" ? TELEMETRY_PW_CAP : null,
  );
  return {
    frameId,
    manufacturer: manufacturer.id,
    rule: manufacturer.rule,
    style: frame.style,
    ...values,
    parts: partIds.slice(),
    quirks: quirkIds.slice(),
  };
}

/** Parts are limited to one per type; returns the list with `partId` added or replacing its type. */
export function installPart(
  content: ContentIndex,
  current: readonly string[],
  partId: string,
  maxParts: number,
): string[] {
  const part = content.getPart(partId);
  const kept = current.filter((id) => content.getPart(id).type !== part.type);
  if (kept.length >= maxParts)
    throw new Error(`cannot install ${partId}: ${maxParts} parts already installed`);
  return [...kept, partId];
}
