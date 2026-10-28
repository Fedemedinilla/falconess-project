import {
  crossingMilliTicks,
  secondsPerColumn,
  TIMELINE_CELLS,
  type TimelineCell,
  timelineCells,
  timelineColumns,
  type WhyModel,
  whyModel,
} from "@falconess/race-view";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { formatFixed } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import { Table } from "../ui/Table";
import type { ReplayClock } from "./clock";
import s from "./RaceViewer.module.css";
import { cellRuns, type RaceView, type RunnerView } from "./view";
import {
  factor,
  finishMargin,
  finishTime,
  metres,
  modesText,
  mps,
  planSummary,
  secs,
  secsMilli,
  sinkText,
  sinkTone,
  termText,
  uiPlural,
  units,
  withSign,
} from "./words";

function RunnerCell({ r }: { r: RunnerView }) {
  return (
    <span className={s.runnerCell}>
      {r.livery ? (
        <Livery palette={r.livery} size="sm" />
      ) : (
        <span className={s.noLivery} aria-hidden="true" />
      )}
      <span>
        <span className={s.runnerCellName}>{r.name}</span>
        {r.isPlayer && <span className={s.youTag}>{ui("ui.race.you")}</span>}
        <span className={s.runnerCellKit}>{r.kit}</span>
      </span>
    </span>
  );
}

/** Place, runner, time and margin, from `results`. */
export function Classification({ view }: { view: RaceView }) {
  return (
    <Panel
      title={ui("ui.race.result.title")}
      meta={ui("ui.race.result.meta", { n: view.byPlace.length })}
      flush
    >
      <Table
        caption={ui("ui.race.result.title")}
        columns={[
          { key: "place", label: ui("ui.race.result.place"), align: "end" },
          { key: "runner", label: ui("ui.race.result.runner") },
          { key: "time", label: ui("ui.race.result.time"), align: "end" },
          { key: "margin", label: ui("ui.race.result.margin"), align: "end" },
        ]}
        rows={view.byPlace.map((r) => ({
          key: String(r.lane),
          highlight: r.isPlayer,
          cells: [
            <span key="p" className={s.place}>
              {ui("ui.race.place", { place: r.result.place })}
            </span>,
            <RunnerCell key="r" r={r} />,
            <span key="t" className={s.num}>
              {finishTime(r.result)}
            </span>,
            <span key="m" className={s.num}>
              {finishMargin(r.result)}
            </span>,
          ],
        }))}
      />
    </Panel>
  );
}

function WhyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.whyRow}>
      <dt className={s.whyLabel}>{label}</dt>
      <dd className={s.whyValue}>{children}</dd>
    </div>
  );
}

const PHASE_KEYS = ["start", "middle", "final"] as const;

