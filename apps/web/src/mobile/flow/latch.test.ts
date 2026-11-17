/**
 * The motion latch (5.5): when the game takes a new «Ritmo» or a reduced-motion change. It follows
 * them at once wherever that cannot change what plays (idle, a training's result, the week's
 * effects, an inheritance card, the event, the decided card), so the phone's setting turned on
 * during a race week's result already skips the emblem; it holds them over what they shaped and is
 * still playing (the emblem, a scene, the race and its result) and over an instant beat. Checked on
 * the season walks, every pace and reduced motion.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Pace } from "../pace";
import { followsMotion } from "./beats";
import { deriveFlow } from "./derive";
import { type WalkSpec, walkMatrix } from "./testing/bots";
import { walkOf } from "./testing/invariants";
import type { Beat, Flow } from "./types";

/** Every pace and reduced motion, a non-race finale, and a v2 season with its luck events. */
const SPECS: readonly WalkSpec[] = [
  ...walkMatrix("peregrina", { all: true }),
  ...walkMatrix("caracara", { all: false }),
  {
    name: "v2 caracara trainer",
    falconessId: "caracara",
    seeds: ["walk-3"],
    bot: "trainer",
    rulesetVersion: "v2",
  },
];

const MOTIONS: readonly { readonly pace: Pace; readonly reduced: boolean }[] = (
  ["normal", "fast", "direct"] as const
).flatMap((pace) => [false, true].map((reduced) => ({ pace, reduced })));

/** Every frame of the walks, with the flow derived again under each «Ritmo» and reduced motion. */
function* frames(): Generator<{
  readonly top: Beat;
  readonly flow: Flow;
  readonly others: readonly Flow[];
  readonly where: string;
}> {
  for (const spec of SPECS) {
    const w = walkOf(spec);
    for (const e of w.trace) {
      if (e.type !== "frame") continue;
      const others = MOTIONS.map((m) =>
        deriveFlow(w.ctx, { ...e.facts, pace: m.pace, reduced: m.reduced }, e.ui),
      );
      const where = `${spec.name} season ${e.at.season} move ${e.at.move}`;
      yield { top: e.flow.top, flow: e.flow, others, where };
    }
  }
}

describe("the motion latch", () => {
  // the walks are played once for the file (a few seconds natively)
  beforeAll(() => {
    for (const spec of SPECS) walkOf(spec);
  }, 120_000);

  it("follows at idle, a training's result, the effects, a card, the event and the decided card; holds over the emblem, a scene, the race and an instant beat", () => {
    const seen = new Map<Beat["kind"], boolean>();
    for (const spec of SPECS)
      for (const e of walkOf(spec).trace)
        if (e.type === "frame") seen.set(e.flow.top.kind, followsMotion(e.flow.top));
    expect(Object.fromEntries([...seen].sort(([a], [b]) => a.localeCompare(b)))).toEqual({
      ack: false,
      emblem: false,
      enter: false,
      event: true,
      finish: false,
      fx: true,
      idle: true,
      inspiration: true,
      pass: false,
      position: true,
      "race-result": false,
      replay: false,
      scene: false,
      "train-result": true,
    });
  });

  it("where it follows them, no value of theirs changes the beat in front or its layer (no render loop, nothing cut short)", () => {
    const out: string[] = [];
    for (const { top, flow, others, where } of frames()) {
      if (!followsMotion(top)) continue;
      for (const o of others)
        if (o.top.key !== top.key || o.layer?.key !== flow.layer?.key)
          out.push(`${where}: ${top.key} → ${o.top.key}`);
    }
    expect(out).toEqual([]);
  });

  it("where it holds them, a change would cut the beat short, put one back, or change a scene as it plays", () => {
    const why = new Set<string>();
    for (const { top, flow, others } of frames()) {
      if (followsMotion(top)) continue;
      for (const o of others) {
        if (o.top.key !== top.key) why.add(`${top.kind}: top`);
        else if (o.layer?.kind === "scene" && flow.layer?.kind === "scene") {
          if (o.layer.digest !== flow.layer.digest) why.add(`${top.kind}: digest`);
        }
      }
    }
    expect([...why].sort()).toEqual(
      expect.arrayContaining([
        "emblem: top",
        "finish: top",
        "race-result: top",
        "replay: top",
        "scene: digest",
      ]),
    );
  });
});
