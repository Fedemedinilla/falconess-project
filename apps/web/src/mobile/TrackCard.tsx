import type { StatName, TrackDemand } from "@falconess/schema";
import { useEffect, useRef } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import type { StripPiece, TrackCardView, TrackFeature } from "./track";

const STAT_GLYPH: Readonly<Record<StatName, GlyphName>> = {
  agility: "bolt",
  stamina: "heart",
  technique: "cross",
  courage: "flame",
  intelligence: "eye",
};

/** The strip's drawing units: 1000 wide (per-mille of the track), 40 high, ground at 30. */
const H = 40;
const G = 30;

function Piece({ p }: { p: StripPiece }) {
  const x0 = p.fromPm;
  const w = p.widthPm;
  const x1 = x0 + w;
  const ns = { vectorEffect: "non-scaling-stroke" } as const;
  switch (p.type) {
    case "flat":
      return (
        <line className={p.final ? s.tsFinal : s.tsFlat} x1={x0} x2={x1} y1={G} y2={G} {...ns} />
      );
    case "climb":
      return <polygon className={s.tsHill} points={`${x0},${G} ${x1},8 ${x1},${G}`} {...ns} />;
    case "descent":
      return <polygon className={s.tsHill} points={`${x0},8 ${x1},${G} ${x0},${G}`} {...ns} />;
    case "jump": {
      const lip = x0 + w * 0.35;
      return (
        <g className={s.tsJump}>
          <polygon points={`${x0},${G} ${lip},20 ${lip},${G}`} {...ns} />
          <path className={s.tsArc} d={`M${lip} 20 Q${x0 + w * 0.7} 2 ${x1} ${G}`} {...ns} />
        </g>
      );
    }
    case "water": {
      const n = Math.max(2, Math.round(w / 18));
      let d = `M${x0} ${G}`;
      for (let i = 0; i < n; i++) {
        const a = x0 + (w * i) / n;
        const b = x0 + (w * (i + 1)) / n;
        d += ` Q${(a + b) / 2} ${i % 2 ? G + 6 : G - 6} ${b} ${G}`;
      }
      return (
        <g className={s.tsWater}>
          <rect x={x0} y={G - 4} width={w} height={10} />
          <path d={d} {...ns} />
        </g>
      );
    }
    case "curves": {
      const n = Math.max(2, Math.round(w / 22));
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const x = x0 + (w * i) / n;
        const y = i === 0 || i === n ? G : i % 2 ? G - 9 : G + 5;
        return `${x},${y}`;
      });
      return <polyline className={s.tsCurves} points={pts.join(" ")} {...ns} />;
    }
    case "canyon":
      return (
        <g className={s.tsCanyon}>
          <rect x={x0} y={10} width={w} height={H - 10} />
          <line x1={x0} x2={x1} y1={10} y2={10} {...ns} />
          <line x1={x0} x2={x1} y1={G} y2={G} {...ns} />
        </g>
      );
  }
}

/** The track drawn along its length: Saltos, Colinas, Bajadas, Terreno líquido, Curvas, Pasillo. */
export function TrackStrip({
  view,
  large = false,
  id,
}: {
  view: TrackCardView;
  large?: boolean;
  id?: string;
}) {
  const label = ui("ui.m.track.profile.aria", {
    course: gameText(view.nameKey),
    list: view.strip
      .map((p) => (p.final ? ui("ui.m.track.final") : gameText(`segment.${p.type}`)))
      .join(", "),
  });
  const ends = view.strip.at(-1)?.final === true;
  return (
    <div
      className={cx(s.tstrip, large && s.tstripL)}
      role="img"
      aria-label={label}
      id={id}
      data-pieces={view.strip.map((p) => p.type).join(" ")}
    >
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {view.strip.map((p) => (
          <Piece key={p.fromPm} p={p} />
        ))}
      </svg>
      <span className={cx(s.tsFlag, ends && s.tsFlagOn)} aria-hidden="true">
        <Glyph name="flag" size={large ? 18 : 14} weight={2.6} />
      </span>
    </div>
  );
}

