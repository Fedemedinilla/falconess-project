import { describe, expect, it } from "vitest";
import type { Beat, DecidedWeek, Flow, Layer, Screen } from "./flow/types";
import { type BackGesture, backGesture, type GestureHistory, gestureAt } from "./useBackGesture";

type Entry = { readonly state: unknown; readonly route: string };

/**
 * One tab's history, as the browser keeps it: its entries (each with its state and its route), the
 * one shown, and the steps the page asked for (`history.back()` and `history.forward()` land
 * later, in a task of their own, each with its `popstate`, as a browser does it). The player's
 * gesture and the browser's Forward land at once.
 */
class FakeHistory implements GestureHistory {
  entries: Entry[];
  index: number;
  /** The page's steps (−1 back, +1 forward) not landed yet. */
  queued: number[] = [];
  /** The entries the page pushed. */
  pushes = 0;
  gesture: BackGesture | undefined;
  /** A page that cannot push an entry (an old browser, a sandbox). */
  refuse = false;

  constructor(entries: readonly Entry[]) {
    this.entries = [...entries];
    this.index = entries.length - 1;
  }

  get state(): unknown {
    return this.entries[this.index]?.state ?? null;
  }

  get route(): string {
    return this.entries[this.index]?.route ?? "";
  }

  pushState(data: unknown, _unused: string): void {
    if (this.refuse) throw new Error("SecurityError");
    this.entries = [...this.entries.slice(0, this.index + 1), { state: data, route: this.route }];
    this.index += 1;
    this.pushes += 1;
  }

  back(): void {
    this.queued.push(-1);
  }

  forward(): void {
    this.queued.push(1);
  }

  /** The browser lands the steps the page asked for, one `popstate` each. */
  land(): void {
    for (let step = this.queued.shift(); step !== undefined; step = this.queued.shift())
      this.go(step);
  }

  /** The player's back gesture (Android's back, iOS's edge swipe, the browser's Back). */
  swipe(): void {
    this.go(-1);
  }

  /** The browser's Forward button. */
  ahead(): void {
    this.go(1);
  }

  private go(delta: number): void {
    const to = this.index + delta;
    if (to < 0 || to >= this.entries.length) return;
    this.index = to;
    this.gesture?.popped();
  }
}

const page = (route: string): Entry => ({ state: null, route });

/** #juego reached from the test view's start (the route before it), with the gesture on it. */
function tab(entries: readonly Entry[] = [page("inicio"), page("juego")]) {
  const h = new FakeHistory(entries);
  const g = backGesture(h, () => h.route === "juego");
  h.gesture = g;
  return { h, g };
}

