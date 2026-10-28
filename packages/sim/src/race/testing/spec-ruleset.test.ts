import { describe, expect, it } from "vitest";
import * as sim from "../../index.js";
import { RULESET_V1 } from "../../rulesets/index.js";
import { SEASON } from "../../rulesets/v1/constants.js";
import { SPEC_RULESET } from "./spec-ruleset.js";

/** Every object below `value` is frozen (the live `season` is shared, not copied: see the header). */
function frozenDeep(value: unknown, path: string, out: string[] = []): string[] {
  if (typeof value !== "object" || value === null) return out;
  if (!Object.isFrozen(value)) out.push(path);
  for (const [k, v] of Object.entries(value)) frozenDeep(v, `${path}.${k}`, out);
  return out;
}

describe("SPEC_RULESET (physics tests pin to it; balance tunes rulesets/v1)", () => {
  // Delete this test in the first balance commit (docs/decisions/ADR-0005-balance-pass-1.md):
  // from then on SPEC_RULESET keeps the ADR-0003 constants and RULESET_V1 moves away on purpose.
  it("SPEC_RULESET matches v1 until the first balance change", () => {
    expect(SPEC_RULESET).toStrictEqual(RULESET_V1);
  });

  it("is deep-frozen except the shared live season, which it does not copy", () => {
    const { season, ...copied } = SPEC_RULESET;
    expect(Object.isFrozen(SPEC_RULESET)).toBe(true);
    const thawed = Object.entries(copied).flatMap(([k, v]) => frozenDeep(v, k));
    expect(thawed).toEqual([]);
    expect(season).toBe(SEASON);
    expect(copied.race).not.toBe(RULESET_V1.race);
    expect(copied.field).not.toBe(RULESET_V1.field);
  });

  it("is test support only: the package index does not export it", () => {
    expect(Object.keys(sim)).not.toContain("SPEC_RULESET");
    expect(sim.RULESET_V1).toBe(RULESET_V1);
  });
});
