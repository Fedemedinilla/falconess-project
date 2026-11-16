/**
 * Peregrina's whole seasons, played by the bots on the node world (plan §3.4): every invariant over
 * each walk, the target policy always, the active one where it has what the invariant needs.
 * `FLOW_WALKS=all` adds the paces, reduced motion.
 */
import { describe } from "vitest";
import { walkMatrix } from "./testing/bots";
import { itHolds, itReaches } from "./testing/invariants";

const ALL = process.env.FLOW_WALKS === "all";
const SPECS = walkMatrix("peregrina", { all: ALL });

describe("Peregrina's season walks", () => {
  for (const spec of SPECS) describe(spec.name, () => itHolds(spec));
  itReaches(SPECS, [
    "scene",
    "pass",
    "inspiration",
    "train-result",
    "fx:all",
    "fx:action",
    "fx:race",
    "ack",
    "emblem",
    "position",
    "replay",
    "finish",
    "race-result",
    "watch:result",
    "watch:end",
    "watch:again",
    "reload:decided",
    "reload:race",
    "box",
    "end",
    ...(ALL ? ["enter"] : []),
  ]);
});
