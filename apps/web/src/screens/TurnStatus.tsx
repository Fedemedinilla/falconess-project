import { POSITIONS, type SeasonState } from "@falconess/schema";
import { learnCap, type SimContext, STAT_ORDER, trainingRisk } from "@falconess/sim";
import { formatFixed, formatInt, formatSigned } from "../text/format";
import { gameText, ui, uiCount } from "../text/ui";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { moodIcon, statIcon } from "../ui/icons";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import { PositionMark } from "../ui/PositionMark";
import { StatBar } from "../ui/StatBar";
import {
  type ActionPreview,
  previewGain,
  previewVigor,
  raceMoodPm,
  trainMoodPm,
  vigorOf,
} from "./model/actions";
import { formatChance } from "./model/describe";
import { seasonStatScale } from "./model/new-season";
import { lastClosedTurn, turnDeltas } from "./model/season";
import {
  type VigorBand,
  type VigorTone,
  vigorBand,
  vigorMarks,
  vigorScale,
  vigorTone,
} from "./model/vigor";
import { Bar } from "./shared/Bar";
import { Letter } from "./shared/Letter";
import s from "./TurnStatus.module.css";

const MOODS = [-2, -1, 0, 1, 2] as const;

const TONE_COLOR: Readonly<Record<VigorTone, string>> = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  neutral: "var(--ink-2)",
};

/** Red only where a failure can be an injury, as on the training cards (`DANGER_RISK_PM`). */
const BAND_PILL: Readonly<Record<VigorBand, "good" | "warn" | "bad">> = {
  safe: "good",
  low: "warn",
  high: "warn",
  injury: "bad",
};

/**
 * Vigor, the bar that drains with training and fills with rest (`fatigueMax − fatigue`), colored
 * by its risk band (v2) or by how near v1's forced rest is, with the action under the pointer
 * previewed on it ("→ 40", or "→ 70 a 100" for a drawn rest).
 */
function VigorGauge({
  ctx,
  state,
  preview,
}: {
  ctx: SimContext;
  state: SeasonState;
  preview: ActionPreview | undefined;
}) {
  const scale = vigorScale(ctx.ruleset);
  const now = vigorOf(ctx, state);
  const to = previewVigor(ctx, state, preview);
  const band = vigorBand(scale, now);
  const forced = scale.forcedAt !== undefined && now <= scale.forcedAt;
  const range =
    to === undefined
      ? undefined
      : to.min === to.max
        ? formatInt(to.min)
        : ui("ui.action.vigorRange", { min: formatInt(to.min), max: formatInt(to.max) });
  let note: string | undefined;
  if (band && scale.bands) {
    const { safeFrom, highBelow, injuryAt } = scale.bands;
    // the risk flight fails even at full vigor: the safe band says so, with its chance
    const risk = formatChance(trainingRisk(ctx.ruleset, 0, "train:risk-flight").failPm);
    note = ui(`ui.turn.vigor.note.${band}`, {
      safe: safeFrom,
      high: highBelow,
      injury: injuryAt,
      risk,
    });
  } else if (scale.forcedAt !== undefined)
    note = ui("ui.turn.vigor.forced", { at: scale.forcedAt });
  return (
    <div className={s.vigor} data-band={band}>
      <Bar
        label={ui("ui.turn.vigor")}
        icon="vigor"
        value={formatInt(now)}
        fraction={now / scale.max}
        meter={{ value: now, max: scale.max }}
        ghost={to === undefined ? undefined : (to.max - now) / scale.max}
        mark={vigorMarks(scale)}
        markColor={scale.bands ? "var(--ink-3)" : undefined}
        color={TONE_COLOR[vigorTone(scale, now)]}
        after={range === undefined ? undefined : `→ ${range}`}
        afterTone={to !== undefined && to.max < now ? "down" : "up"}
      />
      <p className={s.vigorNote} id="turno-vigor-nota">
        {band && (
          <Pill tone={BAND_PILL[band]} solid={band === "injury"}>
            {ui(`ui.turn.vigor.band.${band}`)}
          </Pill>
        )}
        {forced && (
          <Pill tone="warn" solid icon="action.rest">
            {ui("ui.action.forcedRest")}
          </Pill>
        )}
        {note !== undefined && <span>{note}</span>}
      </p>
    </div>
  );
}

export type TurnStatusProps = {
  ctx: SimContext;
  state: SeasonState;
  /** The action under the pointer or the focus: its gains are drawn on the bars. */
  preview: ActionPreview | undefined;
  className?: string | undefined;
};

