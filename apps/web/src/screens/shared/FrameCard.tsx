import { FrameStats } from "@falconess/schema";
import { resolveFrameBuild } from "@falconess/sim";
import type { ReactNode } from "react";
import { getContent } from "../../content/load";
import { formatFixed, formatInt } from "../../text/format";
import { gameText, ui } from "../../text/ui";
import { cx } from "../../ui/cx";
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

/** A frame from content: livery, the four frame stats, its passive or quirks, rule and crew. */
export function FrameCard({
  frameId,
  quirks,
  parts = [],
  durability,
  variant = "full",
  tag,
  headingId,
  foldId,
  className,
}: FrameCardProps) {
  const narrow = useNarrow();
  const content = getContent();
  const frame = content.getFrame(frameId);
  const maker = content.getManufacturer(frame.manufacturer);
  const build = resolveFrameBuild(content, frameId, parts, quirks ?? []);
  const livery = {
    "--livery-primary": maker.palette.primary,
    "--livery-secondary": maker.palette.secondary,
  };
  const passive = frame.passive === undefined ? undefined : content.getPassive(frame.passive);

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
          <Pill>{gameText(`style.${frame.style}`)}</Pill>
          <Pill tone={frame.rarity === "SSR" ? "accent" : "neutral"}>{frame.rarity}</Pill>
        </p>
      </header>

      <div className={s.stats}>
        <Bar
          size="sm"
          label={gameText("framestat.powerToWeight")}
          value={formatFixed(build.powerToWeight, 1000, 2)}
          fraction={build.powerToWeight / SCALE.powerToWeight}
        />
        <Bar
          size="sm"
          label={gameText("framestat.energy")}
          value={formatInt(build.energy)}
          fraction={build.energy / SCALE.energy}
        />
        <Bar
          size="sm"
          label={gameText("framestat.dissipation")}
          value={formatInt(build.dissipation)}
          fraction={build.dissipation / SCALE.dissipation}
        />
        {durability ? (
          <Bar
            size="sm"
            label={gameText("framestat.durability")}
            value={ui("ui.frame.durability", { current: durability.current, max: durability.max })}
            fraction={durability.max > 0 ? durability.current / durability.max : 0}
            color={durabilityColor(durability)}
          />
        ) : (
          <Bar
            size="sm"
            label={gameText("framestat.durability")}
            value={formatInt(build.durabilityMax)}
            fraction={build.durabilityMax / SCALE.durability}
          />
        )}
      </div>

      <Fold id={narrow ? foldId : undefined}>
        <dl className={s.traits}>
          {passive && (
            <div className={s.trait}>
              <dt>{ui("ui.frame.passive")}</dt>
              <dd>
                <strong className={s.traitName}>{gameText(passive.textKey)}</strong>
                <ul className={s.lines}>
                  {passive.modifiers.map((m, i) => (
                    // modifiers have no id; their order is the content's
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed content order
                    <li key={i}>{describeModifier(m)}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {frame.quirkSlots > 0 && (
            <div className={s.trait}>
              <dt>{ui("ui.frame.quirks")}</dt>
              <dd>
                {quirks === undefined ? (
                  <span>{ui("ui.frame.quirks.random", { n: frame.quirkSlots })}</span>
                ) : (
                  <ul className={s.quirks}>
                    {quirks.map((q) => {
                      const quirk = content.getQuirk(q);
                      return (
                        <li key={q}>
                          <strong className={s.traitName}>{gameText(quirk.textKey)}</strong>
                          <span className={s.lineInline}>{describeSource(quirk).join(" · ")}</span>
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
              <dt>{ui("ui.frame.parts")}</dt>
              <dd>{parts.map((p) => gameText(content.getPart(p).textKey)).join(", ")}</dd>
            </div>
          )}
          {variant === "full" && (
            <>
              <div className={s.trait}>
                <dt>{ui("ui.frame.rule")}</dt>
                <dd>{gameText(`rule.${maker.rule}`)}</dd>
              </div>
              <div className={s.trait}>
                <dt>{ui("ui.frame.crew")}</dt>
                <dd>
                  {ui("ui.frame.crew.text", {
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
