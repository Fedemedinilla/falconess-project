import { useEffect, useRef, useState } from "react";
import type { GameController } from "../game/controller";
import { GameContext, useGame } from "../game/useGame";
import { MobileGame } from "../mobile/MobileGame";
import { FreeRace } from "../race/FreeRace";
import { RaceViewer } from "../race/RaceViewer";
import { EventDialog } from "../screens/EventDialog";
import { Home } from "../screens/Home";
import { NewSeason } from "../screens/NewSeason";
import { SeasonEnd } from "../screens/SeasonEnd";
import { Turn } from "../screens/Turn";
import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";
import s from "./App.module.css";
import { ErrorBanner } from "./ErrorBanner";
import { RunDialog } from "./RunDialog";
import type { Route } from "./route";
import { TopBar } from "./TopBar";
import { redirect, useRoute } from "./useRoute";

/**
 * Which screen a route shows, given the run in play:
 * - #inicio: Home.
 * - #temporada: NewSeason without a run; Turn while it is active (Turn opens «Lo que pasó» after
 *   every input and Workshop itself; EventDialog goes over it while an event waits for its
 *   choice, once «Lo que pasó» is read); an ended season goes to #fin.
 * - #fin: SeasonEnd of the ended run.
 * - #carrera: RaceViewer (the goal race of `snap.lastStep`, or one the screen picks).
 * - #carrera-libre: FreeRace.
 */
function Screen({ route, onOpenRun }: { route: Route; onOpenRun: () => void }) {
  const { snap } = useGame();
  const run = snap.run;
  switch (route) {
    case "juego":
      return null;
    case "inicio":
      return <Home onOpenRun={onOpenRun} />;
    case "temporada":
      if (!run) return <NewSeason />;
      if (run.state.status === "ended") return <SeasonEnd />;
      return (
        <>
          <Turn />
          {run.state.pendingEvent && <EventDialog />}
        </>
      );
    case "fin":
      return run?.state.status === "ended" ? (
        <SeasonEnd />
      ) : (
        <ScreenPlaceholder
          title={ui("ui.fin.none.title")}
          note={ui("ui.fin.none.note")}
          badge={false}
        />
      );
    case "carrera":
      return <RaceViewer />;
    case "carrera-libre":
      return <FreeRace />;
  }
}

function Shell() {
  const route = useRoute();
  if (route === "juego") return <MobileGame />;
  return <TestShell route={route} />;
}

/** The test view («Vista de pruebas»): the top bar and the hash-routed screens. */
function TestShell({ route }: { route: Route }) {
  const { snap } = useGame();
  const [runOpen, setRunOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const shownRoute = useRef(route);
  const ended = snap.run?.state.status === "ended";

  // a new screen starts at the top, with focus on it for keyboard and screen-reader users
  useEffect(() => {
    if (shownRoute.current === route) return;
    shownRoute.current = route;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  useEffect(() => {
    if (route === "temporada" && ended) redirect("fin");
  }, [route, ended]);

  return (
    <div className={s.shell}>
      <TopBar route={route} onOpenRun={() => setRunOpen(true)} />
      <ErrorBanner />
      <main className={s.main} ref={mainRef} tabIndex={-1} aria-label={ui("ui.app.name")}>
        <Screen route={route} onOpenRun={() => setRunOpen(true)} />
      </main>
      <RunDialog open={runOpen} onClose={() => setRunOpen(false)} />
    </div>
  );
}

/** The tester page: one game controller for the whole session, hash routes for the screens. */
export function App({ controller }: { controller: GameController }) {
  return (
    <GameContext value={controller}>
      <Shell />
    </GameContext>
  );
}
