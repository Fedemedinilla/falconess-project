import type { RunInput, SeasonState } from "@falconess/schema";
import { lowestStat } from "@falconess/sim";

/** Reference policy (tools/policies in the brief): train the lowest stat, rest when tired, option 0. */
export function lowestStatPolicy(state: SeasonState): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  if (state.fatigue >= 60) return { kind: "rest" };
  switch (lowestStat(state.stats)) {
    case "agility":
      return { kind: "train:agility" };
    case "stamina":
      return { kind: "train:stamina" };
    case "technique":
      return { kind: "train:technique" };
    case "courage":
      return { kind: "train:risk-flight" };
    case "intelligence":
      return { kind: "train:simulator" };
  }
}
