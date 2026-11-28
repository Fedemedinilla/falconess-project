/**
 * What a tap or a timer does in the phone's flow (plan §1.7): each command reads the flow, the facts
 * and the UI state as it found them, writes to the stores and dispatches to the UI state in the same
 * synchronous call (critic (c)3: `game.act` and the nav change never come apart), and does nothing
 * for a beat that is no longer the one in front (a stale timer, a second tap, F18). The sounds
 * play here too, inside the tap: the action's cue, and the whoosh only where a tap goes to another
 * screen (`open`, `raceAgain`, `rewatch`, `raceContinue`), so a timer never sounds (critic b). The
 * same code drives the game and the node season walks. Pure and text-free (flow/imports.test.ts).
 */
import type {
  Position,
  SeasonState,
  StoryScene,
  TrainingKind,
  WorkshopOp,
  WorkshopVisitOp,
} from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { GameController, GameErrorKind } from "../../game/controller";
import { runFingerprint } from "../../game/run";
import { TRAINING_KINDS } from "../../screens/model/actions";
import { isRaceWeek, type WeekActionInput, withPosition } from "../../screens/model/position";
import type { SoundCue } from "../sfx";
import type { StoryStore } from "../storyModel";
import type { WeekStore } from "./decidedWeek";
import { watchKey } from "./derive";
import type { InspirationStore } from "./inspirations";
import { trainingCue } from "./trainResult";
import type { Flow, FlowFacts, InstantBeat, WorkshopTab } from "./types";
import type { UiEvent, UiState } from "./ui";
import { screenFrom, tryPreview } from "./week";

/** What the commands reach: the game, the stores, the sounds, the UI state and the flow now. */
export type FlowPorts = {
  readonly ctx: SimContext;
  readonly game: Pick<GameController, "act" | "acknowledgeStep" | "getSnapshot">;
  readonly weeks: Pick<
    WeekStore,
    "plan" | "decide" | "setPosition" | "enterRace" | "markRaced" | "markRaceSeen"
  >;
  readonly story: Pick<StoryStore, "markSeen">;
  readonly cards: Pick<InspirationStore, "markShown">;
  /** The action's cue, and the whoosh of a tap that goes to another screen. */
  readonly sound: { cue(c: SoundCue): void; nav(): void };
  readonly dispatch: (e: UiEvent) => void;
  /** The flow, facts and UI state exactly as this tap or timer found them. */
  readonly now: () => { readonly flow: Flow; readonly facts: FlowFacts; readonly ui: UiState };
};

export type Commands = {
  /**
   * «Entrenar», «Taller», «Habilidades», the race bar's card, «Volver» and the planning card's
   * «Elegir la acción»: only at idle.
   */
  open(to: "menu" | "train" | "workshop" | "skills" | "plan"): void;
  selectTraining(kind: TrainingKind): void;
  workshopTab(tab: WorkshopTab): void;
  /** The week's action: a normal week commits it, a race week decides it (its preview plays first). */
  choose(input: WeekActionInput): void;
  /**
   * The workshop's «Confirmar». On a ruleset with `workshopVisit` (v3, ADR-0018) a visit that spends
   * no week: committed at once, race week or not, and a position planned for the race week stays
   * planned. On v1 and v2 (or with an op a visit does not take) the workshop is still the week's
   * action (`choose`).
   */
  visit(ops: WorkshopOp[]): void;
  /** A position on the planning card or the decided one; undefined: her wings' own. */
  position(position: Position | undefined): void;
  /** «Correr». */
  run(): void;
  /** A beat's timer or tap ended it (a result, the effects, a card, the emblem, a race's result). */
  complete(key: string): void;
  /** The emblem is opaque: what is under it may change. */
  covered(key: string): void;
  /** «Saltar» or a tap on the finish banner: the replay and the hold end, or a watch goes to its result. */
  raceSkip(play: string): void;
  /** The race's stage ended by itself: the replay, then the finish hold, then the result. */
  raceNext(play: string): void;
  /** «Ver otra vez» on a race's result, or on a watch's: the race again, from where it began. */
  raceAgain(): void;
  /** «Ver carrera» on the season's end. */
  rewatch(turn: number): void;
  /** «Continuar» on a race's result: the race mode ends, or a watch from the end goes back to it. */
  raceContinue(): void;
  /**
   * A story scene ended (`skipped`: «Saltar»). Since the scene's notice went (owner 2026-11-18)
   * nothing is shown either way, so `skipped` is only what the scene reports.
   */
  sceneDone(key: string, skipped: boolean): void;
  /** «Historia»: a scene again, whole. */
  watchScene(scene: StoryScene): void;
  /** An instant beat, before paint: idempotent, and it always ends the beat. */
  resolve(beat: InstantBeat): void;
};

/** Why the controller refused the last act, named as `ui.error.<kind>` names it. */
function errorKindOf(game: FlowPorts["game"]): GameErrorKind {
  return game.getSnapshot().error?.kind ?? "unexpected";
}

