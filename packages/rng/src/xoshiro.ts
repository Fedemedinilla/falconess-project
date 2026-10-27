/**
 * xoshiro128** — small, fast, well-distributed 32-bit PRNG.
 * Reference: Blackman & Vigna, "Scrambled Linear Pseudorandom Number Generators".
 * State: 4 × uint32. All arithmetic is on unsigned 32-bit integers (`>>> 0`).
 */

export type XoshiroState = readonly [number, number, number, number];

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Xoshiro128 {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(state: XoshiroState) {
    if (state.every((w) => w === 0)) {
      throw new Error("xoshiro128 state must not be all zero");
    }
    this.s0 = state[0] >>> 0;
    this.s1 = state[1] >>> 0;
    this.s2 = state[2] >>> 0;
    this.s3 = state[3] >>> 0;
  }

  /** Next unsigned 32-bit integer in [0, 2^32). */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  getState(): XoshiroState {
    return [this.s0, this.s1, this.s2, this.s3];
  }
}

/** FNV-1a 32-bit hash of a UTF-16 code unit sequence. Deterministic across runtimes. */
export function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** splitmix32 step: turns a 32-bit counter into a well-mixed 32-bit word. */
export function splitmix32(x: number): number {
  let z = (x + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/** Derive a non-zero xoshiro state from a seed string and a stream label. */
export function deriveState(seed: string, stream: string): XoshiroState {
  const base = fnv1a32(`${seed}\u0000${stream}`);
  const s: [number, number, number, number] = [
    splitmix32(base),
    splitmix32((base + 1) >>> 0),
    splitmix32((base + 2) >>> 0),
    splitmix32((base + 3) >>> 0),
  ];
  if (s.every((w) => w === 0)) s[0] = 1;
  return s;
}
