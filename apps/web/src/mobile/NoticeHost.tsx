import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { GameError, GameErrorKind } from "../game/controller";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useFlowTimer } from "../ui/flowTimer";
import { useLatest } from "../ui/useLatest";
import { useReducedMotion } from "../ui/useMedia";
import type { Flow } from "./flow/types";
import type { Notice, UiEvent } from "./flow/ui";
import { useLayersIdle } from "./LayerHost";
import { MOTION } from "./motion";
import {
  cutsNotice,
  NOTICE_RISE,
  noticeRise,
  noticeTop,
  type Shown,
  type Span,
  slotView,
} from "./noticeSlot";
import st from "./Story.module.css";

/** The live notice's id and role; the copy that fades out has neither. */
const NOTICE_ID = "m-aviso-error";

/** One notice: its words, how long it stays once shown, and whom it tells. */
type Note = {
  readonly id: string;
  readonly shown: boolean;
  /** Its time on screen, from its first display. */
  readonly ms: number;
  /** Its words; `close` (its button) only while it shows. */
  readonly body: (close: (() => void) | undefined) => ReactNode;
  readonly onShown: () => void;
  readonly onGone: () => void;
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
};

/**
 * The notice's slot (`slotView`): shown when nothing plays in front, for its time from its first
 * display; then, or when its screen changes or something comes in front of it, it leaves
 * (`leave`: faded as a copy, or cut) and is gone.
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
  const { screen } = o;
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
    } else if (view === "gone") go(n, false);
  }, [view, id, at, screen, latest]);
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
 * A column's notice (plan §1.9): a refused act's (`role="alert"`), just over the screen's
 * `[data-toast-anchor]` (elsewhere where that would cover one of the screen's controls or what
 * they must not hide, `[data-toast-avoid]`: `noticeTop`), placed again when the screen changes,
 * the column is resized or the screen scrolls. A notice that leaves while it could still be read
 * fades out as an id-less, inert copy (no close) that a timer removes; under an opaque layer, or
 * under reduced motion, it goes at once. A second refusal is a notice of its own: it waits for
 * the copy of the one before it, so they never stand one over another.
 */
function Notices({
  note,
  visible,
  screen,
  cut,
}: {
  readonly note: Note | undefined;
  /** Nothing plays in front of the game. */
  readonly visible: boolean;
  readonly screen: string;
  /** An opaque layer is in front (a scene, the emblem, a card). */
  readonly cut: boolean;
}) {
  const reduced = useReducedMotion();
  const outMs = reduced ? 0 : MOTION.toastOut;
  const [leaving, setLeaving] = useState<readonly Leaving[]>([]);
  // where the live notice stands, for the copy that fades from there
  const tops = useRef(new Map<string, number>());
  const seq = useRef(0);
  const leave = (n: Note, fade: boolean): void => {
    const top = tops.current.get(n.id);
    tops.current.delete(n.id);
    if (fade && outMs > 0 && top !== undefined) {
      seq.current += 1;
      const copy: Leaving = { key: seq.current, top, note: n };
      setLeaving((l) => [...l, copy]);
    }
    n.onGone();
  };
  // a notice waits for the one before it to fade out: one after the other, never one over another
  const o: SlotOptions = { visible, screen, cut, fades: outMs > 0, fading: leaving.length > 0 };
  const slot = useSlot(note, o, leave);
  const live = slot.live ? (note?.id ?? "") : "";

  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number>();
  // how far it rises as it comes in: never onto what stands under it
  const [rise, setRise] = useState(NOTICE_RISE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed again when the notice on screen or the screen under it changes
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const app = el.closest("[data-app]");
    let current: number | undefined;
    /** Where the notice goes; on a scroll it follows its anchor or stays while it covers nothing. */
    const place = (scrolled: boolean) => {
      const anchor = app?.querySelector("[data-toast-anchor]")?.getBoundingClientRect();
      // fixed inside the column: its containing block is the column when it carries a transform
      const cbTop =
        app && getComputedStyle(app).transform !== "none" ? app.getBoundingClientRect().top : 0;
      const height = el.getBoundingClientRect().height;
      const controls = app ? spansOf(app, CONTROLS, el) : [];
      const avoid = app ? spansOf(app, "[data-toast-avoid]", el) : [];
      const t = noticeTop({
        anchorTop: anchor && anchor.height > 0 ? anchor.top : undefined,
        cbTop,
        height,
        controls,
        avoid,
        current: scrolled ? current : undefined,
        follow: scrolled,
      });
      current = t;
      setTop(t);
      setRise(noticeRise({ top: t, cbTop, height, controls, avoid }));
      for (const child of Array.from(el.children))
        if (child instanceof HTMLElement && child.dataset.notice)
          tops.current.set(child.dataset.notice, t + child.offsetTop);
    };
    place(false);
    if (!app) return;
    const resized = new ResizeObserver(() => place(false));
    resized.observe(app);
    // the screen's scroller moves the anchor or what the notice stands over (one event a frame)
    const scrolled = () => place(true);
    app.addEventListener("scroll", scrolled, { capture: true, passive: true });
    return () => {
      resized.disconnect();
      app.removeEventListener("scroll", scrolled, { capture: true });
    };
  }, [live, screen]);

  const gone = (key: number) => setLeaving((l) => l.filter((x) => x.key !== key));

  return (
    <>
      {slot.live && note && (
        <div
          ref={box}
          className={st.notices}
          style={
            top === undefined
              ? { visibility: "hidden" }
              : ({ top, "--toast-rise": `${rise}px` } as CSSProperties)
          }
        >
          <div className={st.toast} id={NOTICE_ID} role="alert" data-notice={note.id}>
            {note.body(slot.close)}
          </div>
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
      <div className={cx(st.toast, st.toastOut)}>{copy.note.body(undefined)}</div>
    </div>
  );
}

/** What a player taps on a screen: the notice never sits over one (rule 17). */
const CONTROLS = 'button, a[href], input, select, textarea, label, [role="button"]';

/**
 * Where what `selector` matches in the column shows in the viewport (not the notice's own, nor
 * what is out of reach), each cut to what its scrollers show of it: a control scrolled out of view
 * is no control the notice could cover.
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
 * A run's notice (plan §1.9): a refused act (`notice`). It shows only while the flow allows one
 * (`flow.toast`: no layer, no race replay, no training's result) and no layer is in front or
 * leaving (LayerHost's child), so a notice set under a scene, the emblem, the inheritance card or
 * the week's effects waits for them and then shows its whole time. Never in `ui/modals`: the back
 * gesture and the sheet hold ignore it.
 */
export function NoticeHost({
  flow,
  notice,
  dispatch,
}: {
  readonly flow: Flow;
  readonly notice: Notice | undefined;
  readonly dispatch: (e: UiEvent) => void;
}) {
  const idle = useLayersIdle();
  const note: Note | undefined = notice && {
    id: `error:${notice.n}`,
    shown: notice.shown,
    ms: MOTION.noticeMs,
    body: (close) => errorWords(notice.kind, close),
    onShown: () => dispatch({ type: "noticeShown", n: notice.n }),
    onGone: () => dispatch({ type: "noticeGone", n: notice.n }),
  };
  return (
    <Notices
      note={note}
      visible={flow.toast && idle}
      screen={flow.screenKey}
      cut={cutsNotice(flow.layer?.kind)}
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
    ms: MOTION.noticeMs,
    body: (close) => errorWords(error.kind, close),
    onShown: () => undefined,
    onGone: onClose,
  };
  return <Notices note={note} visible screen="select" cut={false} />;
}
