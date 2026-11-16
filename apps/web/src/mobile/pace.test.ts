import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "../game/storage";

const KEY = "falconess.juego.ritmo";

function memoryStore(seed: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
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

const blocked: KeyValueStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

/** pace.ts as a fresh page load finds it, over `store` as the browser's localStorage. */
async function freshPace(store: KeyValueStore | undefined) {
  vi.resetModules();
  vi.stubGlobal("localStorage", store);
  return import("./pace");
}

describe("«Ritmo»: the pace store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cycles Normal → Rápido → Directo → Normal", async () => {
    const { nextPace } = await freshPace(memoryStore());
    expect(nextPace("normal")).toBe("fast");
    expect(nextPace("fast")).toBe("direct");
    expect(nextPace("direct")).toBe("normal");
  });

  it("scales the timed parts by 1, 0.6 and 0.35", async () => {
    const { paceScale } = await freshPace(memoryStore());
    expect(paceScale("normal")).toBe(1);
    expect(paceScale("fast")).toBe(0.6);
    expect(paceScale("direct")).toBe(0.35);
  });

  it("reads the stored pace on load, Normal when none or an unknown one is stored", async () => {
    expect((await freshPace(memoryStore({ [KEY]: "direct" }))).getPace()).toBe("direct");
    expect((await freshPace(memoryStore({ [KEY]: "fast" }))).getPace()).toBe("fast");
    expect((await freshPace(memoryStore({ [KEY]: "slow" }))).getPace()).toBe("normal");
    expect((await freshPace(memoryStore())).getPace()).toBe("normal");
  });

  it("keeps a chosen pace under the same key and tells every subscriber at once", async () => {
    const store = memoryStore();
    const pace = await freshPace(store);
    const heard: string[] = [];
    const stopA = pace.subscribePace(() => heard.push(`a:${pace.getPace()}`));
    const stopB = pace.subscribePace(() => heard.push(`b:${pace.getPace()}`));
    pace.setPace("fast");
    expect(heard).toEqual(["a:fast", "b:fast"]);
    expect(store.data.get(KEY)).toBe("fast");
    stopA();
    pace.setPace("direct");
    expect(heard).toEqual(["a:fast", "b:fast", "b:direct"]);
    stopB();
    pace.setPace("normal");
    expect(heard).toHaveLength(3);
    // the next page load reads it back
    expect((await freshPace(store)).getPace()).toBe("normal");
  });

  it("falls back to Normal when storage is blocked or missing, and a choice lasts the visit", async () => {
    for (const store of [blocked, undefined]) {
      const pace = await freshPace(store);
      expect(pace.getPace()).toBe("normal");
      let calls = 0;
      pace.subscribePace(() => {
        calls += 1;
      });
      expect(() => pace.setPace("direct")).not.toThrow();
      expect(pace.getPace()).toBe("direct");
      expect(calls).toBe(1);
    }
  });
});
