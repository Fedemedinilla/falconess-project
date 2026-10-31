import type { RunInput, SeasonState, WorkshopOp } from "@falconess/schema";
import { bondLevel, type SimContext, STAT_ORDER } from "@falconess/sim";
import { useGlobalDetail } from "../app/explain";
import { uiAt } from "../text/brief";
import { formatSeconds, formatSigned } from "../text/format";
import { gameText, ui, uiCount } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Icon, WithIcon } from "../ui/Icon";
import { actionIcon, type IconName, placeIcon, styleIcon } from "../ui/icons";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import { formatChance } from "./model/describe";
import {
  type GoalStatus,
  isEventNote,
  logNoteText,
  type NextGoal,
  type WeekLog,
} from "./model/season";
import { durabilityOf } from "./model/workshop";
import { CourseStrip } from "./shared/CourseStrip";
import { FrameCard } from "./shared/FrameCard";
import s from "./TurnSide.module.css";

// --- goal races ------------------------------------------------------------------------------------

export type GoalsPanelProps = {
  ctx: SimContext;
  next: NextGoal | undefined;
  goals: readonly GoalStatus[];
  onViewRace: (turn: number) => void;
  className?: string | undefined;
};

/** The next goal race in detail, then every goal of the season with its result. */
export function GoalsPanel({ ctx, next, goals, onViewRace, className }: GoalsPanelProps) {
  const course = next && ctx.content.getCourse(next.goal.courseId);
  // one line and the strip's legend: they follow the page's default
  const [detail] = useGlobalDetail();
  return (
    <Panel
      title={ui("ui.goals.title")}
      icon="goalRace"
      meta={next ? ui("ui.goals.week", { turn: next.goal.turn }) : undefined}
      className={className}
    >
      <div className={s.goals}>
        {next && course ? (
          <div className={s.next}>
            <p className={s.when}>
              {next.weeksLeft === 0
                ? ui("ui.goals.thisWeek")
                : ui("ui.goals.inWeeks", { weeks: uiCount("ui.count.weeks", next.weeksLeft) })}
            </p>
            <h3 className={s.course}>{gameText(course.textKey)}</h3>
            <p className={s.facts}>
              <span>{ui("ui.goals.field", { n: course.entries })}</span>
              <span className={s.need}>
                <Icon name="finish" />
                {ui("ui.goals.need", { place: next.goal.minPlace })}
              </span>
            </p>
            <p className={s.consequence}>{uiAt(detail, "ui.goals.consequence")}</p>
            <CourseStrip courseId={course.id} legend={detail} />
          </div>
        ) : (
          <p className={s.none}>{ui("ui.goals.none")}</p>
        )}

        <ol className={s.list}>
          {goals.map((g) => (
            <li
              key={g.goal.turn}
              className={cx(s.goal, g.goal.turn === next?.goal.turn && s.current)}
            >
              <span className={s.goalWeek}>{ui("ui.goals.week", { turn: g.goal.turn })}</span>
              <span className={s.goalCourse}>
                {gameText(ctx.content.getCourse(g.goal.courseId).textKey)}
                <span className={s.goalNeed}>
                  {ui("ui.goals.need", { place: g.goal.minPlace })}
                </span>
              </span>
              {g.result ? (
                <span className={s.goalResult}>
                  <Pill tone={g.met ? "good" : "bad"} icon={placeIcon(g.result.place)}>
                    {ui("ui.goals.place", { place: g.result.place, field: g.result.fieldSize })}
                  </Pill>
                  <Button
                    id={`metas-ver-${g.goal.turn}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewRace(g.goal.turn)}
                    aria-label={ui("ui.race.view.aria", {
                      course: gameText(ctx.content.getCourse(g.goal.courseId).textKey),
                      turn: g.goal.turn,
                    })}
                  >
                    {ui("ui.race.view")}
                  </Button>
                </span>
              ) : (
                <span className={s.goalPending}>{ui("ui.goals.pending")}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

// --- hangar ------------------------------------------------------------------------------------------

export type HangarPanelProps = {
  ctx: SimContext;
  state: SeasonState;
  className?: string | undefined;
};

/** The equipped frame with its durability, then the hangar's crews and their bond. */
export function HangarPanel({ ctx, state, className }: HangarPanelProps) {
  const crews: string[] = [];
  for (const f of state.hangar) {
    const m = ctx.content.getFrame(f).manufacturer;
    if (!crews.includes(m)) crews.push(m);
  }
  const others = state.hangar.filter((f) => f !== state.equippedFrame);
  const S = ctx.ruleset.season;
  // the crews' note follows the page's default; the frame card has its own switch
  const [crewDetail] = useGlobalDetail();
  return (
    <Panel
      title={ui("ui.hangar.title")}
      icon="frame"
      meta={ui("ui.hangar.meta", { n: state.hangar.length })}
      flush
      className={className}
    >
      <FrameCard
        frameId={state.equippedFrame}
        quirks={state.frameQuirks[state.equippedFrame]}
        parts={state.installedParts}
        durability={durabilityOf(ctx, state, state.equippedFrame)}
        variant="compact"
        explainId="hangar-explicacion"
        tag={<Pill tone="accent">{ui("ui.hangar.equipped")}</Pill>}
      />
      {others.length > 0 && (
        <ul className={s.others}>
          {others.map((f) => {
            const frame = ctx.content.getFrame(f);
            const m = ctx.content.getManufacturer(frame.manufacturer);
            const d = durabilityOf(ctx, state, f);
            return (
              <li key={f} className={s.other}>
                <Livery palette={m.palette} size="sm" />
                <span className={s.otherName}>{gameText(frame.textKey)}</span>
                <WithIcon icon={styleIcon(frame.style)} className={s.otherMeta}>
                  {gameText(`style.${frame.style}`)}
                </WithIcon>
                <WithIcon icon="framestat.durability" className={s.otherDur}>
                  {ui("ui.frame.durability", { current: d.current, max: d.max })}
                </WithIcon>
              </li>
            );
          })}
        </ul>
      )}
      <div className={s.bonds}>
        <p className={s.bondsTitle}>
          <Icon name="crew" />
          {ui("ui.hangar.crews")}
        </p>
        <ul className={s.bondList}>
          {crews.map((id) => {
            const m = ctx.content.getManufacturer(id);
            const bond = state.bond[id] ?? 0;
            return (
              <li key={id} className={s.bond}>
                <Livery palette={m.palette} size="sm" />
                <span className={s.bondName}>
                  {gameText(m.crew.textKey)}
                  <span className={s.bondStats}>
                    {m.crew.stats.map((st) => ui(`ui.stat.abbr.${st}`)).join(" · ")}
                  </span>
                </span>
                <span className={s.bondTrack} aria-hidden="true">
                  <span style={{ width: `${(bond / S.bondMax) * 100}%` }} />
                </span>
                <span className={s.bondValue}>
                  {ui("ui.hangar.bond", { bond, level: bondLevel(ctx, bond) })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={s.bondNote}>
          {uiAt(crewDetail, "ui.hangar.crews.note", {
            base: formatChance(S.crewPresenceBase),
            per: formatChance(S.crewPresencePerBondLevel),
            step: S.bondLevelStep,
          })}
        </p>
      </div>
    </Panel>
  );
}

// --- log ---------------------------------------------------------------------------------------------

/** The emoji of a week's action: the action's own, an event's answer; none for the start. */
export function inputIcon(input: RunInput): IconName | undefined {
  switch (input.kind) {
    case "start":
      return undefined;
    case "event:choose":
      return "event";
    default:
      return actionIcon(input.kind);
  }
}

/** The emoji of a week's action, when it has one. */
export function InputMark({ input }: { input: RunInput | undefined }) {
  const icon = input && inputIcon(input);
  return icon ? <Icon name={icon} /> : null;
}

/** A week's action in words: "Entrenar agilidad", "Taller: equipar Shiden, reparar". */
export function describeInput(ctx: SimContext, input: RunInput): string {
  const c = ctx.content;
  switch (input.kind) {
    case "start":
      return ui("ui.log.start");
    case "event:choose":
      return ui("ui.log.event");
    case "outing":
      return input.manufacturer === undefined
        ? gameText("action.outing")
        : ui("ui.log.outingWith", {
            crew: gameText(c.getManufacturer(input.manufacturer).crew.textKey),
          });
    case "workshop":
      return ui("ui.log.workshop", { ops: input.ops.map((op) => describeOp(ctx, op)).join(", ") });
    default:
      return gameText(`action.${input.kind}`);
  }
}

export function describeOp(ctx: SimContext, op: WorkshopOp): string {
  const c = ctx.content;
  switch (op.op) {
    case "equip-frame":
      return ui("ui.op.equip", { frame: gameText(c.getFrame(op.frameId).textKey) });
    case "install-part":
      return ui("ui.op.install", { part: gameText(c.getPart(op.partId).textKey) });
    case "remove-part":
      return ui("ui.op.remove", { part: gameText(c.getPart(op.partId).textKey) });
    case "repair":
      return ui("ui.op.repair");
    case "reroll-quirks":
      return ui("ui.op.reroll", { frame: gameText(c.getFrame(op.frameId).textKey) });
    case "learn-skill":
      return ui("ui.op.learn", { skill: gameText(c.getSkill(op.skillId).textKey) });
  }
}

export type LogPanelProps = {
  ctx: SimContext;
  weeks: readonly WeekLog[];
  className?: string | undefined;
};

/** The last weeks of the season log, newest first. */
export function LogPanel({ ctx, weeks, className }: LogPanelProps) {
  return (
    <Panel title={ui("ui.log.title")} flush className={className}>
      {weeks.length === 0 ? (
        <p className={s.none}>{ui("ui.log.empty")}</p>
      ) : (
        <ol className={s.log}>
          {weeks.map((w) => (
            <li key={w.turn} className={s.week}>
              <span className={s.weekTurn}>{ui("ui.goals.week", { turn: w.turn })}</span>
              <div className={s.weekBody}>
                <p className={s.weekAction}>
                  <InputMark input={w.input} />
                  {w.input ? describeInput(ctx, w.input) : ui("ui.log.start")}
                </p>
                {w.notes
                  .filter((n) => !isEventNote(n) && n !== "log.race")
                  .map((n, i) => (
                    // a week's notes can repeat a key; their order is the log's
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed log order
                    <p key={i} className={s.weekNote}>
                      {logNoteText(ctx, n)}
                    </p>
                  ))}
                {w.notes.filter(isEventNote).map((n) => (
                  <p key={n} className={s.weekEvent}>
                    <Icon name="event" />
                    {gameText(n)}
                  </p>
                ))}
                {w.race && (
                  <p className={s.weekRace}>
                    <Icon name="goalRace" />
                    {ui("ui.log.race", {
                      course: gameText(ctx.content.getCourse(w.race.courseId).textKey),
                      place: w.race.place,
                      field: w.race.fieldSize,
                      time: formatSeconds(w.race.timeTicks),
                    })}
                  </p>
                )}
                {STAT_ORDER.some((st) => (w.deltas[st] ?? 0) !== 0) && (
                  <p className={s.weekDeltas}>
                    {STAT_ORDER.filter((st) => (w.deltas[st] ?? 0) !== 0).map((st) => {
                      const d = w.deltas[st] ?? 0;
                      return (
                        <span key={st} className={d < 0 ? s.down : s.up}>
                          {ui(`ui.stat.abbr.${st}`)} {formatSigned(d)}
                        </span>
                      );
                    })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
