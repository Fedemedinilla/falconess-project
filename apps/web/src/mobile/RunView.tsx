import type {
  ContentIndex,
  Position,
  SeasonState,
  StoryScene,
  TrainingKind,
  WorkshopOp,
} from "@falconess/schema";
import { advanceSeason, difficultyOf } from "@falconess/sim";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { navigate } from "../app/useRoute";
import { allScenes, allTopics } from "../content/story";
import type { ActiveRun, Step } from "../game/controller";
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
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { reducedMotion } from "../ui/useMedia";
import { ChatSheet } from "./ChatSheet";
import { EndScreen } from "./EndScreen";
import { type ExportItem, ExportSheet, entryItem, HistorySheet } from "./Export";
import { digestFor } from "./flow/scenes";
import {
  type LegacyNames,
  legacyNames,
  SHADOW_IDLE,
  type ShadowWatch,
  sameFlow,
  shadowCommands,
  shadowFrame,
} from "./flow/shadow";
import { fxPart } from "./flow/steps";
import { resultTimeline, type TrainResult, trainingCue, trainResultOf } from "./flow/trainResult";
import type { Flow, WorkshopTab } from "./flow/types";
import type { UiState } from "./flow/ui";
import { InspirationOverlay } from "./Inspiration";
import { inspirationScene } from "./inspirationScene";
import { type MenuAction, MenuScreen } from "./MenuScreen";
import { MenuItems, type MenuItemsProps, MobileMenu } from "./MenuSheet";
import s from "./Mobile.module.css";
import { trainingCards, vigorView, weekMenu } from "./model";
import type { Track } from "./music";
import { OutingSheet } from "./OutingSheet";
import {
  CrewsPanel,
  DeskPanel,
  GoalsPanel,
  GuidePanel,
  LogPanel,
  PanelSheet,
  type PanelTab,
  panelTitle,
} from "./Panels";
import pm from "./Panels.module.css";
import { accentStyle, Hud } from "./Parts";
import { getPace, paceScale } from "./pace";
import { PreRaceScreen, RaceScreen } from "./RaceScreens";
import st from "./Story.module.css";
import { StoryListSheet } from "./StoryListSheet";
import { StoryOverlay } from "./StoryOverlay";
import { StoryToast } from "./StoryToast";
import { playNav, playSound } from "./sfx";
import { dueScene, openTopics } from "./storyModel";
import { TrackSheet } from "./TrackCard";
import { TrainScreen } from "./TrainScreen";
import { ScreenTransition } from "./Transition";
import { type TrackCardView, trackCard } from "./track";
import { useFlow } from "./useFlow";
import { useStory } from "./useStory";
import { WeekFxOverlay } from "./WeekFx";
import { WorkshopScreen } from "./WorkshopScreen";
import { type WeekFx, weekFx } from "./weekFx";

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

/** The music a run's page wants: the race's own in a race, the menu theme everywhere else. */
export type RunMusic = Exclude<Track, "title">;

/** The action whose vigor the bar previews on a screen. */
function previewKind(view: View): ActionKind | undefined {
  if (view.screen === "train") return view.selected;
  if (view.screen === "workshop") return "workshop";
  if (view.screen === "prerace" && view.input) return view.input.kind;
  if (view.screen === "actionfx") return view.input.kind;
  return undefined;
}

/**
 * One run of the phone game, keyed by the shell per run: everything here starts fresh with a new
 * season, a load or a replay from storage (the week's effects, the sheets, the scene asked for,
 * its notice, the race week's position). The week menu while the run is active (training,
 * workshop, pre-race card, flight race and its result as screens; the week's effects and the event
 * dialog over the menu), the season's end once it ends. Three modes (owner 2026-11-13): training
 * (its screen and result), the menu (the week's decision; a story scene due after it plays once
 * the decision's effects end), and the race (the emblem transition, only here, then the scene
 * before the race, the position, the race, the scene after it, its result; then the menu).
 *
 * The tree has fixed slots (the backdrop, the game's column, the panel, the sheets), so crossing
 * the wide-screen size changes classes and the panel, never the column: what plays goes on.
 */
