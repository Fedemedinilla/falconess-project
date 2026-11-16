import type { ContentIndex, Position, StoryScene, WorkshopOp } from "@falconess/schema";
import { difficultyOf, type SimContext } from "@falconess/sim";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { navigate } from "../app/useRoute";
import { allScenes, allTopics } from "../content/story";
import { addBox } from "../game/boxes";
import type { ActiveRun } from "../game/controller";
import { useGame } from "../game/useGame";
import { EventDialog } from "../screens/EventDialog";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { ChatSheet } from "./ChatSheet";
import { EndScreen } from "./EndScreen";
import { ErrorNotice } from "./ErrorNotice";
import { type ExportItem, ExportSheet, entryItem, HistorySheet } from "./Export";
import { boxToKeep } from "./flow/box";
import type { Flow, Layer } from "./flow/types";
import type { Toast } from "./flow/ui";
import { raceWings } from "./flow/week";
import { InspirationOverlay } from "./Inspiration";
import { LayerHost } from "./LayerHost";
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
import { PreRaceScreen, RaceScreen } from "./RaceScreens";
import st from "./Story.module.css";
import { StoryListSheet } from "./StoryListSheet";
import { StoryOverlay } from "./StoryOverlay";
import { StoryToast } from "./StoryToast";
import { playNav } from "./sfx";
import { openTopics } from "./storyModel";
import { TrackSheet } from "./TrackCard";
import { TrainScreen } from "./TrainScreen";
import { ScreenTransition } from "./Transition";
import { type TrackCardView, trackCard } from "./track";
import { gestureAt, useBackGesture } from "./useBackGesture";
import { useFlow } from "./useFlow";
import { useStory } from "./useStory";
import { WeekFxOverlay } from "./WeekFx";
import { WorkshopScreen } from "./WorkshopScreen";

/** The music a run's page wants: the race's own in a race, the menu theme everywhere else. */
export type RunMusic = Exclude<Track, "title">;

/** How long a story notice stays: a scene passed by, with its «Ver», a little longer. */
const NOTICE_MS = 4000;
const PASSED_MS = 6000;

