import type { Style } from "@falconess/schema";
import type {
  EntryInput,
  GenerateFieldArgs,
  NeutralFixtureArgs,
  RaceEnginePort,
  SimulateOptions,
} from "../engine-port.js";
import type { RaceEntry, RaceLog } from "../log-view.js";

/** Every call the CLI made through the port, in order. */
export type EngineCall =
  | {
      op: "simulateRace";
      entries: readonly RaceEntry[];
      courseId: string;
      seed: string;
      opts: SimulateOptions | undefined;
    }
  | { op: "freezeEntry"; input: EntryInput; courseId: string; laneIndex: number }
  | { op: "generateField"; args: GenerateFieldArgs }
  | { op: "neutralFixtureEntry"; args: NeutralFixtureArgs };

const stats = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

function entry(runnerId: string, laneIndex: number, style: Style, frameId: string): RaceEntry {
  return {
    runnerId,
    kind: runnerId === "player" ? "player" : "rival",
    falconessId: null,
    laneIndex,
    frameId,
    manufacturer: "none",
    style,
    stats,
  };
}

/**
 * A recording stand-in for the race engine (tests only): field operations return minimal entries,
 * `simulateRace` returns the given log.
 */
export function fakeEngine(log: RaceLog): { engine: RaceEnginePort; calls: EngineCall[] } {
  const calls: EngineCall[] = [];
  const engine: RaceEnginePort = {
    simulateRace(_ruleset, entries, course, seed, opts) {
      calls.push({ op: "simulateRace", entries, courseId: course.id, seed, opts });
      return log;
    },
    freezeEntry(_ruleset, _content, input, course, laneIndex) {
      calls.push({ op: "freezeEntry", input, courseId: course.id, laneIndex });
      return entry(input.runnerId, laneIndex, "dive", input.frameId);
    },
    generateField(_ruleset, _content, args) {
      calls.push({ op: "generateField", args });
      return Array.from({ length: args.course.entries }, (_, lane) =>
        entry(lane === 0 ? "player" : `rival-${lane}`, lane, "glide", args.player.frameId),
      );
    },
    neutralFixtureEntry(args) {
      calls.push({ op: "neutralFixtureEntry", args });
      return {
        ...entry(args.runnerId, args.laneIndex, args.style, "fixture-neutral"),
        stats: args.stats,
      };
    },
  };
  return { engine, calls };
}
