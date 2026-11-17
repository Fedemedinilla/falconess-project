/**
 * The strangler policy (plan §1.12): only the differences that change the order of the beats or
 * what is derived from them. While a flag keeps its LEGACY value the game ships today's behaviour;
 * each owner-visible step of phase 5 and 6 removes one flag and its legacy branch (so reverting
 * that commit brings it back), and the last one deletes this file. Pure and text-free.
 */
export type FlowPolicy = {
  /** The HUD reads the week just played until its effects lift (O3); removed in 6.10. */
  readonly fxHud: boolean;
};

/** Today's game, flag by flag. */
export const LEGACY_POLICY: FlowPolicy = Object.freeze({
  fxHud: false,
});

/** The designed flow (plan §1.4), which the season walks check. */
export const TARGET_POLICY: FlowPolicy = Object.freeze({
  fxHud: true,
});

/** What the game ships: today's, until each flag is removed. */
export const ACTIVE_POLICY: FlowPolicy = LEGACY_POLICY;
