import { useMemo, useState } from "react";
import { useDetail } from "../app/explain";
import { type BriefUiKey, uiAt } from "../text/brief";
import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { ExplainSwitch } from "../ui/ExplainSwitch";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { RUNNER_FLAGS, sampleAt, standings } from "./playback";
import s from "./RaceViewer.module.css";
import type { RaceView, RunnerView } from "./view";
import { metres, mps, secsMilli, withSign } from "./words";

/** The four gauges: their emoji and the legend line of each. */
const GAUGES: readonly { icon: IconName; legend: BriefUiKey }[] = [
  { icon: "race.hp", legend: "ui.race.gauge.legend.hp" },
  { icon: "race.energy", legend: "ui.race.gauge.legend.energy" },
  { icon: "race.heat", legend: "ui.race.gauge.legend.heat" },
  { icon: "race.durability", legend: "ui.race.gauge.legend.durability" },
];

function Gauge({
  label,
  icon,
  value,
  max,
  tone,
}: {
  label: string;
  icon: IconName;
  value: number;
  max: number;
  tone: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={s.gauge} title={`${label} ${Math.round(pct)} %`}>
      <span className={s.gaugeLabel}>
        <Icon name={icon} />
        {label}
      </span>
      <span className={s.gaugeTrack} aria-hidden="true">
        <span className={cx(s.gaugeFill, s[tone])} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** Where a runner stands: at the start, in front, level, metres behind, or her finish gap. */
function gapText(
  tick: number,
  order: number,
  finished: boolean,
  gapMm: number | null,
  behindMilli: number | null,
): string {
  if (finished) {
    if (order === 1) return ui("ui.race.live.finished");
    if (behindMilli === null || behindMilli === 0) return ui("ui.race.margin.deadHeat");
    return ui("ui.race.live.behindTime", { s: withSign(secsMilli(behindMilli, 2)) });
  }
  if (tick === 0) return ui("ui.race.live.start");
  if (gapMm === null || gapMm < 500)
    return ui(order === 1 ? "ui.race.live.leader" : "ui.race.live.level");
  return ui("ui.race.live.behind", { m: metres(gapMm, 0) });
}

export type LivePanelProps = {
  view: RaceView;
  /** Race time in whole ticks. */
  tick: number;
  /** Prefix of the controls' ids, unique on the page. */
  idPrefix: string;
};

/** The order at the moment the replay shows: gap, speed, gauges and what each runner is doing. */
export function LivePanel({ view, tick, idPrefix }: LivePanelProps) {
  // on a phone the order folds to the first three and the player (CSS); this unfolds it
  const [folded, setFolded] = useState(true);
  const rows = useMemo(() => {
    const samples = sampleAt(view.log, tick, view.spans);
    return standings(view.log, samples);
  }, [view, tick]);
  const byLane = useMemo(() => new Map(view.runners.map((r) => [r.lane, r])), [view]);
  const switchId = `${idPrefix}-en-vivo-explicacion`;
  const [detail, setDetail] = useDetail(switchId);
  return (
    <Panel
      title={ui("ui.race.live.title")}
      meta={ui("ui.race.live.meta")}
      actions={
        <ExplainSwitch
          id={switchId}
          detail={detail}
          onChange={setDetail}
          name={ui("ui.race.live.title")}
        />
      }
      flush
      className={s.live}
    >
      <ol className={cx(s.liveList, folded && s.liveFolded)}>
        {rows.map(({ sample, order, gapMm, behindMilli }) => {
          const r: RunnerView | undefined = byLane.get(sample.lane);
          if (!r) return null;
          const flags = RUNNER_FLAGS.filter((f) => sample.flags.has(f));
          return (
            <li key={sample.lane} className={cx(s.liveRow, r.isPlayer && s.liveRowPlayer)}>
              <span className={s.liveOrder}>{order}</span>
              <span className={s.liveName}>
                {r.livery ? (
                  <Livery palette={r.livery} size="sm" />
                ) : (
                  <span className={s.noLivery} aria-hidden="true" />
                )}
                <span className={s.liveNameText}>{r.name}</span>
              </span>
              <span className={s.liveGap}>
                {gapText(tick, order, sample.finished, gapMm, behindMilli)}
              </span>
              <span className={s.liveSpeed}>
                {sample.finished ? "" : ui("ui.race.live.speed", { v: mps(sample.vMms, 1) })}
              </span>
              <span className={s.liveGauges}>
                <Gauge
                  label={ui("ui.race.gauge.hp")}
                  icon="race.hp"
                  value={sample.hp}
                  max={r.max.hp}
                  tone="toneHp"
                />
                <Gauge
                  label={ui("ui.race.gauge.energy")}
                  icon="race.energy"
                  value={sample.energy}
                  max={r.max.energy}
                  tone="toneEnergy"
                />
                <Gauge
                  label={ui("ui.race.gauge.heat")}
                  icon="race.heat"
                  value={sample.heat}
                  max={r.max.heat}
                  tone="toneHeat"
                />
                <Gauge
                  label={ui("ui.race.gauge.durability")}
                  icon="race.durability"
                  value={sample.durability}
                  max={r.max.durability}
                  tone="toneDurability"
                />
              </span>
              <span className={s.liveFlags}>
                {flags.map((f) => (
                  <span key={f} className={cx(s.flag, s[`flag-${f}`])}>
                    <Icon name={`flag.${f}`} />
                    {ui(`ui.race.flag.${f}`)}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {rows.length > 3 && (
        <div className={s.liveMore}>
          <Button
            id={`${idPrefix}-en-vivo-todas`}
            size="sm"
            aria-expanded={!folded}
            onClick={() => setFolded((f) => !f)}
          >
            {folded ? ui("ui.race.live.all", { n: rows.length }) : ui("ui.race.live.top")}
          </Button>
        </div>
      )}
      <ul className={cx(s.gaugeLegend, detail === "brief" && s.gaugeLegendBrief)}>
        {GAUGES.map((g) => (
          <li key={g.icon}>
            <Icon name={g.icon} />
            {uiAt(detail, g.legend)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
