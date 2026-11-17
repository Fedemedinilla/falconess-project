/**
 * The story scenes in the phone's flow (plan §1.2, §1.4): which are due in each mode, in what
 * order, and where the inheritance card goes among them. Pure and text-free like everything in
 * `mobile/flow/`: the scenes come in as data (`allScenes()` in the app, the JSON files in the
 * tests).
 */
import type { SeasonState, StoryScene, StoryTrigger } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { InspirationScene } from "../inspirationScene";
import { MOTION, STORY } from "../motion";
import type { Pace } from "../pace";
import { triggerHolds } from "../storyModel";
import type { Digest, SceneMode } from "./types";

/**
 * «Ritmo» (owner 2026-11-14): how fast a digest passes its lines, one frozen object per pace, so
 * a scene's props keep their identity from render to render (critic (c)5: a new object restarted
 * the digest's timers on every render).
 */
export const DIGEST: Readonly<Record<Exclude<Pace, "normal">, Digest>> = Object.freeze({
  fast: Object.freeze({ ms: 1100 }),
  direct: Object.freeze({ ms: 650 }),
});

/** Rápido and Directo pass a scene as a digest; Normal plays it whole. */
export function digestFor(pace: Pace): Digest | undefined {
  return pace === "normal" ? undefined : DIGEST[pace];
}

type SceneKind = StoryTrigger["kind"];

function kinds(...list: SceneKind[]): readonly SceneKind[] {
  return Object.freeze(list);
}

/** The kinds in the order the season plays them (F13): then by goal or week, then by id. */
export const SCENE_ORDER: Readonly<Record<SceneKind, number>> = Object.freeze({
  start: 0,
  "goal-before": 1,
  "goal-after": 2,
  end: 3,
  turn: 4,
});

/**
 * The kinds each mode plays (owner 2026-11-13, F14): a goal's «before» only in the race mode
 * before the position; after the race, its goal-after and the end; on the menu the start and the
 * weeks' scenes, plus a goal-after or end the race mode never played (a step read in the test
 * view). `turn` triggers need an active season, so none is due at the end.
 */
export const SCENE_KINDS: Readonly<Record<SceneMode, readonly SceneKind[]>> = Object.freeze({
  prerace: kinds("goal-before"),
  race: kinds("goal-after", "end"),
  menu: kinds("start", "turn", "goal-after", "end"),
  end: kinds("goal-after", "end"),
});

/** What orders two scenes of one kind: the goal's index, or the week. */
function rank(t: StoryTrigger): number {
  switch (t.kind) {
    case "goal-before":
    case "goal-after":
      return t.goal;
    case "turn":
      return t.turn;
    case "start":
    case "end":
      return 0;
  }
}

