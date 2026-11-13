import type {
  Position,
  SeasonState,
  StoryScene,
  TrainingKind,
  WorkshopOp,
} from "@falconess/schema";
import { advanceSeason, difficultyOf, inSync, type SimContext, vigor } from "@falconess/sim";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseHash } from "../app/route";
import { navigate } from "../app/useRoute";
import { allScenes, allTopics } from "../content/story";
import type { Step } from "../game/controller";
import { useGame } from "../game/useGame";
import { EventDialog } from "../screens/EventDialog";
import type { ActionKind } from "../screens/model/actions";
import {
  chosenFor,
  type WeekActionInput,
  type WeekPosition,
  wingsPosition,
  withPosition,
} from "../screens/model/position";
import { weekSummary } from "../screens/model/week";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { ChatSheet } from "./ChatSheet";
import { EndScreen } from "./EndScreen";
import { type ExportItem, ExportSheet, entryItem, HistorySheet } from "./Export";
import { Glyph } from "./Glyph";
import { InspirationOverlay } from "./Inspiration";
import { inspirationScene } from "./inspirationScene";
import { LangButton } from "./LangButton";
import { type MenuAction, MenuScreen } from "./MenuScreen";
import s from "./Mobile.module.css";
import { type TrainingCard, trainingCards, vigorView, weekMenu } from "./model";
import { getMusicOn, setMusic, setMusicOn, stopMusic } from "./music";
import { OutingSheet } from "./OutingSheet";
import { accentStyle, Hud } from "./Parts";
import { PreRaceScreen, RaceScreen } from "./RaceScreens";
import { SelectScreen } from "./SelectScreen";
import st from "./Story.module.css";
import { StoryListSheet } from "./StoryListSheet";
import { StoryOverlay } from "./StoryOverlay";
import {
  getSoundStyle,
  nextSoundStyle,
  playNav,
  playSound,
  queueTap,
  type SoundCue,
  type SoundStyle,
  setSoundStyle,
} from "./sfx";
import {
  dueScene,
  markRead,
  markSeen,
  openTopics,
  readTopics,
  seenEver,
  seenInRun,
} from "./storyModel";
import { TitleScreen } from "./TitleScreen";
import { resultTimeline, type TrainResult, TrainScreen } from "./TrainScreen";
import { ScreenTransition } from "./Transition";
import { WeekFxOverlay } from "./WeekFx";
import { WorkshopScreen, type WorkshopTab } from "./WorkshopScreen";
import { type WeekFx, type WeekFxPart, weekFx } from "./weekFx";

type View =
  | { readonly screen: "menu" }
  | { readonly screen: "train"; readonly selected?: TrainingKind | undefined }
  | { readonly screen: "workshop"; readonly tab: WorkshopTab }
  | {
      readonly screen: "prerace";
      readonly input?: WeekActionInput | undefined;
      /** The action's result was already shown (a race week's preview): no way back, no repeat. */
      readonly decided?: boolean;
    }
  | { readonly screen: "race"; readonly turn: number; readonly result: boolean }
  /** A race week's action played its effects over the menu (skills bought…), then the race mode. */
  | { readonly screen: "actionfx"; readonly input: WeekActionInput; readonly fx: readonly WeekFx[] }
  | { readonly screen: "trained"; readonly result: TrainResult; readonly next: View };

const MENU: View = { screen: "menu" };

/**
 * The title screen shows once per visit, when the page opens on the game (owner 2026-11-12); a
 * visit that starts in the test view goes to the game without it.
 */
let titleDone = typeof location !== "undefined" && parseHash(location.hash) !== "juego";

/** The action whose vigor the bar previews on a screen. */
function previewKind(view: View): ActionKind | undefined {
  if (view.screen === "train") return view.selected;
  if (view.screen === "workshop") return "workshop";
  if (view.screen === "prerace" && view.input) return view.input.kind;
  if (view.screen === "actionfx") return view.input.kind;
  return undefined;
}