/** The order as a v3 visit's ops (ADR-0018: wings and skills), or undefined if it holds other ops. */
function visitOps(ops: readonly WorkshopOp[]): WorkshopVisitOp[] | undefined {
  const out: WorkshopVisitOp[] = [];
  for (const op of ops) {
    if (op.op !== "equip-frame" && op.op !== "learn-skill") return undefined;
    out.push(op);
  }
  return out;
}

/** The fingerprint of the run the controller holds now. */
function fingerprintNow(game: FlowPorts["game"]): string | undefined {
  const run = game.getSnapshot().run;
  return run && runFingerprint(run);
}

/** The week's training cards as the cue reads them: a crew there makes a success a boost. */
function cueCards(state: SeasonState): { kind: TrainingKind; boosted: boolean }[] {
  return TRAINING_KINDS.map((kind) => ({
    kind,
    boosted: (state.crewPresence[kind] ?? []).length > 0,
  }));
}

/** The commands of one run's view, on its ports. */
export function flowCommands(p: FlowPorts): Commands {
  /** A watch shows its race screen at a stage before the result: the result's buttons are not there. */
  const watching = (ui: UiState): boolean => ui.nav.at === "watch" && ui.nav.stage !== "result";

  const complete = (key: string): void => {
    const { flow, facts, ui } = p.now();
    const t = flow.top;
    if (t.key !== key) return;
    switch (t.kind) {
      case "train-result":
        break;
      case "fx":
        // the action's part leaves the step unread: the race part reads it
        if (t.part !== "action") p.game.acknowledgeStep();
        break;
      case "inspiration":
        p.cards.markShown(facts.run.run.seed, t.card.key);
        break;
      case "emblem":
        p.weeks.enterRace(t.fp);
        break;
      case "race-result":
        if (watching(ui)) return;
        p.weeks.markRaceSeen(facts.run.fp);
        break;
      default:
        // scenes end through sceneDone, instants through resolve, the race through raceNext or raceSkip
        return;
    }
    p.dispatch({ type: "done", keys: [key] });
  };

  const cmds: Commands = {
    open(to) {
      const { flow, facts, ui } = p.now();
      if (flow.top.kind !== "idle" || flow.layer || ui.nav.at === "watch") return;
      if (facts.run.run.state.status === "ended") return;
      p.sound.nav();
      p.dispatch({ type: "open", to });
    },

    selectTraining(kind) {
      const { flow } = p.now();
      if (flow.top.kind !== "idle" || flow.layer) return;
      p.dispatch({ type: "select", kind });
    },

    workshopTab(tab) {
      const { flow } = p.now();
      if (flow.top.kind !== "idle" || flow.layer) return;
      p.dispatch({ type: "tab", tab });
    },

    choose(input) {
      const { flow, facts, ui } = p.now();
      if (!flow.canAct || flow.layer) return; // F27, with the controller's expectInputs
      const { run, fp } = facts.run;
      const state = run.state;
      const cards = cueCards(state);
      if (!isRaceWeek(p.ctx, state)) {
        if (!p.game.act(input, run.inputs.length)) {
          p.dispatch({ type: "notice", notice: errorKindOf(p.game) });
          return;
        }
        const after = p.game.getSnapshot();
        // still inside the tap (iOS plays sounds only there)
        p.sound.cue(trainingCue(input, state.turn, after.lastStep?.after, cards));
        p.dispatch({ type: "acted" });
        return;
      }
      // the shared preview cache: the facts read this same simulation
      const preview = tryPreview(p.ctx, state, input);
      if (!preview.ok) {
        p.dispatch({ type: "notice", notice: preview.kind }); // F7, C16: no fallback
        return;
      }
      const planned = facts.record?.phase === "planned" ? facts.record.position : undefined;
      p.weeks.decide({
        fp,
        turn: state.turn,
        inputs: run.inputs.length,
        input,
        position: planned,
        stage: "action",
      });
      p.sound.cue(trainingCue(input, state.turn, preview.step.after, cards));
      p.dispatch({ type: "decided", fp, from: screenFrom(ui.nav) });
    },

    visit(ops) {
      const vops = p.ctx.ruleset.season.workshopVisit ? visitOps(ops) : undefined;
      if (vops === undefined) {
        cmds.choose({ kind: "workshop", ops });
        return;
      }
      const { flow, facts } = p.now();
      if (!flow.canAct || flow.layer) return; // F27, with the controller's expectInputs
      const { run } = facts.run;
      const planned = facts.record?.phase === "planned" ? facts.record : undefined;
      if (!p.game.act({ kind: "workshop:visit", ops: vops }, run.inputs.length)) {
        p.dispatch({ type: "notice", notice: errorKindOf(p.game) });
        return;
      }
      // the visit changed the run's fingerprint: the planned position moves with it
      const next = fingerprintNow(p.game);
      if (planned && next !== undefined) p.weeks.plan(next, planned.turn, planned.position);
      p.sound.cue("confirm");
      p.dispatch({ type: "acted" });
    },

    position(position) {
      const { flow, facts } = p.now();
      const t = flow.top;
      if (flow.layer) return;
      if (t.kind === "position") {
        p.weeks.setPosition(t.week.fp, position);
        return;
      }
      if (t.kind !== "idle" || flow.screen.kind !== "plan") return;
      const { run, fp } = facts.run;
      if (facts.record?.phase === "planned") p.weeks.setPosition(fp, position);
      else p.weeks.plan(fp, run.state.turn, position);
    },

    run() {
      const { flow } = p.now();
      const t = flow.top;
      if (t.kind !== "position" || flow.layer) return; // a second «Correr» finds the race
      const w = t.week;
      if (!p.game.act(withPosition(w.input, w.position), w.inputs)) {
        p.dispatch({ type: "notice", notice: errorKindOf(p.game) });
        return;
      }
      // the race plays on, a reload or not, until its result was seen
      const next = fingerprintNow(p.game);
      if (next !== undefined) p.weeks.markRaced(next);
      p.dispatch({ type: "raced" });
    },

    complete,

    covered(key) {
      const { flow } = p.now();
      const t = flow.top;
      if (t.kind === "emblem" && t.key === key && !t.covered)
        p.dispatch({ type: "done", keys: [`${key}:in`] });
    },

    raceSkip(play) {
      const { flow, facts, ui } = p.now();
      const t = flow.top;
      if (t.key === play && (t.kind === "replay" || t.kind === "finish")) {
        const fp = facts.run.fp;
        p.dispatch({ type: "done", keys: [`${fp}/race:replay`, `${fp}/race:finish`] });
        return;
      }
      if (ui.nav.at === "watch" && ui.nav.stage !== "result" && watchKey(ui.nav) === play)
        p.dispatch({ type: "watchStage", n: ui.nav.n, stage: "result" });
    },

    raceNext(play) {
      const { flow, ui } = p.now();
      const t = flow.top;
      if (t.key === play && (t.kind === "replay" || t.kind === "finish")) {
        p.dispatch({ type: "done", keys: [play] });
        return;
      }
      if (ui.nav.at !== "watch" || ui.nav.stage === "result" || watchKey(ui.nav) !== play) return;
      // a watch too: its replay, then its finish held a moment, then its result
      p.dispatch({
        type: "watchStage",
        n: ui.nav.n,
        stage: ui.nav.stage === "replay" ? "finish" : "result",
      });
    },

    raceAgain() {
      const { flow, ui } = p.now();
      const t = flow.top;
      const nav = ui.nav;
      if (flow.layer) return;
      if (nav.at === "watch") {
        // a race seen again ends on its result too, with «Ver otra vez»: once more, from where
        // the watch began (it still ends there)
        if (nav.stage !== "result") return;
        p.sound.nav();
        p.dispatch({ type: "watch", turn: nav.turn, from: nav.from });
        return;
      }
      if (t.kind !== "race-result") return;
      p.sound.nav();
      p.dispatch({ type: "watch", turn: t.turn, from: "result" });
    },

    rewatch(turn) {
      const { flow, facts, ui } = p.now();
      const state = facts.run.run.state;
      if (flow.top.kind !== "idle" || flow.layer || ui.nav.at === "watch") return;
      if (state.status !== "ended" || !state.raceResults.some((r) => r.turn === turn)) return;
      p.sound.nav();
      p.dispatch({ type: "watch", turn, from: "end" });
    },

    raceContinue() {
      const { flow, ui } = p.now();
      if (flow.top.kind === "race-result") {
        if (watching(ui) || flow.layer) return;
        p.sound.nav();
        complete(flow.top.key);
        return;
      }
      if (ui.nav.at === "watch" && ui.nav.from === "end" && ui.nav.stage === "result") {
        p.sound.nav();
        p.dispatch({ type: "watchDone", n: ui.nav.n });
      }
    },

    sceneDone(key) {
      const { flow, facts } = p.now();
      const layer = flow.layer;
      if (layer?.kind !== "scene" || layer.key !== key) return;
      const id = layer.scene.id;
      if (layer.replay) {
        // «Historia» marks nothing: the scene was seen already
        p.dispatch({ type: "replay", scene: undefined });
        return;
      }
      if (flow.top.key !== key) return;
      p.story.markSeen(facts.run.run.seed, id);
      p.dispatch({ type: "done", keys: [key] });
    },

    watchScene(scene) {
      const { flow } = p.now();
      if (flow.canReplay) p.dispatch({ type: "replay", scene });
    },

    resolve(b) {
      const { facts } = p.now();
      const fp = facts.run.fp;
      switch (b.kind) {
        case "ack":
          // only this run's step: a stale ack never reads a newer step
          if (b.key === `${fp}/ack`) p.game.acknowledgeStep();
          break;
        case "enter":
          p.weeks.enterRace(b.fp);
          break;
        case "pass":
          // seen in an earlier season: marked seen here too, and nothing is shown (owner 2026-11-18)
          p.story.markSeen(facts.run.run.seed, b.scene.id);
          break;
      }
      // never stalls on a write that changed nothing
      p.dispatch({ type: "done", keys: [b.key] });
    },
  };
  return cmds;
}
