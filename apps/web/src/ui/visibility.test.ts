import { describe, expect, it, vi } from "vitest";
import { createVisibility, type VisibilitySource } from "./visibility";

/** A page whose visibility and clock the test sets; `set` fires its `visibilitychange`. */
function fakePage(hiddenAtStart = false) {
  let hidden = hiddenAtStart;
  let now = 0;
  let changed: (() => void) | undefined;
  const source: VisibilitySource = {
    hidden: () => hidden,
    listen: (fn) => {
      changed = fn;
      return () => {
        changed = undefined;
      };
    },
    now: () => now,
  };
  return {
    source,
    at(ms: number) {
      now = ms;
    },
    set(next: boolean) {
      hidden = next;
      changed?.();
    },
  };
}

describe("createVisibility (6.11: a hidden tab)", () => {
  it("follows the page's hidden state and tells its listeners when it changes", () => {
    const page = fakePage();
    const v = createVisibility(page.source);
    const heard = vi.fn();
    v.subscribe(heard);
    expect(v.hidden()).toBe(false);
    page.set(true);
    expect(v.hidden()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    page.set(false);
    expect(v.hidden()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("an event that changes nothing tells nothing", () => {
    const page = fakePage();
    const v = createVisibility(page.source);
    const heard = vi.fn();
    v.subscribe(heard);
    page.set(false);
    page.set(true);
    page.set(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("a listener that leaves hears nothing more", () => {
    const page = fakePage();
    const v = createVisibility(page.source);
    const heard = vi.fn();
    const leave = v.subscribe(heard);
    leave();
    page.set(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it("its clock stops while the page is hidden and goes on from there when it shows", () => {
    const page = fakePage();
    const v = createVisibility(page.source);
    page.at(400);
    expect(v.visibleNow()).toBe(400);
    page.set(true);
    // three seconds in another tab: the game's time stands still
    page.at(1000);
    expect(v.visibleNow()).toBe(400);
    page.at(3400);
    expect(v.visibleNow()).toBe(400);
    page.set(false);
    expect(v.visibleNow()).toBe(400);
    page.at(3500);
    expect(v.visibleNow()).toBe(500);
    // a second time away counts as well
    page.set(true);
    page.at(9500);
    page.set(false);
    page.at(9600);
    expect(v.visibleNow()).toBe(600);
  });

  it("a page hidden from the start: the clock stands until it shows", () => {
    const page = fakePage(true);
    page.at(100);
    const v = createVisibility(page.source);
    expect(v.hidden()).toBe(true);
    page.at(5000);
    expect(v.visibleNow()).toBe(100);
    page.set(false);
    page.at(5250);
    expect(v.visibleNow()).toBe(350);
  });
});
