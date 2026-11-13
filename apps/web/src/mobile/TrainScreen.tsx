import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import { type SimContext, statCap } from "@falconess/sim";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { type RunnerArt, runnerArt } from "./art";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import { type CrewBadge, crewInitials, statCells, type TrainingCard } from "./model";
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
  /** owner 2026-11-13: the vigor it cost (or gave) and the crews it bonded with, with the rest. */
  readonly vigor: number;
  readonly bonds: readonly { readonly manufacturer: string; readonly delta: number }[];
  /** ADR-0016: the crews in sintonía she trained with (their +25 %). */
  readonly sync: readonly string[];
  /** Every crew that stood at this training (mockup 5: they come in with their bond). */
  readonly crews: readonly string[];
};

/**
 * When each «+N» of a result lands (ms): the stats, the skill points, the vigor, then each crew's
 * bond, one after the other; and when the result ends. The HUD's vigor bar reads its own.
 */
export function resultTimeline(result: TrainResult): {
  readonly stats: Partial<Record<StatName, number>>;
  readonly points: number | undefined;
  readonly vigor: number | undefined;
  readonly bonds: Readonly<Record<string, number>>;
  readonly end: number;
} {
  let i = 0;
  const next = () => FIRST_POP_MS + POP_STEP_MS * i++;
  const stats = Object.fromEntries(result.gains.map((g) => [g.stat, next()]));
  const points = result.points > 0 ? next() : undefined;
  const vigor = result.vigor !== 0 ? next() : undefined;
  const bonds = Object.fromEntries(result.bonds.map((b) => [b.manufacturer, next()]));
  const crewsIn = CREW_IN_MS + CREW_STEP_MS * Math.max(0, result.crews.length - 1) + 450;
  return {
    stats,
    points,
    vigor,
    bonds,
    end: Math.max(FIRST_POP_MS + POP_STEP_MS * Math.max(0, i - 1), crewsIn) + HOLD_MS,
  };
}

