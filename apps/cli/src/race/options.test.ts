import { describe, expect, it } from "vitest";
import { parseRaceArgs, RACE_USAGE, RaceArgsError } from "./options.js";

const parse = (line: string) => parseRaceArgs(line.split(/\s+/).filter((s) => s.length > 0));

describe("parseRaceArgs", () => {
  it("defaults to Peregrina on the sprint with seed 42, full detail, text output", () => {
    expect(parse("")).toEqual({
      help: false,
      seed: "42",
      courseId: "sprint",
      detail: "full",
      json: false,
      field: {
        kind: "player",
        falconessId: "peregrina",
        frameId: null,
        parts: [],
        skills: [],
        stats: null,
        turn: 1,
      },
    });
  });

  it("reads the player field, lists and numbers, and tolerates pnpm's bare `--`", () => {
    const opts = parse(
      "-- --seed s1 --course ridge --falconess caracara --frame mule --parts boneyard-battery,steinhaus-stabilizer --skills last-gasp, --stats 600 --turn 24 --detail results --json",
    );
    expect(opts).toEqual({
      help: false,
      seed: "s1",
      courseId: "ridge",
      detail: "results",
      json: true,
      field: {
        kind: "player",
        falconessId: "caracara",
        frameId: "mule",
        parts: ["boneyard-battery", "steinhaus-stabilizer"],
        skills: ["last-gasp"],
        stats: 600,
        turn: 24,
      },
    });
  });

  it("reads --entries and --neutral fields", () => {
    expect(parse("--entries field.json").field).toEqual({ kind: "entries", file: "field.json" });
    expect(parse("--neutral").field).toEqual({ kind: "neutral", stats: 600 });
    expect(parse("--neutral --stats 450").field).toEqual({ kind: "neutral", stats: 450 });
  });

  it("rejects mixed field options", () => {
    expect(() => parse("--entries f.json --falconess peregrina")).toThrow(
      "--entries cannot be combined with --falconess",
    );
    expect(() => parse("--entries f.json --neutral")).toThrow("--neutral");
    expect(() => parse("--entries f.json --stats 600")).toThrow("--stats");
    expect(() => parse("--neutral --frame shiden --skills last-gasp")).toThrow(
      "--neutral cannot be combined with --frame, --skills",
    );
  });

  it("rejects bad values with a message for the user", () => {
    expect(() => parse("--detail all")).toThrow('--detail must be "full" or "results"');
    expect(() => parse("--stats 0")).toThrow("--stats must be in 1..1200");
    expect(() => parse("--stats 1201")).toThrow("--stats must be in 1..1200");
    expect(() => parse("--stats 6e2")).toThrow("--stats expects an integer");
    expect(() => parse("--turn 49")).toThrow("--turn must be in 0..48");
    expect(() => parse("--seed")).toThrow("--seed needs a value");
    expect(() => parse("--json yes")).toThrow('--json takes no value, got "yes"');
    expect(() => parse("--course")).toThrow(RaceArgsError);
  });

  it("rejects unknown options and shows the usage", () => {
    expect(() => parse("--sed 42")).toThrow(`unknown option --sed\n\n${RACE_USAGE}`);
    expect(parse("--help").help).toBe(true);
  });
});
