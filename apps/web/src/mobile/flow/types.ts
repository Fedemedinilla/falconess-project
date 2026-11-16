/**
 * The types of the phone's flow (plan §1.3), pure and text-free like everything in `mobile/flow/`:
 * the native `web-flow` project runs these modules without Vite (flow/imports.test.ts). Types from
 * modules that reach the text tables come in with `import type` only.
 */
import type { Position, SeasonState, StoryScene, TrainingKind } from "@falconess/schema";
import type { ActiveRun, Step } from "../../game/controller";
import type { ActionKind } from "../../screens/model/actions";
import type { WeekActionInput } from "../../screens/model/position";
import type { InspirationScene } from "../inspirationScene";
import type { Pace } from "../pace";
import type { WeekFx, WeekFxPart } from "../weekFx";
import type { TrainResult } from "./trainResult";

/** The owner's three modes (2026-11-13) and the season's end. The selection sits outside a run. */
export type Mode = "training" | "menu" | "race" | "end";

/** Where a story scene may play: the menu, the race mode before the position or after the race, the end. */
export type SceneMode = "menu" | "prerace" | "race" | "end";

/** The workshop's two tabs: learn skills, swap the wings. */
export type WorkshopTab = "skills" | "wings";

/**
 * «Ritmo» Rápido / Directo (owner 2026-11-14, as Umamusume skips): not the whole scene but a
 * digest, about a third of its lines (the first and the last always) passing by on their own,
 * whole at once, `ms` each. Seen in full from «Historia» or «Ver».
 */
export type Digest = { readonly ms: number };

// --- the decided race week (D5) -------------------------------------------------------------------

/**
 * A race week's action, decided once its preview played (owner 2026-11-12: no way back). Kept by
 * the week store (flow/decidedWeek.ts, `WEEK_KEY`), keyed by the run's fingerprint before the
 * commit, so a reload plays the same week on.
 */
export type DecidedWeek = {
  readonly fp: string;
  readonly turn: number;
  /** The run's input count when it was decided: the controller's `expectInputs` at «Correr». */
  readonly inputs: number;
  /** The week's action, without a position: the card adds the one picked at «Correr». */
  readonly input: WeekActionInput;
  /** The position picked on the card (or before, on the planning card); undefined: her wings'. */
  readonly position: Position | undefined;
  /** `action`: its result and effects may still play; `race`: the race mode has begun. */
  readonly stage: "action" | "race";
};

/** What the week store keeps: a position planned, a week decided, or a race whose result was seen. */
export type WeekRecord =
  | {
      readonly phase: "planned";
      readonly fp: string;
      readonly turn: number;
      readonly position: Position | undefined;
    }
  | ({ readonly phase: "decided" } & DecidedWeek)
  | { readonly phase: "raceSeen"; readonly fp: string };

// --- the beats: what the game waits for -------------------------------------------------------------

/** A training's result on the training screen. */
export type TrainBeat = {
  readonly kind: "train-result";
  readonly key: string;
  /** The same object on every derive (cached per step). */
  readonly result: TrainResult;
  /** The week she trained in: the HUD, the buttons, the crews (critic b). */
  readonly before: SeasonState;
  /** What the stats and the vigor move to (F6, L3). */
  readonly after: SeasonState;
};

/** What the game waits for. Only the first one `beatsOf` returns is ever shown or acted on. */
export type Beat =
  | TrainBeat
  | {
      readonly kind: "fx";
      readonly key: string;
      readonly part: WeekFxPart;
      readonly fx: readonly WeekFx[];
      /** The vigor change already showed (a training's result came first, or the race part). */
      readonly landed: boolean;
    }
  /** Instant: the step is read. */
  | { readonly kind: "ack"; readonly key: string }
  /** Instant: the race mode begins without the emblem (Directo, reduced motion). */
  | { readonly kind: "enter"; readonly key: string; readonly fp: string }
  /** Instant: a scene seen in another season is passed by, with a notice. */
  | { readonly kind: "pass"; readonly key: string; readonly scene: StoryScene }
  /** v1/v2: the event dialog acts by itself. */
  | { readonly kind: "event"; readonly key: string }
  | { readonly kind: "inspiration"; readonly key: string; readonly card: InspirationScene }
  | {
      readonly kind: "scene";
      readonly key: string;
      readonly scene: StoryScene;
      readonly where: SceneMode;
    }
  | {
      readonly kind: "emblem";
      readonly key: string;
      readonly fp: string;
      readonly covered: boolean;
      /** False: a week restored from storage opens on a full cover. */
      readonly fadeIn: boolean;
    }
  | {
      readonly kind: "position";
      readonly key: string;
      readonly week: DecidedWeek;
      readonly wings: Position;
    }
  | { readonly kind: "replay"; readonly key: string; readonly turn: number }
  /** D7: the finish banner's hold before the result. */
  | { readonly kind: "finish"; readonly key: string; readonly turn: number }
  | { readonly kind: "race-result"; readonly key: string; readonly turn: number }
  | { readonly kind: "idle"; readonly key: string };

/** The beats that resolve before paint and render nothing. */
export type InstantBeat = Extract<Beat, { kind: "ack" | "enter" | "pass" }>;

// --- what is on screen -------------------------------------------------------------------------------

