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
 * - `drop`: never shown, it waited only for a layer's exit over the screen the layer left it on
 *   (`heldOn`, the screen live under the exit), and the player went to another screen before it
 *   could show: it belonged there, so it goes unseen (and never over the next screen's controls);
 * - `none`: no notice.
 */
export type SlotView = "live" | "wait" | "fade" | "cut" | "gone" | "drop" | "none";

export function slotView(
  note:
    | { readonly id: string; readonly shown: boolean; readonly heldOn?: string | undefined }
    | undefined,
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
  if (!here && !note.shown && note.heldOn !== undefined && note.heldOn !== o.screen) return "drop";
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
/** The least room between the notices and a control or what they must not hide (6.7: a real gap). */
export const NOTICE_CLEAR = 3;
/** How far a control may reach under the notices and not count as covered, where no place is clear. */
export const NOTICE_EDGE = 4;

/** A control's vertical extent in the viewport (`getBoundingClientRect`'s top and bottom). */
export type Span = { readonly top: number; readonly bottom: number };

/**
 * The notices' top in their containing block: just over the screen's `[data-toast-anchor]` (the
 * menu's track tab, a card's foot, the selection's choices: rule 17), or `NOTICE_TOP` without one.
 * `cbTop` is where the containing block starts in the viewport: the game's column when it carries a
 * transform (the wide screen, the tablet's frame), else the viewport (0).
 *
 * Never over one of the screen's `controls` (rule 17: never over the buttons), with a real gap
 * (`NOTICE_CLEAR`), nor over what it must not hide (`avoid`: the HUD, a race card's title and
 * objective). Where the place over the anchor would, the clear place nearest the anchor: closer to
 * it, in the middle of the room left over it (a race card's positions reaching down to its foot),
 * or higher up the screen, just over what it must not cover; with none (a small phone's race
 * card), the notices sit under
 * the top bar, as on a screen with no anchor, unless that covers a control by more than a card's
 * edge too: then over the anchor still (9a4333b).
 *
 * Re-placed on a scroll (`current`, `follow`): over its anchor the notice follows it, also out of
 * view (the selection's choices scrolled up: it goes with the heading); elsewhere it stays where it
 * stands while that still covers nothing.
 */
export function noticeTop(m: {
  readonly anchorTop: number | undefined;
  readonly cbTop: number;
  readonly height: number;
  readonly controls?: readonly Span[];
  readonly avoid?: readonly Span[];
  /** Where the notices stand now, in the containing block: a scroll re-places them. */
  readonly current?: number | undefined;
  /** A scroll: over its anchor the notice follows it, out of view too. */
  readonly follow?: boolean;
}): number {
  const at = (top: number) => Math.max(8, Math.round(top));
  const under = at(NOTICE_TOP);
  if (m.anchorTop === undefined) return under;
  const h = m.height;
  // everything in the containing block's coordinates
  const local = (l: readonly Span[] | undefined) =>
    (l ?? []).map((c) => ({ top: c.top - m.cbTop, bottom: c.bottom - m.cbTop }));
  const controls = local(m.controls);
  const keepOut = [...controls, ...local(m.avoid)];
  const anchor = m.anchorTop - m.cbTop;
  const clear = (top: number) =>
    keepOut.every((c) => c.bottom + NOTICE_CLEAR <= top || top + h + NOTICE_CLEAR <= c.top);
  const placed = Math.round(anchor - h - NOTICE_GAP);
  const over = m.follow ? placed : at(placed);
  if (clear(over)) return over;
  if (m.current !== undefined && clear(m.current)) return m.current;
  // the clear place nearest the anchor: in the middle of the room over it, the same gap above and
  // below, or just over something it must not cover, higher up
  const below = Math.max(8, ...keepOut.filter((c) => c.top < anchor).map((c) => c.bottom));
  const middle = Math.round((below + anchor - h) / 2);
  if (middle >= 8 && clear(middle)) return middle;
  const tops = keepOut
    .map((c) => Math.floor(c.top - NOTICE_CLEAR - h))
    .filter((top) => top >= 8 && top < anchor - h && clear(top));
  if (tops.length > 0) return Math.max(...tops);
  const covers = (top: number) =>
    controls.some((c) => Math.min(c.bottom, top + h) - Math.max(c.top, top) > NOTICE_EDGE);
  const shown = at(placed);
  return covers(shown) && !covers(under) ? under : shown;
}
