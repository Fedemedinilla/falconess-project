import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { allScenes } from "../content/story";
import type { ActiveRun } from "../game/controller";
import { useGame } from "../game/useGame";
import { useAnyModalOpen } from "../ui/modals";
import { useReducedMotion } from "../ui/useMedia";
import { followsMotion, isInstant } from "./flow/beats";
import { type Commands, type FlowPorts, flowCommands } from "./flow/commands";
import { WeekStore } from "./flow/decidedWeek";
import { deriveFlow } from "./flow/derive";
import { factsOf } from "./flow/facts";
import type { InspirationStore } from "./flow/inspirations";
import { ACTIVE_POLICY } from "./flow/policy";
import type { Flow, FlowFacts } from "./flow/types";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "./flow/ui";
import type { Pace } from "./pace";
import { playSound } from "./sfx";
import { storyStore } from "./storyModel";
import { usePace } from "./usePace";
import { useStory } from "./useStory";

/** The flow, the facts and the UI state as a tap or a timer finds them. */
export type FlowNow = { readonly flow: Flow; readonly facts: FlowFacts; readonly ui: UiState };

/**
 * The flow's stores of the page (plan §1.8): made once in Boot next to the controller, on the
 * browser's storage, so they outlive the language's remount and every run's view.
 */
export type FlowStores = {
  /** The inheritance cards this browser showed (F19). */
  readonly cards: InspirationStore;
};

/** Boot's flow stores (`<FlowStoresContext value={stores}>`). */
export const FlowStoresContext = createContext<FlowStores | undefined>(undefined);

function useFlowStores(): FlowStores {
  const stores = useContext(FlowStoresContext);
  if (!stores) throw new Error("useFlow outside <FlowStoresContext>");
  return stores;
}

/** «Ritmo» and reduced motion as the flow reads them. */
type Motion = { readonly pace: Pace; readonly reduced: boolean };

/**
 * The phone's flow in a run's view (plan §1.1): the facts read from the stores (the controller,
 * the week's record, the scenes seen, the cards shown, «Ritmo», reduced motion, a sheet open or the
 * title over the game), the UI state, the flow derived from them and interned (`top`, `screen` and
 * `layer` keep their identity while they say the same), and the commands on their ports, which act
 * on the game. Instant beats resolve before paint.
 *
 * The cards shown are Boot's (`FlowStoresContext`). While the legacy policy is active, the week's
 * record lives in a memory store of this mount (today's "lost on reload"; 5.6 moves it to Boot).
 *
 * «Ritmo» and reduced motion are latched (`followsMotion`): a change applies at once at idle, over
 * a training's result, the week's effects, a card, the event and the decided card, and waits over
 * the emblem, a scene and the race, which it would cut short or change as they play. The panel of
 * the wide screen is locked during the week's beats, so there only the phone's own reduced-motion
 * setting can change mid-week.
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
  /** The flow as a handler finds it, read again from the stores. */
  readonly now: () => FlowNow;
  /** A UI-only event (a notice gone): never one that acts on the game. */
  readonly dispatch: (e: UiEvent) => void;
} {
  const { game, snap } = useGame();
  const story = useStory();
  const livePace = usePace();
  const liveReduced = useReducedMotion();
  const sheetOpen = useAnyModalOpen() || title;
  const { cards } = useFlowStores();
  const [weeks] = useState(() => new WeekStore(undefined));
  const week = useSyncExternalStore(weeks.subscribe, weeks.getSnapshot, weeks.getSnapshot);
  useSyncExternalStore(cards.subscribe, cards.version, cards.version);
  const [motion, setMotion] = useState<Motion>(() => ({ pace: livePace, reduced: liveReduced }));
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
        pace: motion.pace,
        reduced: motion.reduced,
        sheetOpen,
      }),
    [ctx, run, lastStep, lastStepSeen, week, seenInRun, seenEver, shown, motion, sheetOpen],
  );

  // the UI state: the ref is what a command reads at once, the state what renders
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const uiRef = useRef(ui);
  // what the last commit showed: the next derive interns against it, a handler reads its latches
  const factsRef = useRef(facts);
  const lastRef = useRef<Flow | undefined>(undefined);
  const flow = useMemo(
    () => deriveFlow(ctx, facts, ui, ACTIVE_POLICY, lastRef.current),
    [ctx, facts, ui],
  );
  // «Ritmo» and reduced motion apply where they cannot change what is playing
  if (followsMotion(flow.top) && (motion.pace !== livePace || motion.reduced !== liveReduced))
    setMotion({ pace: livePace, reduced: liveReduced });

  const [{ cmd, now, dispatch }] = useState(() => {
    const dispatch = (e: UiEvent): void => {
      const next = reduceUi(uiRef.current, e);
      if (next === uiRef.current) return;
      uiRef.current = next;
      setUi(next);
    };
    /** The facts as the stores hold them now, with the last commit's latches and sheets. */
    const factsNow = (): FlowFacts => {
      const seen = factsRef.current;
      const s = game.getSnapshot();
      if (!s.run) return seen;
      return factsOf(game.context(), {
        snap: { run: s.run, lastStep: s.lastStep, lastStepSeen: s.lastStepSeen },
        week: weeks.getSnapshot(),
        story: storyStore,
        cards,
        scenes: allScenes(),
        pace: seen.pace,
        reduced: seen.reduced,
        sheetOpen: seen.sheetOpen,
      });
    };
    const now = (): FlowNow => {
      const f = factsNow();
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
      game: {
        act: (input, expectInputs) => game.act(input, expectInputs),
        acknowledgeStep: () => game.acknowledgeStep(),
        getSnapshot: () => game.getSnapshot(),
      },
      weeks,
      story: { markSeen: (seed, id) => storyStore.markSeen(seed, id) },
      cards,
      // the cues play inside the tap; the whoosh stays the run's view's until 5.10
      sound: { cue: playSound, nav: () => undefined },
      policy: ACTIVE_POLICY,
      dispatch,
      now,
    };
    return { cmd: flowCommands(ports), now, dispatch };
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
  // a week's record of another run (the run moved on outside this view) is dropped
  const record = facts.record;
  useEffect(() => {
    if (week !== undefined && week.phase !== "raceSeen" && record === undefined) weeks.clear();
  }, [week, record, weeks]);

  return { flow, ui, cmd, now, dispatch };
}
