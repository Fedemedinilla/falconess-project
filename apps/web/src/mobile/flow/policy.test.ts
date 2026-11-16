import { describe, expect, it } from "vitest";
import { ACTIVE_POLICY, LEGACY_POLICY, TARGET_POLICY } from "./policy";

describe("the strangler policy (plan §1.12)", () => {
  it("every flag still differs between today's game and the target: a flag that agrees is gone", () => {
    const same = Object.entries(LEGACY_POLICY).filter(
      ([flag, value]) => Reflect.get(TARGET_POLICY, flag) === value,
    );
    expect(same).toEqual([]);
    expect(Object.keys(TARGET_POLICY).sort()).toEqual(Object.keys(LEGACY_POLICY).sort());
  });

  it("the game ships today's flow until each flag is removed, and nothing edits a policy", () => {
    expect(ACTIVE_POLICY).toBe(LEGACY_POLICY);
    expect(Object.isFrozen(LEGACY_POLICY)).toBe(true);
    expect(Object.isFrozen(TARGET_POLICY)).toBe(true);
  });
});
