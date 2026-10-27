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
