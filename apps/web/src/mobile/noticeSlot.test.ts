import { describe, expect, it } from "vitest";
import {
  cutsNotice,
  NOTICE_CLEAR,
  NOTICE_TOP,
  noticeTop,
  type Shown,
  slotView,
} from "./noticeSlot";

const note = (id: string, shown = false) => ({ id, shown });
const free = { visible: true, screen: "menu", cut: false, fades: true, fading: false };
const at = (id: string, screen = "menu"): Shown => ({ id, screen, ms: 4000 });

describe("slotView: what a notice does now (plan §1.9)", () => {
  it("shows when nothing plays in front; stays while its screen stays", () => {
    expect(slotView(note("a"), undefined, free)).toBe("live");
    expect(slotView(note("a", true), at("a"), free)).toBe("live");
  });
  it("waits, never shown, while something plays in front (a layer, a replay, a training's result)", () => {
    expect(slotView(note("a"), undefined, { ...free, visible: false })).toBe("wait");
    expect(slotView(note("a"), undefined, { ...free, visible: false, cut: true })).toBe("wait");
    // the slot's last notice was another one
    expect(slotView(note("b"), at("a"), { ...free, visible: false })).toBe("wait");
  });
  it("waits, never shown, while the notice before it fades out where it stood; one shown stays", () => {
    expect(slotView(note("b"), undefined, { ...free, fading: true })).toBe("wait");
    expect(slotView(note("a", true), at("a"), { ...free, fading: true })).toBe("live");
  });
  it("shown, then another screen, the effects or a result: it fades out", () => {
    expect(slotView(note("a", true), at("a"), { ...free, screen: "train" })).toBe("fade");
    expect(slotView(note("a", true), at("a"), { ...free, visible: false })).toBe("fade");
  });
  it("shown, then an opaque layer, or no fade under reduced motion: it goes at once", () => {
    expect(slotView(note("a", true), at("a"), { ...free, visible: false, cut: true })).toBe("cut");
    expect(slotView(note("a", true), at("a"), { ...free, screen: "end", fades: false })).toBe(
      "cut",
    );
  });
  it("shown before this host was there: gone, never shown again (F23)", () => {
    expect(slotView(note("a", true), undefined, free)).toBe("gone");
    expect(slotView(note("a", true), at("b"), { ...free, visible: false })).toBe("gone");
  });
  it("held only by a layer's exit over its screen: shown there once the exit is over; dropped unseen on another screen (6.2)", () => {
    const held = { id: "a", shown: false, heldOn: "menu" };
    expect(slotView(held, undefined, free)).toBe("live");
    expect(slotView(held, undefined, { ...free, visible: false })).toBe("wait");
    expect(slotView(held, undefined, { ...free, screen: "train" })).toBe("drop");
    expect(slotView(held, undefined, { ...free, visible: false, screen: "race:10" })).toBe("drop");
    // never held (it waited behind another notice, or a layer in front): it waits for its turn anywhere
    expect(slotView(note("a"), undefined, { ...free, screen: "train" })).toBe("live");
    // shown: the usual fade
    expect(slotView({ ...held, shown: true }, at("a"), { ...free, screen: "train" })).toBe("fade");
  });
  it("no notice: nothing", () => {
    expect(slotView(undefined, at("a"), free)).toBe("none");
  });
});

