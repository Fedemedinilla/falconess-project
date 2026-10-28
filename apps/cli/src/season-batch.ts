/**
 * `pnpm sim:season-batch -- --runs 500 [--falconess peregrina] [--hangar a,b,c,d]`
 * Plays N seasons with the reference policy and reports the stat curve and grade distribution.
 * This is the season half of the balance batch (ROADMAP D17), brought forward to calibrate PT0.
 */
import { loadContent } from "@falconess/content";
import type { Grade, RunInput } from "@falconess/schema";
import {
  advanceSeason,
  RULESET_V1,
  type SimContext,
  STAT_ORDER,
  startSeason,
} from "@falconess/sim";
import { argString, parseArgs } from "./args.js";
import { lowestStatPolicy, REFERENCE_HANGAR } from "./policy.js";

const args = parseArgs(process.argv.slice(2));
const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const runs = Number.parseInt(argString(args, "runs", "500"), 10);
const who = argString(args, "falconess", "all");
const hangar = argString(args, "hangar", REFERENCE_HANGAR.join(",")).split(",");
const ids = who === "all" ? [...ctx.content.falconess.keys()] : [who];

for (const falconessId of ids) {
  const grades: Record<string, number> = {};
  const sums = Object.fromEntries(STAT_ORDER.map((k) => [k, 0])) as Record<string, number>;
  let completed = 0;
  let totalTurns = 0;
  let wins = 0;
  let races = 0;
  const failTurns: Record<number, number> = {};
  for (let i = 0; i < runs; i++) {
    const start: RunInput = { kind: "start", falconessId, hangar, parents: [] };
    let s = startSeason(ctx, `batch-${i}`, start);
    while (s.status === "active") s = advanceSeason(ctx, s, lowestStatPolicy(ctx, s));
    grades[s.grade ?? "?"] = (grades[s.grade ?? "?"] ?? 0) + 1;
    for (const k of STAT_ORDER) sums[k] = (sums[k] ?? 0) + s.stats[k];
    if (s.endReason === "completed") completed++;
    else failTurns[s.turn] = (failTurns[s.turn] ?? 0) + 1;
    totalTurns += s.turn;
    races += s.raceResults.length;
    wins += s.raceResults.filter((r) => r.place === 1).length;
  }
  const order: Grade[] = ["SS", "S", "A", "B", "C", "D", "E", "F", "G"];
  console.log(
    `\n${falconessId}  runs ${runs}  completed ${((100 * completed) / runs).toFixed(0)}%  avg turns ${(totalTurns / runs).toFixed(1)}  win rate ${((100 * wins) / Math.max(1, races)).toFixed(0)}%`,
  );
  console.log(
    `  mean final stats: ${STAT_ORDER.map((k) => `${k} ${Math.round((sums[k] ?? 0) / runs)}`).join("  ")}`,
  );
  console.log(
    `  grades: ${order.map((g) => `${g} ${((100 * (grades[g] ?? 0)) / runs).toFixed(0)}%`).join("  ")}`,
  );
  const fails = Object.entries(failTurns).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (fails.length)
    console.log(`  goal failures by turn: ${fails.map(([t, n]) => `T${t}:${n}`).join("  ")}`);
}
