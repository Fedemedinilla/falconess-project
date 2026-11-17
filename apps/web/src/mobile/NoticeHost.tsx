import type { StoryScene } from "@falconess/schema";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { allScenes } from "../content/story";
import type { GameError, GameErrorKind } from "../game/controller";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useFlowTimer } from "../ui/flowTimer";
import { useLatest } from "../ui/useLatest";
import { useReducedMotion } from "../ui/useMedia";
import type { Flow } from "./flow/types";
import type { Notice, Toast, UiEvent } from "./flow/ui";
import { useLayersIdle } from "./LayerHost";
import { MOTION } from "./motion";
import { cutsNotice, noticeTop, type Shown, type Span, slotView } from "./noticeSlot";
import st from "./Story.module.css";

/** One notice: its words, its element, how long it stays once shown, and whom it tells. */
type Note = {
  readonly id: string;
  readonly shown: boolean;
  /** Its time on screen, from its first display. */
  readonly ms: number;
  /** The live notice's id and role (the copy that fades out has none). */
  readonly elementId: string;
  readonly role: "status" | "alert";
  /** Its words; `close` (its button) only while it shows. */
  readonly body: (close: (() => void) | undefined, live: boolean) => ReactNode;
  readonly onShown: () => void;
  readonly onGone: () => void;
  /** A story notice: the screen a layer's exit held it on, and how it reports that screen. */
  readonly heldOn?: string | undefined;
  readonly onHeld?: ((screen: string) => void) | undefined;
};

/** A notice on its way out: an id-less copy where it stood, until its timer removes it. */
type Leaving = {
  readonly key: number;
  readonly top: number;
  readonly note: Note;
};

type SlotOptions = {
  readonly visible: boolean;
  readonly screen: string;
  readonly cut: boolean;
  readonly fades: boolean;
  readonly fading: boolean;
  /** Only a layer on its way out holds the notices: the screen under it is live. */
  readonly exiting: boolean;
};

/**
 * One channel's notice (`slotView`): shown when nothing plays in front, for its time from its
 * first display; then, or when its screen changes or something comes in front of it, it leaves
 * (`leave`: faded as a copy, or cut) and is gone. A story notice that only a layer's exit holds
 * reports the screen it waits on (`onHeld`): left for another screen before it shows, it is dropped
 * unseen (`drop`).
 */
function useSlot(
  note: Note | undefined,
  o: SlotOptions,
  leave: (note: Note, fade: boolean) => void,
): { readonly live: boolean; readonly close: () => void } {
  const [at, setAt] = useState<Shown>();
  const view = slotView(note, at, o);
  const latest = useLatest({ note, leave });
  const id = note?.id;
  const { screen, exiting } = o;
  // before paint: a notice never shows a frame over what came in front of it
  useLayoutEffect(() => {
    const { note: n, leave: go } = latest.current;
    if (!n || n.id !== id) return;
    if (view === "live") {
      if (at?.id === n.id) return;
      setAt({ id: n.id, screen, ms: n.ms });
      n.onShown();
    } else if (view === "fade" || view === "cut") {
      setAt(undefined);
      go(n, view === "fade");
    } else if (view === "gone" || view === "drop") go(n, false);
    else if (view === "wait" && exiting && !n.shown && n.heldOn === undefined) n.onHeld?.(screen);
  }, [view, id, at, screen, exiting, latest]);
  // its time on screen, from its first display: a flow timer keyed by the notice
  const shownId = at?.id;
  useFlowTimer(
    at?.ms,
    () => {
      const { note: n, leave: go } = latest.current;
      if (!n || n.id !== shownId) return;
      setAt(undefined);
      go(n, true);
    },
    shownId ?? "",
  );
  const close = () => {
    const { note: n, leave: go } = latest.current;
    if (!n) return;
    setAt(undefined);
    go(n, true);
  };
  return { live: view === "live", close };
}

