/**
 * Everything on the phone's screen, derived from the facts and the UI state (plan §1.6): the first
 * beat of the queue decides the mode, the screen, the layer in front, the HUD, the wide screen's
 * panel and the music. Pure and text-free (flow/imports.test.ts).
 */
import type { SeasonState } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { ActionKind } from "../../screens/model/actions";
import { isRaceWeek } from "../../screens/model/position";
import { paceScale } from "../pace";
import { beatsOf, isInstant, stepFx } from "./beats";
import type { FlowPolicy } from "./policy";
import { digestFor } from "./scenes";
import { addedRace } from "./steps";
import { resultTimeline } from "./trainResult";
import type {
  Beat,
  DecidedWeek,
  Flow,
  FlowFacts,
  HudView,
  Layer,
  Mode,
  Nav,
  Screen,
  TrainBeat,
} from "./types";
import type { UiState } from "./ui";
import { raceWings, trainBeat } from "./week";

type Watch = Extract<Nav, { at: "watch" }>;

/** A watch of a race the season ran (a turn without a result has nothing to show). */
function watched(state: SeasonState, nav: Nav): Watch | undefined {
  return nav.at === "watch" && state.raceResults.some((r) => r.turn === nav.turn) ? nav : undefined;
}

/** The key a watch's race screen quotes to «Saltar» and its natural end: new per watch and stage. */
export function watchKey(nav: Watch): string {
  return `watch:${nav.turn}:${nav.n}:${nav.stage}`;
}

/**
 * What a screen is, for the parts that must not remount: the training screen keeps one key from
 * the picker to its result, the race screen one from the replay to the result.
 */
export function screenKey(screen: Screen): string {
  return screen.kind === "race" ? `race:${screen.turn}` : screen.kind;
}

/** What the beat in front of the screen is, before the sheet hold and a replayed scene. */
type Shown = {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly layer: Layer | undefined;
  readonly hud: HudView | undefined;
  /** The raced step's week is still a secret: the panel shows the week before it (no spoiler). */
  readonly racing: boolean;
};

/** The HUD at idle: the run's state, the cost stripes of the action picked. */
function hudOf(state: SeasonState, preview?: ActionKind): HudView {
  return { of: state, vigor: state, vigorTo: undefined, vigorAt: 0, preview, pop: undefined };
}

/** The action a picker previews: its vigor's cost stripes. */
function previewKind(nav: Nav): ActionKind | undefined {
  if (nav.at === "train") return nav.selected;
  return nav.at === "workshop" ? "workshop" : undefined;
}

/** The race screen of a watch. */
function watchScreen(nav: Watch): Screen {
  return {
    kind: "race",
    turn: nav.turn,
    stage: nav.stage,
    play: watchKey(nav),
    watch: nav.from,
  };
}

/** A screen without the layer's inertness (the sheet hold: nothing is in front of it). */
function awake(screen: Screen): Screen {
  switch (screen.kind) {
    case "menu":
    case "position":
    case "end":
      return screen.inert ? { ...screen, inert: false } : screen;
    default:
      return screen;
  }
}

/** A screen under a layer: inert, where the screen has the flag. */
function asleep(screen: Screen): Screen {
  switch (screen.kind) {
    case "menu":
    case "position":
    case "end":
      return screen.inert ? screen : { ...screen, inert: true };
    default:
      return screen;
  }
}

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const rb = new Map(Object.entries(b));
  return Object.entries(a).every(([k, v]) => rb.has(k) && rb.get(k) === v);
}

/** The previous object when it says the same (same fields, each the same value). */
function kept<T extends object>(prev: T | undefined, next: T): T {
  return prev !== undefined && prev !== next && shallowEqual(prev, next) ? prev : next;
}

