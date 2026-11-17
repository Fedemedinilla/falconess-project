import type { StoryBackground, StoryLine, StoryScene } from "@falconess/schema";
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useFlowTimer } from "../ui/flowTimer";
import { isRepeatTap } from "../ui/tap";
import { useLatest } from "../ui/useLatest";
import bgFinish from "./art/bg-finish.webp";
import bgHangar from "./art/bg-hangar.webp";
import bgTrack from "./art/bg-track.webp";
import {
  cardShownAt,
  hurried,
  INTRO_TRACKS,
  type IntroTiming,
  type IntroTrack,
} from "./flow/scenes";
import type { Digest } from "./flow/types";
import { useLayerFocus, useLayerPhase, useLid } from "./LayerHost";
import { STORY } from "./motion";
import s from "./Story.module.css";
import { digestLines } from "./storyModel";

/** The painted backdrops of the scenes (owner 2026-11-12, made with Gemini). */
const BACKDROP: Readonly<Record<StoryBackground, string>> = {
  hangar: bgHangar,
  track: bgTrack,
  finish: bgFinish,
};

/** Speakers without a name plate. */
const UNNAMED = new Set(["narrator", "sfx"]);

function speakerName(line: StoryLine): string | undefined {
  return UNNAMED.has(line.speaker) ? undefined : gameText(`speaker.${line.speaker}`);
}

/** A time for CSS, in ms (a hurried track's times have fractions). */
const cssMs = (ms: number) => `${Math.round(ms * 100) / 100}ms`;

/**
 * The way in as the inline CSS variables Story.module.css reads (`--sc-<track>-at`/`-ms`, the
 * loops' `--sc-drift-at`/`--sc-pan-at`): a hurried way in changes only these, so every animation
 * goes on from where it is.
 */
function introVars(t: IntroTiming): Record<string, string> {
  const vars: Record<string, string> = {};
  const put = (name: string, k: IntroTrack) => {
    vars[`--sc-${name}-at`] = cssMs(k.at);
    vars[`--sc-${name}-ms`] = cssMs(k.ms);
  };
  for (const name of INTRO_TRACKS) put(name, t[name]);
  put("card-out", t.cardOut);
  vars["--sc-drift-at"] = cssMs(t.driftAt);
  vars["--sc-pan-at"] = cssMs(t.panAt);
  return vars;
}

/** Where the way in is: the scene coming in, the chapter's card whole, then its lines. */
type IntroBeat = "intro" | "card" | "line";

/**
 * A story scene over the game (owner 2026-11-12): black at once (owner 2026-11-13: the menu behind
 * never shows), the scene comes out of the black, the chapter's card shows, then its lines one tap
 * at a time. Its way in follows `timing` (plan §2.6: whole on Normal, short in a digest, still
 * under reduced motion; the card always shows whole, H4): «Saltar», Auto and Registro from 0.3 s,
 * and a tap during it (M10, O7) brings everything in within 120 ms from where it is, the card
 * whole, and the first line 0.5 s later (0.3 s in a digest); a second tap shows it at once.
 * `box` is the dialogue box of a common scene, `cine` the cinematic of a key scene (black bars,
 * words appearing one by one, key lines large). Skip ends it at once; Auto moves on by itself;
 * the log rereads what was said. It ends as its 0.8 s exit starts (`onFinish`): the flow moves on
 * under it at once, and LayerHost keeps this instance on its way out, fading over the real next
 * screen (D7) as an id-less copy whose timers have stopped (F18).
 */
