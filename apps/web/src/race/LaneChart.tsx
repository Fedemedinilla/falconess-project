import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Livery } from "../ui/Livery";
import type { ReplayClock } from "./clock";
import s from "./LaneChart.module.css";
import { sampleAt } from "./playback";
import { CHART, type ChartGeometry, chartGeometry, xAt } from "./track";
import { badgeAt, type RaceView } from "./view";
import { metres } from "./words";

/** The width of an element, kept up to date (a sensible default before the first layout). */
function useWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, fallback]);
  return width;
}

/** The runner's glyph: a chevron in her livery, with what the flags draw around it (CSS). */
function RunnerGlyph({ player }: { player: boolean }) {
  return (
    <>
      <path className={s.trail} d="M-7 -4 L-26 0 L-7 4 Z" />
      <path className={s.draft} d="M-20 -5 h8 M-20 5 h8" />
      <ellipse className={s.shadow} cx="0" cy="9" rx="7" ry="1.6" />
      <g className={s.body}>
        <circle className={s.pulse} r="10" />
        <circle className={s.heat} r="12" />
        <path
          className={cx(s.chevron, player && s.playerChevron)}
          d={player ? "M-9 -8 L7 0 L-9 8 L-5 0 Z" : "M-7 -6 L6 0 L-7 6 L-4 0 Z"}
        />
        <path className={s.crack} d="M-8 -1 l3 3 l3 -5 l3 5 l3 -3" />
        <path className={s.stall} d="M-5 -5 L5 5 M5 -5 L-5 5" />
      </g>
    </>
  );
}

function Header({ view, g }: { view: RaceView; g: ChartGeometry }) {
  const { layout } = view;
  const bottom = g.lanesY + view.runners.length * g.laneH;
  const last = layout.scale.length - 1;
  return (
    <g>
      {layout.phases.map((p, i) => (
        <g key={p.name}>
          {i > 0 && (
            <line
              className={s.phaseLine}
              x1={xAt(g, p.from)}
              x2={xAt(g, p.from)}
              y1={0}
              y2={bottom}
            />
          )}
          <text className={s.phaseName} x={xAt(g, p.from) + 4} y={g.phaseY}>
            {ui(`ui.race.phase.${p.name}`)}
          </text>
        </g>
      ))}
      {layout.segments.map((seg) => (
        <rect
          key={seg.index}
          className={s.segment}
          x={xAt(g, seg.from)}
          y={g.stripY}
          width={Math.max(1, xAt(g, seg.to) - xAt(g, seg.from))}
          height={g.stripH}
          style={{ fill: `var(--seg-${seg.type})` }}
        >
          <title>
            {ui("ui.race.track.segment", {
              n: seg.index + 1,
              type: gameText(`segment.${seg.type}`),
              from: metres(seg.startMm),
              to: metres(seg.endMm),
            })}
          </title>
        </rect>
      ))}
      {layout.segments.slice(1).map((seg) => (
        <line
          key={seg.index}
          className={s.segmentEdge}
          x1={xAt(g, seg.from)}
          x2={xAt(g, seg.from)}
          y1={g.stripY}
          y2={g.stripY + g.stripH}
        />
      ))}
      {layout.scale.map((m, i) => (
        <g key={m.mm}>
          <line
            className={s.scaleTick}
            x1={xAt(g, m.at)}
            x2={xAt(g, m.at)}
            y1={g.stripY + g.stripH}
            y2={g.stripY + g.stripH + 4}
          />
          <text
            className={s.scaleText}
            x={xAt(g, m.at)}
            y={g.scaleY}
            textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
          >
            {i === last ? ui("ui.race.track.metres", { m: metres(m.mm) }) : metres(m.mm)}
          </text>
        </g>
      ))}
      {layout.reserve && (
        <g>
          <line
            className={s.reserveLine}
            x1={xAt(g, layout.reserve.at)}
            x2={xAt(g, layout.reserve.at)}
            y1={g.stripY - 2}
            y2={bottom}
          />
          <text
            className={s.reserveText}
            x={xAt(g, layout.reserve.at) - 3}
            y={g.phaseY}
            textAnchor="end"
          >
            {ui("ui.race.track.reserve")}
          </text>
        </g>
      )}
      <line className={s.finishLine} x1={g.x1} x2={g.x1} y1={g.stripY - 2} y2={bottom} />
    </g>
  );
}

export type LaneChartProps = {
  view: RaceView;
  clock: ReplayClock;
};

/**
 * The race as a lane chart: the course as a strip of segments colored by terrain, with its phases,
 * the 60 m sprint reserve and the finish; one lane per runner. The runners move by the clock's
 * frames (no React render per frame) between the sampled positions of the log.
 */
