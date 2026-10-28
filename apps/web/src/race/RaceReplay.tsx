import { contentLabels, type RaceLabels } from "@falconess/race-view";
import type { RaceLog } from "@falconess/schema";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getContent } from "../content/load";
import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Controls } from "./Controls";
import { ReplayClock } from "./clock";
import { type ChartMode, LaneChart } from "./LaneChart";
import { LivePanel } from "./LivePanel";
import s from "./RaceViewer.module.css";
import { Results } from "./Results";
import { raceView } from "./view";
import { metres } from "./words";

let defaultLabels: RaceLabels | undefined;

/** Game names and liveries from the page's content. */
export function pageLabels(): RaceLabels {
  defaultLabels ??= contentLabels(getContent());
  return defaultLabels;
}

/** The flags the chart draws, with the glyph each one uses. */
function FlagLegend() {
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
    </ul>
  );
}

export type RaceReplayProps = {
  log: RaceLog;
  labels: RaceLabels;
  /** Prefix of the controls' ids, unique on the page. */
  idPrefix: string;
};

/**
 * One race replayed from its log: the lane chart with its controls, the live order, and once the
 * replay reaches the finish (or "Ir a la meta"), the classification, the "why" of each runner, her
 * events, the timeline and the splits.
 */
function RaceReplay({ log, labels, idPrefix }: RaceReplayProps) {
  const view = useMemo(() => raceView(log, labels), [log, labels]);
  const [clock] = useState(() => new ReplayClock(view.end));
  useEffect(() => () => clock.dispose(), [clock]);
  const snap = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<ChartMode>("pack");
  useEffect(() => {
    if (snap.atEnd) setRevealed(true);
  }, [snap.atEnd]);

  const g = log.geometry;
  const meta = ui("ui.race.track.meta", {
    m: metres(g.lengthMm),
    biome: labels.biomeName(log.courseId, g.biome),
    seed: log.seed,
    n: view.runners.length,
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
          <FlagLegend />
        </div>
      </Panel>
      <LivePanel view={view} tick={snap.tick} />
      {revealed ? (
        <Results view={view} clock={clock} idPrefix={idPrefix} />
      ) : (
        <div className={s.pending}>
          <p>{ui("ui.race.pending")}</p>
        </div>
      )}
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
};

/** The replay of `log`, started afresh for every new log. */
export function Replay({ log, labels, idPrefix }: ReplayProps) {
  return (
    <RaceReplay key={keyOf(log)} log={log} labels={labels ?? pageLabels()} idPrefix={idPrefix} />
  );
}
