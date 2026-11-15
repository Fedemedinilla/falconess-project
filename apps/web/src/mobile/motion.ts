/**
 * The phone game's motion values for timers (plan §2.1): the twins of motion.css's `--m-dur-*`
 * (motion.test.ts checks every one), plus the holds that only timers know. Components keep no
 * private duration constants; they read these.
 */
import { type Pace, paceScale } from "./pace";

/** Durations, ms. */
export const MOTION = {
  fast: 120,
  screen: 200,
  screenMajor: 320,
  layerIn: 240,
  layerOut: 240,
  emblemIn: 160,
  /** the emblem's full cover between its fade in and its out phase */
  emblemBody: 1080,
  emblemOut: 280,
  sceneOut: 800,
  cardOut: 250,
  lineIn: 220,
  resultIn: 320,
  resultDelay: 400,
  toastIn: 300,
  toastOut: 400,
  /** a notice's life on screen; with «Ver» or for an error, the long one */
  toastShort: 4000,
  toastLong: 6000,
  sheetIn: 220,
  sheetOut: 180,
  deskDim: 200,
  layout: 280,
  /** the race's finish banner before its result (D7), shortened by Ritmo down to the minimum */
  finishHold: 1200,
  finishHoldMin: 400,
} as const;

/** The emblem's beat: from its first frame to its out phase (LEGACY 1250 until 6.4). */
export const EMBLEM_MS = MOTION.emblemIn + MOTION.emblemBody;

/** A story scene's tempo: typing, words, Auto, the chrome, the chapter card. */
export const STORY = {
  typeMs: 26,
  wordMs: 110,
  autoMs: 4500,
  chromeAt: 300,
  cardMinMs: 700,
  rmCardMs: 900,
} as const;

/** How long each full-screen layer takes to leave (plan §1.9). */
const OUT = {
  fx: MOTION.layerOut,
  inspiration: MOTION.layerOut,
  scene: MOTION.sceneOut,
  emblem: MOTION.emblemOut,
  // a native dialog: it closes at once
  event: 0,
} as const;

/** A layer's leave: 0 under reduced motion. */
export function outMs(kind: keyof typeof OUT, reduced: boolean): number {
  return reduced ? 0 : OUT[kind];
}

/** A hold that Ritmo shortens, never below `floor`. */
export function held(ms: number, pace: Pace, floor = 0): number {
  return Math.max(floor, Math.round(ms * paceScale(pace)));
}
