import type { StoryBackground, StoryLine, StoryScene } from "@falconess/schema";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import bgFinish from "./art/bg-finish.webp";
import bgHangar from "./art/bg-hangar.webp";
import bgTrack from "./art/bg-track.webp";
import s from "./Story.module.css";

/** The painted backdrops of the scenes (owner 2026-11-12, made with Gemini). */
const BACKDROP: Readonly<Record<StoryBackground, string>> = {
  hangar: bgHangar,
  track: bgTrack,
  finish: bgFinish,
};

/** Speakers without a name plate. */
const UNNAMED = new Set(["narrator", "sfx"]);
const TYPE_MS = 26;
const WORD_MS = 110;
const CARD_MS = 1500;
const AUTO_MS = 1500;

function reduced(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function speakerName(line: StoryLine): string | undefined {
  return UNNAMED.has(line.speaker) ? undefined : gameText(`speaker.${line.speaker}`);
}

/**
 * A story scene over the game (owner 2026-11-12): the interface fades under it, the chapter's card
 * shows, then its lines one tap at a time. `box` is the dialogue box of a common scene, `cine` the
 * cinematic of a key scene (black bars, words appearing one by one, key lines large). Skip ends it
 * at once; Auto moves on by itself; the log rereads what was said.
 */
export function StoryOverlay({
  scene,
  primary,
  secondary,
  onDone,
}: {
  scene: StoryScene;
  primary: string;
  secondary: string;
  onDone: (skipped: boolean) => void;
}) {
  const [index, setIndex] = useState(-1);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [log, setLog] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const line = index >= 0 ? scene.lines[index] : undefined;
  const text = line ? gameText(line.textKey) : "";
  const cine = scene.style === "cine";
  // how far the line has appeared: letters in the box, words in the cinematic
  const units = cine ? text.split(" ").length : text.length;
  const complete = shown >= units;
  const done = useRef(false);

  const finish = useCallback(
    (skipped: boolean) => {
      if (done.current) return;
      done.current = true;
      setLeaving(true);
      setTimeout(() => onDone(skipped), 450);
    },
    [onDone],
  );

  // the chapter's card, then the first line
  useEffect(() => {
    const t = setTimeout(() => setIndex(0), reduced() ? 300 : CARD_MS);
    return () => clearTimeout(t);
  }, []);

  // the line appears: a letter (box) or a word (cine) at a time
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart on each new line
  useEffect(() => {
    if (index < 0) return;
    if (reduced()) {
      setShown(Number.MAX_SAFE_INTEGER);
      return;
    }
    setShown(0);
    const step = cine ? WORD_MS : TYPE_MS;
    const id = setInterval(() => setShown((n) => n + 1), step);
    return () => clearInterval(id);
  }, [index]);

  const next = useCallback(() => {
    if (log || index < 0) return;
    if (!complete) {
      setShown(Number.MAX_SAFE_INTEGER);
      return;
    }
    if (index + 1 >= scene.lines.length) finish(false);
    else setIndex(index + 1);
  }, [log, index, complete, scene.lines.length, finish]);

  useEffect(() => {
    if (!auto || !complete || log) return;
    const t = setTimeout(next, AUTO_MS);
    return () => clearTimeout(t);
  }, [auto, complete, log, next]);

  const style = { "--s1": primary, "--s2": secondary } as CSSProperties;
  const name = line && speakerName(line);
  const visible = text.slice(0, Math.min(shown, text.length));

  return (
    <div
      className={cx(s.overlay, cine ? s.cine : s.box, leaving && s.leaving)}
      style={style}
      id="m-capitulo"
      data-scene={scene.id}
      data-style={scene.style}
      data-background={scene.background}
      role="dialog"
      aria-modal="true"
      aria-label={gameText(scene.titleKey)}
    >
      {scene.background && (
        <>
          <img className={s.backdrop} src={BACKDROP[scene.background]} alt="" draggable={false} />
          <span className={s.shade} aria-hidden="true" />
        </>
      )}
      <button
        type="button"
        className={s.stage}
        id="m-capitulo-seguir"
        aria-label={ui("ui.m.story.next")}
        onClick={next}
      />
      {cine && (
        <>
          <span className={s.glow} aria-hidden="true" />
          <span className={cx(s.bar, s.barTop)} aria-hidden="true" />
          <span className={cx(s.bar, s.barBottom)} aria-hidden="true" />
        </>
      )}
      <div className={s.chrome}>
        <button
          type="button"
          aria-pressed={auto}
          id="m-capitulo-auto"
          onClick={() => setAuto((a) => !a)}
        >
          {ui("ui.m.story.auto")}
        </button>
        <button type="button" id="m-capitulo-registro" onClick={() => setLog(true)}>
          {ui("ui.m.story.log")}
        </button>
        <button type="button" id="m-capitulo-saltar" onClick={() => finish(true)}>
          {ui("ui.m.story.skip")} ⏭
        </button>
      </div>

      {index < 0 && (
        <div className={s.card} aria-live="polite">
          <small>{gameText(scene.kickerKey)}</small>
          <strong>{gameText(scene.titleKey)}</strong>
        </div>
      )}

      {line && !cine && (
        <div className={s.dialog} aria-live="polite">
          {name && <span className={s.plate}>{name}</span>}
          <p
            className={cx(
              s.text,
              line.speaker === "narrator" && s.narration,
              line.speaker === "sfx" && s.sfx,
            )}
          >
            {visible}
          </p>
          {complete && (
            <span className={s.more} aria-hidden="true">
              ▼
            </span>
          )}
        </div>
      )}

      {line && cine && (
        <p
          key={index}
          className={cx(
            s.subtitle,
            line.key && s.keyLine,
            line.speaker === "narrator" && s.narration,
            line.speaker === "sfx" && s.sfx,
          )}
          aria-live="polite"
        >
          {name && !line.key && <small>{name}</small>}
          {/* every word takes its place from the start (the ones to come stay invisible), so the
              line never grows and never pushes the speaker's name (owner 2026-11-12) */}
          {text.split(" ").map((w, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the words of a fixed line, in order
            <span key={k} className={k < shown ? s.wordOn : s.wordOff}>
              {w}{" "}
            </span>
          ))}
        </p>
      )}

      {log && (
        <div className={s.log} id="m-capitulo-log">
          <div className={s.logList}>
            {scene.lines.slice(0, index + 1).map((l, k) => {
              const n = speakerName(l);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are fixed and in order
                <p key={k}>
                  {n ? <b>{n}</b> : null}
                  {n ? <br /> : null}
                  {n ? gameText(l.textKey) : <i>{gameText(l.textKey)}</i>}
                </p>
              );
            })}
          </div>
          <button type="button" className={s.logClose} onClick={() => setLog(false)}>
            {ui("ui.m.close.story")}
          </button>
        </div>
      )}
    </div>
  );
}
