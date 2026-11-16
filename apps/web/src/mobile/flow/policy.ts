/**
 * The strangler policy (plan §1.12): only the differences that change the order of the beats or
 * what is derived from them. While a flag keeps its LEGACY value the game ships today's behaviour;
 * each owner-visible step of phase 5 and 6 removes one flag and its legacy branch (so reverting
 * that commit brings it back), and the last one deletes this file. Pure and text-free.
 */
export type FlowPolicy = {
  /** A training that rested by rule (an injured week) still shows «FALLÓ» (F4); removed in 5.8. */
  readonly restedCue: boolean;
  /**
   * A training's result shows the week she trained in and counts up to the week after (critic b1,
   * F6); legacy: it sits over the next week's HUD and buttons. Removed in 5.8.
   */
  readonly trainView: boolean;
  /** The finish banner holds before the race's result (D7); removed in 6.3. */
  readonly finishHold: boolean;
  /** The HUD reads the week just played until its effects lift (O3); removed in 6.10. */
  readonly fxHud: boolean;
};

/** Today's game, flag by flag. */
export const LEGACY_POLICY: FlowPolicy = Object.freeze({
  restedCue: true,
  trainView: false,
  finishHold: false,
  fxHud: false,
});

/** The designed flow (plan §1.4), which the season walks check. */
export const TARGET_POLICY: FlowPolicy = Object.freeze({
  restedCue: false,
  trainView: true,
  finishHold: true,
  fxHud: true,
});

/** What the game ships: today's, until each flag is removed. */
export const ACTIVE_POLICY: FlowPolicy = LEGACY_POLICY;
