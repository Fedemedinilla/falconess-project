/**
 * The race replay's playback speed, kept between races in this browser (both views: the phone's
 * race and the test view's replays). A view may ask for a floor: the phone's «Ritmo» Rápido starts
 * its races at ×2 at least (mobile/RaceScreens.tsx); nothing here reads the phone's pace.
 */
import { browserStore, readKey, writeKey } from "../game/storage";

const SPEED_KEY = "falconess.juego.velocidad";

/**
 * The speed to start a replay at: the last one chosen (×1 the first time), raised to `minimum`
 * when that is faster; undefined when `allowed` does not offer it (the replay's own default then).
 */
export function startSpeed<T extends number>(allowed: readonly T[], minimum = 0): T | undefined {
  const raw = readKey(browserStore(), SPEED_KEY);
  const last = raw ? Number(raw) : undefined;
  const want = Math.max(last ?? 1, minimum);
  return allowed.find((v) => v === want);
}

/** Keeps the speed just chosen for the next replay (without storage it is not kept). */
export function rememberSpeed(v: number): void {
  writeKey(browserStore(), SPEED_KEY, String(v));
}
