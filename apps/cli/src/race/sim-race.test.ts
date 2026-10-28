import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "@falconess/content";
import { RaceLog } from "@falconess/schema";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { runSimRace } from "../sim-race.js";
import { fakeEngine } from "./__fixtures__/fake-engine.js";
import { FIXTURE_DIR, loadRaceFixture } from "./__fixtures__/load.js";
import { createRaceEngine } from "./engine-adapter.js";
import { interimRivalPool } from "./interim-field.js";
import { contentLabels } from "./labels.js";
import { RACE_USAGE } from "./options.js";
import { renderRace } from "./render-race.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const noFiles = (path: string): string => {
  throw new Error(`unexpected read of ${path}`);
};
const fixtureFiles = (path: string) => readFileSync(join(FIXTURE_DIR, path), "utf8");

describe("pnpm sim:race through the port", () => {
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
});

describe("pnpm sim:race on the real engine", () => {
  const real = { engine: createRaceEngine(), ctx, readText: fixtureFiles };

  it("prints every course deterministically for each field kind", () => {
    for (const course of ctx.content.courses.keys()) {
      const fields = [
        ["--neutral"],
        ["--falconess", "cernicala", "--turn", "24"],
        ["--entries", "canyon-entries.json"],
      ];
      for (const field of fields) {
        const argv = ["--seed", "smoke", "--course", course, ...field];
        const a = runSimRace(argv, real);
        expect(runSimRace(argv, real)).toBe(a);
        const lines = a.split("\n");
        const start = lines.indexOf("CLASIFICACIÓN");
        expect(lines.slice(start + 2, start + 10).every((l) => /^ {2}[ »]\d /.test(l))).toBe(true);
        expect(a).toContain("POR QUÉ");
        expect(a).not.toContain("NaN");
        expect(a).not.toContain("undefined");
      }
    }
  });

  it("fills the default field with the player and seven rivals of her PW class", () => {
    const out = runSimRace(["--seed", "7", "--course", "desert-ridge", "--json"], real);
    const log = RaceLog.parse(JSON.parse(out));
    expect(log.entries).toHaveLength(8);
    const players = log.entries.filter((e) => e.kind === "player");
    expect(players.map((e) => e.frameId)).toEqual(["peregrina-signature"]);
    const rivals = log.entries.filter((e) => e.kind === "rival");
    expect(rivals.map((e) => e.runnerId).sort()).toEqual(
      Array.from({ length: 7 }, (_, i) => `rival-${i + 1}`),
    );
    for (const r of rivals) expect(["etoile", "shiden"]).toContain(r.frameId);
  });

  it("matches the class pools of docs/race-engine.md 21.1 in the interim field", () => {
    const pool = (frameId: string) =>
      interimRivalPool(RULESET_V1, ctx.content, frameId).map((f) => f.id);
    expect(pool("peregrina-signature")).toEqual(["etoile", "shiden"]);
    expect(pool("hayate")).toEqual(["hayate", "sylphe"]);
    expect(pool("falke")).toEqual(["erzherzog", "falke", "horizon"]);
    expect(pool("cernicala-signature")).toEqual(["nimbus"]);
    expect(pool("caracara-signature")).toEqual(["kite", "mule"]);
  });
});
