/**
 * The side panels (owner 2026-11-13): Registro, Metas, Cuadrillas and Guía. The same views open
 * as a panel beside the game on a wide screen (`DeskPanel`) and as a sheet from «Menú» on a phone.
 */
import type { RunInput, SeasonState, StatName, TrainingKind } from "@falconess/schema";
import {
  advanceSeason,
  bondLevel,
  hangarManufacturers,
  inSync,
  type SimContext,
  startSeason,
  vigor,
} from "@falconess/sim";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from "react";
import { goalStatuses } from "../screens/model/season";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import { crewInitials } from "./model";
import p from "./Panels.module.css";
import { GradeChip, placeText } from "./Parts";
import { trackCard } from "./track";

export type PanelTab = "menu" | "log" | "goals" | "crews" | "guide";
export const PANEL_TABS: readonly PanelTab[] = ["menu", "log", "goals", "crews", "guide"];
export const PANEL_GLYPH: Readonly<Record<PanelTab, GlyphName>> = {
  menu: "menu",
  log: "log",
  goals: "flag",
  crews: "users",
  guide: "help",
};

// --- Registro ------------------------------------------------------------------------------------

type LogWeek = {
  readonly turn: number;
  readonly input: RunInput;
  readonly crews: readonly string[];
  readonly stats: readonly { readonly stat: StatName; readonly delta: number }[];
  readonly vigor: number;
  readonly mood: number;
  readonly bonds: readonly { readonly id: string; readonly delta: number }[];
  readonly race?: {
    readonly courseId: string;
    readonly place: number;
    readonly field: number;
    readonly met: boolean;
  };
  readonly skills: readonly string[];
  readonly notes: readonly string[];
};

/** Every week of the run, replayed from its inputs (the season keeps no per-week snapshot). */
export function logWeeks(ctx: SimContext, seed: string, inputs: readonly RunInput[]): LogWeek[] {
  const start = inputs[0];
  if (start?.kind !== "start") return [];
  let s: SeasonState = startSeason(ctx, seed, start);
  const out: LogWeek[] = [];
  for (const input of inputs.slice(1)) {
    const before = s;
    try {
      s = advanceSeason(ctx, s, input);
    } catch {
      break;
    }
    if (input.kind === "event:choose") continue;
    const stats = (Object.keys(s.stats) as StatName[])
      .map((stat) => ({ stat, delta: s.stats[stat] - before.stats[stat] }))
      .filter((x) => x.delta !== 0);
    const bonds = Object.keys(s.bond)
      .map((id) => ({ id, delta: (s.bond[id] ?? 0) - (before.bond[id] ?? 0) }))
      .filter((x) => x.delta > 0);
    const r = s.raceResults.length > before.raceResults.length ? s.raceResults.at(-1) : undefined;
    const met = r ? goalStatuses(ctx, s).find((g) => g.goal.turn === r.turn)?.met !== false : false;
    const notes = s.log.filter((e) => e.turn === before.turn).flatMap((e) => e.notes);
    out.push({
      turn: before.turn,
      input,
      crews: input.kind.startsWith("train:")
        ? (before.crewPresence[input.kind as TrainingKind] ?? [])
        : [],
      stats,
      vigor: vigor(ctx.ruleset, s.fatigue) - vigor(ctx.ruleset, before.fatigue),
      mood: s.mood - before.mood,
      bonds,
      ...(r ? { race: { courseId: r.courseId, place: r.place, field: r.fieldSize, met } } : {}),
      skills: s.learnedSkills.filter((k) => !before.learnedSkills.includes(k)),
      notes,
    });
  }
  return out;
}

function actionName(input: RunInput): string {
  const k = input.kind;
  if (k === "train:simulator" || k === "train:risk-flight") return ui(`ui.m.train.name.${k}`);
  if (k.startsWith("train:")) return ui("ui.m.log.train", { name: ui(`ui.m.train.name.${k}`) });
  if (k === "rest" || k === "outing" || k === "workshop") return ui(`ui.m.log.act.${k}`);
  return k;
}