/**
 * The flow now (§1.6). Instant beats (`ack`, `enter`, `pass`) resolve before paint, so the screen
 * is the next beat's; a watch takes the race screen over the race's result or the idle end; a
 * sheet open holds a beat's layer (never the event dialog's); a scene asked for from «Historia» or
 * «Ver» plays only when nothing else is in front. With `prev` (the flow derived last), `top`,
 * `screen` and `layer` keep their identity while they say the same, so a component keyed on them
 * never restarts.
 */
export function deriveFlow(
  ctx: SimContext,
  f: FlowFacts,
  ui: UiState,
  p: FlowPolicy,
  prev?: Flow,
): Flow {
  const beats = beatsOf(ctx, f, ui, p);
  const at = beats.findIndex((b) => !isInstant(b));
  const top = beats[0];
  const beat = beats[at];
  if (!top || !beat) throw new Error("the beat queue ends with an idle or a position beat");
  const state = f.run.run.state;
  const ended = state.status === "ended";
  const card = beats.find((b) => b.kind === "position");
  const shown = shownOf(ctx, f, ui, p, {
    beat,
    next: beats.slice(at + 1).find((b) => !isInstant(b)),
    card,
    watch: watched(state, ui.nav),
  });
  let { screen, layer } = shown;
  // a sheet open holds a beat's layer (F10): it waits for the sheet to close; the event dialog does not
  if (f.sheetOpen && layer && layer.kind !== "event") {
    layer = undefined;
    // the black stands only under the emblem: held, the emblem leaves the card it covers (alone,
    // the black would hide the wide screen's chat, a sheet of the column, and leave no way on)
    screen =
      screen.kind === "black" && card?.kind === "position"
        ? { kind: "position", week: card.week, wings: card.wings, inert: false }
        : awake(screen);
  }
  const replayable =
    shown.layer === undefined &&
    ui.nav.at !== "watch" &&
    (top.kind === "position" ||
      top.kind === "race-result" ||
      (top.kind === "idle" &&
        (screen.kind === "menu" || screen.kind === "plan" || screen.kind === "end")));
  if (ui.replay && replayable && !f.sheetOpen) {
    layer = {
      kind: "scene",
      key: `replay:${ui.replay.n}:${ui.replay.scene.id}`,
      scene: ui.replay.scene,
      digest: undefined,
      replay: true,
    };
    screen = asleep(screen);
  }
  const mode = shown.mode;
  const flow: Flow = {
    mode,
    top: kept(prev?.top, top),
    screen: kept(prev?.screen, screen),
    screenKey: screenKey(screen),
    layer: layer && kept(prev?.layer, layer),
    hud: screen.kind === "race" || screen.kind === "end" ? undefined : shown.hud,
    desk: {
      locked: layer !== undefined || mode === "race" || beat.kind === "train-result",
      of: shown.racing ? (f.run.step?.before ?? state) : state,
      hideLast: shown.racing,
    },
    music: mode === "race" ? "race" : "menu",
    wide: screen.kind === "race",
    // the end, or a race of it seen again: the wide screen keeps the end's lone column (M3, L8)
    solo: screen.kind === "end" || (screen.kind === "race" && screen.watch === "end"),
    toast:
      layer === undefined &&
      beat.kind !== "replay" &&
      beat.kind !== "finish" &&
      beat.kind !== "train-result" &&
      screen.kind !== "black" &&
      !(screen.kind === "race" && (screen.stage === "replay" || screen.stage === "finish")),
    canReplay: replayable && layer === undefined,
    canAct:
      top.kind === "idle" &&
      (ui.nav.at === "menu" || ui.nav.at === "train" || ui.nav.at === "workshop") &&
      state.pendingEvent === undefined &&
      !ended,
  };
  return flow;
}

