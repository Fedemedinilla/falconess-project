import { loadContent } from "@falconess/content";
import { RULESET_V1 } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog.js";
import { createFakeEngine } from "./fake-engine.js";
import type { Job } from "./plan.js";
import {
  type BuildContext,
  buildRaceJob,
  neutralField,
  S1_ROLES,
  S8_ROLES,
  shuffledLanes,
} from "./scenarios.js";

const content = loadContent();
const ctx: BuildContext = {
  port: createFakeEngine(),
  ruleset: RULESET_V1,
  content,
  catalog: buildCatalog(content),
};

type RaceJob = Exclude<Job, { scenario: "S7" }>;
/** Omit distributed over the union, so each scenario keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const job = (j: DistributiveOmit<RaceJob, "id">): RaceJob => ({ id: 0, ...j });

function isPermutation(lanes: readonly number[]): boolean {
  return [...lanes].sort((a, b) => a - b).every((l, i) => l === i);
}

describe("S1 field", () => {
  it("is 8 neutral fixtures, 2 per style, stats 600, lanes shuffled per seed", () => {
    const entries = neutralField(ctx, "pr/S1/sprint/field/0");
    expect(entries.map((e) => e.runnerId)).toEqual(S1_ROLES);
    expect(entries.map((e) => e.style)).toEqual([
      "dive",
      "dive",
      "hover",
      "hover",
      "glide",
      "glide",
      "ground",
      "ground",
    ]);
    expect(isPermutation(entries.map((e) => e.laneIndex))).toBe(true);
    for (const e of entries) {
      expect(e.rule).toBe("none");
      expect(e.powerToWeight).toBe(1000);
      expect(e.skills).toEqual([]);
      expect(Object.values(e.stats).every((v) => v === 600)).toBe(true);
    }
    expect(neutralField(ctx, "pr/S1/sprint/field/0")).toEqual(entries);
    const lanesBySeed = new Set(
      Array.from({ length: 20 }, (_, k) => shuffledLanes(`seed/${k}`, 8).join(",")),
    );
    expect(lanesBySeed.size).toBeGreaterThan(1);
  });
});

describe("S2 field (revision 4: one designated entry per manufacturer)", () => {
  it("real frames: a non-signature frame per manufacturer at base 600, letters B, plus 3 fillers", () => {
    const seen = new Map<string, Set<string>>();
    for (let k = 0; k < 40; k++) {
      const spec = buildRaceJob(
        ctx,
        job({
          scenario: "S2",
          variant: "real",
          course: "ridge",
          k,
          seed: `pr/S2/ridge/real/${k}`,
        }),
      );
      const race = spec.races[0];
      expect(race?.roles).toEqual([
        "altair",
        "boneyard",
        "koryu",
        "lumiere",
        "steinhaus",
        "none-1",
        "none-2",
        "none-3",
      ]);
      const entries = race?.entries ?? [];
      expect(isPermutation(entries.map((e) => e.laneIndex))).toBe(true);
      entries.slice(0, 5).forEach((e, i) => {
        const m = ctx.catalog.manufacturers[i] ?? "";
        expect(e.manufacturer).toBe(m);
        expect(ctx.catalog.s2Frames.get(m)).toContain(e.frameId);
        expect(e.quirks).toEqual([]);
        expect(e.parts).toEqual([]);
        expect(e.skills).toEqual([]);
        expect(Object.values(e.stats).every((v) => v === 600)).toBe(true);
        const set = seen.get(m) ?? new Set<string>();
        set.add(e.frameId);
        seen.set(m, set);
      });
      for (const e of entries.slice(5)) {
        expect(e.rule).toBe("none");
        expect(e.style).toBe("hover");
      }
      expect(spec.frames?.slice(0, 5)).toEqual(entries.slice(0, 5).map((e) => e.frameId));
    }
    for (const frames of seen.values()) expect(frames.size).toBe(2);
  });

  it("equal-PW: the neutral fixture with the manufacturer's rule, style hover", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "S2",
        variant: "equal-pw",
        course: "sprint",
        k: 0,
        seed: "pr/S2/sprint/equal-pw/0",
      }),
    );
    const entries = spec.races[0]?.entries ?? [];
    expect(entries.slice(0, 5).map((e) => [e.manufacturer, e.rule])).toEqual([
      ["altair", "telemetry"],
      ["boneyard", "repairable"],
      ["koryu", "pulse"],
      ["lumiere", "regen"],
      ["steinhaus", "mass-thrust"],
    ]);
    for (const e of entries) {
      expect(e.style).toBe("hover");
      expect(e.powerToWeight).toBe(1000);
      expect(e.frameId).toBe("fixture-neutral");
    }
    expect(spec.frames).toBeUndefined();
  });
});

describe("S3 build (revision 4, D47)", () => {
  it("is the same Falconess on both frames, both lane orders of one seed", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "S3",
        pair: "peregrina",
        course: "ridge",
        k: 3,
        seed: "pr/S3/ridge/peregrina/3",
      }),
    );
    expect(spec.races).toHaveLength(2);
    const [a, b] = spec.races;
    expect(a?.seed).toBe(b?.seed);
    expect(a?.roles).toEqual(["signature", "generic"]);
    expect(a?.entries.map((e) => e.laneIndex)).toEqual([0, 1]);
    expect(b?.entries.map((e) => e.laneIndex)).toEqual([1, 0]);
    const [sig, gen] = a?.entries ?? [];
    expect(sig?.frameId).toBe("peregrina-signature");
    expect(gen?.frameId).toBe("shiden");
    for (const e of [sig, gen]) {
      expect(e?.falconessId).toBe("peregrina");
      expect(e?.kind).toBe("player");
      expect(e?.skills.map((s) => s.id)).toEqual(["stoop-strike"]);
      expect(e?.quirks).toEqual([]);
      // No letter on agility (ADR-0007), dive A on intelligence: 600 / 600 / 600 / 600 / 630.
      expect(e?.stats).toEqual({
        agility: 600,
        stamina: 600,
        technique: 600,
        courage: 600,
        intelligence: 630,
      });
    }
  });

  it("gives the generic mule no quirks (Caracara pair)", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "S3",
        pair: "caracara",
        course: "canyon",
        k: 0,
        seed: "pr/S3/canyon/caracara/0",
      }),
    );
    const gen = spec.races[0]?.entries[1];
    expect(gen?.frameId).toBe("mule");
    expect(gen?.quirks).toEqual([]);
    expect(gen?.skills.map((s) => s.id)).toEqual(["scavenger-stride"]);
  });
});

describe("S4 skill ablation (D49)", () => {
  it("gives every runner the skill and disables it on all 8 in the off run, same lanes", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "S4",
        skill: "wind-hover",
        course: "sprint",
        k: 0,
        seed: "pr/S4/sprint/wind-hover/0",
      }),
    );
    const [on, off] = spec.races;
    expect(on?.seed).toBe(off?.seed);
    expect(on?.entries.map((e) => e.laneIndex)).toEqual(off?.entries.map((e) => e.laneIndex));
    for (const e of on?.entries ?? []) {
      expect(e.skills.map((s) => [s.id, s.disabled])).toEqual([["wind-hover", false]]);
    }
    for (const e of off?.entries ?? []) {
      expect(e.skills.map((s) => [s.id, s.disabled])).toEqual([["wind-hover", true]]);
    }
  });
});

describe("S5 part ablation (revision 3)", () => {
  it("puts the part on the runner in lane k mod 8 and leaves everyone else identical", () => {
    for (const k of [0, 5, 9]) {
      const seed = `pr/S5/sprint/steinhaus-turbine/${k}`;
      const spec = buildRaceJob(
        ctx,
        job({ scenario: "S5", part: "steinhaus-turbine", course: "sprint", k, seed }),
      );
      const [withPart, without] = spec.races;
      const c = spec.carrierRole ?? -1;
      expect(withPart?.entries[c]?.laneIndex).toBe(k % 8);
      expect(withPart?.entries[c]?.parts).toEqual(["steinhaus-turbine"]);
      expect(withPart?.entries[c]?.powerToWeight).toBe(1100);
      expect(withPart?.entries[c]?.dissipation).toBe(50);
      expect(without?.entries[c]?.powerToWeight).toBe(1000);
      withPart?.entries.forEach((e, i) => {
        if (i !== c) expect(e).toEqual(without?.entries[i]);
      });
    }
  });

  it("applies falconess-stat deltas of a part (koryu-firmware +30 I)", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "S5",
        part: "koryu-firmware",
        course: "ridge",
        k: 2,
        seed: "pr/S5/ridge/koryu-firmware/2",
      }),
    );
    const c = spec.carrierRole ?? -1;
    expect(spec.races[0]?.entries[c]?.stats.intelligence).toBe(630);
  });
});

describe("S8 Intelligence sweep", () => {
  it("runs the five I values on one seed with the measured runner in lane k mod 8", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "S8",
        style: "glide",
        course: "canyon",
        k: 11,
        seed: "pr/S8/canyon/glide/11",
      }),
    );
    expect(spec.races.map((r) => r.entries[0]?.stats.intelligence)).toEqual([
      300, 510, 600, 630, 1000,
    ]);
    for (const race of spec.races) {
      expect(race.seed).toBe("pr/S8/canyon/glide/11");
      expect(race.roles).toEqual(S8_ROLES);
      expect(race.entries[0]?.laneIndex).toBe(3);
      expect(isPermutation(race.entries.map((e) => e.laneIndex))).toBe(true);
      for (const e of race.entries) expect(e.style).toBe("glide");
      for (const e of race.entries.slice(1)) expect(e.stats.intelligence).toBe(600);
    }
  });
});

describe("stat diagnostic", () => {
  it("pairs a solo neutral hover at 600 with the same seed at stat + 100", () => {
    const spec = buildRaceJob(
      ctx,
      job({
        scenario: "stats",
        stat: "courage",
        course: "sprint",
        k: 0,
        seed: "full/stats/sprint/courage/0",
      }),
    );
    expect(spec.races.map((r) => r.entries.length)).toEqual([1, 1]);
    expect(spec.races[0]?.entries[0]?.stats.courage).toBe(600);
    expect(spec.races[1]?.entries[0]?.stats.courage).toBe(700);
    expect(spec.races[1]?.entries[0]?.stats.agility).toBe(600);
  });
});
