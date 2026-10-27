import { clamp, toPermille } from "@falconess/rng";
import type { ContentIndex, ManufacturerRule, RaceModifier, Style } from "@falconess/schema";

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

export function resolveFrameBuild(
  content: ContentIndex,
  frameId: string,
  partIds: readonly string[],
  quirkIds: readonly string[],
): FrameBuild {
  const frame = content.getFrame(frameId);
  const manufacturer = content.getManufacturer(frame.manufacturer);
  const parts = partIds.map((id) => content.getPart(id));
  const quirks = quirkIds.map((id) => content.getQuirk(id));
  const modifiers: RaceModifier[] = [];

  let pw = toPermille(frame.stats.powerToWeight);
  let energy = frame.stats.energy;
  let dissipation = frame.stats.dissipation;
  let durability = frame.stats.durability;
  let skillSlots = 0;

  if (frame.passive !== undefined) modifiers.push(...content.getPassive(frame.passive).modifiers);

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
  if (manufacturer.rule === "telemetry") pw = Math.min(pw, 1100);
  for (const m of modifiers) if (m.kind === "power-cap") pw = Math.min(pw, toPermille(m.max));

  return {
    frameId,
    manufacturer: manufacturer.id,
    rule: manufacturer.rule,
    style: frame.style,
    powerToWeight: clamp(pw, LIMITS.powerToWeight[0], LIMITS.powerToWeight[1]),
    energy: clamp(energy, LIMITS.energy[0], LIMITS.energy[1]),
    dissipation: clamp(dissipation, LIMITS.dissipation[0], LIMITS.dissipation[1]),
    durabilityMax: clamp(durability, LIMITS.durability[0], LIMITS.durability[1]),
    skillSlots,
    modifiers,
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
