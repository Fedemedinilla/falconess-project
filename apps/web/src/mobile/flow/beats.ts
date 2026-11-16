/**
 * The queue of what the phone's game waits for (plan §1.5): every beat still to play, in order.
 * Only the first is ever shown or acted on (`deriveFlow`), so nothing plays out of order. Each key
 * is scoped to the run: a committed step's and a decided week's carry the fingerprint, a scene's
 * and a card's the seed, an event's its turn. Pure and text-free (flow/imports.test.ts).
 */
import type { SeasonState, StoryScene } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { Step } from "../../game/controller";
import { type InspirationScene, inspirationCard } from "../inspirationScene";
import { type WeekFx, type WeekFxPart, weekFx } from "../weekFx";
import type { FlowPolicy } from "./policy";
import { dueScenes, menuOrder } from "./scenes";
import { addedRace, fxPart } from "./steps";
import type { Beat, FlowFacts, InstantBeat, Nav, SceneMode } from "./types";
import type { UiState } from "./ui";
import { raceWings, trainBeat } from "./week";

const effects = new WeakMap<Step, Map<WeekFxPart, readonly WeekFx[]>>();

/** The step's effects of one part, the same array on every call (a beat that holds it keeps its identity). */
export function stepFx(ctx: SimContext, step: Step, part: WeekFxPart): readonly WeekFx[] {
  let byPart = effects.get(step);
  if (!byPart) {
    byPart = new Map();
    effects.set(step, byPart);
  }
  let fx = byPart.get(part);
  if (!fx) {
    fx = Object.freeze(weekFx(step, ctx.ruleset, part));
    byPart.set(part, fx);
  }
  return fx;
}

/** The beats that resolve before paint and render nothing (§1.7 rule 4). */
export function isInstant(beat: Beat): beat is InstantBeat {
  return beat.kind === "ack" || beat.kind === "enter" || beat.kind === "pass";
}

/** A watch of a race the season ran (a turn without a result has nothing to show). */
export function watched(state: SeasonState, nav: Nav): Extract<Nav, { at: "watch" }> | undefined {
  return nav.at === "watch" && state.raceResults.some((r) => r.turn === nav.turn) ? nav : undefined;
}

/** Legacy (F25, until 5.1): the key of the emblem that opens a watch from the end. */
export function watchEmblemKey(n: number): string {
  return `watch:${n}/emblem`;
}

function cardBeat(card: InspirationScene): Beat {
  return { kind: "inspiration", key: `insp:${card.key}`, card };
}

/**
 * Every beat the game waits for now, in the order they play (§1.4), the idle one last (on a
 * decided race week, its position card). A beat this mount finished is left out, and a key shows
 * once (a scene due both after the race and at the season's end plays once). The legacy policy
 * gives today's order, flag by flag (§1.12).
 */
