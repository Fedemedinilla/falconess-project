import { describe, expect, it } from "vitest";
import { cutsNotice, NOTICE_TOP, noticeTop, type Shown, slotView } from "./noticeSlot";

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
  it("never over a control of the screen: where the anchor's place covers one, under the top bar (rule 17)", () => {
    // a race card's positions reach down to its foot (a small phone, a long card)
    const positions = [{ top: 480, bottom: 560 }];
    expect(noticeTop({ anchorTop: 600, cbTop: 0, height: 60, controls: positions })).toBe(
      NOTICE_TOP,
    );
    // the controls are measured in the viewport: the column's offset applies
    expect(
      noticeTop({ anchorTop: 620, cbTop: 20, height: 60, controls: [{ top: 540, bottom: 580 }] }),
    ).toBe(NOTICE_TOP);
  });
  it("a control's edge under it is no cover; nor one away from it", () => {
    // the notice stands 530-590: a card whose border ends 4 px into it, a button under the bar
    const controls = [
      { top: 400, bottom: 534 },
      { top: 30, bottom: 80 },
    ];
    expect(noticeTop({ anchorTop: 600, cbTop: 0, height: 60, controls })).toBe(530);
  });
  it("where under the top bar covers a control too, over the anchor still", () => {
    const controls = [
      { top: 480, bottom: 560 },
      { top: 130, bottom: 170 },
    ];
    expect(noticeTop({ anchorTop: 600, cbTop: 0, height: 60, controls })).toBe(530);
  });
  it("cut under the layers that start on black or cover the game; faded over the effects", () => {
    expect((["scene", "emblem", "inspiration"] as const).every((k) => cutsNotice(k))).toBe(true);
    expect(cutsNotice("fx")).toBe(false);
    expect(cutsNotice("event")).toBe(false);
    expect(cutsNotice(undefined)).toBe(false);
  });
});
