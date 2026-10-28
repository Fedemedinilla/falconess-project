import { useLayoutEffect, useRef, useState } from "react";
import type { Detail } from "../text/brief";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { ExplainSwitch } from "../ui/ExplainSwitch";
import { Icon } from "../ui/Icon";
import { useNarrow } from "../ui/useMedia";
import s from "./ExplainDefault.module.css";
import { useGlobalDetail } from "./explain";

/** An element where the viewer is reading, and its top before the explanations changed. */
type Anchor = { readonly el: Element; readonly top: number };

/**
 * Where to look for the anchor, best first: a card whose top is in view (the cards above it are
 * the ones that change height), else a list item or a section, else a heading or a term. A card's
 * own lines are a poor anchor: the card's text below them changes too.
 */
const ANCHOR_TIERS = [
  "main article",
  "main li, main section, main fieldset",
  "main h2, main h3, main dt, main summary",
] as const;

/**
 * The first few anchors of the best tier whose top is in the viewport, in page order. Several:
 * one of them may be a line the new length removes.
 */
function readingAnchors(): Anchor[] {
  for (const tier of ANCHOR_TIERS) {
    const found: Anchor[] = [];
    for (const el of document.querySelectorAll(tier)) {
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top >= window.innerHeight) continue;
      found.push({ el, top });
      if (found.length >= 6) break;
    }
    if (found.length > 0) return found;
  }
  return [];
}

export type ExplainDefaultProps = {
  /** "bar": the top bar, "Explicaciones" hides on a narrow bar; "screen": a screen's head. */
  variant: "bar" | "screen";
  className?: string | undefined;
};

/**
 * The book icon, "Explicaciones" and [Breve | Completo]: the length of every card's explanation,
 * with the same control each card has. Choosing one drops the cards' own choices and is remembered in this
 * browser (`explain.ts`). What the viewer is reading stays where it was: the cards above it change
 * height, so the page scrolls by as much.
 */
export function ExplainDefault({ variant, className }: ExplainDefaultProps) {
  const [detail, setDetail] = useGlobalDetail();
  const anchors = useRef<Anchor[]>([]);
  const [changes, setChanges] = useState(0);

  useLayoutEffect(() => {
    if (changes === 0) return;
    const kept = anchors.current.find((a) => a.el.isConnected);
    anchors.current = [];
    if (!kept) return;
    const shift = kept.el.getBoundingClientRect().top - kept.top;
    if (Math.abs(shift) >= 1) window.scrollBy({ top: shift, behavior: "instant" });
  }, [changes]);

  const change = (next: Detail) => {
    anchors.current = readingAnchors();
    setDetail(next);
    setChanges((n) => n + 1);
  };

  return (
    <div className={cx(s.explain, s[variant], className)} title={ui("ui.explain.global.title")}>
      <span className={s.label} aria-hidden="true">
        <Icon name="explain" />
        <span className={s.labelText}>{ui("ui.explain.global")}</span>
      </span>
      <ExplainSwitch
        id="explicaciones"
        detail={detail}
        onChange={change}
        legend={ui("ui.explain.global.legend")}
      />
    </div>
  );
}

/**
 * The page's default at the head of a screen with explanations, on a phone only: the top bar has
 * it on wider screens, and its row scrolls away on a phone. One of the two is rendered, so the
 * ids stay unique.
 */
export function ScreenExplainDefault({ className }: { className?: string | undefined }) {
  return useNarrow() ? <ExplainDefault variant="screen" className={className} /> : null;
}