describe("the back gesture inside #juego (O10): the page's history", () => {
  it("on the menu it has no entry of its own: the gesture leaves #juego, as it always did", () => {
    const { h, g } = tab();
    g.at("rest");
    expect(h.entries).toHaveLength(2);
    expect(h.queued).toEqual([]);
    h.swipe();
    expect(h.route).toBe("inicio");
  });

  it("a screen with «Volver»: one entry, and the gesture does what «Volver» does", () => {
    const { h, g } = tab();
    let backs = 0;
    const toMenu = () => {
      backs += 1;
      g.at("rest");
    };
    g.at("rest");
    g.at("back", toMenu);
    expect(h.entries).toHaveLength(3);
    expect(h.route).toBe("juego");
    h.swipe();
    // the menu, still in #juego, and no step of its own: the entry was the gesture's
    expect(backs).toBe(1);
    expect(h.route).toBe("juego");
    expect(h.index).toBe(1);
    expect(h.queued).toEqual([]);
    // from the menu the next gesture leaves #juego
    h.swipe();
    expect(h.route).toBe("inicio");
    expect(backs).toBe(1);
  });

  it("«Volver» itself takes its entry back, and that step is not a gesture: nothing piles up", () => {
    const { h, g } = tab();
    let backs = 0;
    const toMenu = () => {
      backs += 1;
    };
    for (let i = 0; i < 20; i++) {
      g.at("back", toMenu);
      g.at("rest");
      expect(h.queued).toEqual([-1]);
      h.land();
      expect(h.index).toBe(1);
    }
    expect(backs).toBe(0);
    expect(h.entries).toHaveLength(3);
    h.swipe();
    expect(h.route).toBe("inicio");
  });

  it("where the week plays the gesture does nothing: it steps onto the same entry again", () => {
    const { h, g } = tab();
    let backs = 0;
    g.at("rest");
    g.at("hold", () => {
      backs += 1;
    });
    expect(h.entries).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      h.swipe();
      h.land();
      // the entry is in front again: the next gesture finds it
      expect(h.route).toBe("juego");
      expect(h.index).toBe(2);
      expect(h.state).toEqual({ juego: "hold" });
    }
    expect(backs).toBe(0);
    // never a new entry without a tap (the browser's Back may skip one pushed without one)
    expect(h.pushes).toBe(1);
    expect(h.entries).toHaveLength(3);
    // the menu again: the entry goes, and the gesture leaves from there
    g.at("rest");
    h.land();
    expect(h.index).toBe(1);
    h.swipe();
    expect(h.route).toBe("inicio");
  });

  it("from a screen with «Volver» into the week's beats (an action confirmed): still one entry", () => {
    const { h, g } = tab();
    let backs = 0;
    g.at("back", () => {
      backs += 1;
    });
    g.at("hold");
    expect(h.entries).toHaveLength(3);
    expect(h.queued).toEqual([]);
    h.swipe();
    h.land();
    expect(backs).toBe(0);
    expect(h.index).toBe(2);
    g.at("rest");
    h.land();
    expect(h.index).toBe(1);
    expect(h.entries).toHaveLength(3);
    expect(h.pushes).toBe(1);
  });

  it("a sheet over a screen with «Volver»: the gesture closes the sheet, then the screen's entry", () => {
    const { h, g } = tab();
    const done: string[] = [];
    const toMenu = () => {
      done.push("menu");
      g.at("rest");
    };
    const closeSheet = () => {
      done.push("sheet");
      // the planning card under it: a screen with «Volver»
      g.at("back", toMenu);
    };
    g.at("back", toMenu);
    g.at("back", closeSheet);
    expect(h.entries).toHaveLength(3);
    h.swipe();
    h.land();
    expect(done).toEqual(["sheet"]);
    expect(h.index).toBe(2);
    h.swipe();
    h.land();
    expect(done).toEqual(["sheet", "menu"]);
    expect(h.index).toBe(1);
    expect(h.pushes).toBe(1);
    h.swipe();
    expect(h.route).toBe("inicio");
  });

  it("a gesture whose «Volver» changes nothing keeps the entry: the next one still finds it", () => {
    const { h, g } = tab();
    let backs = 0;
    g.at("back", () => {
      backs += 1;
    });
    h.swipe();
    h.land();
    expect(backs).toBe(1);
    expect(h.index).toBe(2);
    expect(h.entries).toHaveLength(3);
  });

  it("a reload on its own entry: the menu takes it back, a beat keeps it (never a second one)", () => {
    const left = [page("inicio"), page("juego"), { state: { juego: "hold" }, route: "juego" }];
    const atMenu = tab(left);
    atMenu.g.at("rest");
    expect(atMenu.h.queued).toEqual([-1]);
    atMenu.h.land();
    expect(atMenu.h.index).toBe(1);
    atMenu.h.swipe();
    expect(atMenu.h.route).toBe("inicio");

    const onCard = tab(left);
    onCard.g.at("hold");
    expect(onCard.h.entries).toHaveLength(3);
    expect(onCard.h.queued).toEqual([]);
    onCard.h.swipe();
    onCard.h.land();
    expect(onCard.h.index).toBe(2);
    expect(onCard.h.pushes).toBe(0);
  });

  it("a new entry waits for the game's own step back to land: never two, never a lost one", () => {
    const { h, g } = tab();
    let backs = 0;
    const toMenu = () => {
      backs += 1;
      g.at("rest");
    };
    g.at("back", toMenu);
    g.at("rest");
    // Taller tapped before the step back of «Volver» landed
    g.at("back", toMenu);
    expect(h.entries).toHaveLength(3);
    expect(h.index).toBe(2);
    h.land();
    expect(backs).toBe(0);
    expect(h.index).toBe(2);
    expect(h.entries).toHaveLength(3);
    h.swipe();
    expect(backs).toBe(1);
    expect(h.index).toBe(1);
  });

  it("the game's step forward again is its own: its popstate is not a gesture", () => {
    const { h, g } = tab();
    let backs = 0;
    g.at("hold", () => {
      backs += 1;
    });
    h.swipe();
    expect(h.queued).toEqual([1]);
    // the beat ends while the step is on its way: «Volver» is there now
    g.at("back", () => {
      backs += 1;
    });
    h.land();
    expect(backs).toBe(0);
    expect(h.index).toBe(2);
    expect(h.pushes).toBe(1);
  });

  it("a step forward onto an entry it no longer needs: taken back", () => {
    const { h, g } = tab();
    g.at("back", () => g.at("rest"));
    h.swipe();
    expect(h.index).toBe(1);
    h.ahead();
    expect(h.queued).toEqual([-1]);
    h.land();
    expect(h.index).toBe(1);
  });

  it("with no view of #juego, or on another route, it neither pushes nor acts", () => {
    const { h, g } = tab();
    let backs = 0;
    g.at("back", () => {
      backs += 1;
    });
    g.at(undefined);
    h.swipe();
    expect(backs).toBe(0);
    expect(h.index).toBe(1);
    expect(h.queued).toEqual([]);

    const elsewhere = tab([page("juego"), page("inicio")]);
    elsewhere.g.at("hold");
    expect(elsewhere.h.entries).toHaveLength(2);
  });

  it("a page that cannot push an entry: the gesture leaves as before, nothing breaks", () => {
    const { h, g } = tab();
    h.refuse = true;
    expect(() => g.at("hold")).not.toThrow();
    expect(h.entries).toHaveLength(2);
    h.swipe();
    expect(h.route).toBe("inicio");
  });
});

