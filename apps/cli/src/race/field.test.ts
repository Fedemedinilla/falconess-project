import { loadContent } from "@falconess/content";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { fakeEngine } from "./__fixtures__/fake-engine.js";
import { loadRaceFixture } from "./__fixtures__/load.js";
import type { EntryInput } from "./engine-port.js";
import { buildField, type FieldSpec, parseEntryInputs, playerEntryInput } from "./field.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const sprint = ctx.content.getCourse("desert-sprint");
const player = (over: Partial<Extract<FieldSpec, { kind: "player" }>> = {}) =>
  ({
    kind: "player",
    falconessId: "peregrina",
    frameId: null,
    parts: [],
    skills: [],
    stats: null,
    turn: 1,
    ...over,
  }) satisfies FieldSpec;

const validInput: EntryInput = {
  runnerId: "player",
  kind: "player",
  falconessId: "caracara",
  baseStats: { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 },
  mood: 1,
  biomeAptitude: { desert: "A", mountain: "B", coast: "B", urban: "C", tundra: "D" },
  styleAptitude: { dive: "C", hover: "B", glide: "B", ground: "A" },
  frameId: "caracara-signature",
  parts: ["boneyard-battery"],
  quirks: [],
  learnedSkills: ["scavenger-stride"],
  durability: 120,
};

describe("playerEntryInput", () => {
  it("builds the spec 3.1 input from content: base stats, aptitudes, signature frame", () => {
    const peregrina = ctx.content.getFalconess("peregrina");
    expect(playerEntryInput(ctx.content, player({ skills: ["last-gasp"] }))).toEqual({
      runnerId: "player",
      kind: "player",
      falconessId: "peregrina",
      baseStats: peregrina.baseStats,
      mood: 0,
      biomeAptitude: peregrina.biomeAptitude,
      styleAptitude: peregrina.styleAptitude,
      frameId: "peregrina-signature",
      parts: [],
      quirks: [],
      learnedSkills: ["last-gasp"],
      durability: null,
    });
  });

  it("uses uniform stats, the given frame and parts", () => {
    const input = playerEntryInput(
      ctx.content,
      player({ stats: 600, frameId: "shiden", parts: ["koryu-firmware"] }),
    );
    expect(input.baseStats).toEqual({
      agility: 600,
      stamina: 600,
      technique: 600,
      courage: 600,
      intelligence: 600,
    });
    expect(input.frameId).toBe("shiden");
    expect(input.parts).toEqual(["koryu-firmware"]);
  });

  it("rejects unknown ids, passive skills and another Falconess's unique skill", () => {
    expect(() => playerEntryInput(ctx.content, player({ falconessId: "halcon" }))).toThrow(
      'unknown falconess "halcon" (known: ',
    );
    expect(() => playerEntryInput(ctx.content, player({ frameId: "zeppelin" }))).toThrow(
      'unknown frame "zeppelin"',
    );
    expect(() => playerEntryInput(ctx.content, player({ parts: ["nitro"] }))).toThrow(
      'unknown part "nitro"',
    );
    expect(() => playerEntryInput(ctx.content, player({ skills: ["talon-lock"] }))).toThrow(
      'skill "talon-lock" is passive',
    );
    expect(() => playerEntryInput(ctx.content, player({ skills: ["scavenger-stride"] }))).toThrow(
      'skill "scavenger-stride" is unique to caracara',
    );
  });
});

describe("buildField through the port", () => {
  const log = loadRaceFixture("sprint");

  it("asks generateField for the player plus rivals with the race seed and turn", () => {
    const { engine, calls } = fakeEngine(log);
    const entries = buildField(engine, ctx, sprint, "s1", player({ turn: 24, stats: 500 }));
    expect(entries).toHaveLength(sprint.entries);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call?.op !== "generateField") throw new Error("expected generateField");
    expect(call.args.course).toBe(sprint);
    expect(call.args.turn).toBe(24);
    expect(call.args.raceSeed).toBe("s1");
    expect(call.args.player.baseStats.agility).toBe(500);
    expect(call.args.player.frameId).toBe("peregrina-signature");
  });

  it("freezes every --entries input with lane = array index", () => {
    const { engine, calls } = fakeEngine(log);
    const second = {
      ...validInput,
      runnerId: "rival-1",
      kind: "rival" as const,
      falconessId: null,
    };
    const entries = buildField(engine, ctx, sprint, "s1", {
      kind: "entries",
      inputs: [validInput, second],
    });
    expect(entries.map((e) => [e.runnerId, e.laneIndex])).toEqual([
      ["player", 0],
      ["rival-1", 1],
    ]);
    expect(
      calls.map((c) => (c.op === "freezeEntry" ? [c.input.runnerId, c.laneIndex] : c.op)),
    ).toEqual([
      ["player", 0],
      ["rival-1", 1],
    ]);
  });

  it("builds eight neutral fixtures, two per style, with uniform stats", () => {
    const { engine, calls } = fakeEngine(log);
    const entries = buildField(engine, ctx, sprint, "s1", { kind: "neutral", stats: 450 });
    expect(entries.map((e) => `${e.laneIndex}:${e.runnerId}:${e.style}`)).toEqual([
      "0:neutral-dive-1:dive",
      "1:neutral-hover-1:hover",
      "2:neutral-glide-1:glide",
      "3:neutral-ground-1:ground",
      "4:neutral-dive-2:dive",
      "5:neutral-hover-2:hover",
      "6:neutral-glide-2:glide",
      "7:neutral-ground-2:ground",
    ]);
    expect(calls.every((c) => c.op === "neutralFixtureEntry")).toBe(true);
    expect(entries.every((e) => e.stats.courage === 450)).toBe(true);
  });
});

describe("parseEntryInputs (the --entries file)", () => {
  it("accepts a JSON array of spec 3.1 EntryInput objects", () => {
    const raw: unknown = JSON.parse(
      JSON.stringify([validInput, { ...validInput, durability: null }]),
    );
    expect(parseEntryInputs(raw, "f.json")).toEqual([
      validInput,
      { ...validInput, durability: null },
    ]);
  });

  it("rejects anything else with the offending path", () => {
    expect(() => parseEntryInputs({}, "f.json")).toThrow("f.json: expected a JSON array of 1..8");
    expect(() => parseEntryInputs([], "f.json")).toThrow("1..8");
    expect(() => parseEntryInputs(Array(9).fill(validInput), "f.json")).toThrow("1..8");
    const { durability: _d, ...missing } = validInput;
    expect(() => parseEntryInputs([missing], "f.json")).toThrow(
      'f.json[0]: missing field "durability"',
    );
    expect(() => parseEntryInputs([{ ...validInput, speed: 3 }], "f.json")).toThrow(
      'f.json[0]: unknown field "speed"',
    );
    expect(() => parseEntryInputs([{ ...validInput, kind: "boss" }], "f.json")).toThrow(
      "f.json[0].kind",
    );
    expect(() =>
      parseEntryInputs(
        [{ ...validInput, baseStats: { ...validInput.baseStats, agility: 0 } }],
        "f.json",
      ),
    ).toThrow("f.json[0].baseStats");
    expect(() => parseEntryInputs([{ ...validInput, mood: 3 }], "f.json")).toThrow(
      "f.json[0].mood",
    );
    expect(() => parseEntryInputs([{ ...validInput, parts: ["Bad Id"] }], "f.json")).toThrow(
      "f.json[0].parts",
    );
    expect(() => parseEntryInputs([{ ...validInput, durability: 1.5 }], "f.json")).toThrow(
      "f.json[0].durability",
    );
  });
});