function byPriority(a: StoryScene, b: StoryScene): number {
  return (
    SCENE_ORDER[a.trigger.kind] - SCENE_ORDER[b.trigger.kind] ||
    rank(a.trigger) - rank(b.trigger) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Every scene of hers due now in a mode (of the mode's kinds) and not seen in this season, in the
 * order they play: by kind, then by goal or week, then by id, whatever order they came in (F13).
 */
export function dueScenes(
  ctx: SimContext,
  scenes: readonly StoryScene[],
  state: SeasonState,
  where: SceneMode,
  seen: ReadonlySet<string>,
): StoryScene[] {
  return scenes
    .filter(
      (sc) =>
        sc.falconess === state.falconessId &&
        !seen.has(sc.id) &&
        SCENE_KINDS[where].includes(sc.trigger.kind) &&
        triggerHolds(ctx, state, sc.trigger),
    )
    .sort(byPriority);
}

/** One thing the menu shows after a week: a story scene or the inheritance card. */
export type MenuItem =
  | { readonly kind: "scene"; readonly scene: StoryScene }
  | { readonly kind: "card"; readonly card: InspirationScene };

/**
 * The menu's scenes and the inheritance card in D2's order: at the season's start the prologue,
 * then the start's card; on any other week the goal's scenes and the end, then the week's card,
 * then the weeks' scenes (and a start scene left over).
 */
export function menuOrder(
  scenes: readonly StoryScene[],
  card: InspirationScene | undefined,
): MenuItem[] {
  const items = (list: readonly StoryScene[]): MenuItem[] =>
    list.map((scene) => ({ kind: "scene", scene }));
  const cards: MenuItem[] = card ? [{ kind: "card", card }] : [];
  const of = (kind: SceneKind) => items(scenes.filter((sc) => sc.trigger.kind === kind));
  const goals = [...of("goal-after"), ...of("end")];
  if (card?.kind === "start") return [...of("start"), ...cards, ...goals, ...of("turn")];
  return [...goals, ...cards, ...of("turn"), ...of("start")];
}

// --- a scene's way in (plan §2.6; H4, M5, M10, O7) ------------------------------------------------

/**
 * How a scene comes in: Normal and the scenes asked for from «Historia» or «Ver» play the whole way
 * in (`full`), Rápido and Directo a short one (`digest`), reduced motion none (`still`: the card
 * stands whole from the first frame).
 */
export type IntroTempo = "full" | "digest" | "still";

/** One animation of the way in: its start and its length, ms from the scene's first frame. */
export type IntroTrack = { readonly at: number; readonly ms: number };

/** The animations of the way in, in the order they come (each a track of `IntroTiming`). */
export const INTRO_TRACKS = Object.freeze([
  "chrome",
  "ground",
  "backdrop",
  "shade",
  "glow",
  "bars",
  "card",
] as const);

/**
 * A scene's way in (StoryOverlay writes it as inline CSS variables; its timers read `lineAt`):
 * black at once, then the chrome («Saltar», Auto, Registro), the scene's ground and its painted
 * backdrop with its shade, the cinematic's glow and bars, the chapter's card in, held, and out
 * into the first line. `driftAt` and `panAt` start the backdrop's and the glow's slow loops.
 */
export type IntroTiming = {
  readonly tempo: IntroTempo;
  readonly chrome: IntroTrack;
  readonly ground: IntroTrack;
  readonly backdrop: IntroTrack;
  readonly shade: IntroTrack;
  readonly glow: IntroTrack;
  readonly bars: IntroTrack;
  readonly card: IntroTrack;
  readonly cardOut: IntroTrack;
  readonly driftAt: number;
  readonly panAt: number;
  readonly lineAt: number;
};

const track = (at: number, ms: number): IntroTrack => Object.freeze({ at, ms });

/** The way in of each tempo, from its first line back: the card's fade ends there. */
function timing(
  tempo: IntroTempo,
  t: Omit<IntroTiming, "tempo" | "cardOut" | "driftAt" | "panAt">,
  cardOutMs: number,
): IntroTiming {
  return Object.freeze({
    tempo,
    ...t,
    cardOut: track(t.lineAt - cardOutMs, cardOutMs),
    driftAt: t.backdrop.at + t.backdrop.ms,
    panAt: t.glow.at + t.glow.ms,
  });
}

/**
 * Each tempo's way in. `full` keeps the owner's (escenas.md §2: the first line at 2.8 s) with the
 * chrome from 0.3 s (M10, was 1.3 s) and the card fading out over its last 250 ms (M5). `digest`
 * is shorter (H4: on Rápido the card used to be whole for 0 ms) with the card whole for 0.7 s.
 * `still` (reduced motion) has no animation: the card whole for 0.9 s, then the first line.
 */
const INTRO: Readonly<Record<IntroTempo, IntroTiming>> = Object.freeze({
  full: timing(
    "full",
    {
      chrome: track(STORY.chromeAt, MOTION.fast),
      ground: track(500, 900),
      backdrop: track(500, 1300),
      shade: track(600, 900),
      glow: track(700, 1000),
      bars: track(1100, 800),
      card: track(1200, 600),
      lineAt: 2800,
    },
    MOTION.cardOut,
  ),
  digest: timing(
    "digest",
    {
      chrome: track(STORY.chromeAt, MOTION.fast),
      ground: track(200, 700),
      backdrop: track(200, 700),
      shade: track(250, 650),
      glow: track(300, 600),
      bars: track(300, 550),
      card: track(400, 400),
      lineAt: 800 + STORY.cardMinMs + MOTION.cardOut,
    },
    MOTION.cardOut,
  ),
  still: timing(
    "still",
    {
      chrome: track(0, 0),
      ground: track(0, 0),
      backdrop: track(0, 0),
      shade: track(0, 0),
      glow: track(0, 0),
      bars: track(0, 0),
      card: track(0, 0),
      lineAt: STORY.rmCardMs,
    },
    0,
  ),
});

/** The tempo of a scene's way in: reduced motion first, then a digest («Ritmo»), else whole. */
export function introTempo(digest: Digest | undefined, reduced: boolean): IntroTempo {
  return reduced ? "still" : digest ? "digest" : "full";
}

/** A tempo's way in: the same frozen object on every call (a scene latches it at its mount). */
export function introTiming(tempo: IntroTempo): IntroTiming {
  return INTRO[tempo];
}

/** When the chapter's card is whole (its fade in ended). */
export function cardShownAt(t: IntroTiming): number {
  return t.card.at + t.card.ms;
}

/**
 * A track hurried at `at`: if it would end more than `within` after the tap, it goes on from
 * where it is (the same progress at the tap: nothing jumps) and ends `within` after it; one not
 * started yet plays from the tap.
 */
function hurryTrack(k: IntroTrack, at: number, within: number): IntroTrack {
  if (k.at + k.ms <= at + within) return k;
  const p = Math.max(0, (at - k.at) / k.ms);
  const ms = within / (1 - p);
  return track(at - p * ms, ms);
}

/**
 * The way in after a tap at `at` ms (M10, O7): every animation of it catches up within 120 ms from
 * where it is (the card shows whole), and the first line comes 500 ms after the tap (300 in a
 * digest), never later than it would have; the card's fade ends at that line, after it showed
 * whole. A second tap shows the line at once (StoryOverlay).
 */
export function hurried(t: IntroTiming, at: number): IntroTiming {
  const h = (name: (typeof INTRO_TRACKS)[number]) => hurryTrack(t[name], at, MOTION.fast);
  const backdrop = h("backdrop");
  const glow = h("glow");
  const card = h("card");
  const lineAt = Math.min(
    t.lineAt,
    at + (t.tempo === "digest" ? STORY.hurryDigestMs : STORY.hurryMs),
  );
  const outAt =
    lineAt === t.lineAt ? t.cardOut.at : Math.max(card.at + card.ms, lineAt - t.cardOut.ms);
  const loop = (old: number, fade: IntroTrack) =>
    at >= old ? old : Math.max(at, fade.at + fade.ms);
  return Object.freeze({
    tempo: t.tempo,
    chrome: h("chrome"),
    ground: h("ground"),
    backdrop,
    shade: h("shade"),
    glow,
    bars: h("bars"),
    card,
    cardOut: lineAt === t.lineAt ? t.cardOut : track(outAt, lineAt - outAt),
    driftAt: loop(t.driftAt, backdrop),
    panAt: loop(t.panAt, glow),
    lineAt,
  });
}
