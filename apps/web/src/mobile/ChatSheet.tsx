import type { ChatTopic } from "@falconess/schema";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import s from "./Story.module.css";

type Bubble = { readonly key: string; readonly text: string; readonly mine: boolean };

const TYPING_MS = 650;
const PER_CHAR_MS = 12;

function reduced(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * The chat with the Falconess (owner 2026-11-12): optional, only to know her better. The player
 * taps a question pill; she types and answers in her own voice, bubble by bubble. It changes
 * nothing in the season. A topic opens with the week (`fromTurn`); a new one carries «Nuevo».
 */
export function ChatSheet({
  name,
  topics,
  read,
  primary,
  secondary,
  onRead,
  onClose,
}: {
  name: string;
  topics: readonly ChatTopic[];
  read: ReadonlySet<string>;
  primary: string;
  secondary: string;
  onRead: (topicId: string) => void;
  onClose: () => void;
}) {
  const [bubbles, setBubbles] = useState<readonly Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new bubble
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, typing]);

  const ask = (t: ChatTopic) => {
    if (typing) return;
    setBubbles((b) => [
      ...b,
      { key: `${t.id}/q/${b.length}`, text: gameText(t.questionKey), mine: true },
    ]);
    onRead(t.id);
    let at = 0;
    t.replyKeys.forEach((k, i) => {
      const text = gameText(k);
      const wait = reduced() ? 0 : TYPING_MS + Math.min(900, text.length * PER_CHAR_MS);
      timers.current.push(setTimeout(() => setTyping(true), at));
      at += wait;
      timers.current.push(
        setTimeout(() => {
          setBubbles((b) => [...b, { key: `${t.id}/${i}/${b.length}`, text, mine: false }]);
          if (i === t.replyKeys.length - 1) setTyping(false);
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
    >
      <header className={s.chatBar}>
        <h2 id="m-chat-titulo">
          {ui("ui.m.chat.with", { name })}
          <small>{ui("ui.m.chat.sub")}</small>
        </h2>
        <button type="button" id="m-chat-cerrar" onClick={onClose}>
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
