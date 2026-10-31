import { loadContent } from "@falconess/content";
import type { Course, RaceEntry, RaceRule, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import type { Ruleset } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry, type CourseGeometry } from "./geometry.js";
import { createRaceArena } from "./state.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";

/**
 * The batch scenarios S1 (styles) and S2 (equal-PW rule terms) of docs/race-engine.md 25.2 at the
 * sample sizes and seeds the spec prototype used for 25.4 and 13.1 (.work/proto/proto2/s1.mjs,
 * s2eq.mjs). The engine agrees with the prototype race by race (differential harness,
 * .work/impl/diff), so the printed win rates and phase splits come out exactly; a change here is a
 * change to the spec's balance tables. About 8 s: the heaviest file of the suite.
 */

const content = loadContent();
const QUIET: Ruleset = {
  ...SPEC_RULESET,
  race: { ...SPEC_RULESET.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
const COURSES = ["sprint", "ridge", "canyon"].map((id) => content.getCourse(id));
const STYLES: readonly Style[] = ["dive", "hover", "glide", "ground"];

function stats(over: Partial<RaceEntry["stats"]> = {}): RaceEntry["stats"] {
  return { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600, ...over };
}
function neutral(style: Style, lane = 0, st = stats(), over: Partial<RaceEntry> = {}): RaceEntry {
  return {
    ...neutralFixtureEntry({ runnerId: `n${lane}`, laneIndex: lane, style, stats: st }),
    ...over,
  };
}
function solo(ruleset: Ruleset, e: RaceEntry, c: Course, seed: string) {
  const r = simulateRace(ruleset, [e], c, seed, { detail: "results" }).results[0];
  if (!r || r.finishMilli === null) throw new Error("no finish");
  return r;
}
/** A batch runner: one arena and one cached geometry per course, detail "results". */
function batch() {
  const arena = createRaceArena();
  const geo = new Map<string, CourseGeometry>();
  return (ruleset: Ruleset, entries: RaceEntry[], c: Course, seed: string) => {
    let g = geo.get(c.id);
    if (!g) {
      g = buildCourseGeometry(ruleset, c);
      geo.set(c.id, g);
    }
    return simulateRace(ruleset, entries, c, seed, { detail: "results", arena, geometry: g });
  };
}

describe("S1 and S2 of 25.2 at their 25.4 sample sizes (s1.mjs, s2eq.mjs seeds)", () => {
  it("S1: style wins 35/31/23/11, 20/19/23/38, 24/29/32/16 % (mean 26.2/26.3/25.8/21.8; canyon without wind, ADR-0007) and the mean phase splits", {
    timeout: 60_000,
  }, () => {
    // two neutral fixtures per style, lanes rotated per seed, 800 races per course, noise on
    const wins: string[] = [];
    const splits: string[] = [];
    const mean = [0, 0, 0, 0];
    for (const c of COURSES) {
      const G = buildCourseGeometry(SPEC_RULESET, c);
      const w = [0, 0, 0, 0];
      const sp = STYLES.map(() => [0, 0, 0, 0]);
      const arena = createRaceArena();
      for (let k = 0; k < 800; k++) {
        const rot = STYLES.concat(STYLES).map((_, i) => STYLES[(i + k) % 4] as Style);
        const split = rot.map(() => [-1, -1]);
        const log = simulateRaceProbed(
          SPEC_RULESET,
          rot.map((st, lane) => neutral(st, lane)),
          c,
          `s1-${k}`,
          (t, A) => {
            for (let i = 0; i < 8; i++) {
              const row = split[i] ?? [];
              const pos = A.state.pos[i] ?? 0;
              const prev = A.state.prevPos[i] ?? 0;
              const disp = A.state.disp[i] ?? 0;
              for (const [q, x] of [G.startEnd, G.finalStart].entries())
                if (row[q] === -1 && pos >= x)
                  row[q] = t * 1000 + Math.floor(((x - prev) * 1000) / disp);
            }
          },
          { detail: "results", arena, geometry: G },
        );
        for (const r of log.results) {
          const s = STYLES.indexOf(rot[r.lane] as Style);
          const a = sp[s] ?? [];
          const [p1 = 0, p2 = 0] = split[r.lane] ?? [];
          a[0] = (a[0] ?? 0) + p1;
          a[1] = (a[1] ?? 0) + p2 - p1;
          a[2] = (a[2] ?? 0) + (r.finishMilli ?? 0) - p2;
          a[3] = (a[3] ?? 0) + 1;
          if (r.place === 1) w[s] = (w[s] ?? 0) + 1;
        }
      }
      w.forEach((x, s) => {
        mean[s] = (mean[s] ?? 0) + x / 800 / 3;
      });
      wins.push(w.map((x) => ((100 * x) / 800).toFixed(0)).join("/"));
      splits.push(
        sp
          .map((a) =>
            [0, 1, 2].map((q) => ((a[q] ?? 0) / (a[3] ?? 1) / 15_000).toFixed(2)).join(" / "),
          )
          .join(", "),
      );
    }
    expect(wins).toEqual(["35/31/23/11", "20/19/23/38", "24/29/32/16"]);
    expect(mean.map((x) => (100 * x).toFixed(1)).join("/")).toBe("26.2/26.3/25.8/21.8");
    // dive / hover / glide / ground, start / middle / final (s)
    expect(splits).toEqual([
      "10.44 / 26.95 / 16.76, 10.35 / 26.51 / 17.28, 10.04 / 26.83 / 17.49, 10.28 / 26.56 / 17.66",
      "16.15 / 42.62 / 28.25, 16.17 / 42.27 / 28.50, 16.04 / 42.61 / 28.36, 16.19 / 42.07 / 28.29",
      "23.59 / 64.57 / 46.81, 23.45 / 63.69 / 47.56, 23.01 / 64.57 / 47.33, 23.47 / 64.14 / 47.70",
    ]);
  });

  it("S2 equal PW (hover, v1): solo time vs none and the win rate of 5 rules + 3 none over 600 races", {
    timeout: 60_000,
  }, () => {
    const run = batch();
    const rules: RaceRule[] = ["mass-thrust", "regen", "pulse", "telemetry", "repairable"];
    const out: string[] = [];
    for (const c of COURSES) {
      const base = solo(QUIET, neutral("hover"), c, "s2").finishMilli ?? 1;
      const pct = rules.map((rule) => {
        const t = solo(QUIET, neutral("hover", 0, stats(), { rule }), c, "s2").finishMilli ?? 0;
        return (100 * (t / base - 1)).toFixed(2);
      });
      const field: RaceRule[] = [...rules, "none", "none", "none"];
      const wins = new Map<RaceRule, number>();
      for (let k = 0; k < 600; k++) {
        const rot = field.map((_, i) => field[(i + k) % 8] ?? "none");
        const log = run(
          SPEC_RULESET,
          rot.map((rule, lane) => neutral("hover", lane, stats(), { rule })),
          c,
          `s2-${k}`,
        );
        const win = log.results.find((r) => r.place === 1);
        const rule = win ? (rot[win.lane] ?? "none") : "none";
        wins.set(rule, (wins.get(rule) ?? 0) + 1);
      }
      const share = (rule: RaceRule) => ((100 * (wins.get(rule) ?? 0)) / 600).toFixed(0);
      out.push(`${pct.join(" ")} | ${rules.map(share).join(" ")} | none ${share("none")}`);
    }
    // mass-thrust, regen, pulse, telemetry, repairable (13.1 and the v1 rows of 25.4)
    expect(out).toEqual([
      "0.01 -2.93 -0.13 0.77 2.89 | 4 82 5 1 0 | none 8",
      "0.00 0.60 -0.09 0.71 -0.99 | 13 2 15 3 37 | none 31",
      "0.04 -2.02 0.10 -1.27 0.00 | 4 48 3 34 4 | none 8",
    ]);
  });
});
