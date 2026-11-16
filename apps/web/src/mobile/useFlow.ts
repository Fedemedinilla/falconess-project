import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { allScenes } from "../content/story";
import type { ActiveRun } from "../game/controller";
import { useGame } from "../game/useGame";
import { useAnyModalOpen } from "../ui/modals";
import { useReducedMotion } from "../ui/useMedia";
import { isInstant } from "./flow/beats";
import { type Commands, type FlowPorts, flowCommands } from "./flow/commands";
import { WeekStore } from "./flow/decidedWeek";
import { deriveFlow } from "./flow/derive";
import { factsOf } from "./flow/facts";
import { InspirationStore } from "./flow/inspirations";
import { ACTIVE_POLICY } from "./flow/policy";
import type { Flow, FlowFacts } from "./flow/types";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "./flow/ui";
import { usePace } from "./usePace";
import { useStory } from "./useStory";

/** The flow, the facts and the UI state as a tap or a timer finds them. */
export type FlowNow = { readonly flow: Flow; readonly facts: FlowFacts; readonly ui: UiState };

/**
 * The phone's flow in a run's view (plan §1.1): the facts read from the stores (the controller,
 * the week's record, the scenes seen, the cards shown, «Ritmo», reduced motion, a sheet open or the
 * title over the game), the UI state, the flow derived from them and interned (`top`, `screen` and
 * `layer` keep their identity while they say the same), and the commands on their ports. Instant
 * beats resolve before paint.
 *
 * Step 4.0 (the shadow): the model only follows today's game. Its ports are dry: `act` acts
 * nothing (the view acted already; it reads the controller's snapshot after), nothing reads a step
 * or marks a scene seen, no sound plays, and the week's record and the cards shown live in memory
 * stores of this mount. 4.1 gives it the real ports and lets it drive the game.
 */
export function useFlow({
  run,
  title,
}: {
  readonly run: ActiveRun;
  /** The title screen is over the game: it holds what a sheet holds. */
  readonly title: boolean;
}): {
  readonly flow: Flow;
  readonly ui: UiState;
  readonly cmd: Commands;
  readonly now: () => FlowNow;
} {
  const { game, snap } = useGame();
  const story = useStory();
  const pace = usePace();
  const reduced = useReducedMotion();
  const sheetOpen = useAnyModalOpen() || title;
  const [weeks] = useState(() => new WeekStore(undefined));
  const [cards] = useState(() => new InspirationStore(undefined));
  const week = useSyncExternalStore(weeks.subscribe, weeks.getSnapshot, weeks.getSnapshot);
  useSyncExternalStore(cards.subscribe, cards.version, cards.version);
  const ctx = game.context();
  // each store's reading keeps its identity until a mark changes it
  const seenInRun = story.seenInRun(run.seed);
  const seenEver = story.seenEver();
  const shown = cards.shown(run.seed);
  const { lastStep, lastStepSeen } = snap;
  const facts = useMemo(
    () =>
      factsOf(ctx, {
        snap: { run, lastStep, lastStepSeen },
        week,
        story: { seenInRun: () => seenInRun, seenEver: () => seenEver },
        cards: { shown: () => shown },
        scenes: allScenes(),
        pace,
        reduced,
        sheetOpen,
      }),
    [ctx, run, lastStep, lastStepSeen, week, seenInRun, seenEver, shown, pace, reduced, sheetOpen],
  );

  // the UI state: the ref is what a command reads at once, the state what renders
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const uiRef = useRef(ui);
  // what the last commit showed: a tap or a timer reads it, and the next derive interns against it
  const factsRef = useRef(facts);
  const lastRef = useRef<Flow | undefined>(undefined);
  const flow = useMemo(
    () => deriveFlow(ctx, facts, ui, ACTIVE_POLICY, lastRef.current),
    [ctx, facts, ui],
  );

  const [{ cmd, now }] = useState(() => {
    const dispatch = (e: UiEvent): void => {
      const next = reduceUi(uiRef.current, e);
      if (next === uiRef.current) return;
      uiRef.current = next;
      setUi(next);
    };
    const found = (): FlowNow => {
      const f = factsRef.current;
      const u = uiRef.current;
      return {
        flow: deriveFlow(game.context(), f, u, ACTIVE_POLICY, lastRef.current),
        facts: f,
        ui: u,
      };
    };
    const ports: FlowPorts = {
      get ctx() {
        return game.context();
      },
      // dry (4.0): the run's view acted already; the model learns whether it did
      game: {
        act: (_input, expectInputs) => {
          const r = game.getSnapshot().run;
          return (
            r !== undefined && expectInputs !== undefined && r.inputs.length === expectInputs + 1
          );
        },
        acknowledgeStep: () => undefined,
        getSnapshot: () => game.getSnapshot(),
      },
      weeks,
      story: { markSeen: () => undefined },
      cards,
      sound: { cue: () => undefined, nav: () => undefined },
      policy: ACTIVE_POLICY,
      dispatch,
      now: found,
    };
    return { cmd: flowCommands(ports), now: found };
  });

  useLayoutEffect(() => {
    factsRef.current = facts;
    lastRef.current = flow;
  }, [facts, flow]);
  // an instant beat (a step read, the race mode entered without the emblem, a scene passed by)
  // resolves before paint and renders nothing
  const top = flow.top;
  useLayoutEffect(() => {
    if (isInstant(top)) cmd.resolve(top);
  }, [top, cmd]);

  return { flow, ui, cmd, now };
}