export function StoryOverlay({
  scene,
  primary,
  secondary,
  digest: digestProp,
  timing: timingProp,
  onFinish,
}: {
  scene: StoryScene;
  primary: string;
  secondary: string;
  /** Play a fast digest instead of every line; read once, when the scene mounts. */
  digest?: Digest | undefined;
  /** Its way in (`introTiming`); read once, when the scene mounts. */
  timing: IntroTiming;
  /** Called once, as the scene starts to leave; held in a ref, so a new arrow on each render is fine. */
  onFinish: (skipped: boolean) => void;
}) {
  // latched: «Ritmo» can change in the desk panel's «Menú» mid-scene, and the timers key on it
  const [digest] = useState(digestProp);
  const [timing] = useState(timingProp);
  const still = timing.tempo === "still";
  const onFinishRef = useLatest(onFinish);
  // its ids only while it is in front (a leaving copy has none), its timers too: on its way out
  // nothing of it moves on, types or ends anything
  const lid = useLid();
  const playing = useLayerPhase() === "in";
  // the stage takes the focus (L7): Enter or Space reads on, the game behind is inert
  const stage = useRef<HTMLButtonElement>(null);
  useLayerFocus(stage);
  const lines = useMemo(
    () => (digest ? digestLines(scene.lines) : scene.lines),
    [digest, scene.lines],
  );
  const [index, setIndex] = useState(-1);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [log, setLog] = useState(false);
  // the way in counts from the scene's first frame; a tap during it hurries it (ms from there)
  const born = useRef(0);
  useEffect(() => {
    born.current = performance.now();
  }, []);
  const [hurry, setHurry] = useState<number>();
  const intro = useMemo(
    () => (hurry === undefined ? timing : hurried(timing, hurry)),
    [timing, hurry],
  );
  const vars = useMemo(() => introVars(intro), [intro]);
  const [cardShown, setCardShown] = useState(() => cardShownAt(timing) <= 0);
  const beat: IntroBeat = index >= 0 ? "line" : cardShown ? "card" : "intro";
  const line = index >= 0 ? lines[index] : undefined;
  const text = line ? gameText(line.textKey) : "";
  const cine = scene.style === "cine";
  // how far the line has appeared: letters in the box, words in the cinematic
  const units = cine ? text.split(" ").length : text.length;
  const complete = shown >= units;
  const done = useRef(false);

  // the flow moves on at once: the exit is LayerHost's (its time, its removal)
  const finish = useCallback(
    (skipped: boolean) => {
      if (done.current) return;
      done.current = true;
      onFinishRef.current(skipped);
    },
    [onFinishRef],
  );

  // the way in: the chapter's card whole, then the first line (sooner after a tap); a leaving
  // copy's timers are off
  useFlowTimer(
    playing && !cardShown ? cardShownAt(timing) : undefined,
    () => setCardShown(true),
    "card",
  );
  useFlowTimer(
    playing && index < 0 ? Math.max(0, intro.lineAt - (hurry ?? 0)) : undefined,
    () => setIndex(0),
    `line:${hurry ?? "-"}`,
  );

  // the line appears: a letter (box) or a word (cine) at a time
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart on each new line; stop on the way out
  useEffect(() => {
    if (!playing || index < 0) return;
    if (still || digest) {
      setShown(Number.MAX_SAFE_INTEGER);
      return;
    }
    setShown(0);
    const step = cine ? STORY.wordMs : STORY.typeMs;
    const id = setInterval(() => setShown((n) => n + 1), step);
    return () => clearInterval(id);
  }, [index, playing]);

  /** On to what comes next in the lines: the line whole, then the next one, then the end. */
  const next = useCallback(() => {
    if (log || index < 0) return;
    if (!complete) {
      setShown(Number.MAX_SAFE_INTEGER);
      return;
    }
    if (index + 1 >= lines.length) finish(false);
    else setIndex(index + 1);
  }, [log, index, complete, lines.length, finish]);

  /**
   * A tap on the scene. During the way in (M10): the first hurries it (the card whole at once, the
   * line soon), a second shows the line at once; a double tap's second click is no second tap
   * (F50). Then each tap reads on, as fast as the player taps.
   */
  const tap = (e: MouseEvent) => {
    if (log) return;
    if (index >= 0) {
      next();
      return;
    }
    if (isRepeatTap(e)) return;
    if (hurry === undefined) {
      setHurry(Math.max(0, performance.now() - born.current));
      setCardShown(true);
    } else setIndex(0);
  };

  // Auto and the digest move on by themselves once a line is whole (each line its own timer)
  useFlowTimer(
    playing && (auto || digest) && complete && !log && index >= 0
      ? digest
        ? digest.ms
        : STORY.autoMs
      : undefined,
    next,
    `step:${index}`,
  );

  const style = { "--s1": primary, "--s2": secondary, ...vars } as CSSProperties;
  const name = line && speakerName(line);
  const visible = text.slice(0, Math.min(shown, text.length));

  return (
    <div
      className={cx(s.overlay, cine ? s.cine : s.box, !playing && s.leaving)}
      style={style}
      id={lid("m-capitulo")}
      data-scene={scene.id}
      data-style={scene.style}
      data-digest={digest ? "true" : undefined}
      data-beat={beat}
      data-hurry={hurry === undefined ? undefined : ""}
      data-background={scene.background}
      role="dialog"
      aria-modal="true"
      aria-label={gameText(scene.titleKey)}
    >
      <span className={s.veil} aria-hidden="true" />
      <span className={s.base} aria-hidden="true" />
      {scene.background && (
        <>
          <img className={s.backdrop} src={BACKDROP[scene.background]} alt="" draggable={false} />
          <span className={s.shade} aria-hidden="true" />
        </>
      )}
      <button
        ref={stage}
        type="button"
        className={s.stage}
        id={lid("m-capitulo-seguir")}
        aria-label={ui("ui.m.story.next")}
        onClick={tap}
      />
      {cine && (
        <>
          <span className={s.glow} aria-hidden="true" />
          <span className={cx(s.bar, s.barTop)} aria-hidden="true" />
          <span className={cx(s.bar, s.barBottom)} aria-hidden="true" />
        </>
      )}
      <div className={s.chrome}>
        {digest && (
          <span className={s.digest} id={lid("m-capitulo-resumen")}>
            {ui("ui.m.story.digest")}
          </span>
        )}
        <button
          type="button"
          aria-pressed={auto}
          id={lid("m-capitulo-auto")}
          onClick={() => setAuto((a) => !a)}
        >
          {ui("ui.m.story.auto")}
        </button>
        <button type="button" id={lid("m-capitulo-registro")} onClick={() => setLog(true)}>
          {ui("ui.m.story.log")}
        </button>
        <button type="button" id={lid("m-capitulo-saltar")} onClick={() => finish(true)}>
          {ui("ui.m.story.skip")} ⏭
        </button>
      </div>

      {index < 0 && (
        <div className={s.card} aria-live="polite" data-card="">
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
        <div className={s.log} id={lid("m-capitulo-log")}>
          <div className={s.logList}>
            {lines.slice(0, index + 1).map((l, k) => {
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