describe("where the gesture is: rest, «Volver» or nothing (gestureAt)", () => {
  const idle: Beat = { kind: "idle", key: "idle:f" };
  const flow = (
    top: Beat,
    screen: Screen,
    layer?: Layer,
  ): Pick<Flow, "top" | "screen" | "layer"> => ({ top, screen, layer });
  const menu: Screen = { kind: "menu", inert: false };
  const train: Screen = { kind: "train", selected: undefined, result: undefined, finished: false };
  const fx: Layer = { kind: "fx", key: "f/fx", fx: [] };

  it("the menu and the season's end, free: rest", () => {
    expect(gestureAt(flow(idle, menu))).toBe("rest");
    expect(gestureAt(flow(idle, { kind: "end", inert: false }))).toBe("rest");
  });

  it("training, the workshop and the planning card: «Volver»", () => {
    expect(gestureAt(flow(idle, train))).toBe("back");
    expect(gestureAt(flow(idle, { kind: "workshop", tab: "skills" }))).toBe("back");
    expect(gestureAt(flow(idle, { kind: "plan", position: undefined }))).toBe("back");
  });

  it("anything of the week in front, the decided card, the race and a race seen again: nothing", () => {
    expect(gestureAt(flow(idle, { kind: "menu", inert: true }, fx))).toBe("hold");
    expect(
      gestureAt(flow({ kind: "fx", key: "f/fx", part: "all", fx: [], landed: false }, menu, fx)),
    ).toBe("hold");
    const week: DecidedWeek = {
      fp: "f",
      turn: 10,
      inputs: 10,
      input: { kind: "rest" },
      position: undefined,
      stage: "race",
    };
    const card: Screen = { kind: "position", week, wings: "stalk", inert: false };
    expect(
      gestureAt(flow({ kind: "position", key: "f/w:position", week, wings: "stalk" }, card)),
    ).toBe("hold");
    expect(
      gestureAt(
        flow({ kind: "emblem", key: "f/w:emblem", fp: "f", covered: true, fadeIn: false }, card),
      ),
    ).toBe("hold");
    const race = (stage: "replay" | "result", watch?: "end"): Screen => ({
      kind: "race",
      turn: 10,
      stage,
      play: "p",
      watch,
    });
    expect(
      gestureAt(flow({ kind: "replay", key: "f/race:replay", turn: 10 }, race("replay"))),
    ).toBe("hold");
    expect(
      gestureAt(flow({ kind: "race-result", key: "f/race:result", turn: 10 }, race("result"))),
    ).toBe("hold");
    expect(gestureAt(flow(idle, race("replay", "end")))).toBe("hold");
  });

  it("an instant beat renders nothing: no say", () => {
    expect(gestureAt(flow({ kind: "ack", key: "f/ack" }, menu))).toBeUndefined();
    expect(gestureAt(flow({ kind: "enter", key: "f/w:enter", fp: "f" }, menu))).toBeUndefined();
  });
});
