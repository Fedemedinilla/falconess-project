/**
 * Provisional art of the three Falconess (AI-generated, declared as such on screen, T15): the
 * full-body splash of the week menu and the chibi of the training screen and the roster. The same
 * images the approved phone prototype embeds (docs/design/prototipo), as WebP files Vite inlines in
 * the Artifact.
 */
import caracaraChibi from "./art/caracara-chibi.webp";
import caracaraSplash from "./art/caracara-splash.webp";
import cernicalaChibi from "./art/cernicala-chibi.webp";
import cernicalaSplash from "./art/cernicala-splash.webp";
import peregrinaChibi from "./art/peregrina-chibi.webp";
import peregrinaSplash from "./art/peregrina-splash.webp";

export type RunnerArt = {
  readonly splash: string;
  readonly chibi: string;
  /** Framing of the splash: width/height, height of the face and horizontal axis (fractions). */
  readonly ar: number;
  readonly fy: number;
  readonly cx: number;
};

const ART: Readonly<Record<string, RunnerArt>> = {
  peregrina: { splash: peregrinaSplash, chibi: peregrinaChibi, ar: 0.499, fy: 0.1, cx: 0.45 },
  cernicala: { splash: cernicalaSplash, chibi: cernicalaChibi, ar: 0.46, fy: 0.105, cx: 0.47 },
  caracara: { splash: caracaraSplash, chibi: caracaraChibi, ar: 0.513, fy: 0.15, cx: 0.56 },
};

/** Her art, if she has any yet. */
export function runnerArt(falconessId: string): RunnerArt | undefined {
  return ART[falconessId];
}
