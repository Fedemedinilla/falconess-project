import type { ChatTopic } from "@falconess/schema";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { useModalOpen } from "../ui/modals";
import { useLatest } from "../ui/useLatest";
import { reducedMotion, scrollBehavior } from "../ui/useMedia";
import { useFocusReturn, useSheetPhase } from "../ui/useModalDialog";
import { useLayerFocus } from "./LayerHost";
import s from "./Story.module.css";
import { replyKeysFor } from "./storyModel";

type Bubble = { readonly key: string; readonly text: string; readonly mine: boolean };

const TYPING_MS = 650;
const PER_CHAR_MS = 12;

type ChatProps = {
  name: string;
  topics: readonly ChatTopic[];
  read: ReadonlySet<string>;
  /** The scenes seen in this season: a topic answers after one as `afterScene` says. */
  seen: ReadonlySet<string>;
  primary: string;
  secondary: string;
  onRead: (topicId: string) => void;
  onClose: () => void;
};

/**
 * The chat with the Falconess (owner 2026-11-12): optional, only to know her better. The player
 * taps a question pill; she types and answers in her own voice, bubble by bubble. It changes
 * nothing in the season. A topic opens with the week (`fromTurn`); a new one carries «Nuevo».
 * In the page while open or closing (M8): it comes in rising over 240 ms, and on its close it
 * counts as closed at once (the back gesture goes on to what is under it) and fades out over
 * 180 ms, inert, before it leaves; each opening starts a new conversation.
 *
 * A modal sheet that stays in the game's column (the tablet's frame, the wide screen's column hold
 * it, which the top layer of a native `<dialog>` would not): while it is open the game under it is
 * inert (RunView), the focus goes to its «Cerrar», Escape closes it as «Cerrar» does, and at its
 * close request the focus goes back to what opened it (final review C4, P4).
 */
export function ChatSheet({ open, ...props }: ChatProps & { open: boolean }) {
  // an open sheet for the flow and the back gesture from its open until its close request
  useModalOpen(open, props.onClose);
  useFocusReturn(open);
  const phase = useSheetPhase(open);
  return phase === "closed" ? null : <Chat {...props} closing={phase === "closing"} />;
}

function Chat({
  name,
  topics,
  read,
  seen,
  primary,
  secondary,
  onRead,
  onClose,
  closing,
}: ChatProps & { closing: boolean }) {
  const [bubbles, setBubbles] = useState<readonly Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // its «Cerrar» takes the focus as it opens, or once a sheet it opened under («Menú», on its way
  // out and still modal) has gone, as a layer's control does
  const close = useRef<HTMLButtonElement>(null);
  useLayerFocus(close, !closing);
  // Escape closes it, as a native sheet's close request does
  const onCloseNow = useLatest(onClose);
  useEffect(() => {
    if (closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onCloseNow.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closing, onCloseNow]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new bubble
  useEffect(() => {
    // smoothly, unless the viewer asked for reduced motion: then it jumps (plan §2.4)
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: scrollBehavior() });
  }, [bubbles, typing]);

  const ask = (t: ChatTopic) => {
    if (typing) return;
    setBubbles((b) => [
      ...b,
      { key: `${t.id}/q/${b.length}`, text: gameText(t.questionKey), mine: true },
    ]);
    onRead(t.id);
    let at = 0;
    const replies = replyKeysFor(t, seen);
    replies.forEach((k, i) => {
      const text = gameText(k);
      const wait = reducedMotion() ? 0 : TYPING_MS + Math.min(900, text.length * PER_CHAR_MS);
      timers.current.push(setTimeout(() => setTyping(true), at));
      at += wait;
      timers.current.push(
        setTimeout(() => {
          setBubbles((b) => [...b, { key: `${t.id}/${i}/${b.length}`, text, mine: false }]);
          if (i === replies.length - 1) setTyping(false);
        }, at),
      );
      at += 250;
    });
  };

  const style = { "--s1": primary, "--s2": secondary } as CSSProperties;
  return (
    <div
      className={s.chat}
      style={style}
      id="m-chat"
      role="dialog"
      aria-modal="true"
      aria-labelledby="m-chat-titulo"
      data-closing={closing ? "" : undefined}
      inert={closing || undefined}
    >
      <header className={s.chatBar}>
        <h2 id="m-chat-titulo">
          {ui("ui.m.chat.with", { name })}
          <small>{ui("ui.m.chat.sub")}</small>
        </h2>
        <button type="button" id="m-chat-cerrar" ref={close} onClick={onClose}>
          {ui("ui.m.close.story")}
        </button>
      </header>
      <div className={s.feed} ref={feed} aria-live="polite">
        {bubbles.map((b) => (
          <p key={b.key} className={b.mine ? `${s.bubble} ${s.mine}` : s.bubble}>
            {b.text}
          </p>
        ))}
        {typing && (
          <span className={s.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      <div className={s.pills}>
        {topics.length === 0 && <p className={s.hint}>{ui("ui.m.chat.none")}</p>}
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            className={s.pill}
            data-topic={t.id}
            data-read={read.has(t.id)}
            disabled={typing}
            onClick={() => ask(t)}
          >
            {gameText(t.questionKey)}
            {!read.has(t.id) && <span className={s.newTag}>{ui("ui.m.chat.new")}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
