import type { Position, SeasonState } from "@falconess/schema";
import { bondLevel, flightOf, type SimContext, STAT_ORDER, trainingRisk } from "@falconess/sim";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useGlobalDetail } from "../app/explain";
import { uiAt } from "../text/brief";
import { formatInt, formatSeconds, formatSigned } from "../text/format";
import { locale, perLang } from "../text/lang";
import { gameText, ui, uiCount } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Icon, WithIcon } from "../ui/Icon";
import { actionIcon, type IconName, statIcon } from "../ui/icons";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import {
  ACTION_KINDS,
  type ActionKind,
  actionBlock,
  type CrewBonus,
  driftPreview,
  isTraining,
  MOOD_MAX,
  outingPreview,
  type RiskLevel,
  restPreview,
  trainingPreview,
  workshopVigor,
} from "./model/actions";
import { formatChance } from "./model/describe";
import { raceDistance, type WeekActionInput } from "./model/position";
import { type NextGoal, type WeekLog, weekOutcome } from "./model/season";
import { vigorScale } from "./model/vigor";
import { durabilityOf } from "./model/workshop";
import { Letter } from "./shared/Letter";
import { PositionPicker } from "./shared/PositionPicker";
import s from "./TurnActions.module.css";
import { describeInput, InputMark } from "./TurnSide";

export type TurnActionsProps = {
  ctx: SimContext;
  state: SeasonState;
  /** The next goal race, to warn when it runs this week. */
  next: NextGoal | undefined;
  /** The last week of the log: what the last decision did, in one line above the actions. */
  lastWeek: WeekLog | undefined;
  /** Open «Lo que pasó» for the last step again (its button on that line), when there is one. */
  onReopen?: (() => void) | undefined;
  /**
   * On a goal race week: the pre-race card's state (ADR-0008). `chosen` is the position tapped,
   * none until then (she runs in her wings' one); the week's action confirms it.
   */
  position?:
    | {
        readonly wings: Position;
        readonly chosen: Position | undefined;
        readonly onChange: (position: Position) => void;
      }
    | undefined;
  /** Apply an action input (the screen adds the race position on a race week). */
  onAct: (input: WeekActionInput) => void;
  onOpenWorkshop: () => void;
  /** The action under the pointer or the focus (for the board's preview), or none. */
  onPreview: (kind: ActionKind | undefined) => void;
  className?: string | undefined;
};

/** "+30 (25 %), +50 (50 %) o +70 (25 %)". */
const disjunction = perLang(
  () => new Intl.ListFormat(locale(), { style: "long", type: "disjunction" }),
);

const SHORTCUT: Readonly<Record<ActionKind, number>> = Object.fromEntries(
  ACTION_KINDS.map((k, i) => [k, i + 1]),
) as Record<ActionKind, number>;

