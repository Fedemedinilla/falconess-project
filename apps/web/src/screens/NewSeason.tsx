import type { ContentIndex, Falconess, RunInput } from "@falconess/schema";
import { BIOMES, STYLES } from "@falconess/schema";
import { STAT_ORDER, startSeason } from "@falconess/sim";
import { type FormEvent, useMemo, useState } from "react";
import { ScreenExplainDefault } from "../app/ExplainDefault";
import { useDetail, useGlobalDetail } from "../app/explain";
import { SavedRunNotice } from "../app/SavedRunNotice";
import { navigate } from "../app/useRoute";
import { randomSeed } from "../game/seed";
import { useGame } from "../game/useGame";
import { gameBrief, uiAt } from "../text/brief";
import { formatInt } from "../text/format";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { ExplainSwitch } from "../ui/ExplainSwitch";
import { Icon } from "../ui/Icon";
import { biomeIcon, statIcon, styleIcon } from "../ui/icons";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import { useNarrow } from "../ui/useMedia";
import { describeActiveSkill, describeModifier, formatFraction } from "./model/describe";
import {
  crewCoverage,
  DEFAULT_FALCONESS,
  defaultHangar,
  HANGAR_SIZE,
  orderedFrames,
  seasonStatScale,
  toggleFrame,
} from "./model/new-season";
import s from "./NewSeason.module.css";
import { Bar } from "./shared/Bar";
import { Fold, FrameCard } from "./shared/FrameCard";
import { Letter } from "./shared/Letter";

type RunnerCardProps = {
  falconess: Falconess;
  content: ContentIndex;
  checked: boolean;
  onPick: () => void;
  scale: number;
  narrow: boolean;
};

/**
 * A Falconess to pick: stats and growth, aptitudes, her unique skill and her goal races. The
 * skill's line is the one text the card shortens: its "Breve | Completo" sits on that row.
 */
function RunnerCard({ falconess: f, content, checked, onPick, scale, narrow }: RunnerCardProps) {
  const sponsor = content.getManufacturer(f.sponsor);
  const id = `nueva-corredora-${f.id}`;
  const [detail, setDetail] = useDetail(`${id}-explicacion`);
  return (
    <article
      className={cx(s.runner, checked && s.checked)}
      style={{
        "--livery-primary": sponsor.palette.primary,
        "--livery-secondary": sponsor.palette.secondary,
      }}
    >
      <input
        type="radio"
        id={id}
        name="nueva-corredora"
        value={f.id}
        checked={checked}
        onChange={onPick}
        className={s.hiddenInput}
      />
      <label htmlFor={id} className={s.hitArea}>
        <span className="visually-hidden">{gameText(f.textKey)}</span>
      </label>
      <span className={s.band} aria-hidden="true" />
      <span className={s.runnerHead}>
        <span className={s.runnerName} id={`${id}-nombre`}>
          {gameText(f.textKey)}
        </span>
        {checked && (
          <Pill tone="accent" solid>
            {ui("ui.new.chosen")}
          </Pill>
        )}
        <span className={s.species}>{f.species}</span>
      </span>
      <span className={s.sponsor}>
        <Livery palette={sponsor.palette} size="sm" />
        {ui("ui.new.sponsor", { maker: gameText(sponsor.textKey) })}
      </span>

      <div className={s.block}>
        {STAT_ORDER.map((stat) => {
          const growth = f.growth[stat] ?? 0;
          return (
            <Bar
              key={stat}
              size="sm"
              label={gameText(`stat.${stat}`)}
              icon={statIcon(stat)}
              value={formatInt(f.baseStats[stat])}
              fraction={f.baseStats[stat] / scale}
              after={
                growth > 0 ? ui("ui.new.growth", { growth: formatFraction(growth) }) : undefined
              }
              afterTone="up"
            />
          );
        })}
      </div>

      <Fold id={narrow ? `${id}-detalle` : undefined} label={ui("ui.new.runner.more")}>
        <span className={s.aptitudes}>
          <span className={s.aptRow}>
            <span className={s.aptLabel}>{ui("ui.turn.aptitude.biome")}</span>
            {BIOMES.map((b) => (
              <span key={b} className={s.apt}>
                <Icon name={biomeIcon(b)} />
                {gameText(`biome.${b}`)} <Letter letter={f.biomeAptitude[b] ?? "G"} />
              </span>
            ))}
          </span>
          <span className={s.aptRow}>
            <span className={s.aptLabel}>{ui("ui.turn.aptitude.style")}</span>
            {STYLES.map((st) => (
              <span key={st} className={cx(s.apt, st === f.preferredStyle && s.preferred)}>
                <Icon name={styleIcon(st)} />
                {gameText(`style.${st}`)} <Letter letter={f.styleAptitude[st] ?? "G"} />
              </span>
            ))}
          </span>
          <span className={s.prefers}>
            {ui("ui.new.preferred", { style: gameText(`style.${f.preferredStyle}`) })}
          </span>
        </span>

        {f.uniqueSkills.map((skillId, i) => {
          const skill = content.getSkill(skillId);
          const brief = detail === "brief" ? gameBrief(skill.textKey) : undefined;
          return (
            <div key={skillId} className={s.unique}>
              <div className={s.uniqueHead}>
                <span className={s.aptLabel}>
                  <Icon name="skill" />
                  {ui("ui.new.unique")}
                </span>
                {i === 0 && (
                  <ExplainSwitch
                    id={`${id}-explicacion`}
                    detail={detail}
                    onChange={setDetail}
                    name={gameText(f.textKey)}
                  />
                )}
              </div>
              <strong>{gameText(skill.textKey)}</strong>
              <span className={s.uniqueDesc}>
                {brief ??
                  (skill.kind === "active"
                    ? describeActiveSkill(skill)
                    : skill.modifiers.map(describeModifier).join(" · "))}
              </span>
            </div>
          );
        })}

        <span className={s.goals}>
          <span className={s.aptLabel}>
            <Icon name="goalRace" />
            {ui("ui.new.goals")}
          </span>
          {[...f.seasonGoals]
            .sort((a, b) => a.turn - b.turn)
            .map((g) => (
              <span key={g.turn} className={s.goal}>
                <span className={s.goalWeek}>{ui("ui.goals.week", { turn: g.turn })}</span>
                <span>{gameText(content.getCourse(g.courseId).textKey)}</span>
                <span className={s.goalPlace}>{ui("ui.goals.need", { place: g.minPlace })}</span>
              </span>
            ))}
        </span>
      </Fold>
    </article>
  );
}