/**
 * The notices of a column (plan §1.9): the error's (`role="alert"`) over the story's
 * (`role="status"`), both just over the screen's `[data-toast-anchor]` (elsewhere where that
 * would cover one of the screen's controls or what they must not hide, `[data-toast-avoid]`:
 * `noticeTop`), placed again when the screen changes, the column is resized or the screen
 * scrolls. A notice that leaves while it could still be read
 * fades out as an id-less, inert copy (no «Ver», no close) that a timer removes; under an opaque
 * layer, or under reduced motion, it goes at once.
 */
function Notices({
  error,
  story,
  visible,
  screen,
  cut,
  exiting,
}: {
  readonly error: Note | undefined;
  readonly story: Note | undefined;
  /** Nothing plays in front of the game. */
  readonly visible: boolean;
  readonly screen: string;
  /** An opaque layer is in front (a scene, the emblem, a card). */
  readonly cut: boolean;
  /** Only a layer on its way out holds the notices (the screen under it is live). */
  readonly exiting: boolean;
}) {
  const reduced = useReducedMotion();
  const outMs = reduced ? 0 : MOTION.toastOut;
  const [leaving, setLeaving] = useState<readonly Leaving[]>([]);
  // where each live notice stands, for the copy that fades from there
  const tops = useRef(new Map<string, number>());
  const seq = useRef(0);
  const leave = (note: Note, fade: boolean): void => {
    const top = tops.current.get(note.id);
    tops.current.delete(note.id);
    if (fade && outMs > 0 && top !== undefined) {
      seq.current += 1;
      const copy: Leaving = { key: seq.current, top, note };
      setLeaving((l) => [...l, copy]);
    }
    note.onGone();
  };
  // a notice waits for the one before it to fade out: one after the other, never one over another
  const o: SlotOptions = {
    visible,
    screen,
    cut,
    fades: outMs > 0,
    fading: leaving.length > 0,
    exiting,
  };
  const err = useSlot(error, o, leave);
  const sto = useSlot(story, o, leave);
  const live = `${err.live ? error?.id : ""}|${sto.live ? story?.id : ""}`;

  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed again when the notices on screen or the screen under them change
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const app = el.closest("[data-app]");
    let current: number | undefined;
    /** Where the notices go; on a scroll they follow their anchor or stay while they cover nothing. */
    const place = (scrolled: boolean) => {
      const anchor = app?.querySelector("[data-toast-anchor]")?.getBoundingClientRect();
      // fixed inside the column: its containing block is the column when it carries a transform
      const cbTop =
        app && getComputedStyle(app).transform !== "none" ? app.getBoundingClientRect().top : 0;
      const t = noticeTop({
        anchorTop: anchor && anchor.height > 0 ? anchor.top : undefined,
        cbTop,
        height: el.getBoundingClientRect().height,
        controls: app ? spansOf(app, CONTROLS, el) : [],
        avoid: app ? spansOf(app, "[data-toast-avoid]", el) : [],
        current: scrolled ? current : undefined,
        follow: scrolled,
      });
      current = t;
      setTop(t);
      for (const child of Array.from(el.children))
        if (child instanceof HTMLElement && child.dataset.notice)
          tops.current.set(child.dataset.notice, t + child.offsetTop);
    };
    place(false);
    if (!app) return;
    const resized = new ResizeObserver(() => place(false));
    resized.observe(app);
    // the screen's scroller moves the anchor or what the notices stand over (one event a frame)
    const scrolled = () => place(true);
    app.addEventListener("scroll", scrolled, { capture: true, passive: true });
    return () => {
      resized.disconnect();
      app.removeEventListener("scroll", scrolled, { capture: true });
    };
  }, [live, screen]);

  const gone = (key: number) => setLeaving((l) => l.filter((x) => x.key !== key));

  const shown = (note: Note, close: () => void) => (
    <div className={st.toast} id={note.elementId} role={note.role} data-notice={note.id}>
      {note.body(close, true)}
    </div>
  );
  return (
    <>
      {(err.live || sto.live) && (
        <div
          ref={box}
          className={st.notices}
          style={top === undefined ? { visibility: "hidden" } : { top }}
        >
          {err.live && error && shown(error, err.close)}
          {sto.live && story && shown(story, sto.close)}
        </div>
      )}
      {leaving.map((c) => (
        <LeavingNotice key={c.key} copy={c} ms={outMs} onGone={gone} />
      ))}
    </>
  );
}

