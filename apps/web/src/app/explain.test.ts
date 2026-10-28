import { afterEach, describe, expect, it } from "vitest";
import { browserStore, EXPLAIN_KEY, type KeyValueStore } from "../game/storage";
import { createDetailStore, DEFAULT_DETAIL, detailOf, parseDetail } from "./explain";

/** A storage in memory, as tests need it. */
function memory(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

/** A storage whose every access throws, like a sandboxed frame's. */
const throwing: KeyValueStore = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

describe("explanation detail", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("is brief by default, and when the stored value is unknown", () => {
    expect(DEFAULT_DETAIL).toBe("brief");
    expect(parseDetail(undefined)).toBe("brief");
    expect(parseDetail("completas")).toBe("brief");
    expect(parseDetail("full")).toBe("full");
    expect(createDetailStore(() => memory()).getSnapshot().global).toBe("brief");
    expect(createDetailStore(() => undefined).getSnapshot().global).toBe("brief");
  });

  it("remembers the page's default in storage and reads it back", () => {
    const kv = memory();
    const store = createDetailStore(() => kv);
    store.setGlobal("full");
    expect(kv.data.get(EXPLAIN_KEY)).toBe("full");
    expect(createDetailStore(() => kv).getSnapshot().global).toBe("full");
  });

  it("lets a card override the default until the default changes", () => {
    const store = createDetailStore(() => memory());
    let calls = 0;
    store.subscribe(() => calls++);
    store.setCard("nueva-bastidor-shiden-explicacion", "full");
    const state = store.getSnapshot();
    expect(detailOf(state, "nueva-bastidor-shiden-explicacion")).toBe("full");
    expect(detailOf(state, "nueva-bastidor-hayate-explicacion")).toBe("brief");
    // the same choice again changes nothing (and tells nobody)
    store.setCard("nueva-bastidor-shiden-explicacion", "full");
    expect(store.getSnapshot()).toBe(state);
    expect(calls).toBe(1);
    // a new default drops the cards' own choices
    store.setGlobal("brief");
    expect(detailOf(store.getSnapshot(), "nueva-bastidor-shiden-explicacion")).toBe("brief");
    store.setCard("nueva-bastidor-shiden-explicacion", "brief");
    store.setGlobal("full");
    expect(detailOf(store.getSnapshot(), "nueva-bastidor-shiden-explicacion")).toBe("full");
  });

  it("works with a storage that throws on every access", () => {
    const store = createDetailStore(() => throwing);
    expect(store.getSnapshot().global).toBe("brief");
    expect(() => store.setGlobal("full")).not.toThrow();
    expect(store.getSnapshot().global).toBe("full");
  });

  it("works when the browser's localStorage itself throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(browserStore()).toBeUndefined();
    const store = createDetailStore(browserStore);
    expect(store.getSnapshot().global).toBe("brief");
    expect(() => store.setGlobal("full")).not.toThrow();
    expect(store.getSnapshot().global).toBe("full");
  });
});
