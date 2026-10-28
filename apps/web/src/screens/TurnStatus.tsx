import { BIOMES, type SeasonState, STYLES } from "@falconess/schema";
import { learnCap, type SimContext, STAT_ORDER } from "@falconess/sim";
import { formatFixed, formatInt, formatSigned } from "../text/format";
import { gameText, ui, uiCount } from "../text/ui";
import { cx } from "../ui/cx";
import { Panel } from "../ui/Panel";
import { StatBar } from "../ui/StatBar";
import { type ActionPreview, moodPm, previewFatigue, previewGain } from "./model/actions";
import { lastClosedTurn, turnDeltas } from "./model/season";
import { Bar } from "./shared/Bar";
import { Letter } from "./shared/Letter";
import s from "./TurnStatus.module.css";

const MOODS = [-2, -1, 0, 1, 2] as const;

export type TurnStatusProps = {
  ctx: SimContext;
  state: SeasonState;
  /** The action under the pointer or the focus: its gains are drawn on the bars. */
  preview: ActionPreview | undefined;
  className?: string | undefined;
};

/** The Falconess this week: mood, fatigue, resources and stats with last week's changes. */
export function TurnStatus({ ctx, state, preview, className }: TurnStatusProps) {
  const S = ctx.ruleset.season;
  const deltas = turnDeltas(state, lastClosedTurn(state));
  const fatigueTo = previewFatigue(ctx, state, preview);
  return (
    <Panel
      title={ui("ui.turn.status")}
      meta={gameText(ctx.content.getFalconess(state.falconessId).textKey)}
      className={className}
    >
      <div className={s.status}>
        <div className={s.gauges}>
          <div className={s.gauge}>
            <span className={s.gaugeLabel}>{ui("ui.turn.mood")}</span>
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
            <span className={s.gaugeValue}>
              {gameText(`mood.${state.mood}`)}
              <span className={s.gaugeNote}>
                {ui("ui.turn.mood.mult", {
                  mult: formatFixed(moodPm(ctx, state), 1000, 2),
                })}
              </span>
            </span>
          </div>

          <div className={s.fatigue}>
            <Bar
              label={ui("ui.turn.fatigue")}
              value={formatInt(state.fatigue)}
              fraction={state.fatigue / S.fatigueMax}
              meter={{ value: state.fatigue, max: S.fatigueMax }}
              ghost={
                fatigueTo === undefined ? undefined : (fatigueTo - state.fatigue) / S.fatigueMax
              }
              mark={S.forcedRestAt / S.fatigueMax}
              color={
                state.fatigue >= S.forcedRestAt
                  ? "var(--bad)"
                  : state.fatigue >= S.forcedRestAt - 20
                    ? "var(--warn)"
                    : "var(--ink-2)"
              }
              after={fatigueTo === undefined ? undefined : `→ ${formatInt(fatigueTo)}`}
              afterTone={fatigueTo !== undefined && fatigueTo > state.fatigue ? "down" : "up"}
            />
            <p className={s.threshold}>{ui("ui.turn.fatigue.threshold", { at: S.forcedRestAt })}</p>
          </div>

          <dl className={s.resources}>
            <div>
              <dt>{ui("ui.turn.skillPoints")}</dt>
              <dd>{formatInt(state.skillPoints)}</dd>
            </div>
            <div>
              <dt>{ui("ui.turn.scrap")}</dt>
              <dd>{formatInt(state.wallet.scrap)}</dd>
            </div>
            <div>
              <dt>{ui("ui.turn.feathers")}</dt>
              <dd>{formatInt(state.wallet.feathers)}</dd>
            </div>
          </dl>
          {state.injuryTurns > 0 && (
            <p className={s.injured} role="status">
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
                  value={state.stats[stat]}
                  max={S.statMax}
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

/** What changes slowly: aptitude letters by biome and style, and the skills learned. */
export function TurnProfile({ ctx, state, className }: TurnProfileProps) {
  const cap = learnCap(ctx, state);
  return (
    <Panel title={ui("ui.turn.profile")} className={className}>
      <div className={s.profile}>
        <div className={s.aptitudes}>
          <p className={s.aptLabel}>{ui("ui.turn.aptitude.biome")}</p>
          <ul className={s.letters}>
            {BIOMES.map((b) => (
              <li key={b}>
                <span>{gameText(`biome.${b}`)}</span>
                <Letter letter={state.biomeAptitude[b] ?? "G"} />
              </li>
            ))}
          </ul>
          <p className={s.aptLabel}>{ui("ui.turn.aptitude.style")}</p>
          <ul className={s.letters}>
            {STYLES.map((st) => (
              <li key={st}>
                <span>{gameText(`style.${st}`)}</span>
                <Letter letter={state.styleAptitude[st] ?? "G"} />
              </li>
            ))}
          </ul>
        </div>

        <div className={s.skills}>
          <p className={s.aptLabel}>
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