/** A notice's copy fading out where it stood, removed by its timer (never its animation's end). */
function LeavingNotice({
  copy,
  ms,
  onGone,
}: {
  readonly copy: Leaving;
  readonly ms: number;
  readonly onGone: (key: number) => void;
}) {
  useFlowTimer(ms, () => onGone(copy.key), String(copy.key));
  return (
    <div
      className={st.notices}
      style={{ top: copy.top }}
      aria-hidden="true"
      inert
      data-notice-leaving
    >
      <div className={cx(st.toast, st.toastOut)}>{copy.note.body(undefined, false)}</div>
    </div>
  );
}

/** What a player taps on a screen: the notices never sit over one (rule 17). */
const CONTROLS = 'button, a[href], input, select, textarea, label, [role="button"]';

/**
 * Where what `selector` matches in the column shows in the viewport (not the notices' own, nor
 * what is out of reach), each cut to what its scrollers show of it: a control scrolled out of view
 * is no control the notices could cover.
 */
function spansOf(app: Element, selector: string, notices: Element): Span[] {
  const out: Span[] = [];
  const clips = new Map<Element, Span | null>();
  /** What an element's scrolling ancestors (within the column) let show, in the viewport. */
  const clipOf = (from: Element | null): Span | null => {
    if (!from || from === app) return null;
    const known = clips.get(from);
    if (known !== undefined) return known;
    const outer = clipOf(from.parentElement);
    let clip = outer;
    if (getComputedStyle(from).overflowY !== "visible") {
      const r = from.getBoundingClientRect();
      clip = outer
        ? { top: Math.max(outer.top, r.top), bottom: Math.min(outer.bottom, r.bottom) }
        : { top: r.top, bottom: r.bottom };
    }
    clips.set(from, clip);
    return clip;
  };
  for (const c of Array.from(app.querySelectorAll(selector))) {
    if (notices.contains(c) || c.closest("[inert], [aria-hidden='true']")) continue;
    const r = c.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const clip = clipOf(c.parentElement);
    const top = clip ? Math.max(r.top, clip.top) : r.top;
    const bottom = clip ? Math.min(r.bottom, clip.bottom) : r.bottom;
    if (bottom > top) out.push({ top, bottom });
  }
  return out;
}

/** What went wrong, in the phone's words: #juego has no «Partida» to copy the run from. */
function errorWords(kind: GameErrorKind, close: (() => void) | undefined): ReactNode {
  return (
    <span className={st.toastRow}>
      {kind === "unexpected" ? ui("ui.m.error.unexpected") : ui(`ui.error.${kind}`)}
      {close && (
        <button type="button" className={st.toastBtn} onClick={close}>
          {ui("ui.error.dismiss")}
        </button>
      )}
    </span>
  );
}

/**
 * A story scene's notice (owner 2026-11-13): played («seen», «skipped») or passed by because she
 * saw it in an earlier season (owner 2026-11-14), with «Ver» to play it whole where a scene may
 * play now.
 */
function storyWords(
  toast: Toast,
  scene: StoryScene | undefined,
  watch: (() => void) | undefined,
): ReactNode {
  return (
    <>
      {scene && (
        <>
          <b>
            {gameText(scene.kickerKey)} · {gameText(scene.titleKey)}
          </b>
          <br />
        </>
      )}
      {toast.kind === "passed" ? (
        <span className={st.toastRow}>
          {ui("ui.m.story.passed")}
          {watch && (
            <button type="button" className={st.toastBtn} id="m-escena-ver" onClick={watch}>
              {ui("ui.m.story.watch")}
            </button>
          )}
        </span>
      ) : (
        ui(toast.kind === "skipped" ? "ui.m.story.skipped" : "ui.m.story.seen")
      )}
    </>
  );
}

