/**
 * Vigor, the bar the Turn screen shows: `vigor = fatigueMax − fatigue` (the sim's `vigor`), full
 * when rested, drained by training (ADR-0006: presentation only, the state keeps `fatigue`).
 *
 * Its risk bands are the edges of the ruleset's failure curve ("curve" model, v2): safe while the
 * curve has not started (`failCurveStart`), injury once a failure can be an injury
 * (`injuryFromFatigue`, counted on the fatigue before training, so vigor 20 itself is in it), and
 * the span between split in half into low and high. With v2's numbers: ≥ 60 sin riesgo, 40–59
 * riesgo bajo, 21–39 riesgo alto, ≤ 20 puede lesionarse. Only the edges are read here; the chance
 * of each training is the sim's `trainingRisk`, on its button (at 58–59 the curve still rounds
 * down to 0 ‰). The linear model (v1) has no bands: v1 has its forced rest instead.
 */
import { type Ruleset, vigor } from "@falconess/sim";

export type VigorBand = "safe" | "low" | "high" | "injury";

export type VigorScale = {
  /** The bar's top: `fatigueMax`. */
  readonly max: number;
  /**
   * The bands as vigor edges, when the ruleset has them: safe from `safeFrom` up, low down to
   * `highBelow`, high below it, injury at `injuryAt` or less.
   */
  readonly bands:
    | { readonly safeFrom: number; readonly highBelow: number; readonly injuryAt: number }
    | undefined;
  /** v1: training at this vigor or less is a forced rest; undefined when the ruleset has none. */
  readonly forcedAt: number | undefined;
};

export function vigorScale(ruleset: Ruleset): VigorScale {
  const S = ruleset.season;
  const curve = S.failModel === "curve";
  const safeFrom = vigor(ruleset, S.failCurveStart);
  const injuryAt = vigor(ruleset, Math.min(S.injuryFromFatigue, S.fatigueMax));
  return {
    max: S.fatigueMax,
    bands: curve
      ? { safeFrom, injuryAt, highBelow: Math.ceil((safeFrom + injuryAt) / 2) }
      : undefined,
    forcedAt: S.forcedRestAt <= S.fatigueMax ? vigor(ruleset, S.forcedRestAt) : undefined,
  };
}

/** The band of a vigor value, or undefined when the ruleset has no bands (v1). */
export function vigorBand(scale: VigorScale, value: number): VigorBand | undefined {
  const b = scale.bands;
  if (!b) return undefined;
  if (value >= b.safeFrom) return "safe";
  if (value <= b.injuryAt) return "injury";
  return value >= b.highBelow ? "low" : "high";
}

export type VigorTone = "good" | "warn" | "bad" | "neutral";

/** The color of the bar: by band in v2; in v1, amber near the forced rest and red at it. */
export function vigorTone(scale: VigorScale, value: number): VigorTone {
  const band = vigorBand(scale, value);
  if (band) return band === "safe" ? "good" : band === "low" ? "warn" : "bad";
  if (scale.forcedAt === undefined) return "neutral";
  if (value <= scale.forcedAt) return "bad";
  return value <= scale.forcedAt + 20 ? "warn" : "neutral";
}

/** Where the bar marks its edges, as shares of the track: the bands, or v1's forced rest. */
export function vigorMarks(scale: VigorScale): number[] {
  const b = scale.bands;
  if (b) return [b.safeFrom, b.highBelow, b.injuryAt].map((v) => v / scale.max);
  return scale.forcedAt === undefined ? [] : [scale.forcedAt / scale.max];
}
