/**
 * What a notice does and where it sits (plan §1.9), apart from the DOM: NoticeHost's decisions.
 * A notice shows only while nothing plays in front of the game (the flow's `toast` and the layers
 * idle); its time counts from its first display; once shown and hidden it is gone (F23). Pure.
 */
import type { Layer } from "./flow/types";

/** The notice a slot showed: the screen it came on, and how long it stays. */
export type Shown = { readonly id: string; readonly screen: string; readonly ms: number };

/**
 * What a slot does with its notice now:
 * - `live`: it shows (its first display, or still on the screen it came on);
 * - `wait`: never shown yet, and something plays in front, or a notice that left still fades
 *   where it stood: it waits for its turn (one notice after the other, never one over another);
 * - `fade`: it showed and must go (another screen, the week's effects, a training's result): an
 *   id-less copy of it fades out;
 * - `cut`: the same, but at once: an opaque layer came in front (a fading notice would show over
 *   its black first frame), or nothing fades (reduced motion);
 * - `gone`: it showed before this host was there (the End's column replaced the run's): gone;
 * - `none`: no notice.
 */
export type SlotView = "live" | "wait" | "fade" | "cut" | "gone" | "none";

export function slotView(
  note: { readonly id: string; readonly shown: boolean } | undefined,
  at: Shown | undefined,
  o: {
    /** Nothing plays in front: the flow's `toast` and the layers idle. */
    readonly visible: boolean;
    /** The screen on now (the flow's `screenKey`). */
    readonly screen: string;
    /** An opaque layer is in front. */
    readonly cut: boolean;
    /** A notice fades out (not under reduced motion). */
    readonly fades: boolean;
    /** The copy of a notice that left still fades out. */
    readonly fading: boolean;
  },
): SlotView {
  if (!note) return "none";
  const here = at !== undefined && at.id === note.id;
  if (o.visible && (here ? at.screen === o.screen : !note.shown && !o.fading)) return "live";
  if (here) return o.cut || !o.fades ? "cut" : "fade";
  return note.shown ? "gone" : "wait";
}

/** The layers a notice cannot fade over: they start on opaque black or cover the game. */
export function cutsNotice(layer: Layer["kind"] | undefined): boolean {
  return layer === "scene" || layer === "emblem" || layer === "inspiration";
}

/** Without an anchor on screen, the notices sit under the top bar. */
export const NOTICE_TOP = 124;
/** Between the notices and their anchor. */
export const NOTICE_GAP = 10;

/**
 * The notices' top in their containing block: just over the screen's `[data-toast-anchor]` (the
 * menu's track tab, a card's foot: rule 17), or `NOTICE_TOP` without one. `cbTop` is where the
 * containing block starts in the viewport: the game's column when it carries a transform (the
 * wide screen), else the viewport (0).
 */
export function noticeTop(m: {
  readonly anchorTop: number | undefined;
  readonly cbTop: number;
  readonly height: number;
}): number {
  const top =
    m.anchorTop === undefined ? NOTICE_TOP : m.anchorTop - m.cbTop - m.height - NOTICE_GAP;
  return Math.max(8, Math.round(top));
}
