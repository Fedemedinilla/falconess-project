import { FrameStats } from "@falconess/schema";
import { resolveFrameBuild } from "@falconess/sim";
import type { ReactNode } from "react";
import { useDetail, useGlobalDetail } from "../../app/explain";
import { getContent } from "../../content/load";
import { type Detail, gameBrief, uiAt } from "../../text/brief";
import { formatFixed, formatInt } from "../../text/format";
import { gameText, ui } from "../../text/ui";
import { cx } from "../../ui/cx";
import { ExplainSwitch } from "../../ui/ExplainSwitch";
import { Icon } from "../../ui/Icon";
import { type IconName, styleIcon } from "../../ui/icons";
import { Livery } from "../../ui/Livery";
import { Pill } from "../../ui/Pill";
import { useNarrow } from "../../ui/useMedia";
import { describeModifier, describeSource, formatFraction } from "../model/describe";
import type { Durability } from "../model/workshop";
import { Bar } from "./Bar";
import s from "./FrameCard.module.css";

/** Top of each frame stat's bar: the schema's maximum for content frames. */
const SCALE = {
  powerToWeight: (FrameStats.shape.powerToWeight.maxValue ?? 1.6) * 1000,
  energy: FrameStats.shape.energy.maxValue ?? 140,
  dissipation: FrameStats.shape.dissipation.maxValue ?? 100,
  durability: FrameStats.shape.durability.maxValue ?? 200,
};

export type FrameCardProps = {
  frameId: string;
  /**
   * The rolled quirks of a Boneyard frame. Undefined before the season: the card then says how
   * many slots get rolled.
   */
  quirks?: readonly string[] | undefined;
  /** Installed parts (they count on the equipped frame only). */
  parts?: readonly string[] | undefined;
  /** Durability now, for a frame in the hangar. */
  durability?: Durability | undefined;
  /** "full" lists the manufacturer's rule and crew too. */
  variant?: "full" | "compact";
  /** Right of the name: "Equipado", a selection mark. */
  tag?: ReactNode;
  headingId?: string | undefined;
  /**
   * Stable id of the card's "Breve | Completo" (`<id>-breve`, `<id>-completo`): in the header, or
   * first in "Ver detalle" when the card folds. Without one the card has no switch and follows the
   * page's default.
   */
  explainId?: string | undefined;
  /**
   * On a phone, fold the passive, quirks, rule and crew under "Ver detalle" (a <details> with this
   * id), leaving the name and the four bars: a list of thirteen frames stays short.
   */
  foldId?: string | undefined;
  className?: string | undefined;
};

/** Its children, or with an id, the same children folded under "Ver detalle". */
export function Fold({
  id,
  label = ui("ui.frame.more"),
  children,
}: {
  id: string | undefined;
  label?: string;
  children: ReactNode;
}) {
  if (id === undefined) return children;
  return (
    <details className={s.fold} id={id}>
      <summary className={s.foldSummary}>{label}</summary>
      {children}
    </details>
  );
}

function durabilityColor(d: Durability): string {
  const share = d.max > 0 ? d.current / d.max : 0;
  return share < 0.25 ? "var(--bad)" : share < 0.5 ? "var(--warn)" : "var(--good)";
}

/** A trait's term with its emoji before it ("Pasiva", "Regla"). */
function Term({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <dt>
      <Icon name={icon} />
      {children}
    </dt>
  );
}

/** A card's detail: its own switch when it has an id, else the page's default. */
function useCardDetail(explainId: string | undefined): [Detail, (d: Detail) => void] {
  const own = useDetail(explainId ?? "");
  const page = useGlobalDetail();
  return explainId === undefined ? page : own;
}

