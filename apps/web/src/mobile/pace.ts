/**
 * «Ritmo» (owner 2026-11-14): how fast the season's animations go, chosen in the menu and kept in
 * this browser. Normal plays everything; Rápido starts races at ×2 and shortens the training's
 * result and the week's effects; Directo goes from a race straight to its result (it can still be
 * watched), skips the transition into the race mode and keeps the result and the effects short.
 */
import { browserStore, readKey, writeKey } from "../game/storage";

export type Pace = "normal" | "fast" | "direct";

const KEY = "falconess.juego.ritmo";
const ORDER: readonly Pace[] = ["normal", "fast", "direct"];

function load(): Pace {
  const v = readKey(browserStore(), KEY);
  return v === "fast" || v === "direct" ? v : "normal";
}

let current: Pace | undefined;
const listeners = new Set<() => void>();

export function getPace(): Pace {
  current ??= load();
  return current;
}

/**
 * Chooses the pace: kept in this browser (without storage it lasts this visit) and told to every
 * subscriber, so the «Menú» in the phone's sheet and in the desk panel never disagree.
 */
export function setPace(p: Pace): void {
  current = p;
  writeKey(browserStore(), KEY, p);
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` after every `setPace`; returns the unsubscribe (`usePace`). */
export function subscribePace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function nextPace(p: Pace): Pace {
  return ORDER[(ORDER.indexOf(p) + 1) % ORDER.length] ?? "normal";
}

/** How long the timed parts of the training's result and the week's effects last (1 = normal). */
export function paceScale(p: Pace = getPace()): number {
  return p === "normal" ? 1 : p === "fast" ? 0.6 : 0.35;
}
