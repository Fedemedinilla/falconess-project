/**
 * Cernícala's whole seasons, played by the bots on the node world (plan §3.4): every invariant over
 * each walk. `FLOW_WALKS=all` adds the paces, reduced motion and Exigente.
 */
import { describe } from "vitest";
import { walkMatrix } from "./testing/bots";
import { itHolds, itReaches } from "./testing/invariants";

const ALL = process.env.FLOW_WALKS === "all";
const SPECS = walkMatrix("cernicala", { all: ALL, exigente: true });

describe("Cernícala's season walks", () => {
  for (const spec of SPECS) describe(spec.name, () => itHolds(spec));
  itReaches(SPECS, [
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
    "end:race",
    "end:result",
    ...(ALL ? ["enter"] : []),
  ]);
});
