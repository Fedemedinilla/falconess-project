import {
  activeOverlays,
  altitudeAt,
  energyAt,
  type FlightModel,
  type FlightMoment,
  type FlightOverlay,
  type FlightTrack,
  flightAhead,
  flightModel,
  flightMoments,
  flightOverlays,
  hpAt,
  type MomentCat,
  orderAt,
  FLIGHT_PHASE as PH,
  phaseAt,
  positionAt,
  type RaceLabels,
  rowOf,
  slowWindows,
  speedAt,
} from "@falconess/race-view";
import type { RaceLog } from "@falconess/schema";
import { distanceOfLength, flightOf, getRuleset } from "@falconess/sim";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { formatFixed, formatSeconds } from "../../text/format";
import { gameText, ui } from "../../text/ui";
import { cx } from "../../ui/cx";
import { mediaList } from "../../ui/useMedia";
import { ReplayClock } from "../clock";
import s from "../RaceViewer.module.css";
import { Results } from "../Results";
import { raceView } from "../view";
import f from "./FlightReplay.module.css";
import { FlightStage, POS_COLOR, STYLE_COLOR, type StageState } from "./stage";
import {
  bandName,
  countdownCaption,
  kmh,
  momentText,
  overlayCaption,
  stageWords,
  styleName,
} from "./words";

/** `<b>` of an es.json caption as bold, the rest as text (no HTML from strings). */
export function rich(text: string): ReactNode {
  return text.split(/(<b>.*?<\/b>)/g).map((part, k) =>
    part.startsWith("<b>") ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
      <b key={k}>{part.slice(3, -4)}</b>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
      <Fragment key={k}>{part}</Fragment>
    ),
  );
}

const SPEEDS = [0.5, 1, 2, 4] as const;
const CATS: MomentCat[] = ["all", "tk", "fi", "dv", "pa"];
const MOMENT_COLOR: Record<MomentCat, string> = {
  all: "#ffc83d",
  tk: "#35e0ff",
  fi: "#ff5468",
  dv: "#b48cff",
  pa: "#78e6ff",
};

/** The race's distance on its ruleset (v3: Sprint, Milla, Media, Larga), or null. */
function distanceOf(log: RaceLog): string | null {
  try {
    const F = flightOf(getRuleset(log.rulesetVersion));
    return F === null ? null : distanceOfLength(F, log.geometry.lengthMm);
  } catch {
    return null;
  }
}