export function beatsOf(
  ctx: SimContext,
  f: FlowFacts,
  ui: UiState,
  p: FlowPolicy,
): readonly Beat[] {
  const { run, fp, step, stepSeen } = f.run;
  const out: Beat[] = [];
  const keys = new Set<string>();
  const push = (b: Beat | undefined): void => {
    if (!b || ui.done.has(b.key) || keys.has(b.key)) return;
    keys.add(b.key);
    out.push(b);
  };
  const scene = (sc: StoryScene, where: SceneMode): Beat => {
    const key = `scene:${run.seed}:${sc.id}`;
    return f.seenEver.has(sc.id)
      ? { kind: "pass", key, scene: sc }
      : { kind: "scene", key, scene: sc, where };
  };
  const due = (where: SceneMode) => dueScenes(ctx, f.scenes, run.state, where, f.seenInRun, p);

  // C. A decided race week (D5): the action's part, then the race mode up to «Correr».
  const w = f.record?.phase === "decided" ? f.record : undefined;
  if (w && f.preview) {
    const k = (b: string) => `${w.fp}/w:${b}`;
    if (w.stage === "action") {
      const tb = trainBeat(ctx, f.preview, "preview", k("result"), p);
      push(tb);
      const afx = stepFx(ctx, f.preview, "action");
      if (afx.length > 0)
        push({ kind: "fx", key: k("fx"), part: "action", fx: afx, landed: tb !== undefined });
      // a week restored from storage, nothing of it played in this mount, opens on a full cover
      const fresh = !ui.mine.has(w.fp) && !ui.done.has(k("result")) && !ui.done.has(k("fx"));
      push(
        f.pace === "direct" || f.reduced
          ? { kind: "enter", key: k("enter"), fp: w.fp }
          : {
              kind: "emblem",
              key: k("emblem"),
              fp: w.fp,
              fadeIn: !fresh,
              covered: fresh || ui.done.has(k("emblem:in")),
            },
      );
    }
    for (const sc of due("prerace")) push(scene(sc, "prerace"));
    // nothing after «Correr» exists yet: the card is always the last beat (it has no way back)
    out.push({ kind: "position", key: k("position"), week: w, wings: raceWings(ctx, run.state) });
    return out;
  }

  // B, C after «Correr», D: the last step while unread (the controller's lastStep, lastStepSeen).
  const ended = run.state.status === "ended";
  const unread = step && !stepSeen && run.state === step.after ? step : undefined;
  const own = p.resume || ui.mine.has(fp); // legacy: only what this mount committed
  const tail = p.endSequence || !ended; // legacy: the season's end swallows the rest (F3)
  const card = ended
    ? undefined
    : inspirationCard(
        run.seed,
        run.state,
        run.inputs.length,
        p.order === "legacy" ? unread : step,
        f.cardsShown,
      );
  if (unread) {
    const k = (b: string) => `${fp}/${b}`;
    const race = addedRace(unread);
    // the race part's vigor already showed before «Correr»
    let landed = race !== undefined;
    if (!race) {
      if (own && tail) {
        const tb = trainBeat(ctx, unread, "step", k("result"), p);
        landed = tb !== undefined;
        push(tb);
      }
    } else if (own && f.record?.phase !== "raceSeen") {
      if (f.pace !== "direct") {
        push({ kind: "replay", key: k("race:replay"), turn: race.turn });
        if (p.finishHold) push({ kind: "finish", key: k("race:finish"), turn: race.turn });
      }
      for (const sc of due("race")) push(scene(sc, "race"));
      push({ kind: "race-result", key: k("race:result"), turn: race.turn });
    }
    if (p.order === "legacy" && card) push(cardBeat(card)); // C10 as the game plays it today
    if (tail) {
      const part = fxPart(unread);
      const fx = stepFx(ctx, unread, part);
      push(
        fx.length > 0
          ? { kind: "fx", key: k("fx"), part, fx, landed }
          : { kind: "ack", key: k("ack") },
      );
    }
  }
  // Once the step is read: the event, or the scenes and the inheritance card in D2's order.
  const event = ended ? undefined : run.state.pendingEvent;
  if (event) push({ kind: "event", key: `event:${event.eventId}/${event.turn}` });
  else {
    const where: SceneMode = ended ? "end" : "menu";
    const later = p.order === "legacy" && unread ? undefined : card; // legacy pushed it already
    for (const it of menuOrder(due(where), later, p))
      push(it.kind === "card" ? cardBeat(it.card) : scene(it.scene, where));
  }
  // legacy (F25, removed in 5.1): «Ver carrera» from the end opens with the emblem, as today
  const watch = watched(run.state, ui.nav);
  if (p.emblemOnWatch && watch?.from === "end" && f.pace !== "direct" && !f.reduced)
    push({ kind: "emblem", key: watchEmblemKey(watch.n), fp, fadeIn: false, covered: true });
  out.push({ kind: "idle", key: `idle:${fp}` });
  return out;
}
