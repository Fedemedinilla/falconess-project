/** This checkout's `InvarianceApi` (`invariance.ts`): v1, v2 and v3 with each switch off. */
import {
  advanceSeason,
  canonicalJson,
  FIELD_V3_R4,
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_OFF_ALLFLY,
  FLIGHT_OFF_HOMES,
  FLIGHT_OFF_JUMPSKIM,
  FLIGHT_OFF_KICK,
  FLIGHT_OFF_LINES,
  FLIGHT_OFF_NEUTRAL,
  FLIGHT_OFF_POLISH,
  FLIGHT_OFF_R5,
  FLIGHT_OFF_STAMINA,
  FLIGHT_OFF_TRIM,
  type FlightConstants,
  flightOf,
  getRuleset,
  neutralFixtureEntry,
  RULESET_V3,
  type Ruleset,
  rulesetV3With,
  type SimContext,
  simulateRace,
  startSeason,
} from "@falconess/sim";
import { REFERENCE_HANGAR, referencePolicy } from "../policy.js";
import { content, courseOf } from "./field.js";
import type { InvarianceApi } from "./invariance.js";

/** Each switch of ADR-0011 §7; the round-4 and round-2 engines also take the round-4 rival rows. */
const SWITCHES: Record<string, { flight: Partial<FlightConstants>; r4Field?: true }> = {
  "off-jumpskim": { flight: FLIGHT_OFF_JUMPSKIM },
  "off-trim": { flight: FLIGHT_OFF_TRIM },
  "off-homes": { flight: FLIGHT_OFF_HOMES },
  "off-polish": { flight: FLIGHT_OFF_POLISH },
  "off-kick": { flight: FLIGHT_OFF_KICK },
  "off-stamina": { flight: FLIGHT_OFF_STAMINA },
  "off-neutral": { flight: FLIGHT_OFF_NEUTRAL },
  "off-allfly": { flight: FLIGHT_OFF_ALLFLY },
  "off-lines": { flight: FLIGHT_OFF_LINES },
  "off-r5": { flight: FLIGHT_OFF_R5, r4Field: true },
  "off-1-3": { flight: FLIGHT_OFF_1_3 },
  "off-1-2": { flight: FLIGHT_OFF_1_2, r4Field: true },
};

function rulesetOfGroup(group: string): Ruleset | null {
  if (group === "v1" || group === "v2") return getRuleset(group);
  if (group === "v3") return RULESET_V3;
  const s = SWITCHES[group];
  if (!s) return null;
  const R = rulesetV3With(s.flight);
  return s.r4Field ? { ...R, field: FIELD_V3_R4 } : R;
}

export const localInvarianceApi: InvarianceApi<Ruleset> = {
  ruleset: rulesetOfGroup,
  simulateRace: (R, entries, course, seed, opts) => simulateRace(R, entries, course, seed, opts),
  neutralFixtureEntry,
  letters: (R) => flightOf(R)?.distanceLetters === true,
  courseOf,
  seasons: (R, falconessId, seed) => {
    const ctx: SimContext = { ruleset: R, content };
    let s = startSeason(ctx, seed, {
      kind: "start",
      falconessId,
      hangar: [...REFERENCE_HANGAR],
      parents: [],
    });
    while (s.status === "active") s = advanceSeason(ctx, s, referencePolicy(ctx, s));
    return canonicalJson(s);
  },
};