/**
 * #juego: the phone game (the approved prototype wired to the real season). One run, the same
 * controller as the test view: character select without a run, the week menu while it is active
 * (training, workshop, pre-race card, flight race and its result as screens; the week's effects and
 * the event dialog over the menu), the season's end once it ends. Three modes (owner 2026-11-13):
 * training (its screen and result), the menu (the week's decision; a story scene due after it plays
 * once the decision's effects end), and the race (the emblem transition, only here, then the
 * scene before the race, the position, the race, the scene after it, its result; then the menu).
 */
export function MobileGame() {
  const { game, snap } = useGame();
  const [view, setView] = useState<View>(MENU);
  const [weekPosition, setWeekPosition] = useState<WeekPosition>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sceneDone, setSceneDone] = useState<string>();
  // owner 2026-11-13: the week's mood, injury and sleep play as effects, once per step
  const [fxDone, setFxDone] = useState<number>();
  const [exporting, setExporting] = useState<ExportItem>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [outingOpen, setOutingOpen] = useState(false);
  const run = snap.run;
  const inputs = run?.inputs.length ?? 0;

  // the phone game is light and airy by design: its dialogs (shared with the test view) must not
  // take the system's dark tokens under the game's light colors; the test view gets its theme back
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (before === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", before);
    };
  }, []);

  // every button taps (a screen's own cue replaces the tap of the same click)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("button")) queueTap();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // the emblem transition (owner 2026-11-12) covers the way into a race: the race page starts
  // fully covered by it
  const ended = run?.state.status === "ended" && view.screen !== "race";
  // the race mode starts at the position card of a decided race week
  const page = !run
    ? "select"
    : ended
      ? "end"
      : view.screen === "trained"
        ? "train"
        : view.screen === "actionfx"
          ? "menu"
          : view.screen === "prerace" && view.decided
            ? "race"
            : view.screen;
  const [title, setTitle] = useState(() => !titleDone);
  // story scenes and the chat (owner 2026-11-12)
  const [, setStoryTick] = useState(0);
  const [replay, setReplay] = useState<StoryScene>();
  const [storyToast, setStoryToast] = useState<{
    n: number;
    kicker: string;
    title: string;
    skipped: boolean;
  }>();
  const [chatOpen, setChatOpen] = useState(false);
  const [storyListOpen, setStoryListOpen] = useState(false);
  useEffect(() => {
    if (!storyToast) return;
    const id = setTimeout(() => setStoryToast(undefined), 4000);
    return () => clearTimeout(id);
  }, [storyToast]);
  const titleScreen = title && (
    <TitleScreen
      onStart={() => {
        titleDone = true;
        setTitle(false);
      }}
    />
  );
  // the music follows the page (owner 2026-11-12): the title theme until a season starts, the
  // race's own in a race, the menu theme everywhere else
  const track = title || page === "select" ? "title" : page === "race" ? "race" : "menu";
  useEffect(() => setMusic(track), [track]);
  useEffect(() => stopMusic, []);
  const [cover, setCover] = useState<number>();
  const endCover = useCallback(() => setCover(undefined), []);
  const firstPage = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of page only
  useLayoutEffect(() => {
    if (firstPage.current) firstPage.current = false;
    // only on the way to a race (owner 2026-11-12: on every screen it got in the way)
    else if (page === "race" && !reducedMotion()) setCover((c) => (c ?? 0) + 1);
  }, [page]);
  const colors = transitionColors(game, run?.state.falconessId);
  const transition = cover !== undefined && (
    <ScreenTransition
      key={cover}
      primary={colors.primary}
      secondary={colors.secondary}
      onDone={endCover}
    />
  );

  // a change of screen whooshes (in the click's own commit, so it replaces its tap)
  const screenName = run ? view.screen : "select";
  const firstScreen = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of screen only
  useLayoutEffect(() => {
    if (firstScreen.current) firstScreen.current = false;
    else playNav();
  }, [screenName]);

  // a new run (or a load, or an undo in the test view) starts on the menu
  const firstInput = run?.inputs[0];
  const seed = run?.seed;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on a different run only
  useEffect(() => {
    setView(MENU);
  }, [seed, firstInput]);

  const shown = useRef(inputs);
  useEffect(() => {
    // the run moved on outside this screen's own act (the test view): back to the menu
    if (inputs < shown.current) setView(MENU);
    shown.current = inputs;
  }, [inputs]);

  const toTests = () => navigate("inicio");

  if (!run)
    return (
      <div className={s.app}>
        <SelectScreen onTests={toTests} />
        {transition}
        {titleScreen}
      </div>
    );

  const ctx = game.context();
  const state = run.state;
  const style = accentStyle(ctx.content, state.falconessId);

  /**
   * The story scene due now in a mode (owner 2026-11-13): the scene before a race only in the race
   * mode, before the position; the others after the week's decision (on the menu, once its
   * effects ended) or after the race, before its result.
   */
  const dueIn = (where: SceneMode): StoryScene | undefined => {
    const fits = (sc: StoryScene) => (sc.trigger.kind === "goal-before") === (where === "prerace");
    return dueScene(allScenes().filter(fits), ctx, state, seenInRun(run.seed));
  };
  /** The scene to play now (or one asked from «Historia»), once nothing else is on screen. */
  const storyScene = (where: SceneMode | undefined): StoryScene | undefined => {
    if (replay) return replay;
    const idle =
      where !== undefined &&
      !title &&
      cover === undefined &&
      !menuOpen &&
      !chatOpen &&
      !storyListOpen;
    return idle ? dueIn(where) : undefined;
  };
  const storyLayer = (sc: StoryScene | undefined) => (
    <>
      {sc && (
        <StoryOverlay
          key={`${sc.id}/${replay ? "again" : "first"}`}
          scene={sc}
          primary={colors.primary}
          secondary={colors.secondary}
          onDone={(skipped) => {
            if (!replay) markSeen(run.seed, sc.id);
            setReplay(undefined);
            setStoryTick((n) => n + 1);
            setStoryToast({
              n: Date.now(),
              kicker: gameText(sc.kickerKey),
              title: gameText(sc.titleKey),
              skipped,
            });
          }}
        />
      )}
      {storyToast && (
        <StoryToast key={storyToast.n}>
          <b>
            {storyToast.kicker} · {storyToast.title}
          </b>
          <br />
          {ui(storyToast.skipped ? "ui.m.story.skipped" : "ui.m.story.seen")}
        </StoryToast>
      )}
    </>
  );

  if (state.status === "ended" && view.screen !== "race")
    return (
      <div className={s.app} style={style}>
        <EndScreen
          run={run}
          onRace={(t) => setView({ screen: "race", turn: t, result: false })}
          onNew={() => game.newSeason()}
          onTests={() => navigate("fin")}
        />
        {storyLayer(storyScene("race"))}
        {transition}
        {titleScreen}
      </div>
    );

  const menu = weekMenu(ctx, state);
  const cards = trainingCards(ctx, state);
  const wings = wingsPosition(ctx.content, state.equippedFrame);
  const chosen = menu.raceWeek ? chosenFor(weekPosition, state) : undefined;
  const pending = state.pendingEvent !== undefined;
  // the week's step is read once its effects played (none: at once); no dialog waits on the menu
  const unreadNoFx = (stepOnMenu: Step | undefined) =>
    stepOnMenu !== undefined && weekFx(stepOnMenu, ctx.ruleset, fxPart(stepOnMenu)).length === 0;

  /** The result of a training, for the result on the training screen. */
  const trainResult = (
    kind: TrainingKind,
    outcome: "success" | "boost" | "fail",
    step: Step,
    points: number,
  ): TrainResult => ({
    kind,
    outcome,
    gains: weekSummary(ctx, step).stats,
    points,
    from: step.before.stats,
    fromPoints: step.before.skillPoints,
    vigor: vigor(ctx.ruleset, step.after.fatigue) - vigor(ctx.ruleset, step.before.fatigue),
    bonds: Object.keys(step.after.bond)
      .sort()
      .map((m) => ({
        manufacturer: m,
        delta: (step.after.bond[m] ?? 0) - (step.before.bond[m] ?? 0),
      }))
      .filter((b) => b.delta > 0),
    crews: step.before.crewPresence[kind] ?? [],
    sync: (step.before.crewPresence[kind] ?? []).filter((m) =>
      inSync(ctx, step.before.bond[m] ?? 0),
    ),
  });
  /** Apply the week's input (with the race position on a race week); a race opens its view. */
  const commit = (input: WeekActionInput) => {
    const raceTurn = menu.raceWeek ? state.turn : undefined;
    if (!game.act(withPosition(input, chosen), inputs)) return;
    const step = game.getSnapshot().lastStep;
    const cue = trainingCue(input, state.turn, step?.after, cards);
    playSound(cue);
    const next: View =
      raceTurn !== undefined ? { screen: "race", turn: raceTurn, result: false } : MENU;
    // a training plays its result on the training screen first (owner 2026-11-11)
    const kind = cards.find((c) => c.kind === input.kind)?.kind;
    if (kind && step && (cue === "success" || cue === "boost" || cue === "fail")) {
      setView({
        screen: "trained",
        next,
        result: trainResult(
          kind,
          cue,
          step,
          Math.max(0, step.after.skillPoints - step.before.skillPoints),
        ),
      });
      return;
    }
    setView(next);
  };
  /**
   * A week's action. On a race week (owner 2026-11-12) its result comes first, then the race
   * mode: the week is previewed with the season's own pure step (the action does not depend on
   * the position; only the race does), a training's result shows on its screen, then the pre-race
   * card runs the real input. After the preview the action is decided: the card has no «Volver».
   */
  const act = (input: WeekActionInput) => {
    if (!menu.raceWeek) {
      commit(input);
      return;
    }
    let after: SeasonState;
    try {
      after = advanceSeason(ctx, state, withPosition(input, chosen));
    } catch {
      setView({ screen: "prerace", input });
      return;
    }
    const step: Step = { before: state, input: withPosition(input, chosen), after };
    const cue = trainingCue(input, state.turn, after, cards);
    playSound(cue);
    // what the action did (a bought skill, how she slept…) plays before the race mode
    const actionFx = weekFx(step, ctx.ruleset, "action");
    const race: View = { screen: "prerace", input, decided: true };
    const next: View = actionFx.length > 0 ? { screen: "actionfx", input, fx: actionFx } : race;
    const kind = cards.find((c) => c.kind === input.kind)?.kind;
    if (kind && (cue === "success" || cue === "boost" || cue === "fail")) {
      // the race's skill points are not hers yet: only the Simulator's own
      const points =
        kind === "train:simulator" && cue !== "fail" ? ctx.ruleset.season.simulatorSkillPoints : 0;
      setView({ screen: "trained", next, result: trainResult(kind, cue, step, points) });
      return;
    }
    setView(next);
  };
  /** The race week's real input, after its preview: straight to the race. */
  const runRaceWeek = (input: WeekActionInput) => {
    const turn = state.turn;
    if (!game.act(withPosition(input, chosen), inputs)) return;
    setView({ screen: "race", turn, result: false });
  };

  const onMenu = (action: MenuAction) => {
    switch (action) {
      case "train":
        setView({ screen: "train" });
        return;
      case "rest":
        act({ kind: "rest" });
        return;
      case "outing":
        // ADR-0016: with sintonía the player picks the crew she goes out with
        if (ctx.ruleset.season.crewSync) setOutingOpen(true);
        else act({ kind: "outing" });
        return;
      case "workshop":
        setView({ screen: "workshop", tab: "wings" });
        return;
      case "skills":
        setView({ screen: "workshop", tab: "skills" });
        return;
      case "race":
        setView({ screen: "prerace" });
        return;
      case "menu":
        setMenuOpen(true);
        return;
    }
  };

  const hud = (
    <Hud
      hard={difficultyOf(state) === "exigente"}
      turn={menu.turn}
      turns={menu.turns}
      goal={menu.goal}
      vigor={vigorView(ctx, state, previewKind(view))}
      vigorPop={
        view.screen === "trained" && view.result.vigor !== 0
          ? { delta: view.result.vigor, delay: resultTimeline(view.result).vigor ?? 0 }
          : undefined
      }
      mood={menu.mood}
      content={ctx.content}
    />
  );

  let screen: React.ReactNode;
  switch (view.screen) {
    case "menu":
      screen = (
        <MenuScreen ctx={ctx} state={state} menu={menu} pendingEvent={pending} onAction={onMenu} />
      );
      break;
    case "trained":
      screen = (
        <TrainScreen
          ctx={ctx}
          state={state}
          cards={cards}
          selected={undefined}
          injured={false}
          onSelect={() => undefined}
          onConfirm={() => undefined}
          onBack={() => undefined}
          result={view.result}
          onResultDone={() => setView(view.next)}
        />
      );
      break;
    case "train":
      screen = (
        <TrainScreen
          ctx={ctx}
          state={state}
          cards={cards}
          selected={view.selected}
          injured={menu.injured}
          onSelect={(kind) => setView({ screen: "train", selected: kind })}
          onConfirm={(kind) => act({ kind })}
          onBack={() => setView(MENU)}
        />
      );
      break;
    case "workshop":
      screen = (
        <WorkshopScreen
          key={`${state.turn}/${inputs}`}
          ctx={ctx}
          state={state}
          tab={view.tab}
          onTab={(tab) => setView({ screen: "workshop", tab })}
          onConfirm={(ops: WorkshopOp[]) => act({ kind: "workshop", ops })}
          onBack={() => setView(MENU)}
        />
      );
      break;
    case "prerace": {
      const goal = menu.goal;
      if (!goal || !menu.raceWeek) {
        screen = null;
        break;
      }
      const input = view.input;
      screen = (
        <PreRaceScreen
          ctx={ctx}
          state={state}
          courseId={goal.courseId}
          minPlace={goal.minPlace}
          cup={goal.cup}
          mirror={goal.mirror}
          named={goal.named}
          wings={wings}
          position={chosen}
          input={input}
          onPosition={(position: Position) =>
            setWeekPosition(position === wings ? undefined : { turn: state.turn, position })
          }
          onRun={() =>
            input ? (view.decided ? runRaceWeek(input) : commit(input)) : setView(MENU)
          }
          onBack={view.decided ? undefined : () => setView(MENU)}
        />
      );
      break;
    }
    case "actionfx":
      screen = (
        <>
          <MenuScreen
            ctx={ctx}
            state={state}
            menu={menu}
            pendingEvent={false}
            onAction={() => undefined}
          />
          <WeekFxOverlay
            fx={view.fx}
            content={ctx.content}
            onDone={() => setView({ screen: "prerace", input: view.input, decided: true })}
          />
        </>
      );
      break;
    case "race":
      screen = (
        <RaceScreen
          ctx={ctx}
          state={state}
          turn={view.turn}
          showResult={view.result}
          // the scene after the race comes before its result
          hold={dueIn("race") !== undefined}
          onSkip={() => setView({ screen: "race", turn: view.turn, result: true })}
          onReplay={() => setView({ screen: "race", turn: view.turn, result: false })}
          onDone={() => setView(MENU)}
        />
      );
      break;
  }

  const onMenuScreen = view.screen === "menu";
  // ADR-0013: an inspiration (or the season's start with parents) shows its card first
  const startInput = run.inputs[0];
  const parents = startInput?.kind === "start" ? startInput.parents : [];
  const scene = onMenuScreen
    ? inspirationScene(run.seed, state, inputs, snap.lastStep, snap.lastStepSeen)
    : undefined;
  const showScene = scene !== undefined && scene.key !== sceneDone;
  const fxStep = onMenuScreen && !snap.lastStepSeen ? snap.lastStep : undefined;
  const fx = fxStep ? weekFx(fxStep, ctx.ruleset, fxPart(fxStep)) : [];
  const showFx = !showScene && fx.length > 0 && fxDone !== inputs;
  const mode: SceneMode | undefined =
    view.screen === "prerace" && view.decided
      ? "prerace"
      : view.screen === "race" && view.result
        ? "race"
        : onMenuScreen && !showScene && !showFx && !pending
          ? "menu"
          : undefined;
  return (
    <div className={cx(s.app, view.screen === "race" && s.appWide)} style={style}>
      {view.screen !== "race" && hud}
      {screen}
      {/* the week's effects and the event wait until the race and its result were seen */}
      {showScene && scene && (
        <InspirationOverlay
          scene={scene}
          falconessId={state.falconessId}
          parents={parents}
          onDone={() => setSceneDone(scene.key)}
        />
      )}
      {showFx && (
        <WeekFxOverlay
          key={inputs}
          fx={fx}
          content={ctx.content}
          onDone={() => {
            setFxDone(inputs);
            game.acknowledgeStep();
          }}
        />
      )}
      {/* the race mode's transition opens on black when a scene comes next: no card shows between */}
      {mode === "prerace" && cover !== undefined && dueIn("prerace") && (
        <div className={st.black} aria-hidden="true" />
      )}
      {storyLayer(storyScene(mode))}
      {!showScene && unreadNoFx(fxStep) && <Acknowledge onMount={() => game.acknowledgeStep()} />}
      {onMenuScreen && !showScene && !showFx && pending && <EventDialog />}
      {chatOpen && (
        <ChatSheet
          name={gameText(`falconess.${state.falconessId}`)}
          topics={openTopics(allTopics(), state)}
          read={readTopics()}
          primary={colors.primary}
          secondary={colors.secondary}
          onRead={(id) => {
            markRead(id);
            setStoryTick((n) => n + 1);
          }}
          onClose={() => setChatOpen(false)}
        />
      )}
      <OutingSheet
        ctx={ctx}
        state={state}
        open={outingOpen}
        onPick={(manufacturer) => {
          setOutingOpen(false);
          act({ kind: "outing", manufacturer });
        }}
        onClose={() => setOutingOpen(false)}
      />
      <StoryListSheet
        open={storyListOpen}
        scenes={allScenes().filter(
          (sc) => sc.falconess === state.falconessId && seenEver().has(sc.id),
        )}
        onWatch={(sc) => {
          setStoryListOpen(false);
          setReplay(sc);
        }}
        onClose={() => setStoryListOpen(false)}
      />
      <ExportSheet item={exporting} onClose={() => setExporting(undefined)} />
      <HistorySheet
        open={historyOpen}
        entries={historyOpen ? game.history() : []}
        onExport={(e) => {
          setHistoryOpen(false);
          setExporting(entryItem(e));
        }}
        onClose={() => setHistoryOpen(false)}
      />
      {transition}
      {titleScreen}
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onExport={() => {
          setMenuOpen(false);
          const entry = game.history().find((e) => e.seed === run.seed);
          if (entry) setExporting(entryItem(entry));
        }}
        onHistory={() => {
          setMenuOpen(false);
          setHistoryOpen(true);
        }}
        onTests={toTests}
        chatName={gameText(`falconess.${state.falconessId}`)}
        chatNew={openTopics(allTopics(), state).some((tp) => !readTopics().has(tp.id))}
        onChat={() => {
          setMenuOpen(false);
          setChatOpen(true);
        }}
        onStory={() => {
          setMenuOpen(false);
          setStoryListOpen(true);
        }}
        onNew={() => {
          setMenuOpen(false);
          game.newSeason();
        }}
      />
    </div>
  );
}

