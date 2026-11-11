/**
 * Provisional art of the three Falconess (AI-generated, declared as such on screen, T15): the
 * full-body splash of the week menu and the chibi of the training screen and the roster. The same
 * images the approved phone prototype embeds (docs/design/prototipo), as WebP files Vite inlines in
 * the Artifact.
 */
import type { TrainingKind } from "@falconess/schema";
import caracaraChibi from "./art/caracara-chibi.webp";
import caracaraSplash from "./art/caracara-splash.webp";
import cernicalaChibi from "./art/cernicala-chibi.webp";
import cernicalaSplash from "./art/cernicala-splash.webp";
import peregrinaChibi from "./art/peregrina-chibi.webp";
import peregrinaSplash from "./art/peregrina-splash.webp";
import peregrinaTrainAgility from "./art/peregrina-train-agility.webp";
import peregrinaTrainRiskFlight from "./art/peregrina-train-risk-flight.webp";
import peregrinaTrainStamina from "./art/peregrina-train-stamina.webp";

/**
 * A training's illustration (owner 2026-11-11, Gemini from her splash): a 9:16 scene that fills
 * the training screen, placed so her face (`fx`, `fy`: fractions of the image) lands in the open
 * part of the screen between the top bar and the stats.
 */
export type TrainingArt = {
  readonly src: string;
  /** Natural size, px. */
  readonly w: number;
  readonly h: number;
  readonly fx: number;
  readonly fy: number;
};

export type RunnerArt = {
  readonly splash: string;
  readonly chibi: string;
  /** Framing of the splash: width/height, height of the face and horizontal axis (fractions). */
  readonly ar: number;
  readonly fy: number;
  readonly cx: number;
  /** Her training scenes, by training; a training without one shows the chibi. */
  readonly training?: Partial<Record<TrainingKind, TrainingArt>>;
};

const ART: Readonly<Record<string, RunnerArt>> = {
  peregrina: {
    splash: peregrinaSplash,
    chibi: peregrinaChibi,
    ar: 0.499,
    fy: 0.1,
    cx: 0.45,
    training: {
      "train:agility": { src: peregrinaTrainAgility, w: 720, h: 1290, fx: 0.63, fy: 0.23 },
      "train:stamina": { src: peregrinaTrainStamina, w: 720, h: 1290, fx: 0.5, fy: 0.4 },
      "train:risk-flight": { src: peregrinaTrainRiskFlight, w: 720, h: 1290, fx: 0.56, fy: 0.33 },
    },
  },
  cernicala: { splash: cernicalaSplash, chibi: cernicalaChibi, ar: 0.46, fy: 0.105, cx: 0.47 },
  caracara: { splash: caracaraSplash, chibi: caracaraChibi, ar: 0.513, fy: 0.15, cx: 0.56 },
};

/** Her art, if she has any yet. */
export function runnerArt(falconessId: string): RunnerArt | undefined {
  return ART[falconessId];
}