/** «Pide: AGI B · RES C» with stat icons: the stats a track asks for, each with its letter, nothing else. */
export function TrackDemands({
  demands,
  long = false,
  id,
}: {
  demands: readonly TrackDemand[];
  long?: boolean;
  id?: string;
}) {
  if (demands.length === 0) return null;
  const aria = ui("ui.m.track.asks.aria", {
    list: demands
      .map((d) => ui("ui.m.track.demand", { stat: gameText(`stat.${d.stat}`), letter: d.letter }))
      .join(", "),
  });
  return (
    <div className={cx(s.dm, long && s.dmLong)} id={id} role="img" aria-label={aria}>
      <span className={s.dmK} aria-hidden="true">
        {ui("ui.m.track.asks")}
      </span>
      {demands.map((d) => (
        <span
          key={d.stat}
          className={s.dmC}
          data-stat={d.stat}
          data-letter={d.letter}
          aria-hidden="true"
        >
          <Glyph name={STAT_GLYPH[d.stat]} size={long ? 18 : 14} weight={2.4} />
          <span className={s.dmS}>
            {long ? gameText(`stat.${d.stat}`) : ui(`ui.stat.abbr.${d.stat}`)}
          </span>
          <span className={s.dmL}>{d.letter}</span>
        </span>
      ))}
    </div>
  );
}

/** The next goal's track in the week menu: its strip, its distance class and what it asks. */
export function TrackCardButton({
  view,
  id,
  onOpen,
  disabled = false,
}: {
  view: TrackCardView;
  id: string;
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={s.tcard}
      id={id}
      data-course={view.courseId}
      aria-label={ui("ui.m.track.open", { course: gameText(view.nameKey) })}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onOpen}
    >
      <TrackStrip view={view} id={`${id}-perfil`} />
      <span className={s.tcRow}>
        {view.distance && (
          <span className={s.tcDist} data-distance={view.distance}>
            {ui(`ui.flight.distance.${view.distance}`)}
          </span>
        )}
        <TrackDemands demands={view.demands} id={`${id}-pide`} />
      </span>
    </button>
  );
}

const FEATURE_GLYPH: Readonly<Record<TrackFeature["kind"], GlyphName>> = {
  climb: "climb",
  descent: "descent",
  jump: "jump",
  water: "water",
  curves: "curves",
  canyon: "canyon",
  final: "flag",
};

/** The full track card: profile, its features, distance, what it asks and one line of character. */
export function TrackSheet({
  view,
  open,
  onClose,
}: {
  view: TrackCardView;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-pista-dialogo"
      aria-labelledby="m-pista-titulo"
      data-course={view.courseId}
      onClose={onClose}
    >
      <div className={s.dl}>
        <p className={s.tsCap}>{ui("ui.m.track.cap")}</p>
        <h2 className={s.dlTitle} id="m-pista-titulo">
          {gameText(view.nameKey)}
        </h2>
        <p className={s.tsFlavor} id="m-pista-sabor">
          {gameText(view.flavorKey)}
        </p>
        <TrackStrip view={view} large id="m-pista-hoja-perfil" />
        <ul className={s.tsLegend} id="m-pista-rasgos">
          {view.features.map((f) => (
            <li key={f.kind} data-kind={f.kind}>
              <Glyph name={FEATURE_GLYPH[f.kind]} size={18} weight={2.2} />
              {f.kind === "final" ? ui("ui.m.track.final") : gameText(`segment.${f.kind}`)}
              {f.count > 1 && <span className={s.tsCount}>×{f.count}</span>}
            </li>
          ))}
        </ul>
        {view.distance && (
          <p className={s.tsDistance} id="m-pista-distancia" data-distance={view.distance}>
            {ui("ui.m.track.distance", {
              distance: ui(`ui.flight.distance.${view.distance}`),
              m: view.lengthM,
            })}
          </p>
        )}
        <TrackDemands demands={view.demands} long id="m-pista-hoja-pide" />
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-pista-cerrar"
          onClick={onClose}
        >
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