/** A race week's step played its action's effects before the race: the menu shows the race's. */
function fxPart(step: Step): WeekFxPart {
  return step.after.raceResults.length > step.before.raceResults.length ? "race" : "all";
}

/**
 * The notice after a story scene (owner 2026-11-13): just over the goal's track card, never over
 * the menu's buttons; without that card on screen, under the top bar.
 */
function StoryToast({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // the notice is fixed: viewport coordinates
    const track = document.getElementById("m-pista")?.getBoundingClientRect();
    const height = el.getBoundingClientRect().height;
    const top = track && track.height > 0 ? track.top - height - 10 : 124;
    setSpot({ top: Math.max(8, Math.round(top)), bottom: "auto" });
  }, []);
  return (
    <div ref={ref} className={st.toast} id="m-capitulo-aviso" role="status" style={spot}>
      {children}
    </div>
  );
}

/** Where a story scene can play (owner 2026-11-13). */
type SceneMode = "menu" | "prerace" | "race";

/** Marks the week's step read once mounted (a week whose decision left no effects to play). */
function Acknowledge({ onMount }: { onMount: () => void }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: once
  useEffect(onMount, []);
  return null;
}

/** The sponsor's two colors of the Falconess in play (Kōryū's red and yellow before one is picked). */
function transitionColors(
  game: { context(): SimContext },
  falconessId: string | undefined,
): { primary: string; secondary: string } {
  const content = falconessId === undefined ? undefined : game.context().content;
  const f = falconessId === undefined ? undefined : content?.falconess.get(falconessId);
  const palette = f ? content?.getManufacturer(f.sponsor).palette : undefined;
  return { primary: palette?.primary ?? "#c0392b", secondary: palette?.secondary ?? "#f1c40f" };
}

function reducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** A week's sound: a training's result (a crew there makes it a boost), else a confirm. */
function trainingCue(
  input: WeekActionInput,
  turn: number,
  after: SeasonState | undefined,
  cards: readonly TrainingCard[],
): SoundCue {
  const card = cards.find((c) => c.kind === input.kind);
  if (!card) return "confirm";
  const entry = after?.log.find((e) => e.turn === turn && e.input?.kind === input.kind);
  if (!entry?.notes.includes("log.train.ok")) return entry ? "fail" : "confirm";
  return card.boosted ? "boost" : "success";
}

/** The «Menú» sheet: the test view, a new season. */
function MobileMenu({
  open,
  onClose,
  onExport,
  onHistory,
  onTests,
  onNew,
  chatName,
  chatNew,
  onChat,
  onStory,
}: {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  onHistory: () => void;
  onTests: () => void;
  onNew: () => void;
  chatName: string;
  chatNew: boolean;
  onChat: () => void;
  onStory: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [sound, setSound] = useState<SoundStyle>(getSoundStyle);
  const [music, setMusicState] = useState(getMusicOn);
  const onSound = () => {
    const next = nextSoundStyle(sound);
    setSoundStyle(next);
    setSound(next);
    // the new style says itself: its success
    playSound("success");
  };
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setConfirm(false);
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-menu-dialogo"
      aria-labelledby="m-menu-titulo"
      onClose={onClose}
    >
      <div className={s.dl}>
        <h2 className={s.dlTitle} id="m-menu-titulo">
          {ui("ui.m.menu")}
        </h2>
        <button
          type="button"
          className={s.btn}
          id="m-chat-abrir"
          data-new={chatNew}
          onClick={onChat}
        >
          <Glyph name="chat" size={20} />
          {ui("ui.m.chat.with", { name: chatName })}
          {chatNew && <span className={st.newTag}>{ui("ui.m.chat.new")}</span>}
        </button>
        <button type="button" className={s.btn} id="m-historia-abrir" onClick={onStory}>
          <Glyph name="book" size={20} />
          {ui("ui.m.story.title")}
        </button>
        <button type="button" className={s.btn} id="m-exportar-partida" onClick={onExport}>
          <Glyph name="down" size={20} />
          {ui("ui.m.export.run")}
        </button>
        <button type="button" className={s.btn} id="m-temporadas" onClick={onHistory}>
          <Glyph name="book" size={20} />
          {ui("ui.m.history.title")}
        </button>
        <button type="button" className={s.btn} id="m-pruebas" onClick={onTests}>
          <Glyph name="screen" size={20} />
          {ui("ui.m.tests")}
        </button>
        <button
          type="button"
          className={s.btn}
          id="m-sonido"
          data-style={sound}
          aria-label={ui("ui.m.sound.label", { style: ui(`ui.m.sound.${sound}`) })}
          onClick={onSound}
        >
          <Glyph name={sound === "off" ? "mute" : "speaker"} size={20} />
          {ui("ui.m.sound", { style: ui(`ui.m.sound.${sound}`) })}
        </button>
        <button
          type="button"
          className={s.btn}
          id="m-musica"
          data-on={music}
          onClick={() => {
            setMusicOn(!music);
            setMusicState(!music);
          }}
        >
          <Glyph name={music ? "note" : "mute"} size={20} />
          {ui("ui.m.music", { state: ui(music ? "ui.m.music.on" : "ui.m.music.off") })}
        </button>
        <LangButton className={s.btn} id="m-idioma" />
        {confirm ? (
          <button type="button" className={cx(s.btn, s.btnMain)} id="m-nueva-si" onClick={onNew}>
            {ui("ui.m.new.confirm")}
          </button>
        ) : (
          <button type="button" className={s.btn} id="m-nueva" onClick={() => setConfirm(true)}>
            <Glyph name="flag" size={20} />
            {ui("ui.m.new")}
          </button>
        )}
        <button type="button" className={cx(s.btn, s.btnDark)} id="m-menu-cerrar" onClick={onClose}>
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
