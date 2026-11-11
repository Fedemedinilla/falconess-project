import { STAT_ORDER } from "@falconess/sim";
import { useMemo, useState } from "react";
import { LoadDialog } from "../app/LoadDialog";
import { routeHref } from "../app/route";
import { navigate } from "../app/useRoute";
import { useGame } from "../game/useGame";
import { formatInt } from "../text/format";
import { locale, perLang } from "../text/lang";
import { gameText, ui, uiCount } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { statIcon } from "../ui/icons";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { PositionMark } from "../ui/PositionMark";
import { SeasonStrip } from "../ui/SeasonStrip";
import s from "./Home.module.css";

const list = perLang(() => new Intl.ListFormat(locale(), { style: "long", type: "conjunction" }));

type MenuItem = {
  id: string;
  title: string;
  note: string;
  onClick: () => void;
  primary?: boolean;
};

/** The playtests this page serves (ROADMAP section 4), in the order a tester meets them. */
const CHECKS = ["pt0", "pt1", "pt2"] as const;

/** The roster and its season goals, straight from content. */
function Roster() {
  const { game } = useGame();
  const ctx = game.context();
  const content = ctx.content;
  const turns = ctx.ruleset.season.turns;
  const frames = [...content.frames.values()];
  return (
    <div className={s.runners}>
      <p className={s.rosterNote}>{ui("ui.goals.rule")}</p>
      {[...content.falconess.values()].map((f) => {
        const sponsor = content.getManufacturer(f.sponsor);
        const signature = frames.find((fr) => fr.signatureOf === f.id);
        const weeks = list().format(f.seasonGoals.map((g) => formatInt(g.turn)));
        return (
          <article key={f.id} className={s.runner}>
            <header className={s.runnerHead}>
              <h3 className={s.runnerName}>{gameText(f.textKey)}</h3>
              <span className={s.species}>{f.species}</span>
              <span className={s.sponsor}>
                <Livery palette={sponsor.palette} size="lg" />
                {gameText(sponsor.textKey)}
              </span>
            </header>
            <dl className={s.facts}>
              {STAT_ORDER.map((stat) => (
                <div key={stat} className={s.fact}>
                  <dt title={gameText(`stat.${stat}`)}>
                    <Icon name={statIcon(stat)} />
                    {ui(`ui.stat.abbr.${stat}`)}
                  </dt>
                  <dd>{formatInt(f.baseStats[stat])}</dd>
                </div>
              ))}
              <div className={s.fact}>
                <dt>{ui("ui.home.roster.position")}</dt>
                <dd>
                  <PositionMark position={f.preferredPosition} />
                  {gameText(`position.${f.preferredPosition}`)}
                </dd>
              </div>
              {signature && (
                <div className={cx(s.fact, s.signature)}>
                  <dt>
                    <Icon name="frame" />
                    {ui("ui.home.roster.signature")}
                  </dt>
                  <dd>{gameText(signature.textKey)}</dd>
                </div>
              )}
            </dl>
            <SeasonStrip
              turns={turns}
              marks={f.seasonGoals.map((g) => ({
                turn: g.turn,
                label: ui("ui.home.goal.week", { turn: g.turn }),
              }))}
              label={ui("ui.home.strip.label", { turns, weeks })}
            />
            <ol className={s.goals}>
              {f.seasonGoals.map((g) => (
                <li key={g.turn} className={s.goal}>
                  <span className={s.goalWeek}>{ui("ui.home.goal.week", { turn: g.turn })}</span>
                  <span>{gameText(content.getCourse(g.courseId).textKey)}</span>
                  <span className={s.goalPlace}>
                    {ui("ui.home.goal.place", { place: g.minPlace })}
                  </span>
                </li>
              ))}
            </ol>
          </article>
        );
      })}
    </div>
  );
}

export type HomeProps = {
  /** Open the run tools (to copy the run in play before replacing it). */
  onOpenRun: () => void;
};