/** What fills the game's column: exactly one at a time. */
export type Screen =
  | { readonly kind: "menu"; readonly inert: boolean }
  | {
      readonly kind: "train";
      readonly selected: TrainingKind | undefined;
      readonly result: TrainBeat | undefined;
      /** A finished result under the emblem: no timers, no replayed drop. */
      readonly finished: boolean;
    }
  | { readonly kind: "workshop"; readonly tab: WorkshopTab }
  /** D3: the planning card, in the menu mode. */
  | { readonly kind: "plan"; readonly position: Position | undefined }
  | {
      readonly kind: "position";
      readonly week: DecidedWeek;
      readonly wings: Position;
      readonly inert: boolean;
    }
  /** `[data-black]`: only under a covered emblem before a scene. */
  | { readonly kind: "black" }
  | {
      readonly kind: "race";
      readonly turn: number;
      readonly stage: "replay" | "finish" | "held" | "result";
      /** The key «Saltar» and the natural end quote (the beat's key, or the watch's). */
      readonly play: string;
      readonly watch: "result" | "end" | undefined;
    }
  | { readonly kind: "end"; readonly inert: boolean };

/** The one full-screen layer in front, if any. */
export type Layer =
  | { readonly kind: "fx"; readonly key: string; readonly fx: readonly WeekFx[] }
  | { readonly kind: "inspiration"; readonly key: string; readonly card: InspirationScene }
  | {
      readonly kind: "scene";
      readonly key: string;
      readonly scene: StoryScene;
      readonly digest: Digest | undefined;
      readonly replay: boolean;
    }
  | { readonly kind: "emblem"; readonly key: string; readonly fadeIn: boolean }
  | { readonly kind: "event"; readonly key: string };

/** Which week the HUD shows (O3, critic b1): read from the beat, never from the last step. */
export type HudView = {
  /** The calendar, the goal pill, the mood: the run's state, or the beat's own `before`. */
  readonly of: SeasonState;
  /** The vigor bar, until `vigorTo` lands. */
  readonly vigor: SeasonState;
  /** A training's result: the bar's value switches to it at `vigorAt` (L3). */
  readonly vigorTo: SeasonState | undefined;
  /** Ms after the beat's start: the vigor «±N»'s delay. */
  readonly vigorAt: number;
  /** The cost stripes on the idle pickers. */
  readonly preview: ActionKind | undefined;
  readonly pop: { readonly delta: number; readonly delay: number } | undefined;
};

/** The wide screen's panel (D4). */
export type DeskView = {
  readonly locked: boolean;
  /** Metas: the run's state, or the raced step's `before` while its race part plays (no spoiler). */
  readonly of: SeasonState;
  /** Registro hides the week being raced. */
  readonly hideLast: boolean;
};

/** Where the player went at idle. */
export type Nav =
  | { readonly at: "menu" }
  | { readonly at: "train"; readonly selected: TrainingKind | undefined }
  | { readonly at: "workshop"; readonly tab: WorkshopTab }
  | { readonly at: "plan" }
  | {
      readonly at: "watch";
      readonly turn: number;
      readonly from: "result" | "end";
      /** Unique per watch, so its keys never repeat. */
      readonly n: number;
      readonly stage: "replay" | "finish" | "result";
    };

// --- what the flow is derived from -------------------------------------------------------------------

/** The run, as the controller has it. */
export type RunFacts = {
  readonly run: ActiveRun;
  /** `runFingerprint(run)`. */
  readonly fp: string;
  /** The controller's last step. */
  readonly step: Step | undefined;
  /** The controller's `lastStepSeen` (persisted). */
  readonly stepSeen: boolean;
};

/** Everything the flow reads, from the stores and the page. */
export type FlowFacts = {
  readonly run: RunFacts;
  /** Data: `allScenes()` in the app, the JSON files in the tests. */
  readonly scenes: readonly StoryScene[];
  /** The week store's record if it belongs to this run (`validRecord`), else undefined. */
  readonly record: WeekRecord | undefined;
  /** The decided week's preview (`previewOf`, cached). */
  readonly preview: Step | undefined;
  readonly seenInRun: ReadonlySet<string>;
  readonly seenEver: ReadonlySet<string>;
  /** The inheritance cards shown. */
  readonly cardsShown: ReadonlySet<string>;
  readonly pace: Pace;
  readonly reduced: boolean;
  /** A sheet or the chat is open (never the event dialog); released at its close request. */
  readonly sheetOpen: boolean;
};

/** Everything on screen, derived. */
export type Flow = {
  readonly mode: Mode;
  readonly top: Beat;
  readonly screen: Screen;
  /** menu | train | workshop | plan | position | black | race:<turn> | end */
  readonly screenKey: string;
  readonly layer: Layer | undefined;
  /** Undefined only on race screens and the end (kept under black: the cover is fixed). */
  readonly hud: HudView | undefined;
  readonly desk: DeskView;
  readonly music: "menu" | "race";
  /** The race's wide column. */
  readonly wide: boolean;
  /** The end shows, or a re-watch from it: the wide screen centers the column alone. */
  readonly solo: boolean;
  /** A notice may show (it also waits for no layer to be in or leaving). */
  readonly toast: boolean;
  /** «Historia» and «Ver» may start a scene now. */
  readonly canReplay: boolean;
  /** The week's actions take a tap now. */
  readonly canAct: boolean;
};
