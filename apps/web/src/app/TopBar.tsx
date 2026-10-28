import { useGame } from "../game/useGame";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { Livery } from "../ui/Livery";
import { Pill } from "../ui/Pill";
import { useGlobalDetail } from "./explain";
import { type Route, routeHref } from "./route";
import s from "./TopBar.module.css";
import { setTheme, useTheme } from "./theme";

const NAV: readonly { route: Route; key: string }[] = [
  { route: "inicio", key: "ui.nav.home" },
  { route: "temporada", key: "ui.nav.season" },
  { route: "carrera-libre", key: "ui.nav.freeRace" },
];

/** Half-filled disc: the theme toggle's glyph, drawn in the text color. */
function ThemeGlyph() {
  return (
    <svg className={s.glyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
    </svg>
  );
}

/** The run in play, in one line: who, which week, and what is waiting. */
function RunStatus() {
  const { game, snap } = useGame();
  const run = snap.run;
  if (!run) return null;
  const ctx = game.context();
  const falconess = ctx.content.getFalconess(run.state.falconessId);
  const sponsor = ctx.content.getManufacturer(falconess.sponsor);
  const turns = ctx.ruleset.season.turns;
  return (
    <p className={s.status}>
      <span className={s.swatch}>
        <Livery palette={sponsor.palette} size="sm" />
      </span>
      <span className={s.runner}>{gameText(falconess.textKey)}</span>
      {run.state.status === "ended" ? (
        <Pill tone="neutral">{ui("ui.top.ended")}</Pill>
      ) : (
        <span className={s.week} title={ui("ui.top.week.long", { turn: run.state.turn, turns })}>
          {ui("ui.top.week", { turn: run.state.turn, turns })}
        </span>
      )}
      {run.state.pendingEvent && (
        <Pill tone="accent" icon="event">
          {ui("ui.top.event")}
        </Pill>
      )}
    </p>
  );
}

/**
 * "Explicaciones: breves / completas": the default length of every card's explanation, remembered
 * in this browser. Changing it also resets the cards switched by hand.
 */
function ExplainTool() {
  const [detail, setDetail] = useGlobalDetail();
  const full = detail === "full";
  const mode = ui(full ? "ui.explain.global.long" : "ui.explain.global.short");
  return (
    <Button
      id="explicaciones-cambiar"
      size="sm"
      variant="ghost"
      role="switch"
      aria-checked={full}
      aria-label={ui("ui.explain.global.aria")}
      title={ui("ui.explain.global.title", { mode })}
      className={cx(s.explainTool, full && s.explainOn)}
      onClick={() => setDetail(full ? "brief" : "full")}
    >
      <Icon name="explain" />
      <span className={s.explainLabel}>{ui("ui.explain.global")}</span>
      <span className={s.explainMode}>{mode}</span>
    </Button>
  );
}

export type TopBarProps = {
  route: Route;
  /** Open the run tools (copy, undo). */
  onOpenRun: () => void;
};

/** The sticky timing bar: name, sections, the run in play, run tools and theme. */
export function TopBar({ route, onOpenRun }: TopBarProps) {
  const { snap } = useGame();
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const nextLabel = ui(next === "dark" ? "ui.theme.dark" : "ui.theme.light");
  return (
    <header className={s.bar}>
      <div className={s.inner}>
        <a className={s.brand} href={routeHref("inicio")} id="marca-inicio">
          <span className={s.name}>{ui("ui.app.name")}</span>
          <span className={s.tag}>{ui("ui.app.tag")}</span>
        </a>
        <nav className={s.nav} aria-label={ui("ui.nav.label")}>
          {NAV.map((item) => (
            <a
              key={item.route}
              id={`nav-${item.route}`}
              href={routeHref(item.route)}
              className={cx(s.link, route === item.route && s.active)}
              aria-current={route === item.route ? "page" : undefined}
            >
              {ui(item.key)}
            </a>
          ))}
        </nav>
        <RunStatus />
        <div className={s.tools}>
          {snap.run && (
            <Button id="partida-abrir" size="sm" onClick={onOpenRun} className={s.runTool}>
              {ui("ui.top.run")}
            </Button>
          )}
          <ExplainTool />
          <Button
            id="tema-cambiar"
            size="sm"
            variant="ghost"
            className={s.themeTool}
            onClick={() => setTheme(next)}
            aria-label={nextLabel}
            title={nextLabel}
          >
            <ThemeGlyph />
            <span className={s.themeLabel}>{nextLabel}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