function crewName(ctx: SimContext, id: string): string {
  return gameText(ctx.content.getManufacturer(id).crew.textKey);
}

export function LogPanel({
  ctx,
  seed,
  inputs,
}: {
  ctx: SimContext;
  seed: string;
  inputs: readonly RunInput[];
}) {
  const weeks = useMemo(() => logWeeks(ctx, seed, inputs), [ctx, seed, inputs]);
  if (weeks.length === 0) return <p className={p.note}>{ui("ui.m.log.empty")}</p>;
  return (
    <ol className={p.list} id="m-registro">
      {[...weeks].reverse().map((w, i) => {
        const sleep = ["great", "normal", "poor"].find((q) =>
          w.notes.includes(`log.vigor.rest.${q}`),
        );
        const fail = w.notes.includes("log.train.injury")
          ? "injury"
          : w.notes.includes("log.train.fail")
            ? "fail"
            : undefined;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: one row per applied input, in order
          <li key={i} className={p.entry} data-turn={w.turn}>
            <span className={p.wk}>
              {ui("ui.m.log.week")}
              <b>{w.turn}</b>
            </span>
            <div>
              <h4 className={p.h}>
                {actionName(w.input)}
                {sleep && <span className={p.sub}> · {ui(`ui.m.log.rest.${sleep}`)}</span>}
                {fail && <span className={p.bad}> · {ui(`ui.m.log.${fail}`)}</span>}
                {w.crews.length > 0 && (
                  <span className={p.sub}>
                    {" "}
                    {ui("ui.m.log.with", {
                      crews: w.crews.map((c) => crewName(ctx, c)).join(", "),
                    })}
                  </span>
                )}
              </h4>
              <div className={p.chips}>
                {w.stats.map((x) => (
                  <span key={x.stat} className={cx(p.chip, x.delta > 0 ? p.up : p.down)}>
                    {gameText(`stat.${x.stat}`)} {x.delta > 0 ? "+" : ""}
                    {x.delta}
                  </span>
                ))}
                {w.vigor !== 0 && (
                  <span className={cx(p.chip, w.vigor > 0 ? p.vig : p.vigDown)}>
                    {ui("ui.m.log.vigor", { n: `${w.vigor > 0 ? "+" : ""}${w.vigor}` })}
                  </span>
                )}
                {w.mood !== 0 && (
                  <span className={cx(p.chip, w.mood > 0 ? p.vig : p.vigDown)}>
                    {ui(w.mood > 0 ? "ui.m.log.mood.up" : "ui.m.log.mood.down")}
                  </span>
                )}
                {w.bonds.map((b) => (
                  <span key={b.id} className={cx(p.chip, p.bond)}>
                    {ui("ui.m.log.bond", { crew: crewName(ctx, b.id), n: b.delta })}
                  </span>
                ))}
                {w.skills.length > 0 && (
                  <span className={cx(p.chip, p.up)}>
                    {ui("ui.m.log.skills", {
                      list: w.skills
                        .map((k) => gameText(ctx.content.getSkill(k).textKey))
                        .join(", "),
                    })}
                  </span>
                )}
                {w.race && (
                  <span className={cx(p.chip, w.race.met ? p.win : p.down)}>
                    {ui("ui.m.log.race", {
                      course: gameText(`course.${w.race.courseId}`),
                      place: w.race.place,
                      field: w.race.field,
                    })}{" "}
                    · {ui(w.race.met ? "ui.m.log.race.met" : "ui.m.log.race.missed")}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// --- Metas ---------------------------------------------------------------------------------------

export function GoalsPanel({
  ctx,
  state,
  onTrack,
}: {
  ctx: SimContext;
  state: SeasonState;
  onTrack?: (courseId: string) => void;
}) {
  const goals = goalStatuses(ctx, state);
  const next = goals.find((g) => g.result === undefined);
  const met = goals.filter((g) => g.met === true).length;
  return (
    <div className={p.stack} id="m-metas">
      <p className={p.note}>{ui("ui.m.goals.note")}</p>
      <ol className={p.list}>
        {goals.map((g) => {
          const card = trackCard(ctx, g.goal.courseId);
          const isNext = g === next;
          const left = g.goal.turn - state.turn;
          const status = g.result
            ? ui(g.met ? "ui.m.goals.done" : "ui.m.goals.failed", { place: g.result.place })
            : isNext
              ? left <= 0
                ? ui("ui.m.goals.today")
                : ui("ui.m.goals.in", { n: left })
              : ui("ui.m.goals.week", { n: g.goal.turn });
          return (
            <li key={g.goal.turn}>
              <button
                type="button"
                className={cx(
                  p.goal,
                  g.met === true && p.goalDone,
                  g.met === false && p.goalFailed,
                  isNext && p.goalNext,
                )}
                data-turn={g.goal.turn}
                onClick={() => onTrack?.(g.goal.courseId)}
              >
                <span className={p.wk}>
                  {ui("ui.m.log.week")}
                  <b>{g.goal.turn}</b>
                </span>
                <span className={p.gmain}>
                  <span className={p.h}>
                    <GradeChip grade={g.goal.grade} /> {gameText(card.nameKey)}
                  </span>
                  <small>
                    {card.distance ? `${ui(`ui.flight.distance.${card.distance}`)} · ` : ""}
                    {card.lengthM} m · {placeText(g.goal.minPlace)}
                  </small>
                </span>
                <span
                  className={cx(
                    p.state,
                    g.met === true && p.ok,
                    (isNext || g.met === false) && p.nx,
                  )}
                >
                  {status}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className={p.note}>
        {ui("ui.m.goals.progress", {
          turn: state.turn,
          turns: ctx.ruleset.season.turns,
          met,
          total: goals.length,
        })}
        <span className={p.bar}>
          <i style={{ width: `${(100 * state.turn) / ctx.ruleset.season.turns}%` }} />
        </span>
      </div>
    </div>
  );
}

// --- Cuadrillas ----------------------------------------------------------------------------------

export function CrewsPanel({ ctx, state }: { ctx: SimContext; state: SeasonState }) {
  const sync = ctx.ruleset.season.crewSync;
  const levels = Math.floor(100 / ctx.ruleset.season.bondLevelStep);
  const syncLevel = sync ? bondLevel(ctx, sync.minBond) : undefined;
  const crews = hangarManufacturers(ctx, state).sort(
    (a, b) => (state.bond[b] ?? 0) - (state.bond[a] ?? 0) || a.localeCompare(b),
  );
  return (
    <div className={p.stack} id="m-cuadrillas-panel">
      <p className={p.note}>
        {sync ? ui("ui.m.crews.note", { min: sync.minBond }) : ui("ui.m.crews.note.v1")}
      </p>
      <ul className={p.list}>
        {crews.map((id) => {
          const m = ctx.content.getManufacturer(id);
          const bond = state.bond[id] ?? 0;
          const lv = Math.min(levels, bondLevel(ctx, bond));
          const on = inSync(ctx, bond);
          const at = (Object.keys(state.crewPresence) as TrainingKind[]).find((k) =>
            state.crewPresence[k]?.includes(id),
          );
          return (
            <li key={id} className={cx(p.crew, on && p.crewSync)} data-crew={id}>
              <span
                className={p.face}
                style={{ "--bc": m.palette.primary } as CSSProperties}
                aria-hidden="true"
              >
                {crewInitials(gameText(m.textKey))}
              </span>
              <div>
                <h4 className={p.h}>
                  {gameText(m.crew.textKey)}
                  {at && (
                    <span className={p.here}>
                      {ui("ui.m.crews.here", { training: ui(`ui.m.train.name.${at}`) })}
                    </span>
                  )}
                </h4>
                <span
                  className={p.segs}
                  role="img"
                  aria-label={ui("ui.m.crew.bond", { n: lv, max: levels })}
                >
                  {Array.from({ length: levels }, (_, i) => (
                    <i
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments of a bar
                      key={i}
                      className={cx(
                        i < lv && (on ? p.segSync : p.segOn),
                        syncLevel !== undefined && i === syncLevel - 1 && p.segGoal,
                      )}
                    />
                  ))}
                </span>
                <small>
                  {ui("ui.m.crews.bond", { n: bond })}
                  {sync && (
                    <>
                      {" · "}
                      {on ? (
                        <b>{ui("ui.m.crews.sync")}</b>
                      ) : (
                        ui("ui.m.crews.toSync", { n: sync.minBond - bond })
                      )}
                    </>
                  )}
                  {" · "}
                  {ui("ui.m.crews.trains", {
                    stats: m.crew.stats
                      .map((st) => gameText(`stat.${st}`))
                      .join(ui("ui.m.crews.and")),
                  })}
                </small>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Guía ----------------------------------------------------------------------------------------

const GUIDE: readonly GlyphName[] = ["flag", "dumbbell", "bed", "bolt", "trophy", "book", "check"];
const GUIDE_KEY = "falconess.juego.guia";

/** Whether this browser has opened the guide (the dot on its tab until then). */
export function guideSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(GUIDE_KEY) === "1";
  } catch {
    return true;
  }
}
export function markGuideSeen(): void {
  try {
    globalThis.localStorage?.setItem(GUIDE_KEY, "1");
  } catch {
    // no storage: it shows again next visit
  }
}

export function GuidePanel({ onDone }: { onDone?: () => void }) {
  return (
    <div className={p.stack} id="m-guia">
      <p className={p.step}>{ui("ui.m.guide.steps", { n: GUIDE.length })}</p>
      <ol className={p.list}>
        {GUIDE.map((glyph, i) => (
          <li key={glyph} className={p.tip}>
            <span className={p.tipIcon} aria-hidden="true">
              <Glyph name={glyph} size={26} color="#1d1704" weight={2.4} />
            </span>
            <div>
              <h4 className={p.h}>{ui(`ui.m.guide.${i + 1}.title`)}</h4>
              <p>{ui(`ui.m.guide.${i + 1}.text`)}</p>
            </div>
          </li>
        ))}
      </ol>
      {onDone && (
        <button type="button" className={p.ok2} id="m-guia-ok" onClick={onDone}>
          {ui("ui.m.guide.ok")}
        </button>
      )}
    </div>
  );
}

/** A panel's title. */
export function panelTitle(tab: PanelTab): string {
  return ui(`ui.m.panel.${tab}`);
}

/** The wide screen's panel: the chosen tab's view and the tabs on the side. */
export function DeskPanel({
  tab,
  onTab,
  dot,
  children,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  dot: PanelTab | undefined;
  children: ReactNode;
}) {
  return (
    <aside className={p.desk} id="m-panel" aria-label={panelTitle(tab)}>
      <div className={p.deskMain}>
        <h2 className={p.deskTitle}>{panelTitle(tab)}</h2>
        <div className={p.deskBody}>{children}</div>
      </div>
      <nav className={p.rail} aria-label={ui("ui.m.panel.tabs")}>
        {PANEL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={cx(p.tab, t === tab && p.tabOn)}
            id={`m-panel-${t}`}
            aria-pressed={t === tab}
            onClick={() => onTab(t)}
          >
            <Glyph name={PANEL_GLYPH[t]} size={30} weight={2.2} />
            {panelTitle(t)}
            {dot === t && <span className={p.dot} aria-hidden="true" />}
          </button>
        ))}
      </nav>
    </aside>
  );
}

/** A panel as a sheet, on a phone (from «Menú»). */
export function PanelSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      id="m-panel-hoja"
      aria-labelledby="m-panel-hoja-titulo"
      onClose={onClose}
    >
      <div className={s.dl}>
        <h2 className={s.dlTitle} id="m-panel-hoja-titulo">
          {title}
        </h2>
        {children}
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-panel-hoja-cerrar"
          onClick={onClose}
        >
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
