import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState, TurnLogEntry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../race/golden.js";
import { RULESET_V1 } from "../rulesets/index.js";
import { advanceSeason } from "./advance.js";
import type { SimContext } from "./context.js";
import { startSeason } from "./start.js";
import { mixedPolicy } from "./testing/mixed-policy.js";

/**
 * ADR-0006: ruleset v1 plays exactly as it did before the season engine learned v2. The digests
 * were recorded at commit 5f0fd65 (the engine the owner's playtest 1 ran on) by replaying the
 * owner's run and 30 seasons of `mixedPolicy` under RULESET_V1. The state without its log must
 * match after every input, draw for draw; the log may only gain what ADR-0006 adds to it (the
 * mood and vigor notes, `moodDelta`, `fatigueDelta` and `event`), which is stripped before hashing.
 */
type Fixture = {
  run1: { perInput: string[]; finalLog: string; final: { grade: string; places: number[] } };
  mixed: Array<{
    falconessId: string;
    seed: string;
    inputs: number;
    state: string;
    log: string;
    grade: string;
  }>;
};

const fixture = (name: string): string =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const expected = JSON.parse(fixture("v1-invariance-5f0fd65.json")) as Fixture;
const run1 = JSON.parse(fixture("playtest-run1.json")) as {
  rulesetVersion: string;
  seed: string;
  inputs: RunInput[];
};

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const hash = (v: unknown): string =>
  createHash("sha256").update(canonicalJson(v)).digest("hex").slice(0, 16);

function rulesDigest(s: SeasonState): string {
  const { log: _log, ...rest } = s;
  return hash(rest);
}

/** The log as 5f0fd65 wrote it: ADR-0006's additions removed. */
function legacyLog(log: readonly TurnLogEntry[]): unknown[] {
  return log.map((e) => {
    const {
      moodDelta: _m,
      fatigueDelta: _f,
      event: _e,
      ...rest
    } = e as TurnLogEntry & Record<string, unknown>;
    return { ...rest, notes: e.notes.filter((n) => !/^log\.(mood|vigor)\./.test(n)) };
  });
}

function startOf(input: RunInput | undefined): Extract<RunInput, { kind: "start" }> {
  if (input?.kind !== "start") throw new Error("the first input must be `start`");
  return input;
}

describe("ruleset v1 invariance (ADR-0006)", () => {
  it("replays the owner's playtest 1 draw for draw, input by input", () => {
    expect(run1.rulesetVersion).toBe("v1");
    let s = startSeason(ctx, run1.seed, startOf(run1.inputs[0]));
    const got = [rulesDigest(s)];
    for (const input of run1.inputs.slice(1)) {
      s = advanceSeason(ctx, s, input);
      got.push(rulesDigest(s));
    }
    expect(got).toEqual(expected.run1.perInput);
    expect(hash(legacyLog(s.log))).toBe(expected.run1.finalLog);
    expect(s.grade).toBe(expected.run1.final.grade);
    expect(s.raceResults.map((r) => r.place)).toEqual(expected.run1.final.places);
  });

  it("plays 30 mixed-policy seasons exactly as 5f0fd65 did", () => {
    for (const m of expected.mixed) {
      let s = startSeason(ctx, m.seed, {
        kind: "start",
        falconessId: m.falconessId,
        hangar: ["shiden", "mule", "nimbus", "hayate"],
        parents: [],
      });
      let inputs = 1;
      while (s.status === "active") {
        s = advanceSeason(ctx, s, mixedPolicy(ctx.content, s));
        inputs += 1;
      }
      const label = `${m.falconessId} ${m.seed}`;
      expect(inputs, label).toBe(m.inputs);
      expect(rulesDigest(s), label).toBe(m.state);
      expect(hash(legacyLog(s.log)), label).toBe(m.log);
      expect(s.grade, label).toBe(m.grade);
    }
  });
});
