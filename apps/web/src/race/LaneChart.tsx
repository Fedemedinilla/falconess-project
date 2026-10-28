import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Livery } from "../ui/Livery";
import type { ReplayClock } from "./clock";
import s from "./LaneChart.module.css";
import { sampleAt } from "./playback";
import {
  type ChartGeometry,
  type ChartWindow,
  chartGeometry,
  packWindow,
  tickStepMm,
  xAt,
  xIn,
} from "./track";
import { badgeAt, type RaceView } from "./view";
import { metres } from "./words";

/** How the lanes frame the race: the whole course, or the stretch where the runners are. */
export type ChartMode = "pack" | "course";

/** Distance marks under the lanes: a fixed pool, moved and relabelled every frame. */
const TICK_POOL = 12;

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
  const chevron = player ? "M-9 -8 L7 0 L-9 8 L-5 0 Z" : "M-7 -6 L6 0 L-7 6 L-4 0 Z";
  return (
    <>
      <path className={s.trail} d="M-7 -4 L-26 0 L-7 4 Z" />
      <path className={s.draft} d="M-20 -5 h8 M-20 5 h8" />
      <ellipse className={s.shadow} cx="0" cy="9" rx="7" ry="1.6" />
      <g className={s.body}>
        <circle className={s.pulse} r="10" />
        <circle className={s.heat} r="12" />
        <path className={s.chevronEdge} d={chevron} />
        <path className={cx(s.chevron, player && s.playerChevron)} d={chevron} />
        <path className={s.crack} d="M-8 -1 l3 3 l3 -5 l3 5 l3 -3" />
        <path className={s.stall} d="M-5 -5 L5 5 M5 -5 L-5 5" />
      </g>
    </>
  );
}

/** The whole course on top: phases, terrain, distances, the 60 m reserve and the finish. */
function Header({ view, g }: { view: RaceView; g: ChartGeometry }) {
  const { layout } = view;
  const last = layout.scale.length - 1;
  const headBottom = g.scaleY - 9;
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
              y2={headBottom}
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
            y2={g.stripY + g.stripH + 2}
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
      <line
        className={s.finishLine}
        x1={g.x1}
        x2={g.x1}
        y1={g.stripY - 2}
        y2={g.stripY + g.stripH + 2}
      />
    </g>
  );
}

export type LaneChartProps = {
  view: RaceView;
  clock: ReplayClock;
  mode: ChartMode;
};

/**
 * The race as a lane chart: the whole course on top (terrain, phases, the 60 m sprint reserve and
 * the finish), then one lane per runner over the stretch the view frames, with that stretch's
 * terrain and distances underneath. The runners move by the clock's frames (no React render per
 * frame) between the sampled positions of the log.
 */