function WhyBlock({ m, view }: { m: WhyModel; view: RaceView }) {
  const { labels } = view;
  const g = m.gains;
  const gains = [
    ui("ui.race.why.gains.boost", {
      start: secs(g.boostTicks[0] ?? 0),
      middle: secs(g.boostTicks[1] ?? 0),
      final: secs(g.boostTicks[2] ?? 0),
    }),
  ];
  if (g.pulses > 0) gains.push(uiPlural("ui.race.why.gains.pulses", g.pulses));
  if (g.draftTicks > 0) gains.push(ui("ui.race.why.gains.draft", { s: secs(g.draftTicks) }));
  if (g.skillsActivated > 0) gains.push(uiPlural("ui.race.why.gains.skills", g.skillsActivated));
  const terms = m.terms ?? [];
  return (
    <dl className={s.why}>
      <WhyRow label={ui("ui.race.why.phases")}>
        <span className={s.phases}>
          {m.phases.map((p, i) => (
            <span key={PHASE_KEYS[i]} className={s.phase}>
              <span className={s.phaseName}>{ui(`ui.race.phase.${PHASE_KEYS[i] ?? "start"}`)}</span>
              <span className={s.num}>{ui("ui.race.seconds", { s: secs(p.ticks, 2) })}</span>
              {p.deltaTicks !== null && (
                <span
                  className={cx(
                    s.delta,
                    p.deltaTicks > 0 && s.deltaWorse,
                    p.deltaTicks < 0 && s.deltaBetter,
                  )}
                >
                  {withSign(secs(p.deltaTicks, 2))}
                </span>
              )}
            </span>
          ))}
        </span>
      </WhyRow>
      <WhyRow label={ui("ui.race.why.gains")}>{gains.join(" · ")}</WhyRow>
      <WhyRow label={ui("ui.race.why.sinks")}>
        {m.sinks.length === 0 ? (
          ui("ui.race.why.sinks.none")
        ) : (
          <ul className={s.sinks}>
            {m.sinks.map((sink) => (
              <li key={sink.kind} className={cx(s.sink, s[`sink-${sinkTone(sink)}`])}>
                {sinkText(sink)}
              </li>
            ))}
          </ul>
        )}
      </WhyRow>
      {m.judgement && (
        <WhyRow label={ui("ui.race.why.judgement")}>
          {ui("ui.race.why.judgement.text", {
            pace: m.judgement.pace.map((pm) => (pm > 0 ? `+${pm}` : String(pm))).join(" / "),
            err:
              m.judgement.planErrPm > 0
                ? `+${m.judgement.planErrPm}`
                : String(m.judgement.planErrPm),
            window: m.judgement.planErrWindowPm,
          })}
        </WhyRow>
      )}
      {m.plan && (
        <WhyRow label={ui("ui.race.why.plan")}>
          {planSummary(m.plan.first, m.plan.last, m.plan.count)}
        </WhyRow>
      )}
      {m.modes.length > 0 && <WhyRow label={ui("ui.race.why.modes")}>{modesText(m.modes)}</WhyRow>}
      {terms.length > 0 && (
        <WhyRow label={ui("ui.race.why.terms")}>
          {terms.map((t) => termText(t, labels)).join(" · ")}
        </WhyRow>
      )}
      {m.segments && (
        <WhyRow label={ui("ui.race.why.segments")}>
          <span className={s.segRows}>
            {m.segments.map((seg) => (
              <span key={seg.index} className={s.segRow}>
                <span className={s.segChip} style={{ background: `var(--seg-${seg.type})` }} />
                <span className={s.segName}>{gameText(`segment.${seg.type}`)}</span>
                <span className={s.num}>
                  {seg.fPm === null
                    ? "—"
                    : ui("ui.race.why.segment", {
                        f: factor(seg.fPm),
                        v: mps(seg.cruiseMms ?? 0, 1),
                      })}
                </span>
              </span>
            ))}
          </span>
        </WhyRow>
      )}
      <WhyRow label={ui("ui.race.why.energy")}>
        {ui("ui.race.why.energy.text", {
          spent: units(m.energy.spent),
          lift: units(m.energy.lift),
          regen: units(m.energy.regen),
          refunded: units(m.energy.refunded),
          heat: units(m.energy.fromHeat),
          left: units(m.energy.left),
        })}
      </WhyRow>
      <WhyRow label={ui("ui.race.why.body")}>
        {ui("ui.race.why.body.text", {
          hp: formatFixed(m.body.hpEnd, 1000, 0),
          lost: units(m.body.durabilityLost),
          repaired: units(m.body.durabilityRepaired),
          end: units(m.body.durabilityEnd),
        })}
      </WhyRow>
      {m.skills.length > 0 && (
        <WhyRow label={ui("ui.race.why.skills")}>
          <ul className={s.skills}>
            {m.skills.map((sk) => (
              <li
                key={`${sk.skillId}-${sk.fired}-${sk.tick ?? ""}`}
                className={sk.fired ? s.skillHit : s.skillMiss}
              >
                {sk.p === null || sk.u === null
                  ? ui(sk.fired ? "ui.race.why.skill.hit" : "ui.race.why.skill.miss", {
                      skill: labels.skillName(sk.skillId),
                    })
                  : ui(sk.fired ? "ui.race.why.skill.hit.pu" : "ui.race.why.skill.miss.pu", {
                      skill: labels.skillName(sk.skillId),
                      p: sk.p,
                      u: sk.u,
                    })}
              </li>
            ))}
          </ul>
        </WhyRow>
      )}
    </dl>
  );
}

