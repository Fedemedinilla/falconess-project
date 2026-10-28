import { loadContent } from "@falconess/content";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { runSimRace } from "../sim-race.js";
import { fakeEngine } from "./__fixtures__/fake-engine.js";
import { loadRaceFixture } from "./__fixtures__/load.js";
import { createRaceEngine, RaceEngineUnavailableError } from "./engine-adapter.js";
import { contentLabels } from "./labels.js";
import { RACE_USAGE } from "./options.js";
import { renderRace } from "./render-race.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const noFiles = (path: string): string => {
  throw new Error(`unexpected read of ${path}`);
};

describe("pnpm sim:race", () => {
  it("builds the field, simulates through the port and prints the log's text view", () => {
    const log = loadRaceFixture("sprint");
    const { engine, calls } = fakeEngine(log);
    const out = runSimRace(
      ["--seed", "pt1-sprint", "--course", "desert-sprint", "--detail", "results"],
      { engine, ctx, readText: noFiles },
    );
    expect(out).toBe(renderRace(log, contentLabels(ctx.content)).join("\n"));
    expect(calls.map((c) => c.op)).toEqual(["generateField", "simulateRace"]);
    const sim = calls[1];
    if (sim?.op !== "simulateRace") throw new Error("expected simulateRace");
    expect(sim.seed).toBe("pt1-sprint");
    expect(sim.courseId).toBe("desert-sprint");
    expect(sim.opts).toEqual({ detail: "results" });
    expect(sim.entries).toHaveLength(8);
  });

  it("prints the RaceLog as JSON with --json", () => {
    const log = loadRaceFixture("ridge");
    const { engine } = fakeEngine(log);
    const out = runSimRace(["--course", "desert-ridge", "--neutral", "--json"], {
      engine,
      ctx,
      readText: noFiles,
    });
    expect(JSON.parse(out)).toEqual(log);
  });

  it("reads the --entries file and reports its problems", () => {
    const { engine, calls } = fakeEngine(loadRaceFixture("canyon"));
    const input = {
      runnerId: "player",
      kind: "player",
      falconessId: "peregrina",
      baseStats: { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 },
      mood: 0,
      biomeAptitude: { desert: "A", mountain: "B", coast: "B", urban: "C", tundra: "D" },
      styleAptitude: { dive: "A", hover: "C", glide: "B", ground: "E" },
      frameId: "peregrina-signature",
      parts: [],
      quirks: [],
      learnedSkills: [],
      durability: 8,
    };
    const files: Record<string, string> = {
      "field.json": JSON.stringify([input]),
      "broken.json": "[{",
    };
    const readText = (path: string) => files[path] ?? noFiles(path);
    runSimRace(["--course", "desert-canyon", "--entries", "field.json"], { engine, ctx, readText });
    expect(calls.map((c) => c.op)).toEqual(["freezeEntry", "simulateRace"]);
    expect(() => runSimRace(["--entries", "broken.json"], { engine, ctx, readText })).toThrow(
      /^broken\.json: /,
    );
  });

  it("answers --help and rejects an unknown course", () => {
    const { engine, calls } = fakeEngine(loadRaceFixture("sprint"));
    expect(runSimRace(["--help"], { engine, ctx, readText: noFiles })).toBe(RACE_USAGE);
    expect(() =>
      runSimRace(["--course", "moon-sprint"], { engine, ctx, readText: noFiles }),
    ).toThrow('unknown course "moon-sprint" (known: desert-canyon, desert-ridge, desert-sprint)');
    expect(calls).toEqual([]);
  });

  it("fails clearly until the race engine is wired", () => {
    const engine = createRaceEngine();
    expect(() => runSimRace(["--neutral"], { engine, ctx, readText: noFiles })).toThrow(
      RaceEngineUnavailableError,
    );
    expect(() =>
      engine.simulateRace(RULESET_V1, [], ctx.content.getCourse("desert-sprint"), "s"),
    ).toThrow("race engine not available yet: `simulateRace`");
  });
});
