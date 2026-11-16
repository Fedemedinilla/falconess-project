import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "../game/storage";
import { rememberSpeed, startSpeed } from "./speed";

const SPEED_KEY = "falconess.juego.velocidad";
const SPEEDS = [0.5, 1, 2, 4] as const;

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

describe("the replay's speed, kept between races", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts at ×1 the first time, then at the speed chosen last (×0.5 included)", () => {
    const store = memoryStore();
    vi.stubGlobal("localStorage", store);
    expect(startSpeed(SPEEDS)).toBe(1);
    rememberSpeed(4);
    expect(store.data.get(SPEED_KEY)).toBe("4");
    expect(startSpeed(SPEEDS)).toBe(4);
    rememberSpeed(0.5);
    expect(startSpeed(SPEEDS)).toBe(0.5);
  });

  it("starts at the minimum when the last speed was slower, and keeps a faster one", () => {
    vi.stubGlobal("localStorage", memoryStore());
    expect(startSpeed(SPEEDS, 2)).toBe(2);
    rememberSpeed(1);
    expect(startSpeed(SPEEDS, 2)).toBe(2);
    rememberSpeed(4);
    expect(startSpeed(SPEEDS, 2)).toBe(4);
  });

  it("O8: does not read the phone's «Ritmo» (a Rápido phone no longer makes test-view replays ×2)", () => {
    vi.stubGlobal("localStorage", memoryStore({ "falconess.juego.ritmo": "fast" }));
    expect(startSpeed(SPEEDS)).toBe(1);
  });

  it("gives nothing for a stored speed the replay does not offer (its own default then)", () => {
    vi.stubGlobal("localStorage", memoryStore({ [SPEED_KEY]: "3" }));
    expect(startSpeed(SPEEDS)).toBeUndefined();
    vi.stubGlobal("localStorage", memoryStore({ [SPEED_KEY]: "fast" }));
    expect(startSpeed(SPEEDS)).toBeUndefined();
  });

  it("works without storage: ×1 (or the minimum), and remembering is a no-op", () => {
    for (const store of [blocked, undefined]) {
      vi.stubGlobal("localStorage", store);
      expect(startSpeed(SPEEDS)).toBe(1);
      expect(startSpeed(SPEEDS, 2)).toBe(2);
      expect(() => rememberSpeed(4)).not.toThrow();
    }
  });
});
