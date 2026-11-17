import type { ContentIndex, Position, WorkshopOp } from "@falconess/schema";
import { difficultyOf, type SimContext } from "@falconess/sim";
import {
  type ReactElement,
  type ReactNode,
  type RefObject,
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
import { gameText } from "../text/ui";
import { cx } from "../ui/cx";
import { useHidden } from "../ui/visibility";
import { ChatSheet } from "./ChatSheet";
import { EndScreen } from "./EndScreen";
import { type ExportItem, ExportSheet, entryItem, HistorySheet } from "./Export";
import { boxToKeep } from "./flow/box";
import { introTempo, introTiming } from "./flow/scenes";
import type { Layer, Screen } from "./flow/types";
import { raceWings } from "./flow/week";
import { InspirationOverlay } from "./Inspiration";
import { LayerHost } from "./LayerHost";
import { type MenuAction, MenuScreen } from "./MenuScreen";
import { MenuItems, type MenuItemsProps, MobileMenu } from "./MenuSheet";
import s from "./Mobile.module.css";
import { trainingCards, vigorView, weekMenu } from "./model";
import type { Track } from "./music";
import { NoticeHost } from "./NoticeHost";
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
import { paceScale } from "./pace";
import { PreRaceScreen, RaceScreen } from "./RaceScreens";
import st from "./Story.module.css";
import { StoryListSheet } from "./StoryListSheet";
import { StoryOverlay } from "./StoryOverlay";
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

/**
 * One run of the phone game, keyed by the shell per run: everything here starts fresh with a new
 * season, a load or a replay from storage. What shows comes from the flow model (`useFlow`, plan
 * §1): the HUD, the one screen (`data-screen`), the one layer in front of it (`LayerHost`: the
 * week's effects, the inheritance card, a story scene, the emblem, the event dialog), the notices
 * and the sheets. Every tap and every timer that ends a beat goes through the flow's commands,
 * which act on the game and move the flow in the same call, and play the sounds inside the tap:
 * a timer never sounds (critic b). Three modes (owner 2026-11-13):
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
  const flowView = useFlow({ run, title: title !== undefined });
  const { flow, ui: flowUi, cmd, dispatch, pace, reduced } = flowView;
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
  // is open, nothing while the week plays or on the season's end; from the menu it leaves #juego
  useBackGesture(gestureAt(flow), () => cmd.open("menu"));

  // the music follows the mode (owner 2026-11-12): the race's own in race mode, the menu theme
  // everywhere else (the shell plays the title theme over the title and the selection)
  const music = flow.music;
  useEffect(() => onMusic(music), [onMusic, music]);

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

  // the notices: a scene's (the queue's first) and a refused act's, while nothing plays in front
  const notices = (
    // under the chat, out of reach as the rest of the game (final review C4)
    <div style={{ display: "contents" }} inert={chatOpen || undefined}>
      <NoticeHost
        flow={flow}
        toasts={flowUi.toasts}
        notice={flowUi.notice}
        dispatch={dispatch}
        onWatch={cmd.watchScene}
      />
    </div>
  );

  /** The layer in front of the screen, from the flow's layer. */
  const layer = (l: Layer): ReactElement => {
    switch (l.kind) {
      case "fx":
        return (
          <WeekFxOverlay
            fx={l.fx}
            pace={pace}
            content={ctx.content}
            onDone={() => cmd.complete(l.key)}
          />
        );
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
            // its way in: whole, short (a digest) or still (reduced motion)
            timing={introTiming(introTempo(l.digest, reduced))}
            // as its exit starts: the flow moves on under its fading copy (D7)
            onFinish={(skipped) => cmd.sceneDone(l.key, skipped)}
          />
        );
      case "emblem":
        return (
          <ScreenTransition
            beat={l.key}
            fadeIn={l.fadeIn}
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
  /**
   * The layers in front of what they cover (`under`: the HUD and the screen, which read the layer
   * leaving: the race's result after a scene), and the notices after them.
   */
  const layers = (under: ReactNode) => (
    <LayerHost top={flow.layer} render={layer} reduced={reduced} under={under}>
      {notices}
    </LayerHost>
  );
  // what comes with the run's view is there with its column; what mounts later comes in (D1, L5):
  // the menu the run opens on comes in slower, the HUD it opens with is the anchor and does not fade
  const [opened, setOpened] = useState(false);
  useEffect(() => setOpened(true), []);
  // L8: the wide screen's column glides to the middle as the End comes, from where it stood beside
  // the panel; never when the window has just grown into the wide screen (it stood nowhere there)
  const [deskShown, setDeskShown] = useState(desk);
  useEffect(() => setDeskShown(desk), [desk]);
  const glide = desk && deskShown && flow.solo;
  // while a layer is in front the game behind it is out of reach (L7: no keyboard path to «Menú»
  // mid-beat); when the last one goes, the focus lands on the screen's own control
  const layerIn = flow.layer !== undefined;
  const slotRef = useRef<HTMLDivElement>(null);
  useFocusHome(layerIn, `${flow.screenKey} ${flow.top.key}`, flow.screen.kind, slotRef);
  // the chat is a modal sheet inside the column: while it is open the game under it (and the wide
  // screen's panel beside it) is out of reach too (final review C4)
  const behind = layerIn || chatOpen;
  // a hidden tab (6.11): the column's CSS stands still with the flow's timers (`data-hidden`)
  const hidden = useHidden() ? "" : undefined;

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
   * column and the sheets stay. The column is one element whether it shows the run or the season's
   * end (only what is inside it changes), so it can glide to the middle as the End comes (L8).
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
   * The one screen: what the probe counts (`data-screen`), with no box of its own; inert while a
   * layer is in front of it (the week's effects, the card, a scene, the emblem, the event).
   */
  const slot = (body: ReactNode) => (
    <div
      ref={slotRef}
      style={{ display: "contents" }}
      data-screen={screen.kind}
      inert={behind || undefined}
    >
      {body}
    </div>
  );

  if (atEnd)
    return slots(
      <div
        key="column"
        className={cx(
          s.app,
          desk && s.appDesk,
          desk && flow.solo && s.appDeskSolo,
          glide && s.appDeskGlide,
        )}
        style={style}
        data-app
        data-hidden={hidden}
        data-mode={flow.mode}
        data-beat={flow.top.kind}
      >
        {layers(
          slot(
            <EndScreen
              run={run}
              scroll={endScroll}
              onRace={cmd.rewatch}
              onNew={() => game.newSeason()}
              onTests={() => navigate("fin")}
              onExport={exportRun}
            />,
          ),
        )}
        {exportSheet}
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
          major={!opened}
          onAction={onMenu}
        />
      );
      break;
    case "train": {
      // the picker and its result are one screen; a result that ended stays under the emblem.
      // A result plays on the week she trained in (its buttons, crews and HUD), counting her
      // stats up to the week after (critic b1, F6)
      const { selected, result, finished } = screen;
      const week = result?.before ?? state;
      body = (
        <TrainScreen
          ctx={ctx}
          state={week}
          cards={week === state ? cards : trainingCards(ctx, week)}
          selected={selected}
          injured={(week === state ? menu : weekMenu(ctx, week)).injured}
          onSelect={cmd.selectTraining}
          onConfirm={(kind) => cmd.choose({ kind })}
          onBack={back}
          result={result?.result}
          after={result?.after}
          k={paceScale(pace)}
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
          // «Elegir la acción» on the planning card; «Correr» on the decided one (no way back,
          // owner rule)
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
      key="column"
      // a race of the season's end seen again keeps the end's lone column on the wide screen (M3)
      className={cx(
        s.app,
        flow.wide && s.appWide,
        desk && s.appDesk,
        desk && flow.solo && s.appDeskSolo,
        glide && s.appDeskGlide,
      )}
      style={style}
      data-app
      data-hidden={hidden}
      data-mode={flow.mode}
      data-beat={flow.top.kind}
    >
      {layers(
        <>
          {hud && hudMenu && (
            <Hud
              inert={behind}
              enter={opened}
              hard={difficultyOf(hud.of) === "exigente"}
              turn={hudMenu.turn}
              turns={hudMenu.turns}
              goal={hudMenu.goal}
              vigor={vigorView(ctx, hud.vigor, hud.preview)}
              vigorPop={hud.pop}
              // a training's result: the bar moves to the week after when its «±N» lands (L3)
              vigorTo={hud.vigorTo && vigorView(ctx, hud.vigorTo, undefined)}
              vigorAt={hud.vigorAt}
              vigorBeat={hud.vigorTo && flow.top.key}
              mood={hudMenu.mood}
              content={ctx.content}
            />
          )}
          {slot(body)}
        </>,
      )}
      <ChatSheet
        open={chatOpen}
        name={gameText(`falconess.${state.falconessId}`)}
        topics={openTopics(allTopics(), state)}
        read={story.readTopics()}
        primary={colors.primary}
        secondary={colors.secondary}
        onRead={story.markRead}
        onClose={() => setChatOpen(false)}
      />
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
          // D4: asleep while the week plays in the column (a layer, the race mode, a result), and
          // under the chat's sheet
          locked={flow.desk.locked || chatOpen}
        >
          {panel(tab)}
        </DeskPanel>
      </div>
    ) : null,
  );
}

/** Each screen's own control, where the focus lands when the last layer in front of it goes. */
const HOME: Partial<Record<Screen["kind"], string>> = {
  menu: "m-entrenar",
  position: "m-correr",
  race: "m-carrera-seguir",
};

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]';

/**
 * When the last layer in front goes (L7), the focus lands on the screen's own control (its main
 * action: «Entrenar», «Correr», «Continuar»; else its first control), never on the page's body:
 * it was on the layer, which leaves inert. The same when the flow moves on with no layer in front
 * (`at`, the screen's key and the top beat's, changed: a training's result that ends on the menu
 * with no week effects, a race's replay that ends on its result with no scene after it,
 * «Entrenar» opening the training screen): the control that had the focus went with what it
 * ended, or went inert. A focus the player put somewhere live stays.
 */
function useFocusHome(
  layerIn: boolean,
  at: string,
  screen: Screen["kind"],
  slot: RefObject<HTMLElement | null>,
): void {
  const was = useRef({ layerIn, at });
  useLayoutEffect(() => {
    const before = was.current;
    was.current = { layerIn, at };
    if (layerIn || (!before.layerIn && before.at === at)) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !active.closest("[inert]"))
      return;
    const box = slot.current;
    const home = HOME[screen];
    const usable = (el: HTMLElement | null | undefined) =>
      el && !el.closest("[inert]") && !(el instanceof HTMLButtonElement && el.disabled)
        ? el
        : undefined;
    const el =
      usable(home ? box?.querySelector<HTMLElement>(`#${home}`) : undefined) ??
      usable(box?.querySelector<HTMLElement>(FOCUSABLE));
    el?.focus({ preventScroll: true });
  }, [layerIn, at, screen, slot]);
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