describe("the notices' place", () => {
  it("just over the anchor, in the containing block's coordinates (rule 17, H6)", () => {
    expect(noticeTop({ anchorTop: 600, cbTop: 0, height: 60 })).toBe(530);
    // the wide screen's column carries a transform: its own top is the origin
    expect(noticeTop({ anchorTop: 620, cbTop: 20, height: 60 })).toBe(530);
  });
  it("under the top bar without an anchor; never off the top", () => {
    expect(noticeTop({ anchorTop: undefined, cbTop: 20, height: 60 })).toBe(NOTICE_TOP);
    expect(noticeTop({ anchorTop: 40, cbTop: 0, height: 60 })).toBe(8);
  });
  it("a real gap: no control within 3 px of it; over the anchor it moves down toward it, in the middle of the room left (6.7, parity N6)", () => {
    // the race card at 390×844: Acecho and Remate end at 694, «Correr» (the foot) starts at 774;
    // a 72 px notice 10 px over the foot (692-764) would rest on their edge
    const positions = [
      { top: 416, bottom: 529 },
      { top: 537, bottom: 694 },
    ];
    const top = noticeTop({ anchorTop: 774, cbTop: 0, height: 72, controls: positions });
    expect(top).toBe(698);
    expect(top - 694).toBeGreaterThanOrEqual(NOTICE_CLEAR);
    expect(774 - (top + 72)).toBeGreaterThanOrEqual(NOTICE_CLEAR);
  });
  it("where the anchor's place covers a control, the clear place nearest the anchor: no control, nor the card's title (6.7)", () => {
    // week 48's long card at 390×844: the HUD, the title and the objective (`avoid`), the track's
    // button and the positions (controls): free between the objective and the track's button
    const avoid = [
      { top: 14, bottom: 114 },
      { top: 164, bottom: 194 },
      { top: 200, bottom: 220 },
    ];
    const controls = [
      { top: 350, bottom: 407 },
      { top: 462, bottom: 575 },
      { top: 583, bottom: 740 },
    ];
    expect(noticeTop({ anchorTop: 774, cbTop: 0, height: 72, controls, avoid })).toBe(275);
    // the same in a column that carries a transform (its top at 20 in the viewport)
    const shift = (l: readonly { top: number; bottom: number }[]) =>
      l.map((c) => ({ top: c.top + 20, bottom: c.bottom + 20 }));
    expect(
      noticeTop({
        anchorTop: 794,
        cbTop: 20,
        height: 72,
        controls: shift(controls),
        avoid: shift(avoid),
      }),
    ).toBe(275);
  });
  it("no clear place: under the top bar where the anchor's place covers a control (9a4333b, rule 17)", () => {
    // a small phone's race card: no gap tall enough between the title, the facts and the positions
    const avoid = [
      { top: 14, bottom: 114 },
      { top: 164, bottom: 194 },
      { top: 200, bottom: 240 },
    ];
    const positions = [
      { top: 304, bottom: 361 },
      { top: 416, bottom: 529 },
      { top: 537, bottom: 694 },
    ];
    expect(noticeTop({ anchorTop: 670, cbTop: 0, height: 72, controls: positions, avoid })).toBe(
      NOTICE_TOP,
    );
    // the controls are measured in the viewport: the column's offset applies
    expect(
      noticeTop({
        anchorTop: 620,
        cbTop: 20,
        height: 60,
        controls: [{ top: 540, bottom: 580 }],
        avoid: [{ top: 20, bottom: 520 }],
      }),
    ).toBe(NOTICE_TOP);
  });
  it("no clear place, and under the top bar covers a control too: over the anchor still", () => {
    const controls = [
      { top: 480, bottom: 560 },
      { top: 130, bottom: 170 },
    ];
    const avoid = [
      { top: 0, bottom: 130 },
      { top: 170, bottom: 480 },
    ];
    expect(noticeTop({ anchorTop: 600, cbTop: 0, height: 60, controls, avoid })).toBe(530);
  });
  it("re-placed on a scroll: it stays where it stands while that covers nothing, and over its anchor it follows it, out of view too", () => {
    const controls = [{ top: 300, bottom: 400 }];
    // a free place it stands in: kept, though nearer the anchor would do as well
    expect(noticeTop({ anchorTop: 900, cbTop: 0, height: 60, controls, current: 200 })).toBe(830);
    expect(
      noticeTop({
        anchorTop: 900,
        cbTop: 0,
        height: 60,
        controls: [{ top: 780, bottom: 900 }],
        current: 200,
      }),
    ).toBe(200);
    // the selection scrolled: its anchor (the choices) went up, and the notice with it
    const choices = [{ top: 20, bottom: 140 }];
    expect(
      noticeTop({ anchorTop: 20, cbTop: 0, height: 60, controls: choices, follow: true }),
    ).toBe(-50);
    // shown on a scrolled selection, it stays in view (9a4333b's rule)
    expect(noticeTop({ anchorTop: 20, cbTop: 0, height: 60, controls: choices })).toBe(8);
  });
  it("cut under the layers that start on black or cover the game; faded over the effects", () => {
    expect((["scene", "emblem", "inspiration"] as const).every((k) => cutsNotice(k))).toBe(true);
    expect(cutsNotice("fx")).toBe(false);
    expect(cutsNotice("event")).toBe(false);
    expect(cutsNotice(undefined)).toBe(false);
  });
});