/** When the stamp lands and each «+N» after it, ms. */
const STAMP_MS = 120;
/** The stats slide down in `DROP_MS` (Mobile.module.css `.stripDown`); then the crews come in. */
const DROP_MS = 460;
const CREW_IN_MS = 80 + DROP_MS;
const CREW_STEP_MS = 150;
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
  // the result's «+N», one after the other: the stats, the points, the vigor, the bonds
  const timeline = result ? resultTimeline(result) : undefined;
  const pops = result &&
    timeline && {
      stats: Object.fromEntries(
        result.gains.map((g) => [g.stat, { delta: g.delta, delay: timeline.stats[g.stat] ?? 0 }]),
      ),
      points:
        timeline.points !== undefined
          ? { delta: result.points, delay: timeline.points }
          : undefined,
      from: result.from,
      fromPoints: result.fromPoints,
    };
  // the pings climb with the «+N» (a failure has none)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per result
  useEffect(() => {
    if (!result || !timeline) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ups = [...Object.values(timeline.stats), timeline.points].filter(
      (d): d is number => d !== undefined,
    );
    if (result.outcome !== "fail")
      ups.forEach((d, i) => {
        timers.push(setTimeout(() => playPing(i, ups.length), d));
      });
    timers.push(setTimeout(() => onResultDone?.(), timeline.end));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [result]);
  const card = result ? undefined : cards.find((c) => c.kind === selected);
  const gains: Partial<Record<StatName, number>> | undefined = card
    ? Object.fromEntries(card.gains.map((g) => [g.stat, g.gain]))
    : undefined;
  const name = (kind: TrainingKind) => ui(`ui.m.train.name.${kind}`);
  const stageRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const roundsRef = useRef<HTMLDivElement>(null);
  // the result (owner 2026-11-13): the stats slide down to the bottom (a transform: nothing else
  // moves, the scene stays put) and leave the room above them to the crews' cards
  const [drop, setDrop] = useState<{ y: number; b: number }>();
  useLayoutEffect(() => {
    if (!result) {
      setDrop(undefined);
      return;
    }
    const strip = stripRef.current?.getBoundingClientRect();
    const foot = footRef.current?.getBoundingClientRect();
    const screen = screenRef.current?.getBoundingClientRect();
    if (!strip || !foot || !screen) return;
    const y = Math.max(0, Math.round(foot.bottom - strip.bottom));
    // the crews' cards sit over the landed stats and their «+N», measured from the box they are
    // placed in (the app: the nearest positioned ancestor)
    const box = (screenRef.current?.offsetParent ?? document.body).getBoundingClientRect();
    setDrop({ y, b: Math.round(box.bottom - foot.bottom + strip.height + 46) });
    // explicit animations: the result may mount a fresh screen, where a CSS transition has no
    // «before» to start from
    if (reducedMotion()) return;
    stripRef.current?.animate(
      [{ transform: "translateY(0)" }, { transform: `translateY(${y}px)` }],
      { duration: DROP_MS, delay: 80, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
    );
    for (const el of [roundsRef.current, footRef.current])
      el?.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(18px)" },
        ],
        { duration: 240, easing: "ease-in", fill: "both" },
      );
  }, [result]);
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
    <div
      className={cx(s.screen, result && s.resultLow)}
      ref={screenRef}
      style={
        drop
          ? ({ "--drop": `${drop.y}px`, "--crewsb": `${drop.b}px` } as React.CSSProperties)
          : undefined
      }
    >
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
          {result && result.sync.length > 0 && result.outcome !== "fail" && (
            <p
              className={s.syncStamp}
              id="m-resultado-sintonia"
              style={{ animationDelay: `${STAMP_MS + 250}ms` }}
            >
              {ui("ui.m.fx.sync")}
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
          {card && card.crews.length > 0 && (
            <div className={s.crewCol} id="m-cuadrillas">
              {card.crews.map((c) => (
                <div key={c.manufacturer} className={s.crewColRow} data-crew={c.manufacturer}>
                  <CrewFace ctx={ctx} id={c.manufacturer} sync={c.sync} size={46} />
                  <BondSeg badge={c} />
                  {c.sync && <div className={s.syncTag}>{ui("ui.m.crew.sync")}</div>}
                </div>
              ))}
            </div>
          )}
          {injured && (
            <p className={s.stageWarn} id="m-entrenar-lesion">
              <Glyph name="warn" size={18} />
              {ui("ui.m.train.injured")}
            </p>
          )}
        </div>
        <div className={cx(s.stripWrap, drop && s.stripDown)} ref={stripRef}>
          <StatStrip
            stats={statCells(state, statCap(ctx.ruleset, state))}
            skillPoints={state.skillPoints}
            gains={gains ?? {}}
            pointsGain={card?.skillPoints}
            long
            {...(pops ? { pops } : {})}
          />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {card
            ? ui("ui.m.train.live", {
                name: name(card.kind),
                gains: card.gains.map((g) => `+${g.gain} ${gameText(`stat.${g.stat}`)}`).join(", "),
                fail: card.failPercent,
              })
            : ""}
        </p>
        <div
          className={cx(s.rounds, result && s.leaving)}
          inert={result ? true : undefined}
          ref={roundsRef}
        >
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
                    c.sync && s.syncBtn,
                  )}
                  aria-pressed={sel}
                  data-sync={c.sync}
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
                  {c.crews.length > 0 && (
                    <span className={s.btnCrews} aria-hidden="true">
                      {c.crews.slice(0, 3).map((k) => (
                        <CrewFace
                          key={k.manufacturer}
                          ctx={ctx}
                          id={k.manufacturer}
                          sync={k.sync}
                          size={24}
                        />
                      ))}
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
      {result && result.crews.length > 0 && (
        <div className={s.crewIn} id="m-resultado-cuadrillas">
          {result.crews.map((m, k) => {
            const bond = result.bonds.find((b) => b.manufacturer === m);
            const sync = result.sync.includes(m);
            return (
              <div
                key={m}
                className={cx(s.crewInCard, sync && s.crewInSync)}
                style={{ animationDelay: `${CREW_IN_MS + k * CREW_STEP_MS}ms` }}
                data-crew={m}
              >
                <CrewFace ctx={ctx} id={m} sync={sync} size={58} />
                <b>{gameText(ctx.content.getManufacturer(m).crew.textKey)}</b>
                {bond ? (
                  <span className={s.crewInBond}>{ui("ui.m.crew.bondUp", { n: bond.delta })}</span>
                ) : null}
                {sync && <span className={s.syncTag}>{ui("ui.m.crew.sync")}</span>}
              </div>
            );
          })}
        </div>
      )}
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
      <div
        className={cx(s.foot, result && s.leaving)}
        inert={result ? true : undefined}
        ref={footRef}
      >
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

/** A crew's portrait at any size (its maker's colors and initials), gold in sintonía. */
function CrewFace({
  ctx,
  id,
  sync,
  size,
}: {
  ctx: SimContext;
  id: string;
  sync: boolean;
  size: number;
}) {
  const m = ctx.content.getManufacturer(id);
  return (
    <span
      className={cx(s.face, sync && s.portraitSync)}
      style={
        {
          "--bc": m.palette.primary,
          "--bc2": m.palette.secondary,
          "--fs": `${size}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {crewInitials(gameText(m.textKey))}
    </span>
  );
}

/** A crew's bond bar: one segment per level, gold in sintonía, the sintonía level marked. */
function BondSeg({ badge }: { badge: CrewBadge }) {
  return (
    <span
      className={s.seg}
      role="img"
      aria-label={ui("ui.m.crew.bond", { n: badge.bond, max: badge.bondMax })}
    >
      {Array.from({ length: badge.bondMax }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments of a bar
          key={i}
          className={cx(
            i < badge.bond && (badge.sync ? s.segSync : s.segOn),
            badge.syncLevel !== undefined && i === badge.syncLevel - 1 && s.segGoal,
          )}
        />
      ))}
    </span>
  );
}

function reducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