/** A frame from content: livery, the four frame stats, its passive or quirks, rule and crew. */
export function FrameCard({
  frameId,
  quirks,
  parts = [],
  durability,
  variant = "full",
  tag,
  headingId,
  explainId,
  foldId,
  className,
}: FrameCardProps) {
  const narrow = useNarrow();
  const [detail, setDetail] = useCardDetail(explainId);
  const brief = detail === "brief";
  const content = getContent();
  const frame = content.getFrame(frameId);
  const maker = content.getManufacturer(frame.manufacturer);
  const build = resolveFrameBuild(content, frameId, parts, quirks ?? []);
  const livery = {
    "--livery-primary": maker.palette.primary,
    "--livery-secondary": maker.palette.secondary,
  };
  const passive = frame.passive === undefined ? undefined : content.getPassive(frame.passive);
  // folded on a phone, the switch opens with the detail, right above the texts it changes
  const folded = narrow && foldId !== undefined;
  const explainSwitch = explainId && (
    <ExplainSwitch
      id={explainId}
      detail={detail}
      onChange={setDetail}
      name={gameText(frame.textKey)}
      className={folded ? s.switchInFold : s.switch}
    />
  );

  return (
    <article className={cx(s.card, variant === "compact" && s.compact, className)} style={livery}>
      <span className={s.band} aria-hidden="true" />
      <header className={s.head}>
        <h3 className={s.name} id={headingId}>
          {gameText(frame.textKey)}
        </h3>
        {tag}
        <p className={s.maker}>
          <Livery palette={maker.palette} size="sm" />
          <span>{gameText(maker.textKey)}</span>
        </p>
        <p className={s.chips}>
          <Pill icon={styleIcon(frame.style)}>{gameText(`style.${frame.style}`)}</Pill>
          <Pill tone={frame.rarity === "SSR" ? "accent" : "neutral"}>{frame.rarity}</Pill>
        </p>
        {!folded && explainSwitch}
      </header>

      <div className={s.stats}>
        <Bar
          size="sm"
          label={gameText("framestat.powerToWeight")}
          icon="framestat.powerToWeight"
          value={formatFixed(build.powerToWeight, 1000, 2)}
          fraction={build.powerToWeight / SCALE.powerToWeight}
        />
        <Bar
          size="sm"
          label={gameText("framestat.energy")}
          icon="framestat.energy"
          value={formatInt(build.energy)}
          fraction={build.energy / SCALE.energy}
        />
        <Bar
          size="sm"
          label={gameText("framestat.dissipation")}
          icon="framestat.dissipation"
          value={formatInt(build.dissipation)}
          fraction={build.dissipation / SCALE.dissipation}
        />
        {durability ? (
          <Bar
            size="sm"
            label={gameText("framestat.durability")}
            icon="framestat.durability"
            value={ui("ui.frame.durability", { current: durability.current, max: durability.max })}
            fraction={durability.max > 0 ? durability.current / durability.max : 0}
            color={durabilityColor(durability)}
          />
        ) : (
          <Bar
            size="sm"
            label={gameText("framestat.durability")}
            icon="framestat.durability"
            value={formatInt(build.durabilityMax)}
            fraction={build.durabilityMax / SCALE.durability}
          />
        )}
      </div>

      <Fold id={folded ? foldId : undefined}>
        {folded && explainSwitch}
        <dl className={s.traits}>
          {passive && (
            <div className={s.trait}>
              <Term icon="passive">{ui("ui.frame.passive")}</Term>
              <dd>
                <strong className={s.traitName}>{gameText(passive.textKey)}</strong>
                {brief && gameBrief(passive.textKey) !== undefined ? (
                  <span className={s.lineInline}>{gameBrief(passive.textKey)}</span>
                ) : (
                  <ul className={s.lines}>
                    {passive.modifiers.map((m, i) => (
                      // modifiers have no id; their order is the content's
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed content order
                      <li key={i}>{describeModifier(m)}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          )}
          {frame.quirkSlots > 0 && (
            <div className={s.trait}>
              <Term icon="quirk">{ui("ui.frame.quirks")}</Term>
              <dd>
                {quirks === undefined ? (
                  <span>{uiAt(detail, "ui.frame.quirks.random", { n: frame.quirkSlots })}</span>
                ) : (
                  <ul className={s.quirks}>
                    {quirks.map((q) => {
                      const quirk = content.getQuirk(q);
                      return (
                        <li key={q}>
                          <strong className={s.traitName}>{gameText(quirk.textKey)}</strong>
                          <span className={s.lineInline}>
                            {(brief && gameBrief(quirk.textKey)) ||
                              describeSource(quirk).join(" · ")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </dd>
            </div>
          )}
          {parts.length > 0 && (
            <div className={s.trait}>
              <Term icon="part">{ui("ui.frame.parts")}</Term>
              <dd>{parts.map((p) => gameText(content.getPart(p).textKey)).join(", ")}</dd>
            </div>
          )}
          {variant === "full" && (
            <>
              <div className={s.trait}>
                <Term icon="rule">{ui("ui.frame.rule")}</Term>
                <dd>
                  {(brief && gameBrief(`rule.${maker.rule}`)) || gameText(`rule.${maker.rule}`)}
                </dd>
              </div>
              <div className={s.trait}>
                <Term icon="crew">{ui("ui.frame.crew")}</Term>
                <dd>
                  {uiAt(detail, "ui.frame.crew.text", {
                    crew: gameText(maker.crew.textKey),
                    stats: maker.crew.stats.map((st) => ui(`ui.stat.abbr.${st}`)).join(" · "),
                    bonus: formatFraction(maker.crew.trainingBonus),
                  })}
                </dd>
              </div>
            </>
          )}
        </dl>
      </Fold>
    </article>
  );
}
