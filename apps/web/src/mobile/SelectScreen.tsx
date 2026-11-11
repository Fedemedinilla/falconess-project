import type { Difficulty } from "@falconess/schema";
import { useState } from "react";
import { randomSeed } from "../game/seed";
import { useGame } from "../game/useGame";
import { defaultHangar } from "../screens/model/new-season";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { runnerArt } from "./art";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";

/**
 * Character select: the three Falconess with their art, her school and wings' style and one line
 * of who she is. «Empezar» starts a season on the current ruleset with the default hangar and a
 * random seed (the test view keeps the full setup: seed and hangar). A run in storage can be
 * continued.
 */
export function SelectScreen({ onTests }: { onTests: () => void }) {
  const { game } = useGame();
  const ctx = game.newRunContext();
  const content = ctx.content;
  const roster = [...content.falconess.values()];
  const [picked, setPicked] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const hasExigente = ctx.ruleset.season.statCapByDifficulty !== undefined;
  const saved = game.savedRun();
  const savedName = (() => {
    const first = saved?.inputs[0];
    if (first?.kind !== "start") return undefined;
    const f = content.falconess.get(first.falconessId);
    return f ? gameText(f.textKey) : undefined;
  })();

  const start = () => {
    if (!picked) return;
    game.start(picked, defaultHangar(content), randomSeed(), hasExigente ? difficulty : undefined);
  };

  return (
    <div className={s.screen}>
      <div className={s.body}>
        <h1 className={s.title}>{ui("ui.m.pick.title")}</h1>
        <p className={s.sub}>
          {ui("ui.m.pick.sub", {
            turns: ctx.ruleset.season.turns,
            goals:
              (difficulty === "exigente"
                ? roster[0]?.exigenteGoals?.length
                : roster[0]?.seasonGoals.length) ?? 0,
          })}
        </p>
        <div className={s.pickList}>
          {roster.map((f) => {
            const art = runnerArt(f.id);
            const sponsor = content.getManufacturer(f.sponsor);
            const position = f.preferredPosition;
            const on = picked === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                id={`m-elegir-${f.id}`}
                className={cx(s.pickc, on && s.pickOn)}
                style={{ "--c": sponsor.palette.primary }}
                onClick={() => setPicked(f.id)}
              >
                <span className={s.pickSw} aria-hidden="true" />
                <span className={s.pickPic} aria-hidden="true">
                  {art && <img src={art.chibi} alt="" draggable={false} />}
                </span>
                <span className={s.pickT}>
                  <span className={s.pickN}>{gameText(f.textKey)}</span>
                  <span className={s.pickS}>
                    {gameText(sponsor.textKey)}
                    {` · ${gameText(`position.${position}`)}`}
                  </span>
                  <span className={s.pickP}>{ui(`ui.m.pick.line.${f.id}`)}</span>
                </span>
                {on && (
                  <span className={s.check} aria-hidden="true">
                    <Glyph name="check" size={16} color="#1d1704" weight={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {hasExigente && (
          <fieldset className={s.diff} id="m-dificultad" aria-label={ui("ui.m.difficulty")}>
            {(["normal", "exigente"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={difficulty === d}
                id={`m-dificultad-${d}`}
                className={cx(s.diffB, difficulty === d && s.diffOn)}
                onClick={() => setDifficulty(d)}
              >
                <span className={s.diffN}>{ui(`ui.m.difficulty.${d}`)}</span>
                <span className={s.diffS}>{ui(`ui.m.difficulty.${d}.line`)}</span>
              </button>
            ))}
          </fieldset>
        )}
        <p className={s.aitag}>{ui("ui.m.aiArt")}</p>
        {saved && savedName && (
          <button
            type="button"
            className={cx(s.btn, s.btnWide)}
            id="m-continuar"
            onClick={() => game.continueSaved()}
          >
            {ui("ui.m.pick.continue", { name: savedName })}
          </button>
        )}
        <button type="button" className={s.linkBtn} id="m-pruebas-inicio" onClick={onTests}>
          {ui("ui.m.tests")}
        </button>
      </div>
      <div className={s.foot}>
        <button
          type="button"
          className={cx(s.btn, s.btnMain)}
          id="m-empezar"
          disabled={!picked}
          onClick={start}
        >
          {picked
            ? ui("ui.m.pick.start", { name: gameText(content.getFalconess(picked).textKey) })
            : ui("ui.m.pick.none")}
        </button>
      </div>
    </div>
  );
}
