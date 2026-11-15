import { resolveLoggedEvent, stepLog } from "@falconess/race-view";
import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, type SimContext, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { type WeekStep, weekSummary } from "../screens/model/week";
import { statGains } from "./flow/trainResult";

/** Every action, a rest whenever she is tired, the first answer to an event. */
const CYCLE: readonly RunInput[] = [
  { kind: "train:agility" },
  { kind: "train:risk-flight" },
  { kind: "train:stamina" },
  { kind: "outing" },
  { kind: "train:simulator" },
  { kind: "train:technique" },
  { kind: "rest" },
];

function steps(ctx: SimContext, seeds: number): WeekStep[] {
  const out: WeekStep[] = [];
  for (let seed = 0; seed < seeds; seed++) {
    let state: SeasonState = startSeason(ctx, `parity-${seed}`, {
      kind: "start",
      falconessId: ["peregrina", "caracara", "cernicala"][seed % 3] ?? "peregrina",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
    });
    for (let i = 0; state.status === "active" && i < 80; i++) {
      const input: RunInput = state.pendingEvent
        ? { kind: "event:choose", option: 0 }
        : state.fatigue >= 60
          ? { kind: "rest" }
          : (CYCLE[(i + seed) % CYCLE.length] ?? { kind: "rest" });
      const after = advanceSeason(ctx, state, input);
      out.push({ before: state, input, after });
      state = after;
    }
  }
  return out;
}

describe("statGains: the training result's gains, without the text tables", () => {
  it("equals «Lo que pasó»'s stats on every step, a luck event's own stats left out (v2)", () => {
    const v2 = simContext("v2");
    const all = steps(v2, 6);
    // luck events of the week that moved stats of their own (the ones to leave out)
    const luck = all.filter((s) => {
      const event = stepLog(s.before, s.after).event;
      const own = event?.auto ? resolveLoggedEvent(v2.content, event)?.stats : undefined;
      return own !== undefined && own.length > 0;
    });
    expect(luck.length).toBeGreaterThan(0);
    for (const step of all) expect(statGains(v2, step)).toEqual(weekSummary(v2, step).stats);
  });
  it("equals them on the phone's ruleset (v3)", () => {
    const v3 = simContext("v3");
    for (const step of steps(v3, 2))
      expect(statGains(v3, step)).toEqual(weekSummary(v3, step).stats);
  });
});
