/**
 * Everything the race screens show about one RaceLog, gathered once per log: names and liveries
 * from content, the course layout, each runner's events (worded), badges and lane pins, and the
 * scales of her gauges. Read from the log and the shared view models only.
 */
import {
  type EventLine,
  type Livery,
  type RaceLabels,
  type Runner,
  runnerEventLines,
  runnersInPlaceOrder,
} from "@falconess/race-view";
import type { RaceLog } from "@falconess/schema";
import { overheatByLane, replayEnd } from "./playback";
import { type TrackLayout, trackLayout } from "./track";
import {
  eventBadge,
  eventPin,
  eventText,
  type PinKind,
  runnerKit,
  runnerName,
  runnerShort,
} from "./words";

export type RunnerView = Runner & {
  readonly lane: number;
  readonly name: string;
  /** "Vos", "R3": the name in a narrow lane label. */
  readonly short: string;
  /** Frame · manufacturer · style. */
  readonly kit: string;
  readonly livery: Livery | undefined;
  readonly isPlayer: boolean;
  /** Her events in time order; `id` is the event's rank among them. */
  readonly events: readonly (EventLine & { readonly id: number; readonly text: string })[];
  /** What her badge on the track says for two seconds after each key event. */
  readonly badges: readonly { readonly tick: number; readonly text: string }[];
  /** Marks on her lane where something decided the race (`id`: the event's). */
  readonly pins: readonly {
    readonly id: number;
    readonly tick: number;
    readonly posMm: number;
    readonly kind: PinKind;
    readonly text: string;
  }[];
  /** The top of each gauge: hp max, energy capacity, heat cap, durability max. */
  readonly max: {
    readonly hp: number;
    readonly energy: number;
    readonly heat: number;
    readonly durability: number;
  };
};

export type RaceView = {
  readonly log: RaceLog;
  readonly labels: RaceLabels;
  readonly layout: TrackLayout;
  /** Lane order. */
  readonly runners: readonly RunnerView[];
  /** Place order. */
  readonly byPlace: readonly RunnerView[];
  readonly player: RunnerView | undefined;
  /** Overheat spans per lane (from the events). */
  readonly spans: readonly (readonly [number, number][])[];
  /** Replay length in ticks. */
  readonly end: number;
  readonly hasFrames: boolean;
};

export function raceView(log: RaceLog, labels: RaceLabels): RaceView {
  const runners: RunnerView[] = runnersInPlaceOrder(log)
    .map((r): RunnerView => {
      const lane = r.entry.laneIndex;
      const events = runnerEventLines(log, lane).map((l, id) => ({
        ...l,
        id,
        text: eventText(l.item, l.tick, log, labels),
      }));
      const badges: { tick: number; text: string }[] = [];
      const pins: RunnerView["pins"][number][] = [];
      for (const l of events) {
        const badge = eventBadge(l.item, labels);
        if (badge !== undefined) badges.push({ tick: l.tick, text: badge });
        const pin = eventPin(l.item);
        if (pin !== undefined)
          pins.push({ id: l.id, tick: l.tick, posMm: l.posMm, kind: pin, text: l.text });
      }
      const d = r.derived;
      return {
        ...r,
        lane,
        name: runnerName(r.entry, labels),
        short: runnerShort(r.entry, labels),
        kit: runnerKit(r.entry, labels),
        livery: labels.livery(r.entry.manufacturer),
        isPlayer: r.entry.kind === "player",
        events,
        badges,
        pins,
        max: {
          hp: Math.max(1, d?.hpMax ?? 1),
          energy: Math.max(1, r.entry.energy * 1000),
          heat: Math.max(1, d?.heatCap ?? 1, d?.capLim ?? 1),
          durability: Math.max(1, r.entry.durabilityMax * 1000),
        },
      };
    })
    .sort((a, b) => a.lane - b.lane);
  const byLane = new Map(runners.map((r) => [r.lane, r]));
  const byPlace = log.results.flatMap((res) => {
    const r = byLane.get(res.lane);
    return r ? [r] : [];
  });
  return {
    log,
    labels,
    layout: trackLayout(log.geometry),
    runners,
    byPlace,
    player: runners.find((r) => r.isPlayer),
    spans: overheatByLane(log),
    end: replayEnd(log),
    hasFrames: log.frames !== undefined,
  };
}

/** Consecutive equal cells of a timeline row, as runs: `from` is the first column (0-based). */
export function cellRuns<T>(cells: readonly T[]): { cell: T; from: number; span: number }[] {
  const runs: { cell: T; from: number; span: number }[] = [];
  cells.forEach((cell, col) => {
    const last = runs[runs.length - 1];
    if (last && last.cell === cell) last.span += 1;
    else runs.push({ cell, from: col, span: 1 });
  });
  return runs;
}

/** The badge a runner shows at race time `t`: the last key event of the past two seconds. */
export function badgeAt(
  badges: readonly { readonly tick: number; readonly text: string }[],
  t: number,
): string {
  let text = "";
  for (const b of badges) {
    if (b.tick > t) break;
    if (t - b.tick <= 30) text = b.text;
  }
  return text;
}
