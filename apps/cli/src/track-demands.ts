/**
 * `pnpm content:track-demands`: what each v3 catalogue track asks for, as letters, written into
 * `packages/content/calendars/v3.json` (`trackDemands`). Measured, never written by hand: the B5
 * probe of `pnpm balance:barandas` (metres +100 of each stat is worth, default field at 450, the
 * same seeds and jobs) and the rival curve at the track's reference week; the mapping lives in
 * `track-demands/derive.ts` and docs/formulas.md «Lo que pide una pista».
 *
 *   pnpm content:track-demands [-- --races 1600] [--bases v3a,v3b] [--workers 4] [--check]
 *
 * By default it measures what B5 measures (1600 races per track in each of the two seed bases)
 * and averages the bases.
 *
 * Deterministic: the same engine, calendar and arguments give the same file. `--check` writes
 * nothing and exits 1 if the calendar's demands differ from the measured ones.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { CONTENT_ROOT, loadCalendar } from "@falconess/content";
import type { StatName, TrackDemand } from "@falconess/schema";
import { getRuleset } from "@falconess/sim";
import { argString, parseArgs } from "./args.js";
import type { BalanceJob, JobResult } from "./balance/jobs.js";
import { deriveTrackDemands, STATS, type StatMetres } from "./track-demands/derive.js";

const args = parseArgs(process.argv.slice(2));
const RACES = Number(argString(args, "races", "1600"));
const BASES = argString(args, "bases", "v3a,v3b").split(",");
const SHARD = 100;
const WORKERS = Number(
  argString(args, "workers", String(Math.max(1, Math.min(4, availableParallelism() - 1)))),
);
const RS = "v3";
const R = getRuleset(RS);
const cal = loadCalendar(RS);

// the B5 probe's job, with its level and bump
const SPEC = JSON.parse(
  readFileSync(new URL("./balance/barandas.json", import.meta.url), "utf8"),
) as { guardrails: { id: string; gate?: Record<string, unknown> }[] };
const b5 = SPEC.guardrails.find((g) => g.id === "B5")?.gate ?? {};
const LEVEL = Number(b5.level);
const BUMP = Number(b5.bumpPts);

const jobs: BalanceJob[] = [];
for (const base of BASES)
  for (const track of cal.catalogue)
    for (let k0 = 0; k0 < RACES; k0 += SHARD)
      jobs.push({
        kind: "statValue",
        group: track,
        rs: RS,
        track,
        stat: LEVEL,
        bump: BUMP,
        base,
        k0,
        k1: Math.min(RACES, k0 + SHARD),
      });

const BOOT = new URL("./balance/worker-boot.mjs", import.meta.url);
const sums = new Map<string, Record<string, number>>();
let next = 0;
let done = 0;
async function one(): Promise<void> {
  const w = new Worker(BOOT);
  try {
    while (next < jobs.length) {
      const j = jobs[next++];
      if (!j) break;
      const r = await new Promise<JobResult>((resolve, reject) => {
        const onErr = (e: Error) => reject(e);
        w.once("message", (m: { ok: boolean; result?: JobResult; error?: string }) => {
          w.off("error", onErr);
          if (m.ok && m.result) resolve(m.result);
          else reject(new Error(m.error ?? "no result"));
        });
        w.once("error", onErr);
        w.postMessage(j);
      });
      const acc = sums.get(j.group) ?? {};
      for (const [k, v] of Object.entries(r.acc)) acc[k] = (acc[k] ?? 0) + v;
      sums.set(j.group, acc);
      done++;
      if (done % 9 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} trabajos`);
    }
  } finally {
    await w.terminate();
  }
}
console.log(
  `track-demands: ${cal.catalogue.length} pistas × ${RACES} carreras (bases ${BASES.join(" + ")}, nivel ${LEVEL}, +${BUMP})`,
);
await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, one));

const STAT_ES: Readonly<Record<StatName, string>> = {
  agility: "Agi",
  stamina: "Res",
  technique: "Téc",
  courage: "Cor",
  intelligence: "Int",
};
const out: Record<string, TrackDemand[]> = {};
for (const track of cal.catalogue) {
  const acc = sums.get(track) ?? {};
  const n = acc.n ?? 0;
  const metres = Object.fromEntries(
    STATS.map((s) => [s, n > 0 ? (acc[`m.${s}`] ?? 0) / n : 0]),
  ) as StatMetres;
  const row = deriveTrackDemands(track, metres, cal, R.field, R.season.turns);
  out[track] = row.demands.map(({ stat, letter }) => ({ stat, letter }));
  console.log(
    `${track.padEnd(10)} T${String(row.week).padStart(2)}  ${STATS.map((s) => `${STAT_ES[s]} ${metres[s].toFixed(1)} m (${row.weights[s].toFixed(2)})`).join(" · ")}`,
  );
  console.log(
    `${"".padEnd(14)} → ${row.demands.map((d) => `${STAT_ES[d.stat]} ${d.letter} (${Math.round(d.level)})`).join(" · ")}`,
  );
}

const file = join(CONTENT_ROOT, "calendars", `${RS}.json`);
const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
if (args.check === true) {
  const same = JSON.stringify(raw.trackDemands ?? null) === JSON.stringify(out);
  console.log(same ? "calendars/v3.json: al día" : "calendars/v3.json: DIFIERE de lo medido");
  process.exit(same ? 0 : 1);
}
writeFileSync(file, `${JSON.stringify({ ...raw, trackDemands: out }, null, 2)}\n`);
console.log(`→ packages/content/calendars/${RS}.json (trackDemands)`);