/** Start screen: continue, start, free race or load a run; the roster; what the tests ask. */
export function Home({ onOpenRun }: HomeProps) {
  const { game, snap } = useGame();
  const [loadOpen, setLoadOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const run = snap.run;
  // storage is read again whenever the run changes (a save, a load, a new season)
  const saved = useMemo(() => (snap.run ? undefined : game.savedRun()), [game, snap.run]);
  const ctx = game.context();
  const content = ctx.content;
  const turns = ctx.ruleset.season.turns;

  const nameOf = (id: string) =>
    content.falconess.has(id) ? gameText(content.getFalconess(id).textKey) : id;
  let continueNote: string | undefined;
  if (run) {
    const name = nameOf(run.state.falconessId);
    continueNote =
      run.state.status === "ended"
        ? ui("ui.home.continue.ended", { name, seed: run.seed, ruleset: run.rulesetVersion })
        : ui("ui.home.continue.active", {
            name,
            turn: run.state.turn,
            turns,
            seed: run.seed,
            ruleset: run.rulesetVersion,
          });
  } else if (saved) {
    const start = saved.inputs[0];
    continueNote = ui("ui.home.continue.saved", {
      name: start?.kind === "start" ? nameOf(start.falconessId) : saved.seed,
      decisions: uiCount("ui.count.decisions", saved.inputs.length - 1),
      seed: saved.seed,
      ruleset: saved.rulesetVersion,
    });
  }

  const startNew = () => {
    setConfirmNew(false);
    game.newSeason();
    navigate("temporada");
  };
  const onNew = () => {
    if (run?.state.status === "active" && !snap.saved) setConfirmNew(true);
    else startNew();
  };
  const onContinue = () => {
    if (!run && !game.continueSaved()) return;
    navigate(game.getSnapshot().run?.state.status === "ended" ? "fin" : "temporada");
  };

  const items: MenuItem[] = [
    ...(continueNote === undefined
      ? []
      : [
          {
            id: "inicio-continuar",
            title: ui("ui.home.continue"),
            note: continueNote,
            onClick: onContinue,
            primary: true,
          },
        ]),
    {
      id: "inicio-nueva",
      title: ui("ui.home.new"),
      note: ui("ui.home.new.note"),
      onClick: onNew,
      primary: continueNote === undefined,
    },
    {
      id: "inicio-libre",
      title: ui("ui.home.free"),
      note: ui("ui.home.free.note"),
      onClick: () => navigate("carrera-libre"),
    },
    {
      id: "inicio-cargar",
      title: ui("ui.home.load"),
      note: ui("ui.home.load.note"),
      onClick: () => setLoadOpen(true),
    },
  ];

  return (
    <div className={s.home}>
      <section className={s.intro} aria-labelledby="inicio-titulo">
        <p className={s.eyebrow}>
          {ui("ui.home.eyebrow", { ruleset: game.newRunContext().ruleset.version })}
        </p>
        <h1 className={s.title} id="inicio-titulo">
          {ui("ui.home.title")}
        </h1>
        <p className={s.lead}>{ui("ui.home.lead", { turns })}</p>
        <p className={s.lead}>
          <a href={routeHref("juego")} id="inicio-juego">
            {ui("ui.home.mobile")}
          </a>
        </p>
      </section>

      <div className={s.grid}>
        <Panel title={ui("ui.home.actions")} flush className={s.actions}>
          <ul className={s.menu}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  id={item.id}
                  className={cx(s.item, item.primary && s.primary)}
                  onClick={item.onClick}
                >
                  <span className={s.itemTitle}>{item.title}</span>
                  <span className={s.itemNote}>{item.note}</span>
                  <span className={s.arrow} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {confirmNew && (
            <div className={s.confirm} role="alert">
              <p>{ui("ui.home.discard")}</p>
              <div className={s.confirmActions}>
                <Button id="inicio-descartar" variant="danger" size="sm" onClick={startNew}>
                  {ui("ui.home.discard.confirm")}
                </Button>
                <Button id="inicio-copiar-antes" size="sm" onClick={onOpenRun}>
                  {ui("ui.home.discard.copy")}
                </Button>
                <Button
                  id="inicio-descartar-cancelar"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmNew(false)}
                >
                  {ui("ui.home.discard.cancel")}
                </Button>
              </div>
            </div>
          )}
          {!game.canSave && <p className={s.notice}>{ui("ui.home.noStorage")}</p>}
        </Panel>

        <Panel
          title={ui("ui.home.roster")}
          meta={ui("ui.home.roster.meta", { count: content.falconess.size, turns })}
          flush
          className={s.roster}
        >
          <Roster />
        </Panel>

        <Panel title={ui("ui.home.tests")} className={s.tests}>
          <ol className={s.checks}>
            {CHECKS.map((code) => (
              <li key={code} className={s.check}>
                <span className={s.code}>{ui(`ui.home.tests.${code}.code`)}</span>
                <span>{ui(`ui.home.tests.${code}`, { turns })}</span>
              </li>
            ))}
          </ol>
          <p className={s.report}>{ui("ui.home.tests.report")}</p>
        </Panel>
      </div>

      <LoadDialog open={loadOpen} onClose={() => setLoadOpen(false)} />
    </div>
  );
}
