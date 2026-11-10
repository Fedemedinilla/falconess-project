import type { Position, TrainingKind, WorkshopOp } from "@falconess/schema";
import { useEffect, useRef, useState } from "react";
import { navigate } from "../app/useRoute";
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
import { WeekDialog } from "../screens/WeekDialog";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { EndScreen } from "./EndScreen";
import { Glyph } from "./Glyph";
import { type MenuAction, MenuScreen } from "./MenuScreen";
import s from "./Mobile.module.css";
import { trainingCards, vigorView, weekMenu } from "./model";
import { accentStyle, Hud } from "./Parts";
import { PreRaceScreen, RaceScreen } from "./RaceScreens";
import { SelectScreen } from "./SelectScreen";
import { TrainScreen } from "./TrainScreen";
import { WorkshopScreen, type WorkshopTab } from "./WorkshopScreen";

type View =
  | { readonly screen: "menu" }
  | { readonly screen: "train"; readonly selected?: TrainingKind | undefined }
  | { readonly screen: "workshop"; readonly tab: WorkshopTab }
  | { readonly screen: "prerace"; readonly input?: WeekActionInput | undefined }
  | { readonly screen: "race"; readonly turn: number; readonly result: boolean };

const MENU: View = { screen: "menu" };

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
  const run = snap.run;
  const inputs = run?.inputs.length ?? 0;

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
      </div>
    );

  const ctx = game.context();
  const state = run.state;
  const style = accentStyle(ctx.content, state.falconessId);

  if (state.status === "ended" && view.screen !== "race")
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
          onViewRace={(t) => setView({ screen: "race", turn: t, result: false })}
        />
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
    setView(raceTurn !== undefined ? { screen: "race", turn: raceTurn, result: false } : MENU);
  };
  /** A week's action: on a race week the pre-race card comes first. */
  const act = (input: WeekActionInput) => {
    if (menu.raceWeek) setView({ screen: "prerace", input });
    else commit(input);
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
          wings={wings}
          position={chosen}
          input={input}
          onPosition={(position: Position) =>
            setWeekPosition(position === wings ? undefined : { turn: state.turn, position })
          }
          onRun={() => (input ? commit(input) : setView(MENU))}
          onBack={() => setView(MENU)}
        />
      );
      break;
    }
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
  return (
    <div className={cx(s.app, view.screen === "race" && s.appWide)} style={style}>
      {view.screen !== "race" && hud}
      {screen}
      {/* «Lo que pasó» and the event wait until the race and its result were seen */}
      {onMenuScreen && (
        <>
          <WeekDialog
            className={s.weekDialog}
            advice={false}
            onViewRace={(t) => setView({ screen: "race", turn: t, result: false })}
          />
          {pending && <EventDialog />}
        </>
      )}
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onTests={toTests}
        onNew={() => {
          setMenuOpen(false);
          game.newSeason();
        }}
      />
    </div>
  );
}

/** The «Menú» sheet: the test view, a new season. */
function MobileMenu({
  open,
  onClose,
  onTests,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  onTests: () => void;
  onNew: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
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
        <button type="button" className={s.btn} id="m-pruebas" onClick={onTests}>
          <Glyph name="screen" size={20} />
          {ui("ui.m.tests")}
        </button>
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
