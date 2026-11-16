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
  it("cut under the layers that start on black or cover the game; faded over the effects", () => {
    expect((["scene", "emblem", "inspiration"] as const).every((k) => cutsNotice(k))).toBe(true);
    expect(cutsNotice("fx")).toBe(false);
    expect(cutsNotice("event")).toBe(false);
    expect(cutsNotice(undefined)).toBe(false);
  });
});