/**
 * A run's notices (plan §1.9; replaces the story toast and the first error notice): the first
 * story notice of the flow's queue (`toasts`) and a refused act (`notice`). They show only while
 * the flow allows one (`flow.toast`: no layer, no race replay, no training's result) and no layer
 * is in front or leaving (LayerHost's child), so a notice set under a scene, the emblem, the
 * inheritance card or the week's effects waits for them and then shows its whole time. A scene's
 * notice that only the scene's 0.8 s exit holds belongs to the screen the scene left onto: if the
 * player goes to another one during the exit (it is live under the fade), the notice is dropped
 * unseen, as it would have shown there and gone with the change. «Ver» is there only while a scene
 * may play (`flow.canReplay`, critic b). Never in `ui/modals`: the back gesture and the sheet hold
 * ignore it.
 */
export function NoticeHost({
  flow,
  toasts,
  notice,
  dispatch,
  onWatch,
}: {
  readonly flow: Flow;
  readonly toasts: readonly Toast[];
  readonly notice: Notice | undefined;
  readonly dispatch: (e: UiEvent) => void;
  readonly onWatch: (scene: StoryScene) => void;
}) {
  const idle = useLayersIdle();
  const toast = toasts[0];
  const scene = toast && allScenes().find((sc) => sc.id === toast.sceneId);
  const canWatch = flow.canReplay;
  const story: Note | undefined = toast && {
    id: toast.id,
    shown: toast.shown,
    ms: toast.kind === "passed" ? MOTION.toastLong : MOTION.toastShort,
    elementId: "m-capitulo-aviso",
    role: "status",
    body: (_close, live) =>
      storyWords(toast, scene, live && canWatch && scene ? () => onWatch(scene) : undefined),
    onShown: () => dispatch({ type: "toastShown", id: toast.id }),
    onGone: () => dispatch({ type: "toastGone", id: toast.id }),
    heldOn: toast.heldOn,
    onHeld: (screen) => dispatch({ type: "toastHeld", id: toast.id, screen }),
  };
  const error: Note | undefined = notice && {
    id: `error:${notice.n}`,
    shown: notice.shown,
    ms: MOTION.toastLong,
    elementId: "m-aviso-error",
    role: "alert",
    body: (close) => errorWords(notice.kind, close),
    onShown: () => dispatch({ type: "noticeShown", n: notice.n }),
    onGone: () => dispatch({ type: "noticeGone", n: notice.n }),
  };
  return (
    <Notices
      error={error}
      story={story}
      visible={flow.toast && idle}
      screen={flow.screenKey}
      cut={cutsNotice(flow.layer?.kind)}
      exiting={flow.toast && !idle}
    />
  );
}

const errorIds = new WeakMap<GameError, string>();
let errorSeq = 0;

/** Each failure the controller reports is its own notice. */
function errorId(e: GameError): string {
  let id = errorIds.get(e);
  if (id === undefined) {
    errorSeq += 1;
    id = `error:select:${errorSeq}`;
    errorIds.set(e, id);
  }
  return id;
}

/**
 * The selection's notice (plan §1.9, critic b: errors were swallowed there): a «Continuar» whose
 * save no longer loads, or a season that could not start, in `ui.error.<kind>`'s words, until it
 * is closed or its time is up (`onClose` clears it). It sits just over the choices, on the heading.
 */
export function ErrorNotice({
  error,
  onClose,
}: {
  readonly error: GameError | undefined;
  readonly onClose: () => void;
}) {
  const note: Note | undefined = error && {
    id: errorId(error),
    shown: false,
    ms: MOTION.toastLong,
    elementId: "m-aviso-error",
    role: "alert",
    body: (close) => errorWords(error.kind, close),
    onShown: () => undefined,
    onGone: onClose,
  };
  return (
    <Notices error={note} story={undefined} visible screen="select" cut={false} exiting={false} />
  );
}
