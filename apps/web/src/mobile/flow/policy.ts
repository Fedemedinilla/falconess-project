/**
 * The strangler policy (plan §1.12): only the differences that change the order of the beats or
 * what is derived from them. While a flag keeps its LEGACY value the game ships today's behaviour;
 * each owner-visible step of phase 5 and 6 removes one flag and its legacy branch (so reverting
 * that commit brings it back), and the last one deletes this file. Pure and text-free.
 */
export type FlowPolicy = {
  /** «Ver carrera» from the season's end plays the emblem (F25); removed in 5.1. */
  readonly emblemOnWatch: boolean;
  /**
   * The scenes of each mode by kind (`SCENE_KINDS`) and in `SCENE_ORDER`; legacy: any scene but a
   * goal's «before» in the race, the menu and the end, in file order (F13, F14). Removed in 5.2.
   */
  readonly sceneFilters: boolean;
  /**
   * `d2`: the week's effects, then the event, then the inheritance card and the scenes in D2's
   * order; legacy: the card first, then the effects, the event and the scenes, and at the start
   * the card before the prologue (C9, C10). Removed in 5.3.
   */
  readonly order: "legacy" | "d2";
  /** The last step's result and effects play over the season's end; legacy: the end swallows them (F3). Removed in 5.4. */
  readonly endSequence: boolean;
  /**
   * A reload plays on what was not seen (the result, the race, the decided week); legacy: only
   * what this mount committed plays, and the decided week lives in memory (F1). Removed in 5.6.
   */
  readonly resume: boolean;
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
  emblemOnWatch: true,
  sceneFilters: false,
  order: "legacy",
  endSequence: false,
  resume: false,
  restedCue: true,
  trainView: false,
  finishHold: false,
  fxHud: false,
});

/** The designed flow (plan §1.4), which the season walks check. */
export const TARGET_POLICY: FlowPolicy = Object.freeze({
  emblemOnWatch: false,
  sceneFilters: true,
  order: "d2",
  endSequence: true,
  resume: true,
  restedCue: false,
  trainView: true,
  finishHold: true,
  fxHud: true,
});

/** What the game ships: today's, until each flag is removed. */
export const ACTIVE_POLICY: FlowPolicy = LEGACY_POLICY;
