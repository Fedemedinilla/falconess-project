/**
 * Fixed-point helpers. The race engine works in integers with scale 1000:
 * 1 m = 1000 units, 1 m/s = 1000 units, multipliers are expressed as per-mille (1.0 = 1000).
 * Rounding is always floor (toward -inf) unless the function name says otherwise.
 */

export const FP = 1000;
/** One unit of per-mille multiplier (1.0). */
export const ONE = FP;

export function floorDiv(a: number, b: number): number {
  if (b === 0) throw new Error("floorDiv by zero");
  return Math.floor(a / b);
}

/** (a × b) / FP with floor rounding. Both operands in FP units → result in FP units. */
export function mulFP(a: number, b: number): number {
  return Math.floor((a * b) / FP);
}

/** (a × FP) / b with floor rounding. */
export function divFP(a: number, b: number): number {
  if (b === 0) throw new Error("divFP by zero");
  return Math.floor((a * FP) / b);
}

/** (a × b) / d with floor rounding, for arbitrary scales. */
export function mulDiv(a: number, b: number, d: number): number {
  if (d === 0) throw new Error("mulDiv by zero");
  return Math.floor((a * b) / d);
}

/** Apply a per-mille multiplier (1000 = ×1.0) to an integer value. */
export function scale(value: number, permille: number): number {
  return Math.floor((value * permille) / FP);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Convert a decimal ratio (e.g. 1.05) to per-mille (1050), rounding half up. Content-load time only. */
export function toPermille(ratio: number): number {
  return Math.round(ratio * FP);
}

export function isInt(n: number): boolean {
  return Number.isInteger(n);
}

/**
 * ceil(a / b) for integers with b > 0, written `ceilDiv` in docs/race-engine.md 0.1:
 * `floorDiv(a + b − 1, b)`. Exact for every integer `a` (negative included) while |a + b| < 2^53.
 */
export function ceilDiv(a: number, b: number): number {
  if (b <= 0) throw new Error("ceilDiv needs a positive divisor");
  return Math.floor((a + b - 1) / b);
}

/** Number of distinct u32 values (2^32): the divisor that maps a u32 draw to a fraction. */
export const U32_RANGE = 4_294_967_296;

/**
 * Map a u32 draw to per-mille in [0, 999] (docs/race-engine.md 17.2): `floor(u × 1000 / 2^32)`.
 * No floats survive (the product is an exact integer below 2^53) and no rejection loop, so the
 * draw count never depends on the values drawn.
 */
export function uPm(u: number): number {
  return Math.floor((u * 1000) / U32_RANGE);
}

/**
 * Map a u32 draw to an integer in [lo, hi] (docs/race-engine.md 17.2):
 * `lo + floor(u × (hi − lo + 1) / 2^32)`, with `hi − lo + 1 ≤ 10^6` so the product stays exact.
 * The bias is below (hi − lo + 1) / 2^32 and deterministic.
 */
export function uRange(u: number, lo: number, hi: number): number {
  const width = hi - lo + 1;
  if (width < 1 || width > 1_000_000) throw new Error(`uRange width ${width} outside 1..10^6`);
  return lo + Math.floor((u * width) / U32_RANGE);
}
