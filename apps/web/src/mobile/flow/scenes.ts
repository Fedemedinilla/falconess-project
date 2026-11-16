/**
 * The story scenes in the phone's flow (plan §1.2), pure and text-free like everything in
 * `mobile/flow/`.
 */
import type { Pace } from "../pace";
import type { Digest } from "./types";

/**
 * «Ritmo» (owner 2026-11-14): how fast a digest passes its lines, one frozen object per pace, so
 * a scene's props keep their identity from render to render (critic (c)5: a new object restarted
 * the digest's timers on every render).
 */
export const DIGEST: Readonly<Record<Exclude<Pace, "normal">, Digest>> = Object.freeze({
  fast: Object.freeze({ ms: 1100 }),
  direct: Object.freeze({ ms: 650 }),
});

/** Rápido and Directo pass a scene as a digest; Normal plays it whole. */
export function digestFor(pace: Pace): Digest | undefined {
  return pace === "normal" ? undefined : DIGEST[pace];
}