export function RunView({
  run,
  desk,
  tab,
  onTab,
  guideNew,
  onGuideSeen,
  title,
  onMusic,
}: {
  run: ActiveRun;
  /** A wide screen: the column with the panel beside it (the shell's `DESK_QUERY`). */
  desk: boolean;
  /** The wide screen's panel tab and the guide's dot: the shell's, a new run keeps them. */
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  guideNew: boolean;
  onGuideSeen: () => void;
  /** The title screen while it shows (the shell's), over the game; scenes wait for it. */
  title: ReactElement | undefined;
  /** The music this run's page wants: the shell is the one that plays it. */
  onMusic: (track: RunMusic) => void;
}) {
  const { game, snap } = useGame();
  // the scenes seen and the chat read: a mark re-renders the game
  const story = useStory();
  // the flow model (plan 4.0, the shadow): it follows today's game on dry ports, each of today's
  // handlers below calling its command after its own work; a development check compares the two
  const { flow, ui: flowUi, cmd, now: flowNow } = useFlow({ run, title: title !== undefined });
  const dry = useMemo(() => shadowCommands(cmd, flowNow), [cmd, flowNow]);
  const [view, setView] = useState<View>(MENU);
  const [weekPosition, setWeekPosition] = useState<WeekPosition>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sceneDone, setSceneDone] = useState<string>();
  // owner 2026-11-13: the week's mood, injury and sleep play as effects, once per step
  const [fxDone, setFxDone] = useState<number>();
  const [exporting, setExporting] = useState<ExportItem>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [outingOpen, setOutingOpen] = useState(false);
  // the wide screen has no «Menú» sheet (its panel is the menu): going wide closes it, or it
  // would stay "open" unseen and hold back every story scene
  useEffect(() => {
    if (desk) setMenuOpen(false);
  }, [desk]);
  // on a phone the panels open from «Menú» as sheets
  const [sheet, setSheet] = useState<PanelTab>();
  // the goals' track sheet keeps its card while it closes
  const [trackSheet, setTrackSheet] = useState<{
    readonly view: TrackCardView;
    readonly open: boolean;
  }>();
  const openPanel = (t: PanelTab) => {
    if (t === "guide") onGuideSeen();
    if (desk) onTab(t);
    else setSheet(t);
  };
  const inputs = run.inputs.length;

  // the emblem transition (owner 2026-11-12) covers the way into a race: the race page starts
  // fully covered by it
  const ended = run.state.status === "ended" && view.screen !== "race";
  // the race mode starts at the position card of a decided race week
  const page = ended
    ? "end"
    : view.screen === "trained"
      ? "train"
      : view.screen === "actionfx"
        ? "menu"
        : view.screen === "prerace" && view.decided
          ? "race"
          : view.screen;
  // story scenes and the chat (owner 2026-11-12)
  const [replay, setReplay] = useState<StoryScene>();
  const [storyToast, setStoryToast] = useState<{
    n: number;
    kicker: string;
    title: string;
    skipped: boolean;
    /** Seen in an earlier season, so it was passed by (owner 2026-11-14): a tap plays it. */
    again?: StoryScene | undefined;
  }>();
  const [chatOpen, setChatOpen] = useState(false);
  const [storyListOpen, setStoryListOpen] = useState(false);
  useEffect(() => {
    if (!storyToast) return;
    const id = setTimeout(() => setStoryToast(undefined), storyToast.again ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [storyToast]);
  // the music follows the page (owner 2026-11-12): the race's own in a race, the menu theme
  // everywhere else (the shell plays the title theme over the title and the selection)
  const music: RunMusic = page === "race" ? "race" : "menu";
  useEffect(() => onMusic(music), [onMusic, music]);
  const [cover, setCover] = useState<number>();
  const endCover = useCallback(() => {
    setCover(undefined);
    dry.complete("emblem");
  }, [dry]);
  const firstPage = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of page only
  useLayoutEffect(() => {
    if (firstPage.current) firstPage.current = false;
    // only on the way to a race (owner 2026-11-12: on every screen it got in the way)
    // «Directo» (owner 2026-11-14) goes into the race mode without it
    else if (page === "race" && !reducedMotion() && getPace() !== "direct") {
      setCover((c) => (c ?? 0) + 1);
      // opaque from its first frame: what is under it may change at once
      dry.covered();
    }
  }, [page]);
  const ctx = game.context();
  const state = run.state;
  const colors = transitionColors(ctx.content, state.falconessId);
  const transition = cover !== undefined && (
    <ScreenTransition
      key={cover}
      primary={colors.primary}
      secondary={colors.secondary}
      onDone={endCover}
    />
  );

  // a change of screen whooshes (in the click's own commit, so it replaces its tap); the shell
  // whooshes between the selection and a run
  const firstScreen = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of screen only
  useLayoutEffect(() => {
    if (firstScreen.current) firstScreen.current = false;
    else playNav();
  }, [view.screen]);

  const shown = useRef(inputs);
  useEffect(() => {
    // the run moved on outside this screen's own act (the test view): back to the menu
    if (inputs < shown.current) setView(MENU);
    shown.current = inputs;
  }, [inputs]);

  const toTests = () => navigate("inicio");
  const style = accentStyle(ctx.content, state.falconessId);

  /**
   * The story scene due now in a mode (owner 2026-11-13): the scene before a race only in the race
   * mode, before the position; the others after the week's decision (on the menu, once its
   * effects ended) or after the race, before its result.
   */
  const dueIn = (where: SceneMode): StoryScene | undefined => {
    const fits = (sc: StoryScene) => (sc.trigger.kind === "goal-before") === (where === "prerace");
    return dueScene(allScenes().filter(fits), ctx, state, story.seenInRun(run.seed));
  };
  /** The scene to play now (or one asked from «Historia»), once nothing else is on screen. */
  const storyScene = (where: SceneMode | undefined): StoryScene | undefined => {
    if (replay) return replay;
    const idle =
      where !== undefined &&
      title === undefined &&
      cover === undefined &&
      !menuOpen &&
      !chatOpen &&
      !storyListOpen;
    return idle ? dueIn(where) : undefined;
  };
  const storyLayer = (sc: StoryScene | undefined) => (
    <>
      {/* owner 2026-11-14: a scene seen in an earlier season is passed by, with a line to watch it */}
      {sc && !replay && story.seenEver().has(sc.id) && (
        <Acknowledge
          key={sc.id}
          onMount={() => {
            story.markSeen(run.seed, sc.id);
            setStoryToast({
              n: Date.now(),
              kicker: gameText(sc.kickerKey),
              title: gameText(sc.titleKey),
              skipped: true,
              again: sc,
            });
          }}
        />
      )}
      {sc && (replay || !story.seenEver().has(sc.id)) && (
        <StoryOverlay
          key={`${sc.id}/${replay ? "again" : "first"}`}
          scene={sc}
          primary={colors.primary}
          secondary={colors.secondary}
          // «Ritmo» (owner 2026-11-14): a fast digest, unless asked for from «Historia» or «Ver»
          digest={replay ? undefined : digestFor(getPace())}
          onDone={(skipped) => {
            if (!replay) story.markSeen(run.seed, sc.id);
            setReplay(undefined);
            setStoryToast({
              n: Date.now(),
              kicker: gameText(sc.kickerKey),
              title: gameText(sc.titleKey),
              skipped,
            });
            dry.sceneDone(sc.id, skipped);
          }}
        />
      )}
      {storyToast && (
        // placed once, over the track tab: placed again when the wide screen comes or goes (the
        // column stays, the tab moves; 5.9's NoticeHost re-measures on any resize)
        <StoryToast key={`${storyToast.n}/${desk}`} long={storyToast.again !== undefined}>
          <b>
            {storyToast.kicker} · {storyToast.title}
          </b>
          <br />
          {storyToast.again ? (
            <span className={st.toastRow}>
              {ui("ui.m.story.passed")}
              <button
                type="button"
                className={st.toastBtn}
                id="m-escena-ver"
                onClick={() => {
                  const again = storyToast.again;
                  setStoryToast(undefined);
                  setReplay(again);
                  if (again) cmd.watchScene(again);
                }}
              >
                {ui("ui.m.story.watch")}
              </button>
            </span>
          ) : (
            ui(storyToast.skipped ? "ui.m.story.skipped" : "ui.m.story.seen")
          )}
        </StoryToast>
      )}
    </>
  );

  /** «Exportar» of this run: from «Menú», from the panel and from the season's end. */
  const exportRun = () => {
    const entry = game.history().find((e) => e.seed === run.seed);
    if (entry) setExporting(entryItem(entry));
  };
  // the menu's buttons, the same in the phone's «Menú» sheet and the wide screen's panel
  const items: MenuItemsProps = {
    onExport: exportRun,
    onHistory: () => setHistoryOpen(true),
    onTests: toTests,
    chatName: gameText(`falconess.${state.falconessId}`),
    chatNew: openTopics(allTopics(), state).some((tp) => !story.readTopics().has(tp.id)),
    onChat: () => setChatOpen(true),
    onStory: () => setStoryListOpen(true),
    onNew: () => game.newSeason(),
  };
  const panel = (t: PanelTab): ReactNode =>
    t === "menu" ? (
      <div className={pm.menuGrid}>
        <MenuItems {...items} />
      </div>
    ) : t === "log" ? (
      <LogPanel ctx={ctx} seed={run.seed} inputs={run.inputs} />
    ) : t === "goals" ? (
      <GoalsPanel
        ctx={ctx}
        state={state}
        onTrack={(courseId) => setTrackSheet({ view: trackCard(ctx, courseId), open: true })}
      />
    ) : t === "crews" ? (
      <CrewsPanel ctx={ctx} state={state} />
    ) : (
      <GuidePanel
        onDone={() => {
          if (desk) onTab("menu");
          else setSheet(undefined);
        }}
      />
    );
  // «Exportar»: one sheet, inside whichever column shows (the season's end or the run)
  const exportSheet = <ExportSheet item={exporting} onClose={() => setExporting(undefined)} />;
  // the panels' sheets, outside the column (the column's own open inside it)
  const sheets = (
    <div className={cx(s.app, s.appContents)} style={style}>
      <PanelSheet
        open={!desk && sheet !== undefined}
        title={sheet ? panelTitle(sheet) : ""}
        onClose={() => setSheet(undefined)}
      >
        {sheet && panel(sheet)}
      </PanelSheet>
      {trackSheet && (
        <TrackSheet
          view={trackSheet.view}
          open={trackSheet.open}
          onClose={() => setTrackSheet((t) => (t?.open ? { ...t, open: false } : t))}
        />
      )}
    </div>
  );
  /**
   * The fixed slots (F12): the backdrop and the panel come and go with the wide screen; the
   * column (keyed by what it shows: the season's end or the run) and the sheets stay.
   */
  const slots = (column: ReactElement, panelSlot: ReactElement | null) => (
    <>
      {desk ? (
        // the season's end keeps Kōryū's tint behind it
        <div className={s.deskBg} style={ended ? undefined : style} aria-hidden="true" />
      ) : null}
      {column}
      {panelSlot}
      {sheets}
    </>
  );

  const pending = state.pendingEvent !== undefined;
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
  // the scene that plays now (at the season's end, the race mode's), or one asked for
  const sceneNow = storyScene(ended ? "race" : mode);
  // the race mode's transition opens on black when a scene comes next: no card shows between
  const blackFor =
    !ended && mode === "prerace" && cover !== undefined ? dueIn("prerace") : undefined;
  // the shadow (plan 4.0): what today's game shows, by name, against the model's flow
  const seenEver = story.seenEver();
  useShadowCheck(
    flow,
    flowUi,
    legacyNames(view, {
      ended,
      hold: view.screen === "race" && dueIn("race") !== undefined,
      cover: cover !== undefined,
      black: blackFor && (seenEver.has(blackFor.id) ? "passed" : "scene"),
      inspiration: !ended && showScene,
      fx: !ended && showFx,
      event: !ended && onMenuScreen && !showScene && !showFx && pending,
      scene:
        sceneNow && (replay || !seenEver.has(sceneNow.id))
          ? { id: sceneNow.id, replay: replay !== undefined }
          : undefined,
      sheet:
        title !== undefined ||
        menuOpen ||
        chatOpen ||
        storyListOpen ||
        outingOpen ||
        historyOpen ||
        exporting !== undefined ||
        (!desk && sheet !== undefined) ||
        trackSheet?.open === true,
    }),
  );

  if (ended)
    return slots(
      <div
        key="end"
        className={cx(s.app, desk && s.appDesk, desk && s.appDeskSolo)}
        style={style}
        data-app
      >
        <EndScreen
          run={run}
          onRace={(t) => {
            setView({ screen: "race", turn: t, result: false });
            cmd.rewatch(t);
          }}
          onNew={() => game.newSeason()}
          onTests={() => navigate("fin")}
          onExport={exportRun}
        />
        {exportSheet}
        {storyLayer(sceneNow)}
        {transition}
        {title}
      </div>,
      null,
    );

  const menu = weekMenu(ctx, state);
  const cards = trainingCards(ctx, state);
  const wings = wingsPosition(ctx.content, state.equippedFrame);
  const chosen = menu.raceWeek ? chosenFor(weekPosition, state) : undefined;
  // the week's step is read once its effects played (none: at once); no dialog waits on the menu
  const unreadNoFx = (stepOnMenu: Step | undefined) =>
    stepOnMenu !== undefined && weekFx(stepOnMenu, ctx.ruleset, fxPart(stepOnMenu)).length === 0;

  /** Apply the week's input (with the race position on a race week); a race opens its view. */
  const commit = (input: WeekActionInput) => {
    const raceTurn = menu.raceWeek ? state.turn : undefined;
    if (!game.act(withPosition(input, chosen), inputs)) return;
    const step = game.getSnapshot().lastStep;
    const cue = trainingCue(input, state.turn, step?.after, cards);
    playSound(cue);
    const next: View =
      raceTurn !== undefined ? { screen: "race", turn: raceTurn, result: raceStraight() } : MENU;
    // a training plays its result on the training screen first (owner 2026-11-11)
    const kind = cards.find((c) => c.kind === input.kind)?.kind;
    if (kind && step && (cue === "success" || cue === "boost" || cue === "fail")) {
      setView({
        screen: "trained",
        next,
        result: trainResultOf(
          ctx,
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
  const actToday = (input: WeekActionInput) => {
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
      setView({ screen: "trained", next, result: trainResultOf(ctx, kind, cue, step, points) });
      return;
    }
    setView(next);
  };
  /** A week's action, then the model's own (dry: it reads what today's acted). */
  const act = (input: WeekActionInput) => {
    actToday(input);
    cmd.choose(input);
  };
  /** The race week's real input, after its preview: straight to the race. */
  const runRaceWeek = (input: WeekActionInput) => {
    const turn = state.turn;
    if (!game.act(withPosition(input, chosen), inputs)) return;
    setView({ screen: "race", turn, result: raceStraight() });
  };

  const onMenu = (action: MenuAction) => {
    switch (action) {
      case "train":
        setView({ screen: "train" });
        cmd.open("train");
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
        cmd.open("workshop");
        return;
      case "skills":
        setView({ screen: "workshop", tab: "skills" });
        cmd.open("skills");
        return;
      case "race":
        setView({ screen: "prerace" });
        cmd.open("plan");
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
          ? {
              delta: view.result.vigor,
              delay: resultTimeline(view.result, paceScale(getPace())).vigor ?? 0,
            }
          : undefined
      }
      mood={menu.mood}
      content={ctx.content}
    />
  );

  let screen: ReactNode;
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
          onResultDone={() => {
            setView(view.next);
            dry.complete("train-result");
          }}
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
          onSelect={(kind) => {
            setView({ screen: "train", selected: kind });
            cmd.selectTraining(kind);
          }}
          onConfirm={(kind) => act({ kind })}
          onBack={() => {
            setView(MENU);
            cmd.open("menu");
          }}
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
          onTab={(tab) => {
            setView({ screen: "workshop", tab });
            cmd.workshopTab(tab);
          }}
          onConfirm={(ops: WorkshopOp[]) => act({ kind: "workshop", ops })}
          onBack={() => {
            setView(MENU);
            cmd.open("menu");
          }}
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
          onPosition={(position: Position) => {
            setWeekPosition(position === wings ? undefined : { turn: state.turn, position });
            cmd.position(position === wings ? undefined : position);
          }}
          onRun={() => {
            if (!input) {
              // «Listo» on the planning card
              setView(MENU);
              cmd.open("menu");
            } else if (view.decided) {
              runRaceWeek(input);
              cmd.run();
            }
            // a preview that failed (F7): the model has no such card (4.1 shows a notice)
            else commit(input);
          }}
          onBack={
            view.decided
              ? undefined
              : () => {
                  setView(MENU);
                  cmd.open("menu");
                }
          }
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
            onDone={() => {
              setView({ screen: "prerace", input: view.input, decided: true });
              dry.complete("fx");
            }}
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
          onSkip={() => {
            setView({ screen: "race", turn: view.turn, result: true });
            dry.raceSkip();
          }}
          onReplay={() => {
            setView({ screen: "race", turn: view.turn, result: false });
            cmd.raceAgain();
          }}
          onDone={() => {
            setView(MENU);
            cmd.raceContinue();
          }}
        />
      );
      break;
  }

  return slots(
    <div
      key="run"
      className={cx(s.app, view.screen === "race" && s.appWide, desk && s.appDesk)}
      style={style}
      data-app
    >
      {view.screen !== "race" && hud}
      {screen}
      {/* the week's effects and the event wait until the race and its result were seen */}
      {showScene && scene && (
        <InspirationOverlay
          scene={scene}
          falconessId={state.falconessId}
          parents={parents}
          onDone={() => {
            setSceneDone(scene.key);
            dry.complete("inspiration");
          }}
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
            dry.complete("fx");
          }}
        />
      )}
      {blackFor && <div className={st.black} aria-hidden="true" />}
      {storyLayer(sceneNow)}
      {!showScene && unreadNoFx(fxStep) && <Acknowledge onMount={() => game.acknowledgeStep()} />}
      {onMenuScreen && !showScene && !showFx && pending && <EventDialog />}
      {chatOpen && (
        <ChatSheet
          name={gameText(`falconess.${state.falconessId}`)}
          topics={openTopics(allTopics(), state)}
          read={story.readTopics()}
          primary={colors.primary}
          secondary={colors.secondary}
          onRead={story.markRead}
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
          (sc) => sc.falconess === state.falconessId && story.seenEver().has(sc.id),
        )}
        onWatch={(sc) => {
          setStoryListOpen(false);
          setReplay(sc);
          cmd.watchScene(sc);
        }}
        onClose={() => setStoryListOpen(false)}
      />
      {exportSheet}
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
      {title}
      {/* the wide screen's panel is its menu: one set of the menu's buttons on the page */}
      {!desk && (
        <MobileMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onPanel={openPanel}
          guideNew={guideNew}
          items={items}
        />
      )}
    </div>,
    desk ? (
      <div className={cx(s.app, s.appContents)}>
        <DeskPanel tab={tab} onTab={openPanel} dot={guideNew ? "guide" : undefined}>
          {panel(tab)}
        </DeskPanel>
      </div>
    ) : null,
  );
}

/**
 * The shadow's check (plan 4.0; development builds only): after a commit where the model's flow
 * and today's game differ, it looks again at each animation frame, and a difference still on
 * screen at two frames in a row (`shadowFrame`) is a console error, which fails any e2e run on the
 * dev server (`E2E_DEV=1`). The known differences (`sameFlow`'s rules) never count.
 */
function useShadowCheck(flow: Flow, ui: UiState, legacy: LegacyNames): void {
  const latest = useRef({ flow, ui, legacy });
  const watch = useRef<ShadowWatch>(SHADOW_IDLE);
  const frame = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    latest.current = { flow, ui, legacy };
  });
  useEffect(() => {
    if (!import.meta.env.DEV || frame.current !== undefined) return;
    const differs = (): string | undefined => {
      const { flow: f, ui: u, legacy: l } = latest.current;
      const v = sameFlow(f, l, u);
      if (v.kind !== "mismatch") return undefined;
      return JSON.stringify({
        model: v.model,
        legacy: v.legacy,
        top: `${f.top.kind} ${f.top.key}`,
      });
    };
    if (differs() === undefined) return;
    const tick = () => {
      const mismatch = differs();
      const step = shadowFrame(watch.current, mismatch);
      watch.current = step.watch;
      if (step.report) console.error("flow shadow", mismatch);
      frame.current = mismatch === undefined ? undefined : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  });
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
    },
    [],
  );
}

/** «Directo» (owner 2026-11-14): a goal race opens on its result; «Ver otra vez» plays it. */
function raceStraight(): boolean {
  return getPace() === "direct";
}

/** Where a story scene can play (owner 2026-11-13). */
type SceneMode = "menu" | "prerace" | "race";

/** Marks the week's step read once mounted (a week whose decision left no effects to play). */
function Acknowledge({ onMount }: { onMount: () => void }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: once
  useEffect(onMount, []);
  return null;
}

/** The sponsor's two colors of the Falconess in play (Kōryū's red and yellow without a palette). */
function transitionColors(
  content: ContentIndex,
  falconessId: string,
): { primary: string; secondary: string } {
  const f = content.falconess.get(falconessId);
  const palette = f ? content.getManufacturer(f.sponsor).palette : undefined;
  return { primary: palette?.primary ?? "#c0392b", secondary: palette?.secondary ?? "#f1c40f" };
}