/** The screen, mode, layer and HUD of the beat in front (§1.6's table). */
function shownOf(
  ctx: SimContext,
  f: FlowFacts,
  ui: UiState,
  p: FlowPolicy,
  q: {
    /** The first beat that is not instant: the one on screen. */
    readonly beat: Beat;
    /** The one after it. */
    readonly next: Beat | undefined;
    /** A decided week's card, the last beat of its queue. */
    readonly card: Beat | undefined;
    readonly watch: Watch | undefined;
  },
): Shown {
  const { beat, next, card, watch } = q;
  const state = f.run.run.state;
  const ended = state.status === "ended";
  const step = f.run.step;
  const w = f.record?.phase === "decided" ? f.record : undefined;
  const menu: Screen = { kind: "menu", inert: true };
  const plain = { racing: false, hud: hudOf(state) };

  /** A decided race week's HUD: the action's vigor once it showed; legacy: its cost stripes. */
  const raceWeekHud = (landed: boolean): HudView =>
    p.trainView
      ? { ...hudOf(state), vigor: landed && f.preview ? f.preview.after : state }
      : hudOf(state, w?.input.kind);
  const position = (week: DecidedWeek, inert: boolean): Screen => ({
    kind: "position",
    week,
    wings: card?.kind === "position" ? card.wings : raceWings(ctx, state, week.input),
    inert,
  });

  switch (beat.kind) {
    case "train-result":
      return {
        screen: {
          kind: "train",
          selected: p.trainView ? beat.result.kind : undefined,
          result: beat,
          finished: false,
        },
        mode: "training",
        layer: undefined,
        hud: trainHud(beat, f, p),
        racing: false,
      };
    case "fx": {
      const layer: Layer = { kind: "fx", key: beat.key, fx: beat.fx };
      if (beat.part === "action")
        return { screen: menu, mode: "menu", layer, hud: raceWeekHud(beat.landed), racing: false };
      const before = step?.before ?? state;
      const hud: HudView = p.fxHud
        ? { ...hudOf(before), vigor: beat.landed && step ? step.after : before }
        : hudOf(state);
      return ended
        ? {
            screen: { kind: "end", inert: true },
            mode: "end",
            layer,
            hud: undefined,
            racing: false,
          }
        : { screen: menu, mode: "menu", layer, hud, racing: false };
    }
    case "event":
      return { ...plain, screen: menu, mode: "menu", layer: { kind: "event", key: beat.key } };
    case "inspiration":
      return {
        ...plain,
        screen: ended ? { kind: "end", inert: true } : menu,
        mode: ended ? "end" : "menu",
        layer: { kind: "inspiration", key: beat.key, card: beat.card },
      };
    case "scene": {
      const layer: Layer = {
        kind: "scene",
        key: beat.key,
        scene: beat.scene,
        digest: digestFor(f.pace),
        replay: false,
      };
      if (beat.where === "race") {
        // over the finished race, held: its result waits for the scene (owner 2026-11-13)
        const turn = (step && addedRace(step)?.turn) ?? state.turn;
        return {
          screen: { kind: "race", turn, stage: "held", play: beat.key, watch: undefined },
          mode: "race",
          layer,
          hud: undefined,
          racing: true,
        };
      }
      if (beat.where === "prerace" && w)
        return {
          screen: position(w, true),
          mode: "race",
          layer,
          hud: raceWeekHud(true),
          racing: false,
        };
      return beat.where === "end"
        ? { ...plain, screen: { kind: "end", inert: true }, mode: "end", layer }
        : { ...plain, screen: menu, mode: "menu", layer };
    }
    case "emblem": {
      // only from a decided week into the race mode (owner 2026-11-13; F25, M3)
      if (!w) throw new Error("the emblem plays only on a decided race week");
      const layer: Layer = { kind: "emblem", key: beat.key, fadeIn: beat.fadeIn };
      const screen: Screen = beat.covered
        ? next?.kind === "scene"
          ? { kind: "black" }
          : position(w, true)
        : underlay(ctx, f, ui, p, w);
      return { screen, mode: "race", layer, hud: raceWeekHud(true), racing: false };
    }
    case "position":
      return {
        screen: position(beat.week, false),
        mode: "race",
        layer: undefined,
        hud: raceWeekHud(true),
        racing: false,
      };
    case "replay":
    case "finish":
      return {
        screen: {
          kind: "race",
          turn: beat.turn,
          stage: beat.kind,
          play: beat.key,
          watch: undefined,
        },
        mode: "race",
        layer: undefined,
        hud: undefined,
        racing: true,
      };
    case "race-result":
      return {
        screen:
          watch?.from === "result"
            ? watchScreen(watch)
            : { kind: "race", turn: beat.turn, stage: "result", play: beat.key, watch: undefined },
        mode: "race",
        layer: undefined,
        hud: undefined,
        racing: false,
      };
    case "idle":
    case "ack":
    case "enter":
    case "pass":
      break;
  }
  return idleOf(ctx, f, ui, watch);
}

