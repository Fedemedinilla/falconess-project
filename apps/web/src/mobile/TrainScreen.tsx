import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import { type SimContext, statCap } from "@falconess/sim";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { type RunnerArt, runnerArt } from "./art";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import { crewInitials, statCells, type TrainingCard } from "./model";
import { StatStrip } from "./Parts";
import { placeScene } from "./sceneLayout";
import { playPing } from "./sfx";

const GLYPH: Readonly<Record<TrainingKind, GlyphName>> = {
  "train:agility": "wind",
  "train:stamina": "heart",
  "train:technique": "cross",
  "train:risk-flight": "dive",
  "train:simulator": "screen",
};

/** `train:risk-flight` → `m-entrenar-risk-flight`. */
export function trainButtonId(kind: TrainingKind): string {
  return `m-entrenar-${kind.slice("train:".length)}`;
}

/**
 * The training screen of the prototype: her chibi on stage with the chosen training's ribbon and
 * the crew's portrait (option 3: top right, its bond bar under it), the gains over her stats, and
 * the five round trainings. A tap chooses (nothing moves), a second tap on the chosen one trains;
 * «Fallo N %» hangs on the chosen button's top edge in its risk color (option 3).
 */
/**
 * A training's result on the training screen (owner 2026-11-11, like Umamusume's): what it came
 * to, the stats it moved and the skill points, and where the numbers count up from.
 */
export type TrainResult = {
  readonly kind: TrainingKind;
  readonly outcome: "success" | "boost" | "fail";
  readonly gains: readonly { readonly stat: StatName; readonly delta: number }[];
  readonly points: number;
  readonly from: Readonly<Record<StatName, number>>;
  readonly fromPoints: number;
};

/** When the stamp lands and each «+N» after it, ms. */
const STAMP_MS = 120;
const FIRST_POP_MS = 520;
const POP_STEP_MS = 300;
/** The result stays this long after its last «+N», then the week goes on (a tap goes sooner). */
const HOLD_MS = 1100;