/** The HUD of the runner she follows at `row` (log numbers only). */
function Hud({
  log,
  model,
  t,
  row,
  idPrefix,
}: {
  log: RaceLog;
  model: FlightModel;
  t: FlightTrack;
  row: number;
  idPrefix: string;
}) {
  const v = kmh(speedAt(t, row));
  const b = rowOf(t.band, row);
  const ph = phaseAt(t, row);
  const boosting = rowOf(t.boosting, row) !== 0;
  const tk = [...t.events].reverse().find((e) => e.kind === "takeoff" && e.tick <= row);
  let vx = ui(
    b > 0 || ph === PH.jump
      ? "ui.flight.hud.speed.air"
      : boosting
        ? "ui.flight.hud.speed.boost"
        : "ui.flight.hud.speed.ground",
  );
  let vTone = "";
  if (ph === PH.dive) [vx, vTone] = [ui("ui.flight.hud.speed.dive"), f.good ?? ""];
  else if (ph === PH.surge) [vx, vTone] = [ui("ui.flight.hud.speed.surge"), f.good ?? ""];
  else if (ph === PH.climb && tk?.kind === "takeoff" && tk.vAfterMms < tk.vMms)
    [vx, vTone] = [
      ui("ui.flight.hud.speed.launch", { v: formatFixed(tk.vMms - tk.vAfterMms, 1000, 1) }),
      f.bad ?? "",
    ];
  else if (ph === PH.stumble) [vx, vTone] = [ui("ui.flight.hud.speed.noDive"), f.bad ?? ""];
  const alt = altitudeAt(t, row);
  const altText =
    ph === PH.jump
      ? ui("ui.flight.hud.alt.jump")
      : bandName(Math.round(Math.max(0, Math.min(3, alt))));
  const altX =
    ph === PH.climb
      ? ui("ui.flight.hud.alt.climb")
      : ph === PH.dive
        ? ui("ui.flight.hud.alt.dive")
        : ph === PH.falling
          ? ui("ui.flight.hud.alt.falling")
          : ph === PH.knocked
            ? ui("ui.flight.hud.alt.knocked")
            : b > 0
              ? ui("ui.flight.hud.alt.line", { line: ui(`ui.flight.line.${rowOf(t.line, row)}`) })
              : ph === PH.jump
                ? ui("ui.flight.hud.alt.inJump")
                : ui("ui.flight.hud.alt.none");
  const energyMax = Math.max(1, (log.entries[t.lane]?.energy ?? 100) * 1000);
  const en = Math.max(0, Math.min(100, (100 * energyAt(t, row)) / energyMax));
  // air
  let air = "—";
  let airX = ui(ph === PH.jump ? "ui.flight.hud.air.jump" : "ui.flight.hud.air.ground");
  let airTone = "";
  if (b > 0 || ph === PH.dive) {
    if (rowOf(t.dirty, row))
      [air, airX, airTone] = [
        ui("ui.flight.hud.air.dirty"),
        ui("ui.flight.hud.air.dirty.x"),
        f.bad ?? "",
      ];
    else if (rowOf(t.drafting, row))
      [air, airX] = [ui("ui.flight.hud.air.tow"), ui("ui.flight.hud.air.tow.x")];
    else if (tk?.kind === "takeoff") {
      air = ui("ui.flight.hud.air.pct", {
        sign: tk.airPm >= 0 ? "+" : "−",
        pct: formatFixed(Math.abs(tk.airPm), 10, 1),
      });
      airX = ui(tk.airPm >= 0 ? "ui.flight.hud.air.clean" : "ui.flight.hud.air.rough");
      airTone = (tk.airPm >= 0 ? f.good : f.bad) ?? "";
    }
  }
  // body: the hit of the last second, else what the bar means
  const hp = Math.max(0, Math.min(100, hpAt(t, row) / 10));
  const hit = [...t.events]
    .reverse()
    .find((e) => e.kind === "hpHit" && e.tick <= row && row - e.tick <= 30);
  const hpMax = Math.max(1, log.derived[t.lane]?.hpMax ?? 1);
  const exhausted = log.results.find((r) => r.lane === t.lane)?.exhausted === true;
  let hpX = ui("ui.flight.hud.hp.idle");
  let hpTone = "";
  let hitW = 0;
  if (hit?.kind === "hpHit") {
    hpX = ui("ui.flight.hud.hp.hit", {
      hp: Math.max(1, Math.round(hit.hp / 1000)),
      cause: ui(`ui.flight.hit.${hit.cause}`),
    });
    hpTone = f.bad ?? "";
    hitW = ((100 * hit.hp) / hpMax) * (1 - (row - hit.tick) / 30);
  } else if (t.finishRow <= row && exhausted) hpX = ui("ui.flight.hud.hp.exhausted");
  else if (hp <= 0) [hpX, hpTone] = [ui("ui.flight.hud.hp.empty"), f.bad ?? ""];
  // the kick on low hp: her last sprintPlan
  const kp = [...t.events].reverse().find((e) => e.kind === "sprintPlan" && e.tick <= row);
  let kick = ui("ui.flight.hud.kick.none");
  let kickX = ui("ui.flight.hud.kick.wait");
  let kickW = 100;
  let kickTone = "";
  if (kp?.kind === "sprintPlan") {
    const k = kp.kickPm ?? 1000;
    kickW = Math.min(100, k / 10);
    kick =
      k >= 1000
        ? ui("ui.flight.hud.kick.full")
        : ui("ui.flight.hud.kick.pct", { pct: Math.round(k / 10) });
    kickX =
      k >= 1000
        ? ui("ui.flight.hud.kick.full.x")
        : k === 0
          ? ui("ui.flight.hud.kick.zero.x")
          : ui("ui.flight.hud.kick.short.x", { pct: Math.round((100 * kp.hp) / hpMax) });
    kickTone = (k >= 1000 ? f.good : f.bad) ?? "";
  }
  void model;
  return (
    <section className={f.hud} aria-label={ui("ui.flight.hud.aria")} id={`${idPrefix}-vuelo-hud`}>
      <div>
        <b>{ui("ui.flight.hud.speed")}</b>
        <span>
          {v}
          <small className={f.unit}>{ui("ui.flight.hud.kmh")}</small>
        </span>
        <em className={vTone}>{vx}</em>
      </div>
      <div>
        <b>{ui("ui.flight.hud.alt")}</b>
        <span data-alt={b}>{altText}</span>
        <em>{altX}</em>
      </div>
      <div>
        <b>{ui("ui.flight.hud.energy")}</b>
        <span>{Math.round(en)}</span>
        <div className={f.bar}>
          <i style={{ width: `${en}%` }} />
        </div>
      </div>
      <div>
        <b>{ui("ui.flight.hud.air")}</b>
        <span>{air}</span>
        <em className={airTone}>{airX}</em>
      </div>
      <div className={f.hp}>
        <b>{ui("ui.flight.hud.hp")}</b>
        <div className={f.bar} aria-hidden="true">
          <u style={{ left: `${hp}%`, width: `${Math.max(0, Math.min(100 - hp, hitW))}%` }} />
          <i className={cx(hp < 15 && f.low)} style={{ width: `${hp}%` }} />
        </div>
        <span>{ui("ui.flight.hud.hp.pct", { pct: Math.round(hp) })}</span>
        <em className={hpTone} id={`${idPrefix}-vuelo-fisico`}>
          {hpX}
        </em>
      </div>
      <div className={f.kick}>
        <b>{ui("ui.flight.hud.kick")}</b>
        <div className={cx(f.bar, kickW >= 100 && f.full)} aria-hidden="true">
          <i style={{ width: `${kickW}%` }} />
          <s />
        </div>
        <span id={`${idPrefix}-vuelo-remate`}>{kick}</span>
        <em className={kickTone}>{kickX}</em>
      </div>
    </section>
  );
}

