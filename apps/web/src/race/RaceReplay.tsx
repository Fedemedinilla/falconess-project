import { contentLabels, isFlightLog, type RaceLabels } from "@falconess/race-view";
import { DEFAULT_POSITION, type RaceLog, SEGMENT_TYPES } from "@falconess/schema";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useGlobalDetail } from "../app/explain";
import { getContent } from "../content/load";
import { Letter } from "../screens/shared/Letter";
import { uiAt } from "../text/brief";
import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { PositionMark } from "../ui/PositionMark";
import { Controls } from "./Controls";
import { ReplayClock } from "./clock";
import { FlightReplay } from "./flight/FlightReplay";
import { type ChartMode, LaneChart } from "./LaneChart";
import { LivePanel } from "./LivePanel";
import s from "./RaceViewer.module.css";
import { Results } from "./Results";
import { type RaceView, type RunnerView, raceView } from "./view";
import { metres } from "./words";

let defaultLabels: RaceLabels | undefined;

/** Game names and liveries from the page's content. */
export function pageLabels(): RaceLabels {
  defaultLabels ??= contentLabels(getContent());
  return defaultLabels;
}

/** The terrain the strip over the lanes is colored by: the types this course has. */
function TerrainLegend({ view }: { view: RaceView }) {
  const types = SEGMENT_TYPES.filter((t) => view.layout.segments.some((seg) => seg.type === t));
  return (
    <ul className={s.terrainLegend} aria-hidden="true">
      {types.map((t) => (
        <li key={t} className={s.flagLegendItem}>
          <span className={s.terrainSwatch} style={{ background: `var(--seg-${t})` }} />
          {view.labels.segmentName(t)}
        </li>
      ))}
    </ul>
  );
}

/** The flags the chart draws, with the glyph each one uses, and the kick line when there is one. */
function FlagLegend({ reserve }: { reserve: boolean }) {
  const [detail] = useGlobalDetail();
  const items: { key: string; glyph: string }[] = [
    { key: "boost", glyph: "M2 8 L12 6 L12 10 Z" },
    { key: "pulse", glyph: "M8 2 a6 6 0 1 0 0.01 0" },
    { key: "airborne", glyph: "M3 13 h10" },
    { key: "drafting", glyph: "M2 6 h8 M2 10 h8" },
    { key: "overheated", glyph: "M8 1 a7 7 0 1 0 0.01 0" },
    { key: "exhausted", glyph: "M4 3 L13 8 L4 13 Z" },
    { key: "broken", glyph: "M2 9 l3 3 l3 -5 l3 5 l3 -3" },
    { key: "stalled", glyph: "M3 3 L13 13 M13 3 L3 13" },
  ];
  return (
    <ul className={s.flagLegend} aria-label={ui("ui.race.legend.title")}>
      {items.map((it) => (
        <li key={it.key} className={s.flagLegendItem}>
          <svg className={s[`legend-${it.key}`]} viewBox="0 0 16 16" aria-hidden="true">
            <path d={it.glyph} />
          </svg>
          {ui(`ui.race.flag.${it.key}`)}
        </li>
      ))}
      <li className={s.flagLegendItem}>
        <svg className={s["legend-pin-skill"]} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3 L13 8 L8 13 L3 8 Z" />
        </svg>
        {ui("ui.race.legend.pin.skill")}
      </li>
      <li className={s.flagLegendItem}>
        <svg className={s["legend-pin-trouble"]} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3 L13 8 L8 13 L3 8 Z" />
        </svg>
        {ui("ui.race.legend.pin.trouble")}
      </li>
      {reserve && (
        <li className={s.flagLegendItem}>
          <svg className={s["legend-reserve"]} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1 V15" />
          </svg>
          {uiAt(detail, "ui.race.legend.reserve")}
        </li>
      )}
    </ul>
  );
}

/**
 * Her race position over the lanes (ADR-0008): its shape, which one, whether it is her wings' or
 * one chosen before the gun, and her letter in it (it scales her Intelligence).
 */
function PlayerPosition({
  player,
  labels,
  idPrefix,
}: {
  player: RunnerView;
  labels: RaceLabels;
  idPrefix: string;
}) {
  const { entry } = player;
  const wings = DEFAULT_POSITION[entry.style];
  const vars = {
    name: player.name,
    position: labels.positionName(entry.position),
    wings: labels.positionName(wings),
  };
  return (
    <p className={s.position} id={`${idPrefix}-corre-en`} data-position={entry.position}>
      <PositionMark position={entry.position} size="lg" />
      <span className={s.positionText}>
        {ui(entry.position === wings ? "ui.race.position.wings" : "ui.race.position.chosen", vars)}
      </span>
      <span className="visually-hidden">{ui("ui.position.letter")}</span>
      <Letter letter={entry.positionAptitude} />
    </p>
  );
}

export type RaceReplayProps = {
  log: RaceLog;
  labels: RaceLabels;
  /** Prefix of the controls' ids, unique on the page. */
  idPrefix: string;
  /** Told once the result shows (the replay reached the finish, or "Ir a la meta"). */
  onReveal?: (() => void) | undefined;
};

/**
 * One race replayed from its log: the lane chart with its controls, the live order, and once the
 * replay reaches the finish (or "Ir a la meta"), the classification, the "why" of each runner, her
 * events, the timeline and the splits.
 */