export function TrainScreen({
  ctx,
  state,
  cards,
  selected,
  injured,
  onSelect,
  onConfirm,
  onBack,
  result,
  onResultDone,
}: {
  ctx: SimContext;
  state: SeasonState;
  cards: readonly TrainingCard[];
  selected: TrainingKind | undefined;
  injured: boolean;
  onSelect: (kind: TrainingKind) => void;
  onConfirm: (kind: TrainingKind) => void;
  onBack: () => void;
  /** Set right after a training ran: the screen plays its result, then calls `onResultDone`. */
  result?: TrainResult | undefined;
  onResultDone?: () => void;
}) {
  const art = runnerArt(state.falconessId);
  // the result's «+N», one after the other: the stats it moved, then the skill points
  const popOrder = result
    ? [
        ...result.gains.map((g) => ({ key: g.stat, delta: g.delta })),
        ...(result.points > 0 ? [{ key: "points", delta: result.points }] : []),
      ]
    : [];
  const delayOf = (i: number) => FIRST_POP_MS + i * POP_STEP_MS;
  const pops = result && {
    stats: Object.fromEntries(
      popOrder.flatMap((p, i) =>
        p.key === "points" ? [] : [[p.key, { delta: p.delta, delay: delayOf(i) }]],
      ),
    ),
    points:
      result.points > 0 ? { delta: result.points, delay: delayOf(popOrder.length - 1) } : undefined,
    from: result.from,
    fromPoints: result.fromPoints,
  };
  const resultEnd = delayOf(Math.max(0, popOrder.length - 1)) + HOLD_MS;
  // the pings climb with the «+N» (a failure has none)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per result
  useEffect(() => {
    if (!result) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (result.outcome !== "fail")
      popOrder.forEach((_, i) => {
        timers.push(setTimeout(() => playPing(i, popOrder.length), delayOf(i)));
      });
    timers.push(setTimeout(() => onResultDone?.(), resultEnd));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [result]);
  const card = result ? undefined : cards.find((c) => c.kind === selected);
  const crew = card?.crews[0];
  const maker = crew && ctx.content.getManufacturer(crew.manufacturer);
  const gains: Partial<Record<StatName, number>> | undefined = card
    ? Object.fromEntries(card.gains.map((g) => [g.stat, g.gain]))
    : undefined;
  const name = (kind: TrainingKind) => ui(`ui.m.train.name.${kind}`);
  const stageRef = useRef<HTMLDivElement>(null);
  const showing = result ? result.kind : selected;
  const active = showing !== undefined && art?.training?.[showing] ? showing : undefined;
  // which way the scene slides in: from the right when the player moved right
  const order = cards.map((c) => c.kind);
  const last = useRef<TrainingKind | undefined>(undefined);
  const from = last.current === undefined ? -1 : order.indexOf(last.current);
  const to = selected === undefined ? -1 : order.indexOf(selected);
  const dir = from === -1 || to === -1 || from === to ? 0 : to > from ? 1 : -1;
  useEffect(() => {
    last.current = selected;
  }, [selected]);

  return (
    <div className={s.screen}>
      <TrainingBackdrop art={art} active={active} dir={dir} stage={stageRef} />
      <div className={s.body}>
        <div className={s.stage} ref={stageRef}>
          <div className={cx(s.chibiLayer, active && s.chibiOff)} aria-hidden="true">
            <div className={s.glow} />
            {art && (
              <div className={s.runner}>
                <img src={art.chibi} alt="" draggable={false} />
              </div>
            )}
          </div>
          {result && (
            <div className={s.ribbon} id="m-cinta">
              <Glyph name={GLYPH[result.kind]} size={26} color="#1d1704" weight={2.4} />
              <div>
                <b>{name(result.kind)}</b>
              </div>
            </div>
          )}
          {result && (
            <p
              className={cx(s.stamp, result.outcome === "fail" && s.stampFail)}
              id="m-resultado"
              data-outcome={result.outcome}
              style={{ animationDelay: `${STAMP_MS}ms` }}
            >
              {ui(`ui.m.result.${result.outcome}`)}
            </p>
          )}
          {card && (
            <div className={s.ribbon} id="m-cinta">
              <Glyph name={GLYPH[card.kind]} size={26} color="#1d1704" weight={2.4} />
              <div>
                <small>{ui("ui.m.train.level", { n: card.level })}</small>
                <b>{name(card.kind)}</b>
              </div>
            </div>
          )}
          {crew && maker && (
            <div className={s.crewp} id="m-cuadrilla" data-crew={crew.manufacturer}>
              <div
                className={s.portrait}
                style={{ "--bc": maker.palette.primary, "--bc2": maker.palette.secondary }}
                aria-hidden="true"
              >
                {crewInitials(gameText(maker.textKey))}
                <span className={s.pbolt}>
                  <Glyph name="bolt" size={13} color="#1d1704" weight={2.8} />
                </span>
              </div>
              <div className={s.nm}>{gameText(maker.crew.textKey)}</div>
              <div
                className={s.seg}
                role="img"
                aria-label={ui("ui.m.crew.bond", { n: crew.bond, max: crew.bondMax })}
              >
                {Array.from({ length: crew.bondMax }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments of a bar
                  <i key={i} className={i < crew.bond ? s.segOn : undefined} />
                ))}
              </div>
              {card && card.crews.length > 1 && (
                <div className={s.more}>{ui("ui.m.crew.more", { n: card.crews.length - 1 })}</div>
              )}
            </div>
          )}
          {injured && (
            <p className={s.stageWarn} id="m-entrenar-lesion">
              <Glyph name="warn" size={18} />
              {ui("ui.m.train.injured")}
            </p>
          )}
        </div>
        <StatStrip
          stats={statCells(state, statCap(ctx.ruleset, state))}
          skillPoints={state.skillPoints}
          gains={gains ?? {}}
          pointsGain={card?.skillPoints}
          long
          {...(pops ? { pops } : {})}
        />
        <p className="visually-hidden" aria-live="polite">
          {card
            ? ui("ui.m.train.live", {
                name: name(card.kind),
                gains: card.gains.map((g) => `+${g.gain} ${gameText(`stat.${g.stat}`)}`).join(", "),
                fail: card.failPercent,
              })
            : ""}
        </p>
        <div className={cx(s.rounds, result && s.leaving)} inert={result ? true : undefined}>
          {cards.map((c) => {
            const sel = c.kind === selected;
            return (
              <div key={c.kind} className={s.rc}>
                <button
                  type="button"
                  id={trainButtonId(c.kind)}
                  className={cx(
                    s.rbtn,
                    c.risk === "high" && s.risky,
                    sel && s.sel,
                    c.boosted && s.boost,
                  )}
                  aria-pressed={sel}
                  data-risk={c.risk}
                  data-fail={c.failPm}
                  aria-label={ui(sel ? "ui.m.train.aria.sel" : "ui.m.train.aria", {
                    name: name(c.kind),
                    level: c.level,
                    fail: c.failPercent,
                    crews: c.crews
                      .map((k) =>
                        gameText(ctx.content.getManufacturer(k.manufacturer).crew.textKey),
                      )
                      .join(", "),
                  })}
                  onClick={(e) => {
                    if (e.detail > 2) return;
                    if (sel) onConfirm(c.kind);
                    else onSelect(c.kind);
                  }}
                >
                  <Glyph name={GLYPH[c.kind]} size={26} color={sel ? "#ffffff" : "#14202b"} />
                  <span className={s.lv}>{ui("ui.m.train.lv", { n: c.level })}</span>
                  {c.boosted && (
                    <span className={s.gdot} aria-hidden="true">
                      <Glyph name="bolt" size={12} color="#1d1704" weight={3} />
                    </span>
                  )}
                  {sel && (
                    <span
                      className={cx(s.ftag, s[`risk-${c.risk}`])}
                      id="m-fallo"
                      data-risk={c.risk}
                      aria-hidden="true"
                    >
                      {ui("ui.m.fail", { n: c.failPercent })}
                    </span>
                  )}
                </button>
                <div className={s.rname}>{name(c.kind)}</div>
              </div>
            );
          })}
        </div>
      </div>
      {result && (
        // a tap anywhere goes on sooner
        <button
          type="button"
          className={s.resultSkip}
          id="m-resultado-seguir"
          aria-label={ui("ui.m.result.next")}
          onClick={() => onResultDone?.()}
        />
      )}
      <div className={cx(s.foot, result && s.leaving)} inert={result ? true : undefined}>
        <button type="button" className={cx(s.btn, s.back)} id="m-volver" onClick={onBack}>
          <Glyph name="back" size={20} weight={2.4} />
          <span>{ui("ui.m.back")}</span>
        </button>
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-entrenar-confirmar"
          disabled={!card}
          onClick={(e) => {
            if (e.detail > 1 || !card) return;
            onConfirm(card.kind);
          }}
        >
          {card ? ui("ui.m.train.confirm", { name: name(card.kind) }) : ui("ui.m.train.pick")}
        </button>
      </div>
    </div>
  );
}

