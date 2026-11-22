/**
 * Seasons on ruleset v2, whose luck events wait for an answer (the event dialog acts by itself):
 * the event beat comes once the week is read, its answer is a new step (plan §3.4, Appendix B A4).
 * Only with `FLOW_WALKS=all`.
 */
import { describe } from "vitest";
import type { WalkSpec } from "./testing/bots";
import { itHolds, itReaches } from "./testing/invariants";

const ALL = process.env.FLOW_WALKS === "all";
const v2 = (falconessId: string, bot: WalkSpec["bot"]): WalkSpec => ({
  name: `v2 ${falconessId} ${bot}`,
  falconessId,
  seeds: ["walk-3"],
  bot,
  rulesetVersion: "v2",
});
const SPECS = [v2("caracara", "trainer"), v2("peregrina", "restHeavy")];

describe.skipIf(!ALL)("season walks on ruleset v2, with events", () => {
  for (const spec of SPECS) describe(spec.name, () => itHolds(spec));
  itReaches(SPECS, ["event", "fx:all", "race-result", "end"]);
});
