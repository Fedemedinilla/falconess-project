/**
 * One runner's key events, ready to be told (docs/race-engine.md 20.4, 20.6): the log's events in
 * emission (time) order, with consecutive pulses grouped and each overheat paired with its end.
 * Boost-mode changes are left to the "why" block (`boostModes` in why.ts).
 */
import type { RaceEvent, RaceLog } from "@falconess/schema";

/** A run of consecutive `pulse` events of one runner. */
export type PulseGroup = {
  readonly kind: "pulses";
  readonly count: number;
  readonly chainMax: number;
  /** Pulses that cost no energy. */
  readonly free: number;
  readonly lastTick: number;
};

/** An `overheat` on event and the off event that ended it (null: hot until the finish). */
export type OverheatSpan = {
  readonly kind: "overheatSpan";
  readonly heat: number;
  readonly offTick: number | null;
  readonly offHeat: number | null;
};

/** Events shown as they are. */
export type PlainEvent = Exclude<RaceEvent, { kind: "pulse" | "boostMode" | "overheat" }>;

export type EventItem = PlainEvent | PulseGroup | OverheatSpan;

export type EventLine = {
  readonly tick: number;
  /** When it happened in milli-ticks (`tick × 1000`, the exact `finishMilli` for a finish). */
  readonly milli: number;
  /** Where; a finish is placed at the line itself. */
  readonly posMm: number;
  readonly item: EventItem;
};

function overheatSpan(e: RaceEvent & { kind: "overheat" }, all: readonly RaceEvent[]) {
  const off = all.find(
    (o): o is RaceEvent & { kind: "overheat" } =>
      o.kind === "overheat" && o.lane === e.lane && !o.on && o.tick > e.tick,
  );
  const span: OverheatSpan = {
    kind: "overheatSpan",
    heat: e.heat,
    offTick: off ? off.tick : null,
    offHeat: off ? off.heat : null,
  };
  return span;
}

/** Key events of one runner in emission (time) order; consecutive pulses become one line. */
export function runnerEventLines(log: RaceLog, lane: number): EventLine[] {
  const all = log.events ?? [];
  const lines: EventLine[] = [];
  let pulses: (RaceEvent & { kind: "pulse" })[] = [];
  const flush = () => {
    const first = pulses[0];
    const last = pulses[pulses.length - 1];
    if (first && last) {
      lines.push({
        tick: first.tick,
        milli: first.tick * 1000,
        posMm: first.posMm,
        item: {
          kind: "pulses",
          count: pulses.length,
          chainMax: Math.max(...pulses.map((p) => p.chain)),
          free: pulses.filter((p) => p.free).length,
          lastTick: last.tick,
        },
      });
    }
    pulses = [];
  };
  for (const e of all) {
    if (e.lane !== lane) continue;
    if (e.kind === "pulse") {
      pulses.push(e);
      continue;
    }
    // modes go to the "why" block; an overheat's end is told with its start
    if (e.kind === "boostMode" || (e.kind === "overheat" && !e.on)) continue;
    flush();
    const item: EventItem = e.kind === "overheat" ? overheatSpan(e, all) : e;
    // A finisher ends its tick past the line; the event reads better at the line itself.
    const posMm = e.kind === "finish" ? Math.min(e.posMm, log.geometry.lengthMm) : e.posMm;
    const milli = e.kind === "finish" ? e.finishMilli : e.tick * 1000;
    lines.push({ tick: e.tick, milli, posMm, item });
  }
  flush();
  return lines;
}