export function LaneChart({ view, clock, mode }: LaneChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef, 640);
  const g = useMemo(() => chartGeometry(width, view.runners.length), [width, view.runners.length]);
  const runnerRefs = useRef<(SVGGElement | null)[]>([]);
  const badgeRefs = useRef<(SVGTextElement | null)[]>([]);
  const pinRefs = useRef<(SVGGElement | null)[][]>([]);
  const bandRefs = useRef<(SVGRectElement | null)[]>([]);
  const markRefs = useRef<(SVGLineElement | null)[]>([]);
  const tickRefs = useRef<(SVGGElement | null)[]>([]);
  const windowRef = useRef<SVGRectElement>(null);

  const { layout } = view;
  const geometry = view.log.geometry;
  // the lines the lanes cross: phase boundaries, the 60 m reserve and the finish
  const marks = useMemo(
    () => [
      { key: "middle", mm: geometry.startEndMm, kind: "phase" },
      { key: "final", mm: geometry.finalStartMm, kind: "phase" },
      ...(layout.reserve ? [{ key: "reserve", mm: layout.reserve.mm, kind: "reserve" }] : []),
      { key: "finish", mm: geometry.lengthMm, kind: "finish" },
    ],
    [geometry, layout],
  );

  useEffect(() => {
    const L = Math.max(1, view.log.geometry.lengthMm);
    const shown = view.runners.map(() => ({ transform: "", flags: "", badge: "", anchor: "" }));
    const placeText = new Map(
      view.byPlace.map((r) => [r.lane, ui("ui.race.badge.place", { place: r.result.place })]),
    );
    const maxTicks = Math.max(2, Math.floor((g.x1 - g.x0) / 70));
    let span: number | undefined;
    let lastT = Number.NaN;
    return clock.onFrame((t) => {
      const samples = sampleAt(view.log, t, view.spans);
      let win: ChartWindow = { a: 0, b: L };
      if (mode === "pack") {
        const target = packWindow(
          samples.map((x) => x.posMm),
          L,
        );
        // ease the zoom while playing; a jump (seek, first frame) snaps to it
        span =
          span === undefined || Math.abs(t - lastT) > 20
            ? target.span
            : span + (target.span - span) * 0.15;
        win = packWindow(
          samples.map((x) => x.posMm),
          L,
          span,
        );
      }
      lastT = t;
      const xOf = (mm: number) => xIn(g, win, mm);
      const inside = (x: number) => x >= g.x0 - 30 && x <= g.x1 + 30;

      const box = windowRef.current;
      if (box) {
        const left = xAt(g, win.a / L);
        const right = xAt(g, win.b / L);
        box.setAttribute("x", left.toFixed(1));
        box.setAttribute("width", Math.max(2, right - left).toFixed(1));
        box.style.visibility = mode === "pack" ? "visible" : "hidden";
      }
      layout.segments.forEach((seg, k) => {
        const rect = bandRefs.current[k];
        if (!rect) return;
        const x0 = Math.max(g.x0 - 30, xOf(seg.startMm));
        const x1 = Math.min(g.x1 + 30, xOf(seg.endMm));
        rect.setAttribute("x", x0.toFixed(1));
        rect.setAttribute("width", Math.max(0, x1 - x0).toFixed(1));
      });
      marks.forEach((m, k) => {
        const line = markRefs.current[k];
        if (!line) return;
        const x = xOf(m.mm);
        line.setAttribute("x1", x.toFixed(1));
        line.setAttribute("x2", x.toFixed(1));
        line.style.visibility = inside(x) ? "visible" : "hidden";
      });
      const step = tickStepMm(win.b - win.a, maxTicks);
      const first = Math.ceil(Math.max(0, win.a) / step) * step;
      tickRefs.current.forEach((tick, k) => {
        if (!tick) return;
        const mm = first + k * step;
        const x = xOf(mm);
        const visible = mm <= Math.min(L, win.b) && inside(x);
        tick.style.visibility = visible ? "visible" : "hidden";
        if (!visible) return;
        tick.setAttribute("transform", `translate(${x.toFixed(1)} 0)`);
        const text = tick.lastElementChild;
        const label = metres(mm);
        if (text && text.textContent !== label) text.textContent = label;
      });

      view.runners.forEach((runner, i) => {
        const sample = samples[i];
        const el = runnerRefs.current[i];
        const last = shown[i];
        if (!sample || !el || !last) return;
        const x = xOf(sample.posMm);
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
          const pinEl = pinRefs.current[i]?.[k];
          if (!pinEl) return;
          const px = xOf(pin.posMm);
          const visible = t >= pin.tick && inside(px);
          pinEl.style.visibility = visible ? "visible" : "hidden";
          if (visible)
            pinEl.setAttribute(
              "transform",
              `translate(${px.toFixed(1)} ${g.lanesY + (i + 1) * g.laneH - 5})`,
            );
        });
      });
    });
  }, [clock, g, view, mode, layout, marks]);

  const label = ui("ui.race.track.label", {
    course: view.labels.courseName(view.log.courseId),
    m: metres(view.log.geometry.lengthMm),
    n: view.runners.length,
  });
  const lanesBottom = g.lanesY + view.runners.length * g.laneH;

  return (
    <div className={s.chart} style={{ "--head-h": `${g.lanesY}px`, "--lane-h": `${g.laneH}px` }}>
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
          <rect
            ref={windowRef}
            className={s.window}
            x={g.x0}
            y={g.stripY - 3}
            width={g.x1 - g.x0}
            height={g.stripH + 6}
          />
          {view.runners.map((r, i) => (
            <line
              key={r.lane}
              className={s.baseline}
              x1={0}
              x2={g.width}
              y1={g.lanesY + i * g.laneH + g.laneH / 2}
              y2={g.lanesY + i * g.laneH + g.laneH / 2}
            />
          ))}
          {marks.map((m, k) => (
            <line
              key={m.key}
              ref={(el) => {
                markRefs.current[k] = el;
              }}
              className={cx(s.mark, s[`mark-${m.kind}`])}
              y1={g.lanesY}
              y2={g.bandY + g.bandH}
            />
          ))}
          {layout.segments.map((seg) => (
            <rect
              key={seg.index}
              ref={(el) => {
                bandRefs.current[seg.index] = el;
              }}
              className={s.band}
              y={g.bandY}
              height={g.bandH}
              style={{ fill: `var(--seg-${seg.type})` }}
            />
          ))}
          {Array.from({ length: TICK_POOL }, (_, k) => k).map((k) => (
            <g
              key={`tick-${k}`}
              ref={(el) => {
                tickRefs.current[k] = el;
              }}
              style={{ visibility: "hidden" }}
            >
              <line className={s.scaleTick} y1={g.bandY + g.bandH} y2={g.bandY + g.bandH + 4} />
              <text className={s.scaleText} y={g.ticksY} textAnchor="middle" />
            </g>
          ))}
          <line className={s.footLine} x1={0} x2={g.width} y1={lanesBottom} y2={lanesBottom} />
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