/**
 * Set up a season: the Falconess, up to four frames for the hangar and the seed. Everything shown
 * is content; the frame she starts with is the sim's answer (`startSeason`).
 */
export function NewSeason() {
  const { game } = useGame();
  // a new season starts on the current ruleset, whatever run is in storage
  const ctx = game.newRunContext();
  const content = ctx.content;
  const roster = [...content.falconess.values()];
  const frames = useMemo(() => orderedFrames(content), [content]);
  const scale = seasonStatScale(ctx.ruleset.season.statMax);
  const [falconessId, setFalconessId] = useState(
    content.falconess.has(DEFAULT_FALCONESS) ? DEFAULT_FALCONESS : (roster[0]?.id ?? ""),
  );
  const [hangar, setHangar] = useState<readonly string[]>(() => defaultHangar(content));
  const [seed, setSeed] = useState(randomSeed);
  const seedOk = seed.trim() !== "";
  const narrow = useNarrow();
  const [pageDetail] = useGlobalDetail();

  // the frame the season starts with, as the sim picks it
  const equipped = useMemo(() => {
    if (hangar.length === 0 || !content.falconess.has(falconessId)) return undefined;
    const input: Extract<RunInput, { kind: "start" }> = {
      kind: "start",
      falconessId,
      hangar: [...hangar],
      parents: [],
    };
    try {
      return startSeason(game.newRunContext(), "preview", input).equippedFrame;
    } catch {
      return undefined;
    }
  }, [game, content, falconessId, hangar]);

  const coverage = crewCoverage(content, hangar);
  const ready = hangar.length > 0 && seedOk && content.falconess.has(falconessId);

  const start = (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready) return;
    if (game.start(falconessId, hangar, seed.trim())) navigate("temporada");
  };

  const chosen = content.falconess.get(falconessId);

  return (
    <form className={s.page} onSubmit={start} aria-labelledby="nueva-titulo">
      <header className={s.intro}>
        <p className={s.eyebrow}>{ui("ui.new.eyebrow", { ruleset: ctx.ruleset.version })}</p>
        <h1 className={s.title} id="nueva-titulo">
          {ui("ui.screen.newSeason.title")}
        </h1>
        <p className={s.lead}>{ui("ui.new.lead", { size: HANGAR_SIZE })}</p>
        <ScreenExplainDefault />
      </header>

      {/* 1 · runner ------------------------------------------------------------------------- */}
      <Panel title={ui("ui.new.runner")} meta={ui("ui.new.runner.meta", { n: roster.length })}>
        <fieldset className={s.fieldset}>
          <legend className="visually-hidden">{ui("ui.new.runner")}</legend>
          <p className={s.hint}>{uiAt(pageDetail, "ui.new.runner.hint")}</p>
          <div className={s.runners}>
            {roster.map((f) => (
              <RunnerCard
                key={f.id}
                falconess={f}
                content={content}
                checked={f.id === falconessId}
                onPick={() => setFalconessId(f.id)}
                scale={scale}
                narrow={narrow}
              />
            ))}
          </div>
        </fieldset>
      </Panel>

      {/* 2 · seed --------------------------------------------------------------------------- */}
      <Panel title={ui("ui.new.seed")}>
        <div className={s.seedRow}>
          <label htmlFor="nueva-semilla" className={s.seedLabel}>
            {ui("ui.new.seed.label")}
          </label>
          <input
            id="nueva-semilla"
            className={s.seedInput}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-describedby="nueva-semilla-ayuda"
            aria-invalid={seedOk ? undefined : true}
          />
          <Button id="nueva-semilla-otra" onClick={() => setSeed(randomSeed())}>
            {ui("ui.new.seed.random")}
          </Button>
        </div>
        <p className={s.hint} id="nueva-semilla-ayuda">
          {ui("ui.new.seed.hint")}
        </p>
      </Panel>

      {/* 3 · hangar ------------------------------------------------------------------------- */}
      <Panel
        title={ui("ui.new.hangar")}
        meta={ui("ui.new.hangar.count", { n: hangar.length, max: HANGAR_SIZE })}
      >
        <fieldset className={s.fieldset}>
          <legend className="visually-hidden">{ui("ui.new.hangar")}</legend>
          <p className={s.hint}>{uiAt(pageDetail, "ui.new.hangar.hint", { max: HANGAR_SIZE })}</p>
          {hangar.length >= HANGAR_SIZE && (
            <p className={s.fullHint} role="status">
              {ui("ui.new.hangar.full")}
            </p>
          )}
          <div className={s.coverage}>
            <span className={s.aptLabel}>
              <Icon name="crew" />
              {ui("ui.new.coverage")}
            </span>
            <ul className={s.coverageList}>
              {coverage.map((c) => (
                <li key={c.stat} className={cx(s.cover, c.crews.length === 0 && s.uncovered)}>
                  <span className={s.coverStat}>
                    <Icon name={statIcon(c.stat)} />
                    {ui(`ui.stat.abbr.${c.stat}`)}
                  </span>
                  {c.crews.length === 0 ? (
                    <span className={s.coverNone}>{ui("ui.new.coverage.none")}</span>
                  ) : (
                    c.crews.map((m) => (
                      <Livery
                        key={m}
                        palette={content.getManufacturer(m).palette}
                        label={gameText(content.getManufacturer(m).crew.textKey)}
                        size="sm"
                      />
                    ))
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className={s.frames}>
            {frames.map((frame) => {
              const checked = hangar.includes(frame.id);
              const full = !checked && hangar.length >= HANGAR_SIZE;
              const id = `nueva-bastidor-${frame.id}`;
              return (
                <div
                  key={frame.id}
                  className={cx(s.frameOption, checked && s.checked, full && s.full)}
                >
                  <input
                    type="checkbox"
                    id={id}
                    checked={checked}
                    disabled={full}
                    onChange={() => setHangar((h) => toggleFrame(h, frame.id))}
                    className={s.frameCheck}
                  />
                  <label htmlFor={id} className={s.hitArea}>
                    <span className="visually-hidden">{gameText(frame.textKey)}</span>
                  </label>
                  <FrameCard
                    frameId={frame.id}
                    headingId={`${id}-nombre`}
                    explainId={`${id}-explicacion`}
                    foldId={`${id}-detalle`}
                    tag={
                      checked ? (
                        <Pill tone="accent" solid>
                          {frame.id === equipped ? ui("ui.new.equipped") : ui("ui.new.inHangar")}
                        </Pill>
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      </Panel>

      {/* start bar -------------------------------------------------------------------------- */}
      <div className={s.startBar}>
        <div className={s.startNotice}>
          <SavedRunNotice idPrefix="nueva" action="start" />
        </div>
        <p className={s.summary}>
          {chosen && <strong>{gameText(chosen.textKey)}</strong>}
          <span className={hangar.length === 0 ? undefined : s.summaryHangar}>
            {hangar.length === 0
              ? ui("ui.new.summary.empty")
              : ui("ui.new.summary.hangar", {
                  frames: hangar.map((f) => gameText(content.getFrame(f).textKey)).join(", "),
                })}
          </span>
          {equipped && (
            <span className={s.summaryEquipped}>
              {ui("ui.new.summary.equipped", {
                frame: gameText(content.getFrame(equipped).textKey),
              })}
            </span>
          )}
        </p>
        <Button id="nueva-empezar" variant="primary" size="lg" submit disabled={!ready}>
          {ui("ui.new.start")}
        </Button>
      </div>
    </form>
  );
}
