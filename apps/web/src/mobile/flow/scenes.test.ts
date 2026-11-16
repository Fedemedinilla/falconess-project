import { describe, expect, it } from "vitest";
import { DIGEST, digestFor } from "./scenes";

describe("digestFor: the scene digest of a «Ritmo»", () => {
  it("is the same frozen object on every call, so a scene's timers never restart on a render", () => {
    expect(digestFor("fast")).toBe(digestFor("fast"));
    expect(digestFor("direct")).toBe(digestFor("direct"));
    expect(digestFor("fast")).toBe(DIGEST.fast);
    expect(Object.isFrozen(DIGEST)).toBe(true);
    expect(Object.isFrozen(DIGEST.fast)).toBe(true);
    expect(Object.isFrozen(DIGEST.direct)).toBe(true);
  });

  it("passes a line every 1100 ms on Rápido and 650 ms on Directo; Normal plays the whole scene", () => {
    expect(digestFor("fast")).toEqual({ ms: 1100 });
    expect(digestFor("direct")).toEqual({ ms: 650 });
    expect(digestFor("normal")).toBeUndefined();
  });
});
