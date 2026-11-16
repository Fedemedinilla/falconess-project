/**
 * The shadow (plan §4 step 4.0; deleted in 4.1, when the model drives the game): the run's view
 * still plays today's game from its own `View`, while the flow model follows it on dry ports (the
 * same commands, right after each of today's handlers, writing nothing the game keeps). A check
 * that runs only in development compares, by name, what both put on screen: the screen, the layer
 * in front and the music. A difference is the model's bug, except the few the phase-3 review
 * expects (`ShadowRule`, each named below), and one that lasts less than two animation frames
 * (`shadowFrame`). Pure and text-free (flow/imports.test.ts).
 */
import type { TrainingKind } from "@falconess/schema";
import type { Commands } from "./commands";
import type { Beat, Flow, Layer, Screen, WorkshopTab } from "./types";
import type { UiState } from "./ui";

/** The run's view's `View`, as far as the names read it (RunView's own type has more in it). */
export type LegacyView =
  | { readonly screen: "menu" }
  | { readonly screen: "train"; readonly selected?: TrainingKind | undefined }
  | { readonly screen: "workshop"; readonly tab: WorkshopTab }
  /** `decided`: the race week's card after its action's preview; else the planning card. */
  | { readonly screen: "prerace"; readonly decided?: boolean }
  | { readonly screen: "race"; readonly turn: number; readonly result: boolean }
  | { readonly screen: "actionfx" }
  | { readonly screen: "trained" };

/** What the run's view draws besides its `View`'s screen. */
export type LegacyOverlays = {
  /** The season's end shows (the state ended and no race plays). */
  readonly ended: boolean;
  /** The race's result waits for a story scene due after it. */
  readonly hold: boolean;
  /** The emblem transition. */
  readonly cover: boolean;
  /** Black under the cover before a goal's scene; `passed`: one seen in another season. */
  readonly black: "scene" | "passed" | undefined;
  readonly inspiration: boolean;
  /** The week's effects over the menu (a race week's action's are the `actionfx` view's own). */
  readonly fx: boolean;
  readonly event: boolean;
  /** The story scene that plays: due now, or asked for from «Historia» or «Ver» (`replay`). */
  readonly scene: { readonly id: string; readonly replay: boolean } | undefined;
  /** A sheet, the chat or the title is over the game, by the view's own state. */
  readonly sheet: boolean;
};

/** What one side puts on screen, by name. */
export type ShadowNames = {
  readonly screen: string;
  readonly layer: string | undefined;
  readonly music: "menu" | "race";
};

/** Today's names, and whether a sheet is open (today's own state, not the model's fact). */
export type LegacyNames = ShadowNames & { readonly sheet: boolean };

/**
 * A difference that is known and not the model's fault (Review of phase 3, "For 4.0"). Each lets
 * one part differ; several can meet (a sheet open on the way into a race), the rest must agree:
 * - `passed-scene-black` (the screen): today's black under the cover waits for a goal's scene even
 *   when it was seen in another season (`dueIn` ignores the scenes seen ever, 3.3 reading 1); the
 *   model passes that scene by, so its covered emblem is over the card it goes to.
 * - `sheet-hold` (the layer): with a sheet open (today's own state says so) the model holds every
 *   beat's layer but the event's (F10, §1.6); today only scenes wait, and only for «Menú», the
 *   chat, «Historia» and the title (seen on a wide screen, whose panel is live during a beat).
 * - `replay-refused` (the layer): today a scene asked for from «Historia» or «Ver» plays over
 *   anything; the model plays one only while `canReplay` (3.3 reading 6), so it refused this one.
 * The emblem's first frame (today's cover lands at 0 ms) is the two-frame rule's (`shadowFrame`).
 */
export type ShadowRule = "passed-scene-black" | "sheet-hold" | "replay-refused";

export type ShadowVerdict =
  | { readonly kind: "same" }
  | { readonly kind: "tolerated"; readonly rules: readonly ShadowRule[] }
  | { readonly kind: "mismatch"; readonly model: ShadowNames; readonly legacy: LegacyNames };

function legacyScreen(view: LegacyView, o: LegacyOverlays): string {
  if (o.ended) return "end";
  switch (view.screen) {
    case "menu":
    case "actionfx":
      return "menu";
    case "train":
      return `train/${view.selected ?? "-"}`;
    case "trained":
      return "train:result";
    case "workshop":
      return `workshop/${view.tab}`;
    case "prerace":
      if (!view.decided) return "plan";
      return o.black === undefined ? "position" : o.black === "passed" ? "black:passed" : "black";
    case "race":
      return `race:${view.turn}/${!view.result ? "replay" : o.hold ? "held" : "result"}`;
  }
}

/** The layer in front: the event's dialog (the top layer), the emblem or the card, a scene, the effects. */
function legacyLayer(view: LegacyView, o: LegacyOverlays): string | undefined {
  if (o.event) return "event";
  if (o.cover) return "emblem";
  if (o.inspiration) return "inspiration";
  if (o.scene) return `${o.scene.replay ? "replay" : "scene"}:${o.scene.id}`;
  return o.fx || view.screen === "actionfx" ? "fx" : undefined;
}

/** Today's screen, layer and music, by name. */
export function legacyNames(view: LegacyView, o: LegacyOverlays): LegacyNames {
  const race = view.screen === "race" || (view.screen === "prerace" && view.decided === true);
  return {
    screen: legacyScreen(view, o),
    layer: legacyLayer(view, o),
    music: race && !o.ended ? "race" : "menu",
    sheet: o.sheet,
  };
}

