import type { RunInput, SeasonState } from "@falconess/schema";
import { bondLevel, type SimContext } from "@falconess/sim";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import {
  ACTION_KINDS,
  type ActionKind,
  actionBlock,
  type CrewBonus,
  isTraining,
  outingPreview,
  restPreview,
  trainingPreview,
  workshopFatigue,
} from "./model/actions";
import { formatChance } from "./model/describe";
import type { NextGoal } from "./model/season";
import { durabilityOf } from "./model/workshop";
import s from "./TurnActions.module.css";

export type TurnActionsProps = {
  ctx: SimContext;
  state: SeasonState;
  /** The next goal race, to warn when it runs this week. */
  next: NextGoal | undefined;
  /** Apply an action input. */
  onAct: (input: RunInput) => void;
  onOpenWorkshop: () => void;
  /** The action under the pointer or the focus (for the board's preview), or none. */
  onPreview: (kind: ActionKind | undefined) => void;
  className?: string | undefined;
};

const SHORTCUT: Readonly<Record<ActionKind, number>> = Object.fromEntries(
  ACTION_KINDS.map((k, i) => [k, i + 1]),
) as Record<ActionKind, number>;

function Crews({ ctx, crews }: { ctx: SimContext; crews: readonly CrewBonus[] }) {
  if (crews.length === 0) return <p className={s.noCrew}>{ui("ui.action.noCrew")}</p>;
  return (
    <ul className={s.crews}>
      {crews.map((c) => {
        const m = ctx.content.getManufacturer(c.manufacturer);
        return (
          <li key={c.manufacturer}>
            <Livery palette={m.palette} size="sm" />
            <span className={s.crewName}>{gameText(m.crew.textKey)}</span>
            <span className={s.crewBonus}>+{formatChance(c.bonusPm)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Effect({
  value,
  label,
  strong = false,
}: {
  value: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <span className={cx(s.effect, strong && s.strong)}>
      <span className={s.effectValue}>{value}</span>
      <span className={s.effectLabel}>{label}</span>
    </span>
  );
}

type CardProps = {
  kind: ActionKind;
  title: string;
  meta?: ReactNode;
  effects: ReactNode;
  detail?: ReactNode;
  footer: ReactNode;
  block?: ReactNode;
  disabled: boolean;
  onClick: () => void;
  onPreview: (kind: ActionKind | undefined) => void;
  extra?: ReactNode;
};

/**
 * One action. The whole card is the button's hit area (a stretched pseudo-element), so a control
 * inside it (the outing's crew) stays a separate control.
 */
function ActionCard({
  kind,
  title,
  meta,
  effects,
  detail,
  footer,
  block,
  disabled,
  onClick,
  onPreview,
  extra,
}: CardProps) {
  const descId = useId();
  const id = `accion-${kind.replace(":", "-")}`;
  return (
    <li
      className={cx(s.card, block !== undefined && s.blocked, disabled && s.disabled)}
      onPointerEnter={() => onPreview(kind)}
      onPointerLeave={() => onPreview(undefined)}
    >
      <div className={s.cardHead}>
        <span className={s.key} aria-hidden="true">
          {SHORTCUT[kind]}
        </span>
        <button
          type="button"
          id={id}
          className={s.hit}
          disabled={disabled}
          onClick={onClick}
          onFocus={() => onPreview(kind)}
          onBlur={() => onPreview(undefined)}
          aria-describedby={descId}
          aria-keyshortcuts={String(SHORTCUT[kind])}
        >
          {title}
        </button>
        {meta}
      </div>
      <div id={descId} className={s.body}>
        {block}
        <p className={s.effects}>{effects}</p>
        {detail}
        <p className={s.footer}>{footer}</p>
      </div>
      {extra}
    </li>
  );
}

/** The eight actions of the week, each saying what it does before the click (keys 1–8). */
export function TurnActions({
  ctx,
  state,
  next,
  onAct,
  onOpenWorkshop,
  onPreview,
  className,
}: TurnActionsProps) {
  const pending = state.pendingEvent !== undefined;
  const injured = state.injuryTurns > 0;
  const rest = restPreview(ctx);
  const outing = outingPreview(ctx, state);
  // the crew the player picked for an outing; until then, the equipped frame's
  const [crew, setCrew] = useState<string | undefined>();
  const crewChoice =
    crew !== undefined && outing.crews.includes(crew) ? crew : (outing.crews[0] ?? "");
  const equipped = durabilityOf(ctx, state, state.equippedFrame);

  const inputFor = (kind: ActionKind): RunInput | undefined => {
    if (kind === "workshop") return undefined;
    if (kind === "outing")
      return crewChoice !== "" && crewChoice !== outing.crews[0]
        ? { kind: "outing", manufacturer: crewChoice }
        : { kind: "outing" };
    return { kind };
  };
  const run = (kind: ActionKind) => {
    if (pending) return;
    if (kind === "workshop") {
      if (!injured) onOpenWorkshop();
      return;
    }
    const input = inputFor(kind);
    if (input) onAct(input);
  };

  // keys 1–8 run the actions, outside form fields and dialogs
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, select, textarea, [contenteditable]"))
        return;
      if (document.querySelector("dialog[open]")) return;
      const n = Number.parseInt(e.key, 10);
      const kind = ACTION_KINDS[n - 1];
      if (!kind || String(n) !== e.key) return;
      e.preventDefault();
      runRef.current(kind);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const blockNote = (kind: ActionKind): ReactNode => {
    const block = actionBlock(ctx, state, kind);
    if (block === "injured")
      return (
        <p className={s.blockNote}>
          <Pill tone="bad" solid>
            {ui("ui.action.injured")}
          </Pill>
          <span>
            {kind === "workshop"
              ? ui("ui.action.injured.workshop")
              : ui("ui.action.injured.note", { fatigue: formatSigned(rest.fatigue) })}
          </span>
        </p>
      );
    if (block === "forced-rest")
      return (
        <p className={s.blockNote}>
          <Pill tone="warn" solid>
            {ui("ui.action.forcedRest")}
          </Pill>
          <span>
            {ui("ui.action.forcedRest.note", {
              at: ctx.ruleset.season.forcedRestAt,
              fatigue: formatSigned(rest.fatigue),
            })}
          </span>
        </p>
      );
    return undefined;
  };

  const cards = ACTION_KINDS.map((kind) => {
    const block = blockNote(kind);
    const common = {
      kind,
      title: gameText(`action.${kind}`),
      block,
      onClick: () => run(kind),
      onPreview,
    };
    if (isTraining(kind)) {
      const t = trainingPreview(ctx, state, kind);
      return (
        <ActionCard
          key={kind}
          {...common}
          disabled={pending}
          meta={
            <span className={s.level} title={ui("ui.action.level.title")}>
              {ui("ui.action.level", { level: t.level })}
            </span>
          }
          effects={
            <>
              {t.gains.map((g, i) => (
                <Effect
                  key={g.stat}
                  value={formatSigned(g.gain)}
                  label={ui(`ui.stat.abbr.${g.stat}`)}
                  strong={i === 0}
                />
              ))}
              {t.skillPoints > 0 && (
                <Effect value={formatSigned(t.skillPoints)} label={ui("ui.action.skillPoints")} />
              )}
            </>
          }
          detail={<Crews ctx={ctx} crews={t.crews} />}
          footer={
            <>
              <span className={cx(t.failPm >= 150 && s.risky)}>
                {t.failPm === 0
                  ? ui("ui.action.noFail")
                  : t.injuryPm > 0
                    ? ui("ui.action.failInjury", {
                        fail: formatChance(t.failPm),
                        injury: formatChance(t.injuryPm),
                      })
                    : ui("ui.action.fail", { fail: formatChance(t.failPm) })}
              </span>
              <span>{ui("ui.action.fatigue", { delta: formatSigned(t.fatigue) })}</span>
            </>
          }
        />
      );
    }
    if (kind === "rest")
      return (
        <ActionCard
          key={kind}
          {...common}
          disabled={pending}
          effects={
            <>
              <Effect
                value={formatSigned(rest.fatigue)}
                label={ui("ui.action.fatigueShort")}
                strong
              />
              <Effect value="+1" label={ui("ui.action.moodShort")} />
            </>
          }
          detail={
            <p className={s.note}>
              {ui("ui.action.rest.note", { chance: formatChance(rest.moodUpPm) })}
            </p>
          }
          footer={<span>{ui("ui.action.noFail")}</span>}
        />
      );
    if (kind === "outing") {
      const m = ctx.content.getManufacturer(crewChoice || outing.crews[0] || "");
      return (
        <ActionCard
          key={kind}
          {...common}
          disabled={pending}
          effects={
            <>
              <Effect value={formatSigned(outing.mood)} label={ui("ui.action.moodShort")} strong />
              <Effect value={formatSigned(outing.fatigue)} label={ui("ui.action.fatigueShort")} />
              <Effect value={formatSigned(outing.bond)} label={ui("ui.action.bondShort")} />
            </>
          }
          detail={
            <p className={s.note}>
              {ui("ui.action.outing.note", { crew: gameText(m.crew.textKey) })}
            </p>
          }
          footer={<span>{ui("ui.action.noFail")}</span>}
          extra={
            outing.crews.length > 1 && (
              <div className={s.extra}>
                <label htmlFor="accion-salida-cuadrilla" className={s.extraLabel}>
                  {ui("ui.action.outing.with")}
                </label>
                <select
                  id="accion-salida-cuadrilla"
                  className={s.select}
                  value={crewChoice}
                  onChange={(e) => setCrew(e.target.value)}
                  disabled={pending}
                >
                  {outing.crews.map((id) => {
                    const mfr = ctx.content.getManufacturer(id);
                    const bond = state.bond[id] ?? 0;
                    return (
                      <option key={id} value={id}>
                        {ui("ui.action.outing.option", {
                          crew: gameText(mfr.crew.textKey),
                          bond,
                          level: bondLevel(ctx, bond),
                        })}
                      </option>
                    );
                  })}
                </select>
              </div>
            )
          }
        />
      );
    }
    // workshop
    return (
      <ActionCard
        key={kind}
        {...common}
        disabled={pending || injured}
        meta={<span className={s.level}>{ui("ui.action.workshop.open")}</span>}
        effects={
          <Effect
            value={ui("ui.frame.durability", { current: equipped.current, max: equipped.max })}
            label={ui("ui.action.durabilityShort")}
            strong
          />
        }
        detail={<p className={s.note}>{ui("ui.action.workshop.note")}</p>}
        footer={
          <>
            <span>{ui("ui.action.noFail")}</span>
            <span>{ui("ui.action.fatigue", { delta: formatSigned(workshopFatigue(ctx)) })}</span>
          </>
        }
      />
    );
  });

  return (
    <Panel
      title={ui("ui.turn.actions")}
      meta={ui("ui.turn.actions.keys")}
      className={className}
      id="turno-acciones"
    >
      {pending && (
        <p className={s.alert} role="status">
          {ui("ui.turn.eventPending")}
        </p>
      )}
      {next?.weeksLeft === 0 && !pending && (
        <p className={s.raceWeek} role="status">
          {ui("ui.turn.raceThisWeek", {
            course: gameText(ctx.content.getCourse(next.goal.courseId).textKey),
            place: next.goal.minPlace,
          })}
        </p>
      )}
      <ul className={s.grid}>{cards}</ul>
      <p className={s.legend}>
        {ui("ui.turn.actions.legend", {
          base: formatChance(ctx.ruleset.season.failBase),
          per: ctx.ruleset.season.failPerFatigue,
          secondary: formatChance(ctx.ruleset.season.secondaryGain),
        })}
      </p>
    </Panel>
  );
}