function RaceReplay({ log, labels, idPrefix, onReveal }: RaceReplayProps) {
  const view = useMemo(() => raceView(log, labels), [log, labels]);
  const [clock] = useState(() => new ReplayClock(view.end));
  useEffect(() => () => clock.dispose(), [clock]);
  const snap = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<ChartMode>("pack");
  const [guess, setGuess] = useState<number | undefined>(undefined);
  const [detail] = useGlobalDetail();
  useEffect(() => {
    if (snap.atEnd) setRevealed(true);
  }, [snap.atEnd]);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  useEffect(() => {
    if (revealed) revealRef.current?.();
  }, [revealed]);

  const g = log.geometry;
  const meta = ui("ui.race.track.meta", {
    m: metres(g.lengthMm),
  });

  if (!view.hasFrames)
    return (
      <div className={s.viewer}>
        <p className={s.notice}>{ui("ui.race.noFrames")}</p>
        <Results view={view} clock={clock} idPrefix={idPrefix} />
      </div>
    );

  const modes: { mode: ChartMode; id: string; key: string }[] = [
    { mode: "pack", id: `${idPrefix}-vista-peloton`, key: "ui.race.view.pack" },
    { mode: "course", id: `${idPrefix}-vista-pista`, key: "ui.race.view.course" },
  ];
  const viewSwitch = (
    <fieldset className={s.viewSwitch}>
      <legend className="visually-hidden">{ui("ui.race.view.label")}</legend>
      {modes.map((m) => (
        <Button
          key={m.mode}
          id={m.id}
          size="sm"
          variant={mode === m.mode ? "primary" : "secondary"}
          aria-pressed={mode === m.mode}
          onClick={() => setMode(m.mode)}
        >
          {ui(m.key)}
        </Button>
      ))}
    </fieldset>
  );

  return (
    <div className={s.viewer}>
      <Panel
        title={labels.courseName(log.courseId)}
        meta={meta}
        actions={viewSwitch}
        className={s.trackPanel}
      >
        <div className={s.trackBody}>
          {view.player && (
            <PlayerPosition player={view.player} labels={labels} idPrefix={idPrefix} />
          )}
          {!revealed && (
            <div className={s.guessBar}>
              <span className={s.select}>
                <label htmlFor={`${idPrefix}-pronostico`}>{ui("ui.race.guess")}</label>
                <select
                  id={`${idPrefix}-pronostico`}
                  value={guess ?? ""}
                  aria-describedby={`${idPrefix}-pronostico-ayuda`}
                  disabled={snap.tick > 0}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setGuess(value === "" ? undefined : Number(value));
                  }}
                >
                  <option value="">{ui("ui.race.guess.none")}</option>
                  {view.runners.map((r) => (
                    <option key={r.lane} value={r.lane}>
                      {ui("ui.race.guess.option", { lane: r.lane + 1, name: r.name })}
                    </option>
                  ))}
                </select>
              </span>
              <p className={s.guessHint} id={`${idPrefix}-pronostico-ayuda`}>
                {uiAt(detail, "ui.race.guess.hint")}
              </p>
            </div>
          )}
          <Controls
            clock={clock}
            snap={snap}
            idPrefix={idPrefix}
            onFinish={() => {
              clock.seek(clock.end);
              setRevealed(true);
            }}
          />
          <LaneChart view={view} clock={clock} mode={mode} />
          <TerrainLegend view={view} />
          <FlagLegend reserve={view.layout.reserve !== null} />
        </div>
      </Panel>
      <LivePanel view={view} tick={snap.tick} idPrefix={idPrefix} />
      {revealed ? (
        <Results view={view} clock={clock} idPrefix={idPrefix} guess={guess} />
      ) : (
        <p className={s.pending}>{ui("ui.race.pending")}</p>
      )}
    </div>
  );
}

/** A v3 race: her position over the side view of the flight. */
function FlightFrame({ log, labels, idPrefix, onReveal }: RaceReplayProps) {
  const view = useMemo(() => raceView(log, labels), [log, labels]);
  return (
    <div className={s.viewer}>
      {view.player && <PlayerPosition player={view.player} labels={labels} idPrefix={idPrefix} />}
      <FlightReplay log={log} labels={labels} idPrefix={idPrefix} onReveal={onReveal} />
    </div>
  );
}

/** A distinct key per log, so a new race starts a new replay (clock, reveal, selection). */
const logKeys = new WeakMap<RaceLog, number>();
let nextKey = 1;
function keyOf(log: RaceLog): number {
  let key = logKeys.get(log);
  if (key === undefined) {
    key = nextKey++;
    logKeys.set(log, key);
  }
  return key;
}

export type ReplayProps = {
  log: RaceLog;
  /** Names and liveries; the page's content by default. */
  labels?: RaceLabels | undefined;
  /** Prefix of the controls' ids, unique on the page. */
  idPrefix: string;
  /** Told once the result shows, so the screen can show what it would have given away. */
  onReveal?: (() => void) | undefined;
};

/** The replay of `log`, started afresh for every new log. */
export function Replay({ log, labels, idPrefix, onReveal }: ReplayProps) {
  // ruleset v3: the side view of the flight; v1 and v2 keep the lane chart
  if (isFlightLog(log) && log.frames !== undefined)
    return (
      <FlightFrame
        key={keyOf(log)}
        log={log}
        labels={labels ?? pageLabels()}
        idPrefix={idPrefix}
        onReveal={onReveal}
      />
    );
  return (
    <RaceReplay
      key={keyOf(log)}
      log={log}
      labels={labels ?? pageLabels()}
      idPrefix={idPrefix}
      onReveal={onReveal}
    />
  );
}
