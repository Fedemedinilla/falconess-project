/**
 * The story scenes in the phone's flow (plan §1.2, §1.4): which are due in each mode, in what
 * order, and where the inheritance card goes among them. Pure and text-free like everything in
 * `mobile/flow/`: the scenes come in as data (`allScenes()` in the app, the JSON files in the
 * tests).
 */
import type { SeasonState, StoryScene, StoryTrigger } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { InspirationScene } from "../inspirationScene";
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
