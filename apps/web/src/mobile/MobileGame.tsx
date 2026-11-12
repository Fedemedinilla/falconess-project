import type {
  Position,
  SeasonState,
  StoryScene,
  TrainingKind,
  WorkshopOp,
} from "@falconess/schema";
import { advanceSeason, difficultyOf, type SimContext } from "@falconess/sim";
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
import { WeekDialog } from "../screens/WeekDialog";
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
import { type TrainResult, TrainScreen } from "./TrainScreen";
import { ScreenTransition } from "./Transition";
import { WorkshopScreen, type WorkshopTab } from "./WorkshopScreen";

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
  /** A race week's action previewed: «Lo que pasó» of the action, before the position. */
  | { readonly screen: "preview"; readonly input: WeekActionInput; readonly step: Step }
  | { readonly screen: "race"; readonly turn: number; readonly result: boolean }
  | { readonly screen: "before"; readonly turn: number }
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
  return undefined;
}

/**
 * #juego: the phone game (the approved prototype wired to the real season). One run, the same
 * controller as the test view: character select without a run, the week menu while it is active
 * (training, workshop, pre-race card, flight race and its result as screens; «Lo que pasó» and the
 * event dialog over the menu), the season's end once it ends.
 */
export function MobileGame() {
  const { game, snap } = useGame();
  const [view, setView] = useState<View>(MENU);
  const [weekPosition, setWeekPosition] = useState<WeekPosition>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sceneDone, setSceneDone] = useState<string>();
  const [exporting, setExporting] = useState<ExportItem>();
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const ended = run?.state.status === "ended" && view.screen !== "race" && view.screen !== "before";
  const page = !run
    ? "select"
    : ended
      ? "end"
      : view.screen === "trained"
        ? "train"
        : view.screen === "before" || view.screen === "preview"
          ? "menu"
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

  /** The story scene due now (or one asked from «Historia»), once nothing else is on screen. */
  const storyScene = (free: boolean): StoryScene | undefined => {
    if (replay) return replay;
    const idle =
      free &&
      (snap.lastStep === undefined || snap.lastStepSeen) &&
      !title &&
      cover === undefined &&
      !menuOpen &&
      !chatOpen &&
      !storyListOpen;
    return idle ? dueScene(allScenes(), ctx, state, seenInRun(run.seed)) : undefined;
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
        <div key={storyToast.n} className={st.toast} id="m-capitulo-aviso" role="status">
          <b>
            {storyToast.kicker} · {storyToast.title}
          </b>
          <br />
          {ui(storyToast.skipped ? "ui.m.story.skipped" : "ui.m.story.seen")}
        </div>
      )}
    </>
  );

  if (state.status === "ended" && view.screen !== "race" && view.screen !== "before")
    return (
      <div className={s.app} style={style}>
        <EndScreen
          run={run}
          onRace={(t) => setView({ screen: "race", turn: t, result: false })}
          onNew={() => game.newSeason()}
          onTests={() => navigate("fin")}
        />
        <WeekDialog
          className={s.weekDialog}
          advice={false}
          part="race"
          onViewRace={(t) => setView({ screen: "race", turn: t, result: false })}
        />
        {storyLayer(storyScene(true))}
        {transition}
        {titleScreen}
      </div>
    );

  const menu = weekMenu(ctx, state);
  const cards = trainingCards(ctx, state);
  const wings = wingsPosition(ctx.content, state.equippedFrame);
  const chosen = menu.raceWeek ? chosenFor(weekPosition, state) : undefined;
  const pending = state.pendingEvent !== undefined;

  /** Apply the week's input (with the race position on a race week); a race opens its view. */
  const commit = (input: WeekActionInput) => {
    const raceTurn = menu.raceWeek ? state.turn : undefined;
    if (!game.act(withPosition(input, chosen), inputs)) return;
    const step = game.getSnapshot().lastStep;
    const cue = trainingCue(input, state.turn, step?.after, cards);
    playSound(cue);
    // a race week shows what the action did before the race (testers 2026-11-11)
    const next: View = raceTurn !== undefined ? { screen: "before", turn: raceTurn } : MENU;
    // a training plays its result on the training screen first (owner 2026-11-11)
    const kind = cards.find((c) => c.kind === input.kind)?.kind;
    if (kind && step && (cue === "success" || cue === "boost" || cue === "fail")) {
      const summary = weekSummary(ctx, step);
      setView({
        screen: "trained",
        next,
        result: {
          kind,
          outcome: cue,
          gains: summary.stats,
          points: Math.max(0, step.after.skillPoints - step.before.skillPoints),
          from: step.before.stats,
          fromPoints: step.before.skillPoints,
        },
      });
      return;
    }
    setView(next);
  };
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
  });
  /**
   * A week's action. On a race week (owner 2026-11-12) its result comes first, then the race
   * position: the week is previewed with the season's own pure step (the action does not depend
   * on the position; only the race does), its result shows as on any week, then the pre-race card
   * runs the real input. After the preview the action is decided: the card has no «Volver».
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
    const next: View = { screen: "preview", input, step };
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
        act({ kind: "outing" });
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
      case "recap":
        game.showStepAgain();
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
      mood={menu.mood}
      content={ctx.content}
    />
  );

  let screen: React.ReactNode;
  switch (view.screen) {
    case "menu":
      screen = (
        <MenuScreen
          ctx={ctx}
          state={state}
          menu={menu}
          pendingEvent={pending}
          canRecap={snap.lastStep !== undefined && snap.lastStepSeen}
          onAction={onMenu}
        />
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
    case "preview":
      // the menu behind «Lo que pasó» of the previewed action; the position card comes next
      screen = (
        <>
          <MenuScreen
            ctx={ctx}
            state={state}
            menu={menu}
            pendingEvent={false}
            canRecap={false}
            onAction={() => undefined}
          />
          <WeekDialog
            className={s.weekDialog}
            advice={false}
            part="action"
            actionOpen
            preview={view.step}
            onActionDone={() => setView({ screen: "prerace", input: view.input, decided: true })}
            onViewRace={() => undefined}
          />
        </>
      );
      break;
    case "before":
      // the menu stays behind «Lo que pasó» of the action; the race starts when it closes
      screen = (
        <>
          <MenuScreen
            ctx={ctx}
            state={state}
            menu={menu}
            pendingEvent={false}
            canRecap={false}
            onAction={() => undefined}
          />
          <WeekDialog
            className={s.weekDialog}
            advice={false}
            part="action"
            actionOpen
            onActionDone={() => setView({ screen: "race", turn: view.turn, result: false })}
            onViewRace={() => undefined}
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
  return (
    <div className={cx(s.app, view.screen === "race" && s.appWide)} style={style}>
      {view.screen !== "race" && hud}
      {screen}
      {/* «Lo que pasó» and the event wait until the race and its result were seen */}
      {showScene && scene && (
        <InspirationOverlay
          scene={scene}
          falconessId={state.falconessId}
          parents={parents}
          onDone={() => setSceneDone(scene.key)}
        />
      )}
      {storyLayer(storyScene(onMenuScreen && !showScene && !pending))}
      {onMenuScreen && !showScene && (
        <>
          <WeekDialog
            className={s.weekDialog}
            advice={false}
            part="race"
            onViewRace={(t) => setView({ screen: "race", turn: t, result: false })}
          />
          {pending && <EventDialog />}
        </>
      )}
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