/** The id of an action's button: `accion-train-agility`, `accion-rest`… */
export function actionButtonId(kind: ActionKind): string {
  return `accion-${kind.replace(":", "-")}`;
}

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
  icon,
  strong = false,
}: {
  value: string;
  label: string;
  icon: IconName;
  strong?: boolean;
}) {
  return (
    <span className={cx(s.effect, strong && s.strong)}>
      <span className={s.effectValue}>{value}</span>
      <span className={s.effectLabel}>
        <Icon name={icon} />
        {label}
      </span>
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
  /** A training's failure chance, loud from "high" on (the card's edge takes its color). */
  risk?: RiskLevel | undefined;
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
  risk,
}: CardProps) {
  const descId = useId();
  const id = actionButtonId(kind);
  return (
    <li
      className={cx(
        s.card,
        block !== undefined && s.blocked,
        disabled && s.disabled,
        block === undefined && risk === "high" && s.cardHigh,
        block === undefined && risk === "danger" && s.cardDanger,
      )}
      data-risk={risk}
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
          onClick={(e) => {
            // the second click of a double click lands on the next week's card: ignore it
            if (e.detail > 1) return;
            onClick();
          }}
          onFocus={() => onPreview(kind)}
          onBlur={() => onPreview(undefined)}
          aria-describedby={descId}
          aria-keyshortcuts={String(SHORTCUT[kind])}
        >
          <Icon name={actionIcon(kind)} size="lg" className={s.titleIcon} />
          <span>{title}</span>
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

/**
 * "Semana 4: Entrenar resistencia — salió bien · RES +66 · COR +33", from the season log: a
 * one-line recap of what «Lo que pasó» said (its button opens that again).
 */
function LastWeek({
  ctx,
  week,
  onReopen,
}: {
  ctx: SimContext;
  week: WeekLog;
  onReopen: (() => void) | undefined;
}) {
  if (!week.input || week.input.kind === "start") return null;
  const result = weekOutcome(week.notes);
  const deltas = STAT_ORDER.filter((st) => (week.deltas[st] ?? 0) !== 0);
  return (
    <div className={s.feedback} id="turno-semana-pasada">
      <span className={s.feedbackLabel}>{ui("ui.turn.feedback.label")}</span>
      <span className={s.feedbackText}>
        <strong>
          <InputMark input={week.input} />
          {ui("ui.turn.feedback", { turn: week.turn, action: describeInput(ctx, week.input) })}
        </strong>
        {result && <span className={s[`feedback-${result.tone}`]}> — {result.text}</span>}
        {deltas.map((st) => {
          const d = week.deltas[st] ?? 0;
          return (
            <span key={st} className={d < 0 ? s.down : s.up}>
              {" · "}
              {ui(`ui.stat.abbr.${st}`)} {formatSigned(d)}
            </span>
          );
        })}
        {week.race && (
          <span>
            {" · "}
            {ui("ui.log.race", {
              course: gameText(ctx.content.getCourse(week.race.courseId).textKey),
              place: week.race.place,
              field: week.race.fieldSize,
              time: formatSeconds(week.race.timeTicks),
            })}
          </span>
        )}
      </span>
      {onReopen && (
        <Button
          id="turno-ver-semana"
          size="sm"
          variant="ghost"
          className={s.feedbackAgain}
          onClick={onReopen}
          aria-label={ui("ui.week.reopen.aria", { turn: week.turn })}
        >
          {ui("ui.week.reopen")}
        </Button>
      )}
    </div>
  );
}

/** v3: the goal's distance, her letter there (and her birth letter a black box lifted), her passive. */
function RaceDistanceNote({
  ctx,
  state,
  courseId,
}: {
  ctx: SimContext;
  state: SeasonState;
  courseId: string;
}) {
  const d = raceDistance(ctx, state, courseId);
  if (!d) return null;
  return (
    <>
      <p id="turno-distancia" data-distance={d.distance}>
        <span>
          {ui("ui.position.race", {
            distance: ui(`ui.flight.distance.${d.distance}`),
            m: Math.round(d.lengthMm / 1000),
          })}
        </span>
        <Letter letter={d.letter} />
        {d.bornAs && <span>{ui("ui.position.race.born", { born: d.bornAs })}</span>}
      </p>
      {d.passive && (
        <p id="turno-pasiva">
          {ui("ui.position.passive", { passive: gameText(`skill.${d.passive}`) })}
        </p>
      )}
    </>
  );
}

/** The eight actions of the week, each saying what it does before the click (keys 1–8). */
export function TurnActions({
  ctx,
  state,
  next,
  lastWeek,
  onReopen,
  position,
  onAct,
  onOpenWorkshop,
  onPreview,
  className,
}: TurnActionsProps) {
  const pending = state.pendingEvent !== undefined;
  const injured = state.injuryTurns > 0;
  const rest = restPreview(ctx);
  const outing = outingPreview(ctx, state);
  const drift = driftPreview(ctx, state);
  // at the top mood (+2) neither a rest nor an outing can raise it
  const moodTop = state.mood >= MOOD_MAX;
  const S = ctx.ruleset.season;
  const scale = vigorScale(ctx.ruleset);
  const restValue =
    rest.vigorMin === rest.vigorMax
      ? formatSigned(rest.vigorMin)
      : ui("ui.action.vigorRange", {
          min: formatSigned(rest.vigorMin),
          max: formatSigned(rest.vigorMax),
        });
  // what a rest can give back (v2 draws one of several) and, while mood can rise, its chance
  const restNote = [
    rest.options.length > 1
      ? ui("ui.action.rest.options", {
          options: disjunction().format(
            rest.options.map((o) =>
              ui("ui.action.rest.option", {
                vigor: formatSigned(o.vigor),
                chance: formatChance(o.chancePm),
              }),
            ),
          ),
        })
      : undefined,
    moodTop ? undefined : ui("ui.action.rest.note", { chance: formatChance(rest.moodUpPm) }),
  ]
    .filter((x) => x !== undefined)
    .join(" ");
  // the crew the player picked for an outing; until then, the equipped frame's
  const [crew, setCrew] = useState<string | undefined>();
  const crewChoice =
    crew !== undefined && outing.crews.includes(crew) ? crew : (outing.crews[0] ?? "");
  const equipped = durabilityOf(ctx, state, state.equippedFrame);
  // v3 (ADR-0011): wings never wear; the workshop is skills and the wings' look
  const noWear = flightOf(ctx.ruleset)?.noWear === true;
  // one line in a card and the legend: they follow the page's default, with no switch of their own
  const [explain] = useGlobalDetail();

  const inputFor = (kind: ActionKind): WeekActionInput | undefined => {
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
          <Pill tone="bad" solid icon="injury">
            {ui("ui.action.injured")}
          </Pill>
          <span>
            {kind === "workshop"
              ? ui("ui.action.injured.workshop")
              : ui("ui.action.injured.note", { vigor: formatSigned(rest.injuredVigor) })}
          </span>
        </p>
      );
    if (block === "forced-rest")
      return (
        <p className={s.blockNote}>
          <Pill tone="warn" solid icon="action.rest">
            {ui("ui.action.forcedRest")}
          </Pill>
          <span>
            {ui("ui.action.forcedRest.note", {
              at: scale.forcedAt ?? 0,
              vigor: restValue,
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
          effects={
            <>
              {t.gains.map((g, i) => (
                <Effect
                  key={g.stat}
                  value={formatSigned(g.gain)}
                  label={ui(`ui.stat.abbr.${g.stat}`)}
                  icon={statIcon(g.stat)}
                  strong={i === 0}
                />
              ))}
              {t.skillPoints > 0 && (
                <Effect
                  value={formatSigned(t.skillPoints)}
                  label={ui("ui.action.skillPoints")}
                  icon="skillPoints"
                />
              )}
              {/* the track's level, at the end of the gains it raises (the title keeps its row) */}
              <span className={cx(s.level, s.levelEnd)} title={ui("ui.action.level.title")}>
                {ui("ui.action.level", { level: t.level })}
              </span>
            </>
          }
          detail={<Crews ctx={ctx} crews={t.crews} />}
          risk={t.risk}
          footer={
            <>
              {t.failPm === 0 ? (
                <span>{ui("ui.action.noFail")}</span>
              ) : (
                <span className={cx(s.risk, s[`risk-${t.risk}`])}>
                  <WithIcon icon="risk">
                    {ui("ui.action.fail", { fail: formatChance(t.failPm) })}
                  </WithIcon>
                  {t.injuryPm > 0 && (
                    <WithIcon icon="injury" className={s.injuryChance}>
                      {ui("ui.action.injury", { injury: formatChance(t.injuryPm) })}
                    </WithIcon>
                  )}
                </span>
              )}
              <WithIcon icon="vigor">
                {ui("ui.action.vigor", { delta: formatSigned(t.vigor) })}
              </WithIcon>
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
              <Effect value={restValue} label={ui("ui.action.vigorShort")} icon="vigor" strong />
              {/* a chance, not a promise: v2 gives the point one rest in four */}
              <Effect
                value={moodTop ? formatSigned(0) : "+1"}
                label={
                  moodTop
                    ? ui("ui.action.moodTop")
                    : ui("ui.action.moodChance", { chance: formatChance(rest.moodUpPm) })
                }
                icon="mood"
              />
            </>
          }
          detail={restNote && <p className={s.note}>{restNote}</p>}
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
              <Effect
                value={formatSigned(outing.mood)}
                label={ui(moodTop ? "ui.action.moodTop" : "ui.action.moodShort")}
                icon="mood"
                strong
              />
              <Effect
                value={formatSigned(outing.vigor)}
                label={ui("ui.action.vigorShort")}
                icon="vigor"
              />
              <Effect
                value={formatSigned(outing.bond)}
                label={ui("ui.action.bondShort")}
                icon="bond"
              />
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
        meta={<span className={cx(s.level, s.meta)}>{ui("ui.action.workshop.open")}</span>}
        effects={
          noWear ? (
            <Effect
              value={formatInt(state.skillPoints)}
              label={ui("ui.action.skillPoints")}
              icon="skillPoints"
              strong
            />
          ) : (
            <Effect
              value={ui("ui.frame.durability", { current: equipped.current, max: equipped.max })}
              label={ui("ui.action.durabilityShort")}
              icon="framestat.durability"
              strong
            />
          )
        }
        detail={
          <p className={s.note}>
            {uiAt(explain, noWear ? "ui.action.workshop.note.v3" : "ui.action.workshop.note")}
          </p>
        }
        footer={
          <>
            <span>{ui("ui.action.noFail")}</span>
            <WithIcon icon="vigor">
              {ui("ui.action.vigor", { delta: formatSigned(workshopVigor(ctx)) })}
            </WithIcon>
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
          <Icon name="event" />
          {ui("ui.turn.eventPending")}
        </p>
      )}
      {next?.weeksLeft === 0 && !pending && (
        <p className={s.raceWeek} role="status">
          <Icon name="goalRace" />
          {ui(noWear ? "ui.turn.raceThisWeek.v3" : "ui.turn.raceThisWeek", {
            course: gameText(ctx.content.getCourse(next.goal.courseId).textKey),
            place: next.goal.minPlace,
          })}
        </p>
      )}
      {lastWeek && <LastWeek ctx={ctx} week={lastWeek} onReopen={onReopen} />}
      {drift.rising && !pending && !injured && (
        <p className={s.drift} role="status" id="turno-racha">
          <Icon name="mood" />
          {ui("ui.turn.drift", {
            name: gameText(ctx.content.getFalconess(state.falconessId).textKey),
            weeks: uiCount("ui.count.weeks", drift.streak),
            chance: formatChance(drift.nextPm),
          })}
        </p>
      )}
      {/* the race week's position, right above the actions that confirm it (ADR-0008) */}
      {position && !pending && (
        <PositionPicker
          id="turno-posicion"
          className={s.position}
          letters={state.positionAptitude}
          wings={position.wings}
          value={position.chosen ?? position.wings}
          onChange={position.onChange}
          hint={ui("ui.position.hint.season")}
          race={next && <RaceDistanceNote ctx={ctx} state={state} courseId={next.goal.courseId} />}
        />
      )}
      <ul className={s.grid}>{cards}</ul>
      <p className={s.legend}>
        {scale.bands
          ? uiAt(explain, "ui.turn.actions.legend.v2", {
              safe: scale.bands.safeFrom,
              max: formatChance(trainingRisk(ctx.ruleset, S.fatigueMax, "train:agility").failPm),
              risk: formatChance(trainingRisk(ctx.ruleset, 0, "train:risk-flight").failPm),
              riskMax: formatChance(
                trainingRisk(ctx.ruleset, S.fatigueMax, "train:risk-flight").failPm,
              ),
              injury: scale.bands.injuryAt,
              share: formatChance(S.injuryShareOfFail),
              // a curve ruleset's simulator gives vigor back (actions.test.ts checks it)
              simulator: formatSigned(-S.fatigueCost["train:simulator"]),
              free: S.moodDriftFreeStreak,
              secondary: formatChance(S.secondaryGain),
            })
          : uiAt(explain, "ui.turn.actions.legend", {
              base: formatChance(S.failBase),
              per: S.failPerFatigue,
              secondary: formatChance(S.secondaryGain),
            })}
      </p>
    </Panel>
  );
}
