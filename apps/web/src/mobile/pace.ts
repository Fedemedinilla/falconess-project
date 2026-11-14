/**
 * «Ritmo» (owner 2026-11-14): how fast the season's animations go, chosen in the menu and kept in
 * this browser. Normal plays everything; Rápido starts races at ×2 and shortens the training's
 * result and the week's effects; Directo goes from a race straight to its result (it can still be
 * watched), skips the transition into the race mode and keeps the result and the effects short.
 */
export type Pace = "normal" | "fast" | "direct";

const KEY = "falconess.juego.ritmo";
const ORDER: readonly Pace[] = ["normal", "fast", "direct"];

function load(): Pace {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === "fast" || v === "direct" ? v : "normal";
  } catch {
    return "normal";
  }
}

let current: Pace | undefined;

export function getPace(): Pace {
  current ??= load();
  return current;
}

export function setPace(p: Pace): void {
  current = p;
  try {
    globalThis.localStorage?.setItem(KEY, p);
  } catch {
    // no storage: it lasts this visit
  }
}

export function nextPace(p: Pace): Pace {
  return ORDER[(ORDER.indexOf(p) + 1) % ORDER.length] ?? "normal";
}

/** How long the timed parts of the training's result and the week's effects last (1 = normal). */
export function paceScale(p: Pace = getPace()): number {
  return p === "normal" ? 1 : p === "fast" ? 0.6 : 0.35;
}

// --- the race's playback speed, kept between races ---------------------------------------------

const SPEED_KEY = "falconess.juego.velocidad";

/** The replay's speed to start at: the last one chosen, at least ×2 with «Rápido». */
export function startSpeed<T extends number>(allowed: readonly T[]): T | undefined {
  let last: number | undefined;
  try {
    const raw = globalThis.localStorage?.getItem(SPEED_KEY);
    last = raw ? Number(raw) : undefined;
  } catch {
    last = undefined;
  }
  const want = Math.max(last ?? 1, getPace() === "fast" ? 2 : 0);
  return allowed.find((v) => v === want);
}

export function rememberSpeed(v: number): void {
  try {
    globalThis.localStorage?.setItem(SPEED_KEY, String(v));
  } catch {
    // no storage
  }
}
