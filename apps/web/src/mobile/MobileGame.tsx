import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { parseHash } from "../app/route";
import { navigate } from "../app/useRoute";
import type { ActiveRun } from "../game/controller";
import { useGame } from "../game/useGame";
import { cx } from "../ui/cx";
import { useMedia } from "../ui/useMedia";
import s from "./Mobile.module.css";
import "./motion.css";
import { setMusic, stopMusic, type Track } from "./music";
import { guideSeen, markGuideSeen, type PanelTab } from "./Panels";
import { type RunMusic, RunView } from "./RunView";
import { SelectScreen } from "./SelectScreen";
import { playNav, queueTap } from "./sfx";
import { TitleScreen } from "./TitleScreen";
import { useBackGesture } from "./useBackGesture";

/** A wide screen (owner 2026-11-13): the game's column with the panel beside it. */
const DESK_QUERY = "(min-width: 1100px) and (min-height: 620px)";

/**
 * The title screen shows once per visit, when the page opens on the game (owner 2026-11-12); a
 * visit that starts in the test view goes to the game without it.
 */
let titleDone = typeof location !== "undefined" && parseHash(location.hash) !== "juego";

/** Each run's view (RunView's key): a start, a load or a replay from storage brings a new one. */
const runIds = new WeakMap<object, number>();
let lastRunId = 0;
function runKey(run: ActiveRun): string {
  const start = run.inputs[0];
  if (start === undefined) return run.seed;
  let id = runIds.get(start);
  if (id === undefined) {
    lastRunId += 1;
    id = lastRunId;
    runIds.set(start, id);
  }
  return `${run.seed}/${id}`;
}

/**
 * #juego: the phone game (the approved prototype wired to the real season), with the same
 * controller as the test view. This shell holds what outlives a run: the light theme, the tap
 * under every button, the title screen, the wide-screen flag, the wide screen's panel tab and the
 * guide's dot, and the music (its one writer). Without a run it shows the character select; with
 * one, a RunView of its own (keyed per run, so a new season starts with nothing of the last one).
 */
export function MobileGame() {
  const { snap } = useGame();
  const run = snap.run;
  // owner 2026-11-13: on a wide screen the game sits in a taller, wider column with the menu open
  // beside it as a panel; on a phone the panels open from «Menú»
  const desk = useMedia(DESK_QUERY);
  const [tab, setTab] = useState<PanelTab>("menu");
  const [guideNew, setGuideNew] = useState(() => !guideSeen());
  const seeGuide = useCallback(() => {
    markGuideSeen();
    setGuideNew(false);
  }, []);
  const [title, setTitle] = useState(() => !titleDone);

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

  // the music follows the page (owner 2026-11-12): the title theme until a season starts, then
  // what the run's page wants (a new run starts on the menu's until its view says otherwise)
  const key = run ? runKey(run) : undefined;
  const [runMusic, setRunMusic] = useState<{ readonly key: string; readonly track: RunMusic }>();
  const onMusic = useCallback(
    (track: RunMusic) => {
      if (key !== undefined) setRunMusic({ key, track });
    },
    [key],
  );
  const music: Track =
    title || !run
      ? "title"
      : runMusic !== undefined && runMusic.key === key
        ? runMusic.track
        : "menu";
  useEffect(() => setMusic(music), [music]);
  useEffect(() => stopMusic, []);

  // the selection and a run are two screens: going between them whooshes (in the click's own
  // commit, so it replaces its tap; only a tap starts or leaves a run); inside a run, the taps'
  // commands whoosh (flow/commands.ts)
  const inRun = run !== undefined;
  const firstScreen = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of screen only
  useLayoutEffect(() => {
    if (firstScreen.current) firstScreen.current = false;
    else playNav();
  }, [inRun]);

  const titleScreen = title ? (
    <TitleScreen
      onStart={() => {
        titleDone = true;
        setTitle(false);
      }}
    />
  ) : undefined;

  return (
    <div className={s.deskRoot}>
      {run ? (
        <RunView
          key={key}
          run={run}
          desk={desk}
          tab={tab}
          onTab={setTab}
          guideNew={guideNew}
          onGuideSeen={seeGuide}
          title={titleScreen}
          onMusic={onMusic}
        />
      ) : (
        <SelectFrame desk={desk} title={titleScreen} />
      )}
    </div>
  );
}

/** The character select: centered on a wide screen, with no panel beside it. */
function SelectFrame({ desk, title }: { desk: boolean; title: ReactElement | undefined }) {
  // the back gesture leaves #juego from here, as from the menu (a sheet open closes first); an
  // entry the game left (a reload, «Nueva temporada» from «Menú» or the season's end) is taken back
  useBackGesture("rest");
  return (
    <>
      {desk ? <div className={s.deskBg} aria-hidden="true" /> : null}
      <div className={cx(s.app, desk && s.appDesk, desk && s.appDeskSolo)} data-app>
        <SelectScreen onTests={() => navigate("inicio")} />
        {title}
      </div>
    </>
  );
}