/** The Falconess this week: mood, vigor, resources and stats with last week's changes. */
export function TurnStatus({ ctx, state, preview, className }: TurnStatusProps) {
  const S = ctx.ruleset.season;
  const deltas = turnDeltas(state, lastClosedTurn(state));
  return (
    <Panel
      title={ui("ui.turn.status")}
      meta={gameText(ctx.content.getFalconess(state.falconessId).textKey)}
      className={className}
    >
      <div className={s.status}>
        <div className={s.gauges}>
          <div className={s.moodGauge}>
            <div className={s.gauge}>
              <span className={s.gaugeLabel}>
                <Icon name={moodIcon(state.mood)} />
                {ui("ui.turn.mood")}
              </span>
              <span
                className={s.mood}
                role="img"
                aria-label={ui("ui.turn.mood.aria", { mood: gameText(`mood.${state.mood}`) })}
              >
                {MOODS.map((m) => (
                  <span
                    key={m}
                    className={cx(
                      s.moodStep,
                      m <= state.mood && s.moodOn,
                      m === state.mood && s.moodNow,
                    )}
                    aria-hidden="true"
                  />
                ))}
              </span>
              <span className={s.gaugeValue}>{gameText(`mood.${state.mood}`)}</span>
            </div>
            {/* what mood is worth: its multiplier on training gains and on race stats */}
            <p className={s.gaugeNote} id="turno-animo-nota">
              {ui("ui.turn.mood.mult", {
                train: formatFixed(trainMoodPm(ctx, state), 1000, 2),
                race: formatFixed(raceMoodPm(ctx, state), 1000, 2),
              })}
            </p>
          </div>

          <VigorGauge ctx={ctx} state={state} preview={preview} />

          <dl className={s.resources}>
            <div>
              <dt>
                <Icon name="skillPoints" />
                {ui("ui.turn.skillPoints")}
              </dt>
              <dd>{formatInt(state.skillPoints)}</dd>
            </div>
          </dl>
          {state.injuryTurns > 0 && (
            <p className={s.injured} role="status">
              <Icon name="injury" />
              {ui("ui.turn.injured", { weeks: uiCount("ui.count.weeks", state.injuryTurns) })}
            </p>
          )}
        </div>

        <div className={s.stats}>
          <div className={s.statsHead} aria-hidden="true">
            <span>{ui("ui.turn.stats")}</span>
            <span>{ui("ui.turn.stats.last")}</span>
          </div>
          {STAT_ORDER.map((stat) => {
            const d = deltas[stat] ?? 0;
            const gain = previewGain(preview, stat);
            return (
              <div key={stat} className={s.statRow}>
                <StatBar
                  label={gameText(`stat.${stat}`)}
                  icon={statIcon(stat)}
                  value={state.stats[stat]}
                  max={seasonStatScale(S.statMax)}
                  {...(gain === undefined ? {} : { preview: gain })}
                  size="sm"
                />
                <span
                  className={cx(s.delta, d > 0 && s.up, d < 0 && s.down)}
                  title={ui("ui.turn.stats.last")}
                >
                  {d === 0 ? "·" : formatSigned(d)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export type TurnProfileProps = {
  ctx: SimContext;
  state: SeasonState;
  className?: string | undefined;
};

/** What changes slowly: aptitude letters by race position (ADR-0008), and the skills learned. */
export function TurnProfile({ ctx, state, className }: TurnProfileProps) {
  const cap = learnCap(ctx, state);
  return (
    <Panel title={ui("ui.turn.profile")} className={className}>
      <div className={s.profile}>
        <div className={s.aptitudes}>
          <p className={s.aptLabel}>{ui("ui.turn.aptitude.position")}</p>
          <ul className={s.letters}>
            {POSITIONS.map((p) => (
              <li key={p}>
                <span>
                  <PositionMark position={p} />
                  {gameText(`position.${p}`)}
                </span>
                <Letter letter={state.positionAptitude[p] ?? "G"} />
              </li>
            ))}
          </ul>
        </div>

        <div className={s.skills}>
          <p className={s.aptLabel}>
            <Icon name="skill" />
            {ui("ui.turn.skills", { n: state.learnedSkills.length, cap })}
          </p>
          <ul className={s.skillList}>
            {state.learnedSkills.map((id) => (
              <li key={id}>{gameText(ctx.content.getSkill(id).textKey)}</li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