export function LaneChart({ view, clock }: LaneChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef, 640);
  const g = useMemo(() => chartGeometry(width, view.runners.length), [width, view.runners.length]);
  const runnerRefs = useRef<(SVGGElement | null)[]>([]);
  const badgeRefs = useRef<(SVGTextElement | null)[]>([]);
  const pinRefs = useRef<(SVGGElement | null)[][]>([]);

  useEffect(() => {
    const L = Math.max(1, view.log.geometry.lengthMm);
    const shown = view.runners.map(() => ({ transform: "", flags: "", badge: "", anchor: "" }));
    const pinShown = view.runners.map((r) => r.pins.map(() => false));
    const placeText = new Map(
      view.byPlace.map((r) => [r.lane, ui("ui.race.badge.place", { place: r.result.place })]),
    );
    return clock.onFrame((t) => {
      const samples = sampleAt(view.log, t, view.spans);
      view.runners.forEach((runner, i) => {
        const sample = samples[i];
        const el = runnerRefs.current[i];
        const last = shown[i];
        if (!sample || !el || !last) return;
        const x = xAt(g, sample.posMm / L);
        const y = g.lanesY + i * g.laneH + g.laneH / 2;
        const transform = `translate(${x.toFixed(1)} ${y})`;
        if (transform !== last.transform) {
          el.setAttribute("transform", transform);
          last.transform = transform;
        }
        const flags = sample.finished ? "finished" : [...sample.flags].join(" ");
        if (flags !== last.flags) {
          el.setAttribute("data-flags", flags);
          last.flags = flags;
        }
        el.style.setProperty("--duty", sample.boostDuty.toFixed(2));
        const badge = badgeRefs.current[i];
        if (badge) {
          const text = sample.finished
            ? (placeText.get(runner.lane) ?? "")
            : badgeAt(runner.badges, t);
          const right = x > g.x0 + (g.x1 - g.x0) * 0.62;
          const anchor = right ? "end" : "start";
          if (text !== last.badge) {
            badge.textContent = text;
            last.badge = text;
          }
          badge.setAttribute("x", (right ? x - 14 : x + 12).toFixed(1));
          if (anchor !== last.anchor) {
            badge.setAttribute("text-anchor", anchor);
            last.anchor = anchor;
          }
        }
        runner.pins.forEach((pin, k) => {
          const visible = t >= pin.tick;
          const pinEl = pinRefs.current[i]?.[k];
          const was = pinShown[i];
          if (!pinEl || !was || was[k] === visible) return;
          pinEl.style.visibility = visible ? "visible" : "hidden";
          was[k] = visible;
        });
      });
    });
  }, [clock, g, view]);

  const label = ui("ui.race.track.label", {
    course: view.labels.courseName(view.log.courseId),
    m: metres(view.log.geometry.lengthMm),
    n: view.runners.length,
  });

  return (
    <div className={s.chart} style={{ "--head-h": `${CHART.headH}px`, "--lane-h": `${g.laneH}px` }}>
      <ol className={s.labels} aria-label={ui("ui.race.track.lanes")}>
        {view.runners.map((r) => (
          <li key={r.lane} className={cx(s.label, r.isPlayer && s.playerLabel)} title={r.name}>
            <span className={s.laneNo}>{r.lane + 1}</span>
            {r.livery ? (
              <Livery palette={r.livery} size="sm" />
            ) : (
              <span className={s.noLivery} aria-hidden="true" />
            )}
            <span className={s.labelName}>{r.name}</span>
          </li>
        ))}
      </ol>
      <div className={s.plot} ref={plotRef}>
        <svg
          className={s.svg}
          width={g.width}
          height={g.height}
          viewBox={`0 0 ${g.width} ${g.height}`}
          role="img"
          aria-label={label}
        >
          {view.runners.map((r, i) => (
            <rect
              key={r.lane}
              className={cx(s.lane, i % 2 === 1 && s.laneAlt, r.isPlayer && s.lanePlayer)}
              x={0}
              y={g.lanesY + i * g.laneH}
              width={g.width}
              height={g.laneH}
            />
          ))}
          <Header view={view} g={g} />
          {view.runners.map((r, i) => (
            <line
              key={r.lane}
              className={s.baseline}
              x1={g.x0}
              x2={g.x1}
              y1={g.lanesY + i * g.laneH + g.laneH / 2}
              y2={g.lanesY + i * g.laneH + g.laneH / 2}
            />
          ))}
          {view.runners.map((r, i) =>
            r.pins.map((pin, k) => (
              <g
                key={`${r.lane}-${pin.id}`}
                ref={(el) => {
                  const row = pinRefs.current[i] ?? [];
                  row[k] = el;
                  pinRefs.current[i] = row;
                }}
                className={cx(s.pin, s[`pin-${pin.kind}`])}
                transform={`translate(${xAt(g, pin.posMm / Math.max(1, view.log.geometry.lengthMm)).toFixed(1)} ${g.lanesY + (i + 1) * g.laneH - 4})`}
                style={{ visibility: "hidden" }}
              >
                <title>{pin.text}</title>
                <path d="M0 -4 L4 0 L0 4 L-4 0 Z" />
              </g>
            )),
          )}
          {view.runners.map((r, i) => (
            <text
              key={r.lane}
              ref={(el) => {
                badgeRefs.current[i] = el;
              }}
              className={s.badge}
              y={g.lanesY + i * g.laneH + g.laneH / 2 + 4}
            />
          ))}
          {view.runners.map((r, i) => (
            <g
              key={r.lane}
              ref={(el) => {
                runnerRefs.current[i] = el;
              }}
              className={cx(s.runner, r.isPlayer && s.player)}
              style={{
                "--livery-primary": r.livery?.primary ?? "var(--ink-3)",
                "--livery-secondary": r.livery?.secondary ?? "var(--surface)",
              }}
            >
              <RunnerGlyph player={r.isPlayer} />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