/**
 * One run of the phone game, keyed by the shell per run: everything here starts fresh with a new
 * season, a load or a replay from storage. What shows comes from the flow model (`useFlow`, plan
 * §1): the HUD, the one screen (`data-screen`), the one layer in front of it (`LayerHost`: the
 * week's effects, the inheritance card, a story scene, the emblem, the event dialog), the notices
 * and the sheets. Every tap and every timer that ends a beat goes through the flow's commands,
 * which act on the game and move the flow in the same call. Three modes (owner 2026-11-13):
 * training (its screen and result), the menu (the week's decision, its effects, a story scene due
 * after it), and the race (the emblem, only here, then the scene before the race, the position,
 * the race, the scene after it, its result; then the menu).
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
  const { game } = useGame();
  // the scenes seen and the chat read: a mark re-renders the game
  const story = useStory();
  const { flow, ui: flowUi, cmd, now, dispatch } = useFlow({ run, title: title !== undefined });
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [chatOpen, setChatOpen] = useState(false);
  const [storyListOpen, setStoryListOpen] = useState(false);
  // how far down the season's end was when a race of it was seen again: it comes back there
  const endScroll = useRef(0);
  // the back gesture (O10): what «Volver» does where there is one, a sheet's «Cerrar» while one
  // is open, nothing while the week plays; from the menu or the end it leaves #juego, as before
  useBackGesture(gestureAt(flow), () => cmd.open("menu"));

  // the music follows the mode (owner 2026-11-12): the race's own in race mode, the menu theme
  // everywhere else (the shell plays the title theme over the title and the selection)
  const music = flow.music;
  useEffect(() => onMusic(music), [onMusic, music]);

  // a change of screen whooshes (in the commit that changed it, so it replaces the tap's sound),
  // as each change of today's view did; 5.10 moves the whoosh into the taps' commands
  const screenName = legacyScreen(flow);
  const shownName = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    // an instant beat renders nothing: what shows is the next commit's
    if (screenName === undefined) return;
    const was = shownName.current;
    shownName.current = screenName;
    if (was !== undefined && was !== screenName) playNav();
  }, [screenName]);

  const ctx = game.context();
  useSeasonBox(ctx, run);
  const state = run.state;
  const inputs = run.inputs.length;
  const colors = transitionColors(ctx.content, state.falconessId);
  const toTests = () => navigate("inicio");
  const style = accentStyle(ctx.content, state.falconessId);
  // ADR-0013: the boxes she inherited from, for the inheritance card
  const startInput = run.inputs[0];
  const parents = startInput?.kind === "start" ? startInput.parents : [];

  // the story notice: the newest one shows (a new one takes its place), for its time
  const toast = flowUi.toasts.at(-1);
  const toastId = toast?.id;
  const toastMs = toast?.kind === "passed" ? PASSED_MS : NOTICE_MS;
  useEffect(() => {
    if (toastId === undefined) return;
    const t = setTimeout(() => {
      for (const gone of now().ui.toasts) dispatch({ type: "toastGone", id: gone.id });
    }, toastMs);
    return () => clearTimeout(t);
  }, [toastId, toastMs, now, dispatch]);
  const notices = (
    <>
      {toast && (
        <StoryNotice
          // placed once, over the track tab: placed again when the wide screen comes or goes (the
          // column stays, the tab moves; 5.9's NoticeHost re-measures on any resize)
          key={`${toast.id}/${desk}`}
          toast={toast}
          onWatch={(sc) => {
            // «Ver» plays the scene only where a scene may play now (the menu, a card, a result)
            if (!now().flow.canReplay) return;
            for (const gone of now().ui.toasts) dispatch({ type: "toastGone", id: gone.id });
            cmd.watchScene(sc);
          }}
        />
      )}
      {flowUi.notice && (
        <ErrorNotice
          kind={flowUi.notice}
          onClose={() => dispatch({ type: "notice", notice: undefined })}
        />
      )}
    </>
  );

  /** The layer in front of the screen, from the flow's layer. */
  const layer = (l: Layer): ReactElement => {
    switch (l.kind) {
      case "fx":
        return <WeekFxOverlay fx={l.fx} content={ctx.content} onDone={() => cmd.complete(l.key)} />;
      case "inspiration":
        return (
          <InspirationOverlay
            scene={l.card}
            falconessId={state.falconessId}
            parents={parents}
            onDone={() => cmd.complete(l.key)}
          />
        );
      case "scene":
        return (
          <StoryOverlay
            scene={l.scene}
            primary={colors.primary}
            secondary={colors.secondary}
            // «Ritmo» (owner 2026-11-14): a fast digest, unless asked for from «Historia» or «Ver»
            digest={l.digest}
            onDone={(skipped) => cmd.sceneDone(l.key, skipped)}
          />
        );
      case "emblem":
        return (
          <ScreenTransition
            beat={l.key}
            primary={colors.primary}
            secondary={colors.secondary}
            onCovered={cmd.covered}
            onDone={cmd.complete}
          />
        );
      case "event":
        return <EventDialog />;
    }
  };
  const layers = (
    <LayerHost top={flow.layer} render={layer}>
      {notices}
    </LayerHost>
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
  // while her race plays, Metas and Registro show the week before it (no spoiler: critic b)
  const panel = (t: PanelTab): ReactNode =>
    t === "menu" ? (
      <div className={pm.menuGrid}>
        <MenuItems {...items} />
      </div>
    ) : t === "log" ? (
      <LogPanel ctx={ctx} seed={run.seed} inputs={run.inputs} hideLast={flow.desk.hideLast} />
    ) : t === "goals" ? (
      <GoalsPanel
        ctx={ctx}
        state={flow.desk.of}
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
  const screen = flow.screen;
  const atEnd = screen.kind === "end";
  /**
   * The fixed slots (F12): the backdrop and the panel come and go with the wide screen; the
   * column (keyed by what it shows: the season's end or the run) and the sheets stay.
   */
  const slots = (column: ReactElement, panelSlot: ReactElement | null) => (
    <>
      {desk ? (
        // the season's end keeps Kōryū's tint behind it, through a race of it seen again too
        <div className={s.deskBg} style={flow.solo ? undefined : style} aria-hidden="true" />
      ) : null}
      {column}
      {panelSlot}
      {sheets}
    </>
  );
  /**
   * The one screen: what the probe counts (`data-screen`), with no box of its own. The End is
   * inert while a layer is over it (the week's effects, a scene: the flow says so).
   */
  const slot = (body: ReactNode, inert?: boolean) => (
    <div style={{ display: "contents" }} data-screen={screen.kind} inert={inert || undefined}>
      {body}
    </div>
  );

  if (atEnd)
    return slots(
      <div
        key="end"
        className={cx(s.app, desk && s.appDesk, desk && flow.solo && s.appDeskSolo)}
        style={style}
        data-app
        data-mode={flow.mode}
        data-beat={flow.top.kind}
      >
        {slot(
          <EndScreen
            run={run}
            scroll={endScroll}
            onRace={cmd.rewatch}
            onNew={() => game.newSeason()}
            onTests={() => navigate("fin")}
            onExport={exportRun}
          />,
          screen.inert,
        )}
        {exportSheet}
        {layers}
        {title}
      </div>,
      null,
    );

  const menu = weekMenu(ctx, state);
  const cards = trainingCards(ctx, state);

  const onMenu = (action: MenuAction) => {
    switch (action) {
      case "train":
        cmd.open("train");
        return;
      case "rest":
        cmd.choose({ kind: "rest" });
        return;
      case "outing":
        // ADR-0016: with sintonía the player picks the crew she goes out with
        if (ctx.ruleset.season.crewSync) setOutingOpen(true);
        else cmd.choose({ kind: "outing" });
        return;
      case "workshop":
        cmd.open("workshop");
        return;
      case "skills":
        cmd.open("skills");
        return;
      case "race":
        cmd.open("plan");
        return;
      case "menu":
        setMenuOpen(true);
        return;
    }
  };
  const back = () => cmd.open("menu");
  // a pick of her wings' own position is no choice: the race follows the frame's (F47)
  const pickFor = (wings: Position) => (p: Position) => cmd.position(p === wings ? undefined : p);

  const hud = flow.hud;
  const hudMenu = hud && (hud.of === state ? menu : weekMenu(ctx, hud.of));

  let body: ReactNode = null;
  switch (screen.kind) {
    case "menu":
      body = (
        <MenuScreen
          ctx={ctx}
          state={state}
          menu={menu}
          pendingEvent={state.pendingEvent !== undefined}
          onAction={onMenu}
        />
      );
      break;
    case "train": {
      // the picker and its result are one screen; a result that ended stays under the emblem
      const { selected, result, finished } = screen;
      body = (
        <TrainScreen
          ctx={ctx}
          state={state}
          cards={cards}
          selected={selected}
          injured={result === undefined && menu.injured}
          onSelect={cmd.selectTraining}
          onConfirm={(kind) => cmd.choose({ kind })}
          onBack={back}
          result={result?.result}
          resultKey={result?.key}
          finished={finished}
          onResultDone={cmd.complete}
        />
      );
      break;
    }
    case "workshop":
      body = (
        <WorkshopScreen
          key={`${state.turn}/${inputs}`}
          ctx={ctx}
          state={state}
          tab={screen.tab}
          onTab={cmd.workshopTab}
          onConfirm={(ops: WorkshopOp[]) => cmd.choose({ kind: "workshop", ops })}
          onBack={back}
        />
      );
      break;
    case "plan":
    case "position": {
      const goal = menu.goal;
      if (!goal || !menu.raceWeek) break;
      const decided = screen.kind === "position" ? screen : undefined;
      // the decided card's wings follow its action's frame (F5); the planning card comes before
      // any action, so its default is the equipped frame's
      const wings = decided?.wings ?? raceWings(ctx, state);
      const position = screen.kind === "position" ? screen.week.position : screen.position;
      body = (
        <PreRaceScreen
          ctx={ctx}
          state={state}
          courseId={goal.courseId}
          minPlace={goal.minPlace}
          cup={goal.cup}
          mirror={goal.mirror}
          named={goal.named}
          wings={wings}
          position={position}
          input={decided?.week.input}
          onPosition={pickFor(wings)}
          // «Listo» on the planning card; «Correr» on the decided one (no way back, owner rule)
          onRun={decided ? cmd.run : back}
          onBack={decided ? undefined : back}
        />
      );
      break;
    }
    case "black":
      // under the emblem, before a scene: no card shows between (owner 2026-11-13)
      body = <div className={st.black} data-black aria-hidden="true" />;
      break;
    case "race":
      body = (
        <RaceScreen
          ctx={ctx}
          state={state}
          turn={screen.turn}
          stage={screen.stage}
          play={screen.play}
          onSkip={cmd.raceSkip}
          onNext={cmd.raceNext}
          onAgain={cmd.raceAgain}
          onContinue={cmd.raceContinue}
        />
      );
      break;
  }

  return slots(
    <div
      key="run"
      // a race of the season's end seen again keeps the end's lone column on the wide screen (M3)
      className={cx(
        s.app,
        flow.wide && s.appWide,
        desk && s.appDesk,
        desk && flow.solo && s.appDeskSolo,
      )}
      style={style}
      data-app
      data-mode={flow.mode}
      data-beat={flow.top.kind}
    >
      {hud && hudMenu && (
        <Hud
          hard={difficultyOf(hud.of) === "exigente"}
          turn={hudMenu.turn}
          turns={hudMenu.turns}
          goal={hudMenu.goal}
          vigor={vigorView(ctx, hud.vigor, hud.preview)}
          vigorPop={hud.pop}
          mood={hudMenu.mood}
          content={ctx.content}
        />
      )}
      {slot(body)}
      {layers}
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
          cmd.choose({ kind: "outing", manufacturer });
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
    desk && !flow.solo ? (
      <div className={cx(s.app, s.appContents)}>
        <DeskPanel
          tab={tab}
          onTab={openPanel}
          dot={guideNew ? "guide" : undefined}
          // D4: asleep while the week plays in the column (a layer, the race mode, a result)
          locked={flow.desk.locked}
        >
          {panel(tab)}
        </DeskPanel>
      </div>
    ) : null,
  );
}

/**
 * The notice after a story scene (owner 2026-11-13): played («seen», «skipped») or passed by
 * because she saw it in an earlier season (owner 2026-11-14), with «Ver» to play it whole.
 */
function StoryNotice({
  toast,
  onWatch,
}: {
  readonly toast: Toast;
  readonly onWatch: (scene: StoryScene) => void;
}) {
  const scene = allScenes().find((sc) => sc.id === toast.sceneId);
  if (!scene) return null;
  return (
    <StoryToast long={toast.kind === "passed"}>
      <b>
        {gameText(scene.kickerKey)} · {gameText(scene.titleKey)}
      </b>
      <br />
      {toast.kind === "passed" ? (
        <span className={st.toastRow}>
          {ui("ui.m.story.passed")}
          <button
            type="button"
            className={st.toastBtn}
            id="m-escena-ver"
            onClick={() => onWatch(scene)}
          >
            {ui("ui.m.story.watch")}
          </button>
        </span>
      ) : (
        ui(toast.kind === "skipped" ? "ui.m.story.skipped" : "ui.m.story.seen")
      )}
    </StoryToast>
  );
}

/**
 * Today's names of the screens (until 5.10): the whoosh plays when the name changes, as it did on
 * each change of the old view (the training picker and its result, the workshop, the race card,
 * the race). Undefined for an instant beat, which renders nothing.
 */
function legacyScreen(flow: Flow): string | undefined {
  const t = flow.top;
  switch (t.kind) {
    case "train-result":
      return "trained";
    case "fx":
      return t.part === "action" ? "actionfx" : "menu";
    case "emblem":
    case "position":
      return "prerace";
    case "scene":
      return t.where === "prerace" ? "prerace" : t.where === "race" ? "race" : "menu";
    case "replay":
    case "finish":
    case "race-result":
      return "race";
    case "event":
    case "inspiration":
      return "menu";
    case "ack":
    case "enter":
    case "pass":
      return undefined;
    case "idle":
      switch (flow.screen.kind) {
        case "train":
          return "train";
        case "workshop":
          return "workshop";
        case "plan":
          return "prerace";
        case "race":
          return "race";
        default:
          return "menu";
      }
  }
}

/**
 * The season's black box (ADR-0013, plan §1.11, critic (c)9): kept as soon as the run in play has
 * ended, in the commit of the tap that ended it («Correr», the last action), so before its race,
 * its scenes and the End, and whatever the player does then. A run loaded ended keeps it too; a
 * box already kept stays once (`addBox` goes by its id).
 */
function useSeasonBox(ctx: SimContext, run: ActiveRun): void {
  useEffect(() => {
    const box = boxToKeep(ctx, run);
    if (box) addBox(box);
  }, [ctx, run]);
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
