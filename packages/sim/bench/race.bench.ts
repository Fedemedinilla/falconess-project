import { appendFileSync } from "node:fs";
import { loadContent } from "@falconess/content";
import type { EntryInput, RaceEntry } from "@falconess/schema";
import { expect, test } from "vitest";
import { freezeEntry } from "../src/race/entry.js";
import { buildCourseGeometry } from "../src/race/geometry.js";
import { simulateRace } from "../src/race/index.js";
import { createRaceArena } from "../src/race/state.js";
import { RULESET_V1 } from "../src/rulesets/index.js";

/**
 * Race benchmark of docs/race-engine.md 22 and ROADMAP D13: eight mixed generic frames (every
 * manufacturer rule, every style, two pulse frames), four actives each, on canyon (3000 m)
 * and sprint (1200 m), with detail "full" and "results", one reused arena and a cached
 * geometry as the batch runs it. Target: under 5 ms per 8-runner 3000 m race (ROADMAP D10/D13):
 * the canyon "results" run fails if its p95 exceeds it. Run with `pnpm bench` (Vitest 5 benchmark
 * fixture, native ES modules: see the `sim-bench` project in vitest.config.ts). In GitHub Actions
 * (`GITHUB_STEP_SUMMARY` set) the ms per race also go to the job summary as a table, written
 * before the gate is checked so a failing run still shows its numbers; a summary that cannot be
 * written only warns: the p95 gate is the one way this file fails.
 */

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const FIELD: [string, string[]][] = [
  ["falke", ["corner-carver", "cool-head", "hill-lungs", "last-gasp"]],
  ["erzherzog", ["canyon-sense", "clean-start", "hill-lungs", "pack-shadow"]],
  ["sylphe", ["cool-head", "pack-shadow", "second-wind", "water-skimmer"]],
  ["etoile", ["iron-wings", "last-gasp", "lead-guard", "second-wind"]],
  ["shiden", ["canyon-sense", "clean-start", "cool-head", "water-skimmer"]],
  ["hayate", ["canyon-sense", "hill-lungs", "iron-wings", "last-gasp"]],
  ["nimbus", ["clean-start", "gravity-friend", "lead-guard", "pack-shadow"]],
  ["horizon", ["clean-start", "gravity-friend", "last-gasp", "second-wind"]],
];

function field(courseId: string): RaceEntry[] {
  const course = content.getCourse(courseId);
  return FIELD.map(([frameId, learnedSkills], lane) => {
    const input: EntryInput = {
      runnerId: `bench-${lane}`,
      kind: "rival",
      falconessId: null,
      baseStats: S600,
      mood: 0,
      positionAptitude: { lead: "B", pack: "B", stalk: "B", closer: "B" },
      frameId,
      parts: [],
      quirks: [],
      learnedSkills,
      durability: null,
    };
    return freezeEntry(RULESET_V1, content, input, course, lane);
  });
}

/** Budget of one 8-runner 3000 m race at p95, ms (docs/race-engine.md 22). */
const BUDGET_MS = 5;

/** p95 of the retained samples (tinybench reports p75 and p99 only); p99 if none were kept. */
function p95(latency: { samples?: readonly number[] | undefined; p99: number }): number {
  const s = latency.samples;
  if (s === undefined || s.length === 0) return latency.p99;
  const sorted = [...s].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? latency.p99;
}

type Latency = {
  mean: number;
  p50: number;
  p99: number;
  samples?: readonly number[] | undefined;
};

let summaryStarted = false;

/** Append rows to the GitHub job summary (Markdown), with the table header the first time. */
function jobSummary(rows: readonly string[]): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path === undefined || path === "") return;
  const head = summaryStarted
    ? []
    : [
        "### Race benchmark: ms per race",
        "",
        `8 runners, 4 actives each, one reused arena and a cached geometry. Gate: the canyon "results" p95 must stay under ${BUDGET_MS} ms (docs/race-engine.md 22).`,
        "",
        "| course | detail | mean | p50 | p95 | p99 | samples | gate |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
      ];
  try {
    appendFileSync(path, `${[...head, ...rows].join("\n")}\n`);
    summaryStarted = true;
  } catch (e) {
    console.warn(`job summary not written: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function summaryRow(courseId: string, detail: string, l: Latency, gate: string): string {
  const ms = (v: number) => v.toFixed(3);
  const n = l.samples?.length ?? 0;
  return `| ${courseId} | ${detail} | ${ms(l.mean)} | ${ms(l.p50)} | ${ms(p95(l))} | ${ms(l.p99)} | ${n} | ${gate} |`;
}

for (const courseId of ["canyon", "sprint"]) {
  test(`8 runners, 4 actives each, ${courseId}`, async ({ bench }) => {
    const course = content.getCourse(courseId);
    const entries = field(courseId);
    const geometry = buildCourseGeometry(RULESET_V1, course);
    const arena = createRaceArena();
    let k = 0;
    const run = (detail: "full" | "results") => () => {
      k += 1;
      simulateRace(RULESET_V1, entries, course, `bench-${k}`, { detail, arena, geometry });
    };
    const opts = { time: 2000, warmupTime: 500 };
    const results = await bench("detail results", run("results")).run(opts);
    const full = await bench("detail full", run("full")).run(opts);
    const gated = courseId === "canyon";
    const rows: string[] = [];
    for (const [name, r] of [
      ["results", results],
      ["full", full],
    ] as const) {
      console.log(
        `${courseId} ${name}: mean ${r.latency.mean.toFixed(3)} ms, p50 ${r.latency.p50.toFixed(3)} ms, p95 ${p95(r.latency).toFixed(3)} ms, p99 ${r.latency.p99.toFixed(3)} ms`,
      );
      const verdict = p95(r.latency) < BUDGET_MS ? "pass" : "**FAIL**";
      const gate =
        gated && name === "results" ? `p95 < ${BUDGET_MS} ms: ${verdict}` : "report only";
      rows.push(summaryRow(courseId, name, r.latency, gate));
    }
    jobSummary(rows);
    if (gated) expect(p95(results.latency)).toBeLessThan(BUDGET_MS);
  });
}