/**
 * The training's illustration behind the whole screen (owner 2026-11-11: «full cover»), her face
 * centered on the stage between the top bar and the stats. Every layer stays mounted (decoded
 * once); the chosen one cross-fades in, sliding a little from the side the player moved to, and
 * then drifts slowly. A light veil under the stats keeps them readable. Reduced motion keeps the
 * cross-fade only. Without a scene the screen keeps its sky and the stage its chibi.
 */
function TrainingBackdrop({
  art,
  active,
  dir,
  stage,
}: {
  art: RunnerArt | undefined;
  active: TrainingKind | undefined;
  dir: number;
  stage: React.RefObject<HTMLDivElement | null>;
}) {
  const scenes = art?.training ?? {};
  const kinds = (Object.keys(scenes) as TrainingKind[]).filter((k) => scenes[k] !== undefined);
  const ref = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ w: number; h: number; x: number; y: number }>();
  useLayoutEffect(() => {
    const box = ref.current;
    const st = stage.current;
    if (!box || !st) return;
    const measure = () => {
      const b = box.getBoundingClientRect();
      const r = st.getBoundingClientRect();
      setFrame({
        w: b.width,
        h: b.height,
        x: r.left - b.left + r.width / 2,
        y: r.top - b.top + r.height * 0.42,
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(st);
    return () => ro.disconnect();
  }, [stage]);
  if (kinds.length === 0) return null;
  return (
    <div
      ref={ref}
      className={cx(s.backdrop, active && s.backdropOn)}
      style={{ "--dir": dir }}
      aria-hidden="true"
      id="m-escena"
      data-scene={active ?? "chibi"}
    >
      {kinds.map((k) => {
        const scene = scenes[k];
        if (!scene) return null;
        const p = frame && placeScene(scene, { width: frame.w, height: frame.h }, frame);
        return (
          <img
            key={k}
            className={cx(s.scene, k === active && s.sceneOn)}
            src={scene.src}
            alt=""
            draggable={false}
            data-kind={k}
            style={p ? { left: p.left, top: p.top, width: p.width, height: p.height } : undefined}
          />
        );
      })}
      <div className={s.veil} />
    </div>
  );
}
