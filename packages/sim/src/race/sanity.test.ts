import { readFileSync } from "node:fs";
import { loadContent } from "@falconess/content";
import type { Course, EntryInput, RaceEntry, SprintPlanReason, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import type { Ruleset } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry } from "./geometry.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";

/**
 * Sanity numbers of docs/race-engine.md 25.4: every build of the three desert tables (neutral
 * fixtures and the 13 real frames, all five stats 600, noise off, no skills, solo) pinned exactly
 * against the spec prototype (.work/proto/proto2/engine.mjs, which produced the spec's numbers):
 * finish milli-ticks, boost ticks per phase, pulses, energy left, durability at the line, where hp
 * ran out, and the first plan's level and reason. The spec allows ±0.5 % of time; the engine
 * matches to the milli-tick.
 */

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const QUIET: Ruleset = {
  ...SPEC_RULESET,
  race: { ...SPEC_RULESET.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
const B = { desert: "B", mountain: "B", coast: "B", urban: "B", tundra: "B" } as const;

/** [build, finishMilli, boost ticks S/M/F, pulses, energy left (me), durability end (md), hp empty (mm), first plan level (mm/s), reason] */
type Row = [
  string,
  number,
  [number, number, number],
  number,
  number,
  number,
  number | null,
  number,
  SprintPlanReason,
];

// prototype output (spec revision 2 constants = v1); seconds of 25.4 = finishMilli / 15 000
const TABLE: Record<string, Row[]> = {
  "desert-sprint": [
    ["neutral-dive", 811731, [1, 0, 99], 0, 0, 100000, null, 1800, "planned"],
    ["neutral-hover", 817093, [10, 0, 90], 0, 0, 100000, null, 1300, "planned"],
    ["neutral-glide", 814407, [1, 0, 99], 0, 0, 100000, null, 1300, "planned"],
    ["neutral-ground", 817402, [18, 43, 39], 0, 0, 100000, null, 2500, "planned"],
    ["falke", 812102, [46, 8, 66], 0, 0, 140000, null, 800, "planned"],
    ["erzherzog", 817406, [41, 20, 39], 0, 0, 140000, null, 1200, "planned"],
    ["sylphe", 691822, [50, 111, 93], 0, 15000, 80000, null, 1900, "planned"],
    ["etoile", 624902, [49, 101, 85], 0, 20000, 60000, 1176806, 3080, "planned"],
    ["shiden", 640876, [36, 0, 36], 6, 13600, 100000, null, 2608, "planned"],
    ["hayate", 710868, [28, 32, 12], 6, 13600, 60000, null, 1596, "planned"],
    ["nimbus", 935210, [15, 0, 105], 0, 0, 100000, null, 1150, "planned"],
    ["horizon", 811322, [37, 35, 103], 0, 0, 100000, null, 1300, "planned"],
    ["mule", 1165452, [14, 46, 40], 0, 0, 180000, null, 1200, "planned"],
    ["kite", 1164103, [0, 0, 100], 0, 0, 180000, null, 800, "planned"],
    ["peregrina-signature", 642131, [36, 0, 36], 6, 13600, 100000, null, 2608, "planned"],
    ["cernicala-signature", 914540, [43, 120, 115], 0, 19250, 100000, null, 1150, "planned"],
    ["caracara-signature", 1165452, [14, 46, 40], 0, 0, 180000, null, 1200, "planned"],
  ],
  "desert-ridge": [
    ["neutral-dive", 1303652, [15, 0, 50], 0, 0, 100000, null, 2600, "planned"],
    ["neutral-hover", 1306911, [0, 0, 65], 0, 0, 100000, null, 1500, "planned"],
    ["neutral-glide", 1304010, [0, 0, 65], 0, 0, 100000, null, 1500, "planned"],
    ["neutral-ground", 1296912, [17, 44, 39], 0, 0, 100000, null, 2500, "planned"],
    ["falke", 1301517, [0, 0, 85], 0, 0, 140000, null, 800, "planned"],
    ["erzherzog", 1296912, [18, 43, 39], 0, 0, 140000, null, 1200, "planned"],
    ["sylphe", 1176863, [77, 166, 95], 0, 60000, 80000, 1834132, 1900, "hp-limited"],
    ["etoile", 1069956, [82, 157, 49], 0, 60000, 60000, 1642774, 3380, "hp-limited"],
    ["shiden", 1066630, [24, 0, 24], 4, 7400, 100000, 1644492, 2608, "hp-limited"],
    ["hayate", 1158815, [36, 24, 12], 6, 13600, 60000, 1768170, 1596, "hp-limited"],
    ["nimbus", 1510095, [0, 0, 85], 0, 0, 100000, null, 1250, "planned"],
    ["horizon", 1303030, [0, 35, 105], 0, 0, 100000, null, 1300, "planned"],
    ["mule", 1813965, [15, 45, 40], 0, 0, 180000, null, 1200, "planned"],
    ["kite", 1813647, [0, 0, 65], 0, 0, 180000, null, 900, "planned"],
    ["peregrina-signature", 1066630, [24, 0, 24], 4, 7400, 100000, 1644492, 2608, "hp-limited"],
    ["cernicala-signature", 1474357, [52, 159, 157], 0, 11750, 100000, null, 1050, "planned"],
    ["caracara-signature", 1813965, [15, 45, 40], 0, 0, 180000, null, 1200, "planned"],
  ],
  "desert-canyon": [
    ["neutral-dive", 2039108, [0, 0, 100], 0, 0, 90000, 2818357, 1800, "hp-limited"],
    ["neutral-hover", 2042391, [0, 0, 100], 0, 0, 90000, 2827861, 1300, "hp-limited"],
    ["neutral-glide", 2028014, [0, 0, 100], 0, 0, 90000, 2872589, 1300, "hp-limited"],
    ["neutral-ground", 2043225, [15, 46, 39], 0, 0, 95000, 2830206, 2500, "hp-limited"],
    ["falke", 2019852, [2, 0, 116], 0, 2000, 130000, 2851313, 700, "hp-limited"],
    ["erzherzog", 2043225, [15, 46, 39], 0, 0, 140000, 2830206, 1200, "hp-limited"],
    ["sylphe", 1776525, [107, 270, 65], 0, 60000, 70000, 2371576, 2100, "hp-limited"],
    ["etoile", 1603997, [111, 232, 40], 0, 60000, 50000, 2173160, 4380, "hp-limited"],
    ["shiden", 1630746, [60, 0, 12], 6, 13600, 90000, 2229911, 2608, "hp-limited"],
    ["hayate", 1806976, [36, 24, 12], 6, 13600, 55000, 2430552, 1596, "hp-limited"],
    ["nimbus", 2338049, [0, 0, 120], 0, 0, 90000, null, 1050, "planned"],
    ["horizon", 2003923, [0, 35, 140], 0, 0, 90000, null, 1200, "planned"],
    ["mule", 2831884, [14, 46, 40], 0, 0, 177000, null, 1200, "planned"],
    ["kite", 2831409, [0, 0, 100], 0, 0, 172000, null, 800, "planned"],
    ["peregrina-signature", 1631102, [60, 0, 12], 6, 13600, 90000, 2231348, 2608, "hp-limited"],
    ["cernicala-signature", 2280219, [77, 260, 219], 0, 0, 90000, null, 950, "planned"],
    ["caracara-signature", 2774171, [14, 46, 40], 0, 0, 180000, null, 1200, "planned"],
  ],
};

function entryOf(name: string, course: Course): RaceEntry {
  if (name.startsWith("neutral-"))
    return neutralFixtureEntry({
      runnerId: name,
      laneIndex: 0,
      style: name.slice("neutral-".length) as Style,
      stats: S600,
    });
  const input: EntryInput = {
    runnerId: name,
    kind: "rival",
    falconessId: null,
    baseStats: S600,
    mood: 0,
    biomeAptitude: B,
    styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
    frameId: name,
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
  };
  return freezeEntry(QUIET, content, input, course, 0);
}

describe("sanity numbers of docs/race-engine.md 25.4 (solo, 600 stats, noise off)", () => {
  for (const [courseId, rows] of Object.entries(TABLE))
    it(`${courseId}: every build matches the prototype to the milli-tick`, () => {
      const course = content.getCourse(courseId);
      for (const [name, milli, boost, pulses, energyLeft, durEnd, hpEmpty, level, reason] of rows) {
        const log = simulateRace(QUIET, [entryOf(name, course)], course, "sanity");
        const r = log.results[0];
        const plan = (log.events ?? []).find((e) => e.kind === "sprintPlan");
        expect({
          name,
          milli: r?.finishMilli,
          boost: r?.ledger.boostTicks,
          pulses: r?.ledger.pulses,
          energyLeft: r?.energyEnd,
          durEnd: r?.durabilityEnd,
          hpEmpty: r?.ledger.hpEmptyMm,
          level: plan?.kind === "sprintPlan" ? plan.levelMms : -1,
          reason: plan?.kind === "sprintPlan" ? plan.reason : "none",
        }).toEqual({ name, milli, boost, pulses, energyLeft, durEnd, hpEmpty, level, reason });
      }
    });

  it("the spec's rounded times: 54.12 / 86.91 / 135.94 s for the neutral dive, 54.47 s for the hover", () => {
    const s = (row: Row | undefined) => ((row?.[1] ?? 0) / 15_000).toFixed(2);
    expect(s(TABLE["desert-sprint"]?.[0])).toBe("54.12");
    expect(s(TABLE["desert-ridge"]?.[0])).toBe("86.91");
    expect(s(TABLE["desert-canyon"]?.[0])).toBe("135.94");
    expect(s(TABLE["desert-sprint"]?.[1])).toBe("54.47");
  });
});

/**
 * The 25.4 tables as printed in docs/race-engine.md, every cell: the engine's run of each build is
 * formatted exactly as the prototype's table generator printed it (.work/proto/proto2/table.mjs:
 * time, phase splits at the crossing milli-tick, boost ticks, pulses, first plan with its start,
 * energy left, hp end or hp-empty point, overheat ticks and durability), and the row must equal the
 * spec's line. A change to an agreed number then fails here until the spec table is regenerated.
 */
describe("the 25.4 tables of docs/race-engine.md, cell by cell", () => {
  const doc = readFileSync(new URL("../../../../docs/race-engine.md", import.meta.url), "utf8");
  const from = doc.indexOf("### 25.4 Sanity numbers");
  const to = doc.indexOf("**Other measured anchors", from);
  const rows: Record<string, string[]> = {};
  let current = "";
  for (const line of doc.slice(from, to).split("\n")) {
    const head = /^\*\*(desert-[a-z]+)\*\*$/.exec(line.trim());
    if (head?.[1]) {
      current = head[1];
      rows[current] = [];
    } else if (
      current &&
      line.startsWith("| ") &&
      !line.startsWith("| Build") &&
      !line.startsWith("| ---")
    )
      rows[current]?.push(line.trim());
  }

  it("the spec holds 3 tables of 17 builds", () => {
    expect(Object.keys(rows)).toEqual(["desert-sprint", "desert-ridge", "desert-canyon"]);
    for (const list of Object.values(rows)) expect(list).toHaveLength(17);
  });

  /** One row in the format of table.mjs, from a solo run with the probe (phase splits, first plan). */
  function printedRow(e: RaceEntry, course: Course): string {
    const G = buildCourseGeometry(QUIET, course);
    const split = [-1, -1];
    let planLevel = 0;
    let planStart = 0;
    const log = simulateRaceProbed(QUIET, [e], course, "sanity", (t, A) => {
      const S = A.state;
      const prev = S.prevPos[0] ?? 0;
      const pos = S.pos[0] ?? 0;
      const disp = S.disp[0] ?? 0;
      for (const [k, x] of [G.startEnd, G.finalStart].entries())
        if (split[k] === -1 && pos >= x)
          split[k] = t * 1000 + Math.floor(((x - prev) * 1000) / disp);
      if (planLevel === 0 && (S.planCount[0] ?? 0) === 1 && planStart === 0) {
        planLevel = S.planLevel[0] ?? 0;
        planStart = S.planStartPos[0] ?? 0;
      }
    });
    const r = log.results[0];
    const d = log.derived[0];
    const plan = (log.events ?? []).find((x) => x.kind === "sprintPlan");
    if (!r || !d || plan?.kind !== "sprintPlan" || r.finishMilli === null)
      throw new Error("no run");
    const fin = r.finishMilli;
    const [s1 = 0, s2 = 0] = split;
    const label =
      e.frameId === "fixture-neutral"
        ? `neutral ${e.style}`
        : `${e.frameId} (${e.style}, ${e.rule}, PW ${(e.powerToWeight / 1000).toFixed(2)})`;
    const level = Math.floor(planLevel / 15);
    const planText =
      level > 0
        ? `${(level / 1000).toFixed(2)} m/s from ${Number((planStart / 225_000).toFixed(1)).toFixed(0)} m${plan.reason === "hp-limited" ? " (hp-limited)" : ""}`
        : plan.reason;
    const hp =
      r.ledger.hpEmptyMm !== null
        ? `empty at ${(r.ledger.hpEmptyMm / 1000).toFixed(0)} m`
        : `${Math.floor(r.hpEnd / 1000)} / ${d.hpMax / 1000} hp`;
    const splits = [s1, s2 - s1, fin - s2].map((x) => (x / 15_000).toFixed(2)).join("/");
    return `| ${label} | ${(fin / 15_000).toFixed(2)} s | ${splits} | ${r.ledger.boostTicks.join("/")} | ${r.ledger.pulses || "-"} | ${planText} | ${(r.energyEnd / 1000).toFixed(1)} | ${hp} | ${r.ledger.overheatTicks} / ${r.durabilityEnd / 1000} |`;
  }

  for (const courseId of ["desert-sprint", "desert-ridge", "desert-canyon"])
    it(`${courseId}: the engine prints the spec's rows`, () => {
      const course = content.getCourse(courseId);
      const printed = (rows[courseId] ?? []).map((line) => {
        const label = line.slice(2, line.indexOf(" |"));
        const name = label.startsWith("neutral ")
          ? label.replace(" ", "-")
          : (label.split(" ")[0] ?? "");
        return printedRow(entryOf(name, course), course);
      });
      expect(printed).toEqual(rows[courseId]);
    });
});