/** The track's profile with the field's flight plans (hers bold), for the pre-race card. */
function Profile({ log, model, focus }: { log: RaceLog; model: FlightModel; focus: number }) {
  const len = model.lengthMm;
  const w = 320;
  const hgt = 86;
  const gy = 62;
  const xAt = (mm: number) => 4 + ((w - 8) * mm) / len;
  const fin = xAt(model.finalStartMm);
  const planPath = (lane: number, mine: boolean) =>
    (log.derived[lane]?.flightPlan ?? []).map((p) => {
      const a = xAt(p.aMm);
      const b = xAt(p.bMm);
      const yb = gy - p.band * 14;
      return (
        <path
          key={`${lane}-${p.aMm}`}
          d={`M${a} ${gy} L${a + (mine ? 6 : 4)} ${yb} L${b - 4} ${yb} L${b} ${gy}`}
          fill="none"
          stroke={POS_COLOR[log.entries[lane]?.position ?? "pack"].c}
          strokeOpacity={mine ? 1 : 0.38}
          strokeWidth={mine ? 3 : 1.2}
          strokeLinejoin="round"
        />
      );
    });
  return (
    <svg
      className={f.profile}
      viewBox={`0 0 ${w} ${hgt}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ui("ui.flight.pre.profile")}
    >
      {log.geometry.segments.map((sg) => (
        <rect
          key={sg.startMm}
          x={xAt(sg.startMm)}
          y={gy}
          width={Math.max(1, xAt(sg.endMm) - xAt(sg.startMm))}
          height={9}
          style={{ fill: `var(--seg-${sg.type})` }}
        />
      ))}
      <line x1={fin} y1={10} x2={fin} y2={gy + 9} stroke="#ffc83d" strokeDasharray="3 3" />
      {model.tracks.filter((t) => t.lane !== focus).map((t) => planPath(t.lane, false))}
      {planPath(focus, true)}
    </svg>
  );
}

export type FlightReplayProps = {
  log: RaceLog;
  labels: RaceLabels;
  idPrefix: string;
  onReveal?: (() => void) | undefined;
};

/**
 * A ruleset v3 race replayed as the side view of its flight (the approved design7 mock): the
 * stage with the pre-race card, play, the time slider with her moments, speed and slow motion,
 * her HUD (speed, band, energy, air, body and kick), whom to follow and the moments list. Once
 * the replay reaches the finish (or «Ir a la meta»), the classification and the «por qué».
 */
export function FlightReplay({ log, labels, idPrefix, onReveal }: FlightReplayProps) {
  const model = useMemo(() => flightModel(log), [log]);
  const view = useMemo(() => raceView(log, labels), [log, labels]);
  const [resultsClock] = useState(() => new ReplayClock(view.end));
  useEffect(() => () => resultsClock.dispose(), [resultsClock]);
  const reduced = useMemo(
    () => mediaList("(prefers-reduced-motion: reduce)")?.matches ?? false,
    [],
  );
  const [focus, setFocus] = useState(() => view.player?.lane ?? log.results[0]?.lane ?? 0);
  const [playing, setPlaying] = useState(false);
  const [preOpen, setPreOpen] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [slowOn, setSlowOn] = useState(!reduced);
  const [cat, setCat] = useState<MomentCat>("all");
  const [row, setRow] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<FlightStage | null>(null);
  const live = useRef({
    row: 0,
    playing: false,
    speed: 1 as number,
    slow: !reduced,
    slowBudget: 0,
    hitstop: 0,
    shake: 0,
    shakeAmp: 0,
    now: 0,
  });

  const overlays = useMemo<FlightOverlay[]>(
    () => (model ? flightOverlays(log, model, focus) : []),
    [log, model, focus],
  );
  const ahead = useMemo(() => flightAhead(log, focus), [log, focus]);
  const slow = useMemo(() => (model ? slowWindows(model, focus) : []), [model, focus]);
  const moments = useMemo<FlightMoment[]>(() => (model ? flightMoments(model) : []), [model]);
  const styleOf = (lane: number) => model?.tracks[lane]?.style ?? "neutral";
  // biome-ignore lint/correctness/useExhaustiveDependencies: words depend on the log only
  const words = useMemo(() => stageWords(log, labels, styleOf), [log, labels, model]);

  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  useEffect(() => {
    if (revealed) {
      resultsClock.seek(resultsClock.end);
      revealRef.current?.();
    }
  }, [revealed, resultsClock]);

  // the stage and its loop
  const stateRef = useRef({ overlays, ahead, slow, focus });
  stateRef.current = { overlays, ahead, slow, focus };
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !model) return;
    const stage = new FlightStage(cv, log, model, words);
    stageRef.current = stage;
    const L = live.current;
    let last = performance.now();
    let raf = 0;
    let shown = -1;
    let shownAt = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) L.now += dt;
      if (L.shake > 0) L.shake = Math.max(0, L.shake - dt);
      const st = stateRef.current;
      if (L.playing) {
        if (L.hitstop > 0) L.hitstop -= dt;
        else {
          let rate = 15 * L.speed;
          const inSlow = L.slow && !reduced && st.slow.some(([a, b]) => L.row >= a && L.row <= b);
          if (inSlow && L.slowBudget < 4) {
            rate *= 0.4;
            L.slowBudget += dt;
          }
          const prev = L.row;
          L.row = Math.min(model.rows, L.row + dt * rate);
          const her = model.tracks[st.focus];
          const imp = her?.events.find(
            (e) => e.kind === "dive" && e.tick > prev && e.tick <= L.row,
          );
          if (imp?.kind === "dive" && !reduced) {
            L.hitstop = 0.08;
            L.shake = 0.15;
            L.shakeAmp =
              (her?.style === "lance" ? 5 : 3.5) * Math.max(0.6, Math.min(1.3, imp.gainMms / 6500));
            L.row = imp.tick;
          }
          if (L.row >= model.rows) {
            L.playing = false;
            setPlaying(false);
            setRevealed(true);
          }
        }
      }
      const state: StageState = {
        focus: st.focus,
        row: L.row,
        now: L.now,
        reduced,
        overlays: st.overlays,
        ahead: st.ahead,
        shake: L.shake,
        shakeAmp: L.shakeAmp,
      };
      stage.draw(state, dt);
      // the HUD and the slider follow at most ten times a second
      if (L.row !== shown && (!L.playing || now - shownAt >= 100)) {
        shown = L.row;
        shownAt = now;
        setRow(L.row);
      }
      raf = requestAnimationFrame(frame);
    };
    stage.draw(
      {
        focus: stateRef.current.focus,
        row: L.row,
        now: 0,
        reduced,
        overlays: stateRef.current.overlays,
        ahead: stateRef.current.ahead,
        shake: 0,
        shakeAmp: 0,
      },
      -1,
    );
    raf = requestAnimationFrame(frame);
    const onResize = () => stage.layout();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      stageRef.current = null;
    };
  }, [log, model, words, reduced]);

  if (!model) return null;
  const her = model.tracks[focus] ?? model.tracks[0];
  if (!her) return null;

  const seek = (r: number) => {
    const L = live.current;
    L.row = Math.max(0, Math.min(model.rows, r));
    L.hitstop = 0;
    L.shake = 0;
    setRow(L.row);
  };
  const play = (on: boolean) => {
    const L = live.current;
    if (on) {
      setPreOpen(false);
      if (L.row >= model.rows) {
        L.row = 0;
        L.slowBudget = 0;
      }
    }
    L.playing = on;
    setPlaying(on);
  };
  const follow = (lane: number) => setFocus(lane);
  const toFinish = () => {
    play(false);
    seek(model.rows);
    setRevealed(true);
  };

  const ord = orderAt(model, row);
  const place = ord.indexOf(her.lane) + 1;
  const entry = log.entries[her.lane];
  const runner = view.runners.find((r) => r.lane === her.lane);
  const done = her.finishRow <= row;
  const left = Math.max(0, Math.round((model.lengthMm - positionAt(her, row)) / 1000));
  const inSlow = slowOn && !reduced && playing && slow.some(([a, b]) => row >= a && row <= b);
  const act = activeOverlays(overlays, row);
  const nx = ahead.find((a) => a.tick > row && a.tick - row <= 45);
  const capFrom = [act.banner, act.chip]
    .filter((o): o is FlightOverlay => o !== null && overlayCaption(o) !== "")
    .sort((a, b) => b.t0 - a.t0)[0];
  const caption = nx
    ? countdownCaption(nx, Math.max(0, Math.round((nx.atMm - positionAt(her, row)) / 1000)))
    : capFrom
      ? overlayCaption(capFrom)
      : "";
  const distance = distanceOf(log);
  const course = labels.courseName(log.courseId);
  const lengthM = Math.round(model.lengthMm / 1000);
  const plan = log.derived[her.lane]?.flightPlan ?? [];
  const shownMoments = moments.filter((m) => cat === "all" || m.cat === cat);
  const posName = (lane: number) => labels.positionName(log.entries[lane]?.position ?? "pack");

  return (
    <div
      className={f.flight}
      id={`${idPrefix}-vuelo`}
      data-row={Math.round(row)}
      data-banner={act.banner?.id ?? ""}
      data-focus={focus}
    >
      <div className={f.stage}>
        <canvas
          ref={canvasRef}
          className={f.canvas}
          id={`${idPrefix}-vuelo-lienzo`}
          role="img"
          aria-label={ui("ui.flight.stage.now", {
            lane: her.lane + 1,
            name: runner?.name ?? "",
            place,
            band: bandName(rowOf(her.band, row)),
          })}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const lane = stageRef.current?.laneAt(e.clientX - r.left, e.clientY - r.top) ?? -1;
            if (lane >= 0) follow(lane);
          }}
        />
        <div className={f.hudtop} aria-hidden="true">
          <div>
            <span className={cx(f.pill, f.big)}>
              {ui("ui.flight.place", { place, n: model.tracks.length })}
            </span>
            <span className={f.pill}>
              {done
                ? ui("ui.flight.arrived", { place: her.place })
                : ui("ui.flight.left", { m: left })}
            </span>
          </div>
          <div>
            {inSlow && <span className={cx(f.pill, f.slowPill)}>{ui("ui.flight.slow.pill")}</span>}
            <span className={f.pill}>{ui("ui.flight.clock", { s: formatSeconds(row) })}</span>
          </div>
        </div>
        {preOpen && (
          <section
            className={f.pre}
            aria-labelledby={`${idPrefix}-vuelo-previa`}
            id={`${idPrefix}-vuelo-tarjeta`}
          >
            <p className={f.kicker}>{ui("ui.flight.pre.kicker")}</p>
            <h3 className={f.preTitle} id={`${idPrefix}-vuelo-previa`}>
              {ui("ui.flight.pre.title", { course, m: lengthM })}
            </h3>
            <Profile log={log} model={model} focus={her.lane} />
            <dl className={f.her}>
              <dt>{ui("ui.flight.pre.follow")}</dt>
              <dd>
                {ui("ui.flight.pre.her", {
                  lane: her.lane + 1,
                  name: runner?.name ?? "",
                  position: posName(her.lane),
                  letter: entry?.positionAptitude ?? "—",
                  style: styleName(her.style),
                })}
              </dd>
              {distance && (
                <>
                  <dt>{ui("ui.flight.pre.distance")}</dt>
                  <dd>
                    {entry?.distanceAptitude
                      ? ui("ui.flight.pre.distance.value", {
                          distance: ui(`ui.flight.distance.${distance}`),
                          letter: entry.distanceAptitude,
                        })
                      : ui("ui.flight.pre.distance.none", {
                          distance: ui(`ui.flight.distance.${distance}`),
                        })}
                  </dd>
                </>
              )}
              {entry?.passive && (
                <>
                  <dt>{ui("ui.flight.pre.passive")}</dt>
                  <dd>{gameText(`skill.${entry.passive}`)}</dd>
                </>
              )}
              <dt>{ui("ui.flight.pre.plan")}</dt>
              <dd>
                {plan.length === 0
                  ? ui("ui.flight.pre.plan.none")
                  : plan
                      .map((p) =>
                        ui(p.cornisa ? "ui.flight.pre.plan.cornisa" : "ui.flight.pre.plan.item", {
                          a: Math.round(p.aMm / 1000),
                          b: Math.round(p.bMm / 1000),
                          band: bandName(p.band).toLocaleLowerCase("es"),
                        }),
                      )
                      .join("; ")}
              </dd>
            </dl>
            <fieldset className={f.field}>
              <legend className="visually-hidden">{ui("ui.flight.pre.pick")}</legend>
              {model.tracks.map((t) => {
                const P = POS_COLOR[log.entries[t.lane]?.position ?? "pack"];
                return (
                  <button
                    key={t.lane}
                    type="button"
                    aria-pressed={t.lane === focus}
                    onClick={() => follow(t.lane)}
                    id={`${idPrefix}-vuelo-previa-c${t.lane + 1}`}
                  >
                    <span>
                      <span
                        style={{ color: t.lane === focus ? "inherit" : P.c }}
                        aria-hidden="true"
                      >
                        {P.glyph}
                      </span>{" "}
                      C{t.lane + 1}
                    </span>
                    <small>{styleName(t.style)}</small>
                  </button>
                );
              })}
            </fieldset>
            <button
              type="button"
              className={f.go}
              id={`${idPrefix}-vuelo-salida`}
              onClick={() => play(true)}
            >
              {ui("ui.flight.pre.go")}
            </button>
          </section>
        )}
      </div>

      <div className={f.ctrl}>
        <button
          type="button"
          className={f.ib}
          id={`${idPrefix}-vuelo-inicio`}
          aria-label={ui("ui.flight.restart")}
          onClick={() => {
            play(false);
            seek(0);
            live.current.slowBudget = 0;
            setPreOpen(true);
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3a7 7 0 1 1-6.6 9.3l1.9-.6A5 5 0 1 0 10 5v3L5.5 4.5 10 1z" />
          </svg>
        </button>
        <button
          type="button"
          className={f.ib}
          id={`${idPrefix}-reproducir`}
          aria-label={ui(playing ? "ui.flight.pause" : "ui.flight.play")}
          onClick={() => play(!playing)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            {playing ? (
              <>
                <rect x="4" y="3" width="4" height="14" />
                <rect x="12" y="3" width="4" height="14" />
              </>
            ) : (
              <path d="M5 3l12 7-12 7z" />
            )}
          </svg>
        </button>
        <div className={f.scrub}>
          <input
            type="range"
            id={`${idPrefix}-tiempo`}
            min={0}
            max={model.rows}
            step={1}
            value={Math.round(row)}
            aria-label={ui("ui.race.controls.slider")}
            onChange={(e) => {
              setPreOpen(false);
              seek(Number(e.currentTarget.value));
            }}
          />
          <div className={f.marks} aria-hidden="true">
            {moments
              .filter((m) => m.lane === focus)
              .map((m) => (
                <i
                  key={`${m.tick}-${m.id}`}
                  style={{
                    left: `${(100 * m.tick) / model.rows}%`,
                    background: MOMENT_COLOR[m.cat],
                  }}
                />
              ))}
          </div>
        </div>
      </div>
      <div className={f.row2}>
        <fieldset className={f.seg}>
          <legend className="visually-hidden">{ui("ui.flight.speed")}</legend>
          {SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={speed === v}
              id={`${idPrefix}-vuelo-x${String(v).replace(".", "")}`}
              onClick={() => {
                setSpeed(v);
                live.current.speed = v;
              }}
            >
              {ui("ui.flight.speed.n", { n: formatFixed(v * 10, 10, v < 1 ? 1 : 0) })}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className={f.tgl}
          aria-pressed={slowOn}
          id={`${idPrefix}-vuelo-lenta`}
          onClick={() => {
            setSlowOn(!slowOn);
            live.current.slow = !slowOn;
          }}
        >
          {ui("ui.flight.slow")}
        </button>
        <button type="button" id={`${idPrefix}-meta`} onClick={toFinish} className={f.tgl}>
          {ui("ui.flight.toFinish")}
        </button>
      </div>
      <p className={f.cap} aria-live="polite" id={`${idPrefix}-vuelo-texto`}>
        {rich(caption)}
      </p>

      <Hud log={log} model={model} t={her} row={row} idPrefix={idPrefix} />

      <h3 className={f.h}>{ui("ui.flight.follow")}</h3>
      <fieldset className={f.foc}>
        <legend className="visually-hidden">{ui("ui.flight.follow")}</legend>
        {model.tracks.map((t) => {
          const P = POS_COLOR[log.entries[t.lane]?.position ?? "pack"];
          return (
            <button
              key={t.lane}
              type="button"
              aria-pressed={t.lane === focus}
              aria-label={ui("ui.flight.follow.aria", {
                lane: t.lane + 1,
                position: posName(t.lane),
                style: styleName(t.style),
              })}
              id={`${idPrefix}-seguir-c${t.lane + 1}`}
              onClick={() => follow(t.lane)}
            >
              <span>
                <span style={{ color: t.lane === focus ? "inherit" : P.c }} aria-hidden="true">
                  {P.glyph}
                </span>{" "}
                C{t.lane + 1}
              </span>
              <small style={{ color: t.lane === focus ? "inherit" : STYLE_COLOR[t.style] }}>
                {styleName(t.style)}
              </small>
            </button>
          );
        })}
      </fieldset>

      <h3 className={f.h}>{ui("ui.flight.mom.title")}</h3>
      <fieldset className={cx(f.seg, f.cats)}>
        <legend className="visually-hidden">{ui("ui.flight.mom.filter")}</legend>
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            id={`${idPrefix}-momentos-${c}`}
          >
            {ui(`ui.flight.mom.cat.${c}`)}
          </button>
        ))}
      </fieldset>
      <ul className={f.mom} id={`${idPrefix}-momentos`}>
        {shownMoments.length === 0 && <li className={f.empty}>{ui("ui.flight.mom.empty")}</li>}
        {shownMoments.map((m) => {
          const { name, detail } = momentText(m);
          const P = POS_COLOR[log.entries[m.lane]?.position ?? "pack"];
          return (
            <li key={`${m.tick}-${m.lane}-${m.id}`} data-moment={m.id}>
              <button
                type="button"
                className={cx(m.lane === focus && f.mine)}
                style={{ ["--c" as string]: MOMENT_COLOR[m.cat] }}
                onClick={() => {
                  setFocus(m.lane);
                  setPreOpen(false);
                  seek(m.tick - m.lead);
                  play(true);
                  canvasRef.current?.scrollIntoView({
                    block: "nearest",
                    behavior: reduced ? "auto" : "smooth",
                  });
                }}
              >
                <span className={f.t}>{ui("ui.flight.clock", { s: formatSeconds(m.tick) })}</span>
                <span className={f.n}>
                  {name}
                  {m.lane === focus && (
                    <span className={f.tag}>{ui("ui.flight.mom.following")}</span>
                  )}
                </span>
                <span className={f.w}>
                  <span style={{ color: P.c }} aria-hidden="true">
                    {P.glyph}
                  </span>{" "}
                  {ui("ui.flight.mom.who", { lane: m.lane + 1, position: posName(m.lane) })} —{" "}
                  {detail}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {revealed ? (
        <Results view={view} clock={resultsClock} idPrefix={idPrefix} />
      ) : (
        <p className={s.pending}>{ui("ui.race.pending")}</p>
      )}
    </div>
  );
}