function screenName(screen: Screen): string {
  switch (screen.kind) {
    case "menu":
    case "plan":
    case "position":
    case "black":
    case "end":
      return screen.kind;
    case "train":
      return screen.result ? "train:result" : `train/${screen.selected ?? "-"}`;
    case "workshop":
      return `workshop/${screen.tab}`;
    case "race":
      return `race:${screen.turn}/${screen.stage}`;
  }
}

function layerName(layer: Layer): string {
  return layer.kind === "scene"
    ? `${layer.replay ? "replay" : "scene"}:${layer.scene.id}`
    : layer.kind;
}

/** The model's screen, layer and music, by the same names. */
export function flowNames(flow: Flow): ShadowNames {
  return {
    screen: screenName(flow.screen),
    layer: flow.layer && layerName(flow.layer),
    music: flow.music,
  };
}

/** The layer a beat shows when nothing holds it (the event's dialog is never held). */
function heldLayer(beat: Beat): string | undefined {
  switch (beat.kind) {
    case "fx":
    case "inspiration":
    case "emblem":
      return beat.kind;
    case "scene":
      return `scene:${beat.scene.id}`;
    default:
      return undefined;
  }
}

/**
 * Whether the model shows what today's game shows (`ui`: the model's UI state, which says whether
 * it took a scene asked for). Today's black for a scene seen elsewhere is black too when a scene
 * of hers follows it.
 */
export function sameFlow(
  flow: Flow,
  legacy: LegacyNames,
  ui: Pick<UiState, "replay">,
): ShadowVerdict {
  const model = flowNames(flow);
  const top = flow.top;
  const rules: ShadowRule[] = [];
  let screen =
    model.screen === legacy.screen ||
    (legacy.screen === "black:passed" && model.screen === "black");
  let layer = model.layer === legacy.layer;
  if (
    !screen &&
    legacy.screen === "black:passed" &&
    model.screen === "position" &&
    top.kind === "emblem" &&
    top.covered
  ) {
    screen = true;
    rules.push("passed-scene-black");
  }
  if (!layer && legacy.sheet && flow.layer === undefined && heldLayer(top) === legacy.layer) {
    layer = true;
    rules.push("sheet-hold");
  }
  if (!layer && legacy.layer?.startsWith("replay:") && ui.replay === undefined) {
    layer = true;
    rules.push("replay-refused");
  }
  if (!screen || !layer || model.music !== legacy.music) return { kind: "mismatch", model, legacy };
  return rules.length === 0 ? { kind: "same" } : { kind: "tolerated", rules };
}

/** How many animation frames in a row a difference must be on screen to count. */
const SHADOW_FRAMES = 2;

/** What the check keeps from one animation frame to the next. */
export type ShadowWatch = {
  /** The difference on screen at the last frame (its description), if any. */
  readonly mismatch: string | undefined;
  /** For how many frames in a row. */
  readonly frames: number;
  /** The one already reported while it lasts. */
  readonly reported: string | undefined;
};

export const SHADOW_IDLE: ShadowWatch = Object.freeze({
  mismatch: undefined,
  frames: 0,
  reported: undefined,
});

/**
 * The two-frame rule: a difference counts once it is on screen at two animation frames in a row,
 * and it is reported once while it lasts. One that a render or an effect later fixes never
 * counts: the emblem's first frame (today's cover lands at 0 ms, a layout effect after the week's
 * last beat) and today's own passive effects (a scene seen elsewhere marked a commit later).
 */
export function shadowFrame(
  watch: ShadowWatch,
  mismatch: string | undefined,
): { readonly watch: ShadowWatch; readonly report: boolean } {
  if (mismatch === undefined) return { watch: SHADOW_IDLE, report: false };
  const frames = mismatch === watch.mismatch ? watch.frames + 1 : 1;
  const report = frames >= SHADOW_FRAMES && watch.reported !== mismatch;
  return { watch: { mismatch, frames, reported: report ? mismatch : watch.reported }, report };
}

/**
 * The commands today's handlers call whose argument is the model's own (a beat's key, the race's
 * `play`): each acts on the beat the model shows now only if it is the kind the handler ended, so
 * a model that fell behind is not pushed on (the check then reports the difference).
 */
export type ShadowCommands = {
  /** A training's result, the effects, an inheritance card or the emblem ended. */
  complete(kind: "train-result" | "fx" | "inspiration" | "emblem"): void;
  /** Today's cover went up (at once, opaque). */
  covered(): void;
  /** «Saltar», or the replay's own end (today's race screen calls one handler for both). */
  raceSkip(): void;
  /** A story scene ended. */
  sceneDone(sceneId: string, skipped: boolean): void;
};

export function shadowCommands(cmd: Commands, now: () => { readonly flow: Flow }): ShadowCommands {
  return {
    complete(kind) {
      const t = now().flow.top;
      if (t.kind === kind) cmd.complete(t.key);
    },
    covered() {
      const t = now().flow.top;
      if (t.kind === "emblem") cmd.covered(t.key);
    },
    raceSkip() {
      const s = now().flow.screen;
      if (s.kind === "race") cmd.raceSkip(s.play);
    },
    sceneDone(sceneId, skipped) {
      const l = now().flow.layer;
      if (l?.kind === "scene" && l.scene.id === sceneId) cmd.sceneDone(l.key, skipped);
    },
  };
}