/** The screen at idle: where the player went, the end once the season ended. */
function idleOf(ctx: SimContext, f: FlowFacts, ui: UiState, watch: Watch | undefined): Shown {
  const state = f.run.run.state;
  const base = { layer: undefined, racing: false };
  if (state.status === "ended")
    return watch?.from === "end"
      ? { ...base, screen: watchScreen(watch), mode: "race", hud: undefined }
      : { ...base, screen: { kind: "end", inert: false }, mode: "end", hud: undefined };
  const nav = ui.nav;
  const hud = hudOf(state, previewKind(nav));
  switch (nav.at) {
    case "train":
      return {
        ...base,
        screen: { kind: "train", selected: nav.selected, result: undefined, finished: false },
        mode: "training",
        hud,
      };
    case "workshop":
      return { ...base, screen: { kind: "workshop", tab: nav.tab }, mode: "menu", hud };
    case "plan":
      if (isRaceWeek(ctx, state)) {
        const r = f.record;
        const position = r?.phase === "planned" ? r.position : undefined;
        return { ...base, screen: { kind: "plan", position }, mode: "menu", hud };
      }
      break;
    case "menu":
    case "watch":
      break;
  }
  return { ...base, screen: { kind: "menu", inert: false }, mode: "menu", hud };
}

/** The screen the emblem rises over: the action's effects' menu, its training's result, or where it was decided. */
function underlay(
  ctx: SimContext,
  f: FlowFacts,
  ui: UiState,
  p: FlowPolicy,
  w: DecidedWeek,
): Screen {
  const preview = f.preview;
  if (preview && stepFx(ctx, preview, "action").length > 0) return { kind: "menu", inert: true };
  const tb = preview && trainBeat(ctx, preview, "preview", `${w.fp}/w:result`, p);
  if (tb)
    return {
      kind: "train",
      selected: p.trainView ? tb.result.kind : undefined,
      result: tb,
      finished: true,
    };
  const nav = ui.nav;
  switch (ui.from) {
    case "train":
      return {
        kind: "train",
        selected: nav.at === "train" ? nav.selected : undefined,
        result: undefined,
        finished: false,
      };
    case "workshop":
      return { kind: "workshop", tab: nav.at === "workshop" ? nav.tab : "wings" };
    case "menu":
      return { kind: "menu", inert: true };
  }
}

/** A training's result's HUD: the week she trained in, the vigor moving when its «±N» lands (L3). */
function trainHud(beat: TrainBeat, f: FlowFacts, p: FlowPolicy): HudView {
  const result = beat.result;
  const delay = resultTimeline(result, paceScale(f.pace)).vigor ?? 0;
  const pop = result.vigor !== 0 ? { delta: result.vigor, delay } : undefined;
  const state = f.run.run.state;
  return p.trainView
    ? {
        of: beat.before,
        vigor: beat.before,
        vigorTo: beat.after,
        vigorAt: delay,
        preview: undefined,
        pop,
      }
    : { ...hudOf(state), pop };
}
