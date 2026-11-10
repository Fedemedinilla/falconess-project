import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { runnerArt } from "./art";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import { crewInitials, statCells, type TrainingCard } from "./model";
import { StatStrip } from "./Parts";

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
export function TrainScreen({
  ctx,
  state,
  cards,
  selected,
  injured,
  onSelect,
  onConfirm,
  onBack,
}: {
  ctx: SimContext;
  state: SeasonState;
  cards: readonly TrainingCard[];
  selected: TrainingKind | undefined;
  injured: boolean;
  onSelect: (kind: TrainingKind) => void;
  onConfirm: (kind: TrainingKind) => void;
  onBack: () => void;
}) {
  const art = runnerArt(state.falconessId);
  const card = cards.find((c) => c.kind === selected);
  const crew = card?.crews[0];
  const maker = crew && ctx.content.getManufacturer(crew.manufacturer);
  const gains: Partial<Record<StatName, number>> | undefined = card
    ? Object.fromEntries(card.gains.map((g) => [g.stat, g.gain]))
    : undefined;
  const name = (kind: TrainingKind) => ui(`ui.m.train.name.${kind}`);

  return (
    <div className={s.screen}>
      <div className={s.body}>
        <div className={s.stage}>
          <div className={s.glow} aria-hidden="true" />
          {art && (
            <div className={s.runner} aria-hidden="true">
              <img src={art.chibi} alt="" draggable={false} />
            </div>
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
          stats={statCells(state)}
          skillPoints={state.skillPoints}
          gains={gains ?? {}}
          pointsGain={card?.skillPoints}
          long
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
        <div className={s.rounds}>
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
      <div className={s.foot}>
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
