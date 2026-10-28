import type { RaceEntry, RaceLog } from "@falconess/schema";
import { freezeEntry, neutralFixtureEntry } from "@falconess/sim";
import type {
  EntryInput,
  GenerateFieldArgs,
  NeutralFixtureArgs,
  RaceEnginePort,
  SimulateOptions,
} from "../engine-port.js";

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

/**
 * A recording stand-in for the race engine (tests only): the field operations are the real
 * content-side ones (`generateField` returns neutral fixtures), `simulateRace` returns the given log.
 */
export function fakeEngine(log: RaceLog): { engine: RaceEnginePort; calls: EngineCall[] } {
  const calls: EngineCall[] = [];
  const engine: RaceEnginePort = {
    simulateRace(_ruleset, entries, course, seed, opts) {
      calls.push({ op: "simulateRace", entries, courseId: course.id, seed, opts });
      return log;
    },
    freezeEntry(ruleset, content, input, course, laneIndex) {
      calls.push({ op: "freezeEntry", input, courseId: course.id, laneIndex });
      return freezeEntry(ruleset, content, input, course, laneIndex);
    },
    generateField(_ruleset, _content, args) {
      calls.push({ op: "generateField", args });
      return Array.from({ length: args.course.entries }, (_, lane) =>
        neutralFixtureEntry({
          runnerId: lane === 0 ? "player" : `rival-${lane}`,
          laneIndex: lane,
          style: "glide",
          stats,
        }),
      );
    },
    neutralFixtureEntry(args) {
      calls.push({ op: "neutralFixtureEntry", args });
      return neutralFixtureEntry(args);
    },
  };
  return { engine, calls };
}
