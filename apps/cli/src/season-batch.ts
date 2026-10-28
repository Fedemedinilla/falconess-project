/**
 * `pnpm sim:season-batch -- --runs 500 [--falconess peregrina] [--hangar a,b,c,d]`
 * Plays N seasons per Falconess with the reference policy and reports what docs/race-engine.md
 * 21.1 asks of D12: the completion rate, the grade distribution and the share graded B or better
 * (the gate: ≥ 60 % per Falconess), the mean `seasonScore` split into stat total, skills and race
 * bonuses, the mean final stats and the goal pass-rate table (per goal: the share of the seasons
 * that reached the race and passed it, flagged under 80 % as a diagnostic, plus the share of all
 * seasons that reached and that passed it). Seeds `batch-0` … `batch-(N−1)`.
 */
import { loadContent } from "@falconess/content";
import type { Grade, RunInput, SeasonGoal } from "@falconess/schema";
import {
  advanceSeason,
  RULESET_V1,
  type SimContext,
  STAT_ORDER,
  seasonScore,
  startSeason,
  statTotal,
} from "@falconess/sim";
import { argString, parseArgs } from "./args.js";
import { goalFlagged } from "./goal-rate.js";
import { lowestStatPolicy, REFERENCE_HANGAR } from "./policy.js";

export const GRADE_ORDER: readonly Grade[] = ["SS", "S", "A", "B", "C", "D", "E", "F", "G"];
const B_OR_BETTER: ReadonlySet<Grade> = new Set(["SS", "S", "A", "B"]);

export type GoalRow = {
  goal: SeasonGoal;
  /** Seasons that ran this goal race. */
  reached: number;
  /** Seasons that placed ≤ minPlace in it. */
  passed: number;
};

export type SeasonBatchSummary = {
  falconessId: string;
  runs: number;
  completed: number;
  totalTurns: number;
  races: number;
  wins: number;
  grades: Partial<Record<Grade, number>>;
  statSums: Record<string, number>;
  score: { stats: number; skills: number; races: number };
  goals: GoalRow[];
  failTurns: Record<number, number>;
};

/** Plays `runs` reference seasons of one Falconess (seeds `batch-<i>`). */
export function runSeasonBatch(
  ctx: SimContext,
  falconessId: string,
  runs: number,
  hangar: readonly string[] = REFERENCE_HANGAR,
): SeasonBatchSummary {
  const goals = ctx.content.getFalconess(falconessId).seasonGoals;
  const out: SeasonBatchSummary = {
    falconessId,
    runs,
    completed: 0,
    totalTurns: 0,
    races: 0,
    wins: 0,
    grades: {},
    statSums: Object.fromEntries(STAT_ORDER.map((k) => [k, 0])),
    score: { stats: 0, skills: 0, races: 0 },
    goals: goals.map((goal) => ({ goal, reached: 0, passed: 0 })),
    failTurns: {},
  };
  for (let i = 0; i < runs; i++) {
    const start: RunInput = { kind: "start", falconessId, hangar: [...hangar], parents: [] };
    let s = startSeason(ctx, `batch-${i}`, start);
    while (s.status === "active") s = advanceSeason(ctx, s, lowestStatPolicy(ctx, s));
    const grade = s.grade ?? "G";
    out.grades[grade] = (out.grades[grade] ?? 0) + 1;
    for (const k of STAT_ORDER) out.statSums[k] = (out.statSums[k] ?? 0) + s.stats[k];
    const stats = statTotal(s.stats);
    const skills = s.learnedSkills.length * ctx.ruleset.season.scorePerSkill;
    out.score.stats += stats;
    out.score.skills += skills;
    out.score.races += seasonScore(ctx, s) - stats - skills;
    if (s.endReason === "completed") out.completed++;
    else out.failTurns[s.turn] = (out.failTurns[s.turn] ?? 0) + 1;
    out.totalTurns += s.turn;
    out.races += s.raceResults.length;
    out.wins += s.raceResults.filter((r) => r.place === 1).length;
    for (const row of out.goals) {
      const r = s.raceResults.find((x) => x.turn === row.goal.turn);
      if (!r) continue;
      row.reached++;
      if (r.place <= row.goal.minPlace) row.passed++;
    }
  }
  return out;
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(0)}%`;
const mean = (n: number, d: number) => Math.round(n / Math.max(1, d));

/** The text report of one Falconess, one string per line. */
export function renderSeasonBatch(m: SeasonBatchSummary): string[] {
  const bOrBetter = GRADE_ORDER.filter((g) => B_OR_BETTER.has(g)).reduce(
    (n, g) => n + (m.grades[g] ?? 0),
    0,
  );
  const lines = [
    "",
    `${m.falconessId}  runs ${m.runs}  completed ${pct(m.completed, m.runs)}  avg turns ${(m.totalTurns / Math.max(1, m.runs)).toFixed(1)}  win rate ${pct(m.wins, m.races)}`,
    `  grades: ${GRADE_ORDER.map((g) => `${g} ${pct(m.grades[g] ?? 0, m.runs)}`).join("  ")}  (≥ B ${pct(bOrBetter, m.runs)}; D12 gate 60%)`,
    `  mean seasonScore ${mean(m.score.stats + m.score.skills + m.score.races, m.runs)} = stats ${mean(m.score.stats, m.runs)} + skills ${mean(m.score.skills, m.runs)} + races ${mean(m.score.races, m.runs)}`,
    `  mean final stats: ${STAT_ORDER.map((k) => `${k} ${mean(m.statSums[k] ?? 0, m.runs)}`).join("  ")}`,
    "  goals (passed and reached: share of all seasons; passed/reached: of the seasons that ran the race, flagged under 80%):",
  ];
  for (const { goal, reached, passed } of m.goals) {
    const flag = goalFlagged(passed, reached) ? "  < 80%" : "";
    const rate = reached > 0 ? pct(passed, reached) : "—";
    lines.push(
      `    T${goal.turn} ${goal.courseId} ≤ ${goal.minPlace}: passed ${pct(passed, m.runs)}  reached ${pct(reached, m.runs)}  passed/reached ${rate}${flag}`,
    );
  }
  const fails = Object.entries(m.failTurns).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (fails.length)
    lines.push(`  goal failures by turn: ${fails.map(([t, n]) => `T${t}:${n}`).join("  ")}`);
  return lines;
}

const isMain =
  process.argv[1]?.endsWith("season-batch.ts") || process.argv[1]?.endsWith("season-batch.js");
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
  const runs = Number.parseInt(argString(args, "runs", "500"), 10);
  const who = argString(args, "falconess", "all");
  const hangar = argString(args, "hangar", REFERENCE_HANGAR.join(",")).split(",");
  const ids = who === "all" ? [...ctx.content.falconess.keys()] : [who];
  for (const falconessId of ids)
    console.log(renderSeasonBatch(runSeasonBatch(ctx, falconessId, runs, hangar)).join("\n"));
}