/** The runner the "why" and events panels start on: the player, else the winner. */
function defaultLane(view: RaceView): number {
  return view.player?.lane ?? view.byPlace[0]?.lane ?? 0;
}

function RunnerSelect({
  view,
  lane,
  onChange,
  id,
}: {
  view: RaceView;
  lane: number;
  onChange: (lane: number) => void;
  id: string;
}) {
  return (
    <span className={s.select}>
      <label htmlFor={id}>{ui("ui.race.why.runner")}</label>
      <select id={id} value={lane} onChange={(e) => onChange(Number(e.currentTarget.value))}>
        {view.byPlace.map((r) => (
          <option key={r.lane} value={r.lane}>
            {ui("ui.race.why.option", { place: r.result.place, name: r.name })}
          </option>
        ))}
      </select>
    </span>
  );
}

/** "Why" and events of one runner, side by side on a wide screen. */
export function RunnerReport({ view, idPrefix }: { view: RaceView; idPrefix: string }) {
  const [lane, setLane] = useState(() => defaultLane(view));
  const winner = view.byPlace[0];
  const r = view.runners.find((x) => x.lane === lane) ?? view.runners[0];
  const m = useMemo(
    () => (r && winner ? whyModel(view.log, r, winner) : undefined),
    [view, r, winner],
  );
  if (!r || !winner || !m) return null;
  const head = m.isWinner
    ? ui("ui.race.why.head.winner", { name: r.name, time: finishTime(r.result) })
    : m.gapMilli === null
      ? ui("ui.race.why.head.dnf", { place: r.result.place, name: r.name })
      : ui("ui.race.why.head", {
          place: r.result.place,
          name: r.name,
          time: finishTime(r.result),
          gap: withSign(secsMilli(m.gapMilli, 2)),
        });
  return (
    <div className={s.report}>
      <Panel
        title={ui("ui.race.why.title")}
        actions={
          <RunnerSelect view={view} lane={lane} onChange={setLane} id={`${idPrefix}-por-que`} />
        }
        className={s.whyPanel}
      >
        <p className={s.whyHead}>
          <RunnerCell r={r} />
          <span className={s.whyHeadText}>{head}</span>
        </p>
        <p className={s.hint}>{ui("ui.race.why.hint")}</p>
        <WhyBlock m={m} view={view} />
      </Panel>
      <Panel
        title={ui("ui.race.events.title")}
        meta={ui("ui.race.events.meta", { name: r.name })}
        flush
        className={s.eventsPanel}
      >
        {r.events.length === 0 ? (
          <p className={s.empty}>{ui("ui.race.events.none")}</p>
        ) : (
          <ol className={s.events}>
            {r.events.map((e) => (
              <li key={e.id} className={cx(s.event, s[`event-${e.item.kind}`])}>
                <span className={s.eventTime}>
                  {ui("ui.race.seconds", { s: secsMilli(e.milli, 1) })}
                </span>
                <span className={s.eventPos}>
                  {ui("ui.race.track.metres", { m: metres(e.posMm) })}
                </span>
                <span className={s.eventText}>{e.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

const CELL_TONE: Record<TimelineCell, string> = {
  finish: "cellFinish",
  dnf: "cellBad",
  stalled: "cellBad",
  broken: "cellBroken",
  airborne: "cellAir",
  overheated: "cellHot",
  exhausted: "cellTired",
  pulse: "cellPulse",
  boost: "cellBoost",
  lightBoost: "cellLight",
  drafting: "cellDraft",
  normal: "cellNormal",
  after: "cellAfter",
};

/**
 * The race over time, one row per runner and one cell per second (the CLI's timeline, from the
 * same cells): what each was doing when, with the replay's moment as a line across.
 */
export function TimelinePanel({ view, clock }: { view: RaceView; clock: ReplayClock }) {
  const seconds = secondsPerColumn(view.log.ticks, 240);
  const cols = timelineColumns(view.log, seconds);
  const rows = useMemo(
    () =>
      view.byPlace.map((r) => {
        const cells = timelineCells(view.log, r.lane, seconds);
        return { r, cells, runs: cellRuns(cells) };
      }),
    [view, seconds],
  );
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      clock.onFrame((t) => {
        headRef.current?.style.setProperty("--at", String(Math.min(1, t / (cols * seconds * 15))));
      }),
    [clock, cols, seconds],
  );
  const shown = TIMELINE_CELLS.filter(
    (c) => c !== "after" && rows.some((x) => x.cells.includes(c)),
  );
  return (
    <Panel title={ui("ui.race.timeline.title")} meta={uiPlural("ui.race.timeline.meta", seconds)}>
      <div className={s.timeline}>
        {rows.map(({ r, runs }) => (
          <div key={r.lane} className={cx(s.tlRow, r.isPlayer && s.tlRowPlayer)}>
            <span className={s.tlName} title={r.name}>
              {ui("ui.race.place", { place: r.result.place })} {r.name}
            </span>
            <div
              className={s.tlCells}
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {runs.map((run) => (
                <span
                  key={run.from}
                  className={cx(s.tlCell, s[CELL_TONE[run.cell]])}
                  style={{ gridColumn: `${run.from + 1} / span ${run.span}` }}
                />
              ))}
            </div>
          </div>
        ))}
        <div className={s.tlHead} ref={headRef} aria-hidden="true" />
      </div>
      <ul className={s.legend}>
        {shown.map((c) => (
          <li key={c} className={s.legendItem}>
            <span className={cx(s.legendSwatch, s[CELL_TONE[c]])} />
            {ui(`ui.race.timeline.cell.${c}`)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Seconds at each 10 % of the course (the CLI's crossing table). */
export function SplitsPanel({ view }: { view: RaceView }) {
  const marks = Array.from({ length: 10 }, (_, k) => k + 1);
  return (
    <Panel title={ui("ui.race.splits.title")} meta={ui("ui.race.splits.meta")} flush>
      <Table
        dense
        caption={ui("ui.race.splits.title")}
        columns={[
          { key: "runner", label: ui("ui.race.result.runner") },
          ...marks.map((k) => ({
            key: `m${k}`,
            label: ui("ui.race.splits.mark", { pct: k * 10 }),
            align: "end" as const,
          })),
        ]}
        rows={view.byPlace.map((r) => ({
          key: String(r.lane),
          highlight: r.isPlayer,
          cells: [
            <span key="n" className={s.splitName}>
              {r.name}
            </span>,
            ...crossingMilliTicks(view.log, r.lane).map((mt, i) => (
              <span key={marks[i]} className={s.num}>
                {mt === null ? "—" : secsMilli(mt, 1)}
              </span>
            )),
          ],
        }))}
      />
    </Panel>
  );
}

/** What the race leaves behind once it is over: who won, why, and when. */
export function Results({
  view,
  clock,
  idPrefix,
  guess,
}: {
  view: RaceView;
  clock: ReplayClock;
  idPrefix: string;
  /** The lane the tester picked to win before watching, if she did. */
  guess?: number | undefined;
}) {
  const player = view.player;
  const winner = view.byPlace[0];
  const guessed = view.runners.find((r) => r.lane === guess);
  return (
    <section className={s.results} aria-label={ui("ui.race.result.title")}>
      {guessed && winner && (
        <p className={cx(s.guess, guessed.lane === winner.lane ? s.guessRight : s.guessWrong)}>
          {guessed.lane === winner.lane
            ? ui("ui.race.guess.right", { name: guessed.name })
            : ui("ui.race.guess.wrong", { name: guessed.name, winner: winner.name })}
        </p>
      )}
      {player && (
        <p className={s.verdict}>
          <Pill
            tone={
              player.result.place === 1 ? "good" : player.result.place <= 3 ? "accent" : "neutral"
            }
            solid
          >
            {ui("ui.race.place", { place: player.result.place })}
          </Pill>
          <span>
            {ui("ui.race.verdict", {
              name: player.name,
              place: player.result.place,
              n: view.byPlace.length,
              time: finishTime(player.result),
            })}
          </span>
        </p>
      )}
      <Classification view={view} />
      <RunnerReport view={view} idPrefix={idPrefix} />
      <TimelinePanel view={view} clock={clock} />
      <SplitsPanel view={view} />
    </section>
  );
}
