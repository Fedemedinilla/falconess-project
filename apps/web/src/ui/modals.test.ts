import { describe, expect, it } from "vitest";
import { createModalRegistry } from "./modals";
import { sheetPhase } from "./useModalDialog";

describe("the modal registry (F10): which sheets are open", () => {
  it("counts a sheet from its open until its release", () => {
    const modals = createModalRegistry();
    expect(modals.anyOpen()).toBe(false);
    const release = modals.hold();
    expect(modals.anyOpen()).toBe(true);
    release();
    expect(modals.anyOpen()).toBe(false);
  });

  it("tells its subscribers when that changes, and only then", () => {
    const modals = createModalRegistry();
    const seen: boolean[] = [];
    const stop = modals.subscribe(() => seen.push(modals.anyOpen()));
    const a = modals.hold();
    const b = modals.hold();
    a();
    b();
    expect(seen).toEqual([true, false]);
    stop();
    modals.hold();
    expect(seen).toEqual([true, false]);
  });

  it("nested opens: a sheet over a sheet, closed in any order", () => {
    const modals = createModalRegistry();
    const goals = modals.hold();
    const track = modals.hold();
    track();
    expect(modals.anyOpen()).toBe(true);
    const again = modals.hold();
    goals();
    expect(modals.anyOpen()).toBe(true);
    again();
    expect(modals.anyOpen()).toBe(false);
  });

  it("a release counts once, however often it runs (StrictMode runs effects twice)", () => {
    const modals = createModalRegistry();
    const a = modals.hold();
    const b = modals.hold();
    a();
    a();
    expect(modals.anyOpen()).toBe(true);
    b();
    expect(modals.anyOpen()).toBe(false);
  });

  it("the back gesture closes the sheet opened last of those still open, as its «Cerrar» does", () => {
    const modals = createModalRegistry();
    const closed: string[] = [];
    expect(modals.closeTop()).toBe(false);
    const goals = modals.hold(() => closed.push("goals"));
    const track = modals.hold(() => closed.push("track"));
    expect(modals.closeTop()).toBe(true);
    expect(closed).toEqual(["track"]);
    // its parent closes it: released, the one under it is next
    track();
    modals.closeTop();
    expect(closed).toEqual(["track", "goals"]);
    goals();
    expect(modals.closeTop()).toBe(false);
    // a sheet released out of order leaves the others in their order
    const a = modals.hold(() => closed.push("a"));
    const b = modals.hold(() => closed.push("b"));
    const c = modals.hold(() => closed.push("c"));
    b();
    modals.closeTop();
    c();
    modals.closeTop();
    expect(closed.slice(2)).toEqual(["c", "a"]);
    a();
  });

  it("released at the close request: a closing sheet is still in the page, no longer open", () => {
    const modals = createModalRegistry();
    // the parent opens it: in the page, and held
    let phase = sheetPhase("closed", true);
    expect(phase).toBe("open");
    const release = modals.hold();
    // its close request (a pick, «Cerrar», Escape): it is still closing in the page, and what
    // waits for no sheet open goes on at once
    phase = sheetPhase(phase, false);
    release();
    expect(phase).toBe("closing");
    expect(modals.anyOpen()).toBe(false);
    // asked open again while closing: open; a closed sheet asked closed stays out of the page
    expect(sheetPhase("closing", true)).toBe("open");
    expect(sheetPhase("closed", false)).toBe("closed");
  });
});
