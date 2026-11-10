/**
 * `pnpm balance:barandas`: the eight balance guardrails B1-B8 of ADR-0010
 * (docs/design/barandas-balance.md) on ruleset v3, measured as `apps/cli/src/balance/barandas.json`
 * says (two seed bases, equal and default fields, levels 300-750, the nine catalogue tracks, 1600
 * races per cell, 1000 seasons per Falconess and base, Wilson 95 %).
 *
 *   pnpm balance:barandas [-- --quick] [--label <name>] [--workers 4] [--bench-runs 5]
 *                         [--skip-b8] [--out out/barandas] [--record-invariance]
 *
 * Prints the B1..B8 table (PASA / FALLA / FRÁGIL / SIN DATOS) and writes
 * `<out>/barandas-<label>.json` and `.md`. Full mode exits 1 if a guardrail fails or could not be
 * measured; FRÁGIL passes. `--quick` (CI) shrinks every sample: B1-B7 are a smoke test of the
 * harness, never a verdict, and it exits 1 only if B8 moves a byte or a guardrail has no data.
 * Job results are cached in `<out>/cache/<engine key>`; the key hashes the sim, schema, rng and
 * content sources, the reference policy and this harness, so a new engine never reads old results.
 * `--record-invariance` rewrites `balance/invariance.json` from this checkout (leader only, with
 * an ADR: it moves the B8 references).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { loadCalendar, loadSeasonContent } from "@falconess/content";
import { argString, parseArgs } from "./args.js";
import { GUARDRAIL_IDS, guardrailVerdict } from "./balance/barandas.js";
import {
  type B8Check,
  type BarandasSpec,
  type BenchRun,
  evaluateGuardrails,
  type Merged,
} from "./balance/evaluate.js";
import { courseLengthM, courseOf } from "./balance/field.js";
import { GATED_GROUPS, invarianceDigests } from "./balance/invariance.js";
import { localInvarianceApi } from "./balance/invariance-api.js";
import type { BalanceJob, JobResult } from "./balance/jobs.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const HERE = fileURLToPath(new URL("./balance/", import.meta.url));
const args = parseArgs(process.argv.slice(2));
const QUICK = args.quick === true;
const SKIP_B8 = args["skip-b8"] === true;
const OUT = join(ROOT, argString(args, "out", "out/barandas"));
const WORKERS = Number(
  argString(args, "workers", String(Math.max(1, Math.min(4, availableParallelism() - 1)))),
);

const SPEC = JSON.parse(readFileSync(join(HERE, "barandas.json"), "utf8")) as BarandasSpec;
const INV_FILE = join(HERE, "invariance.json");
const gate = (id: string) => SPEC.guardrails.find((g) => g.id === id)?.gate ?? {};
const BASES = SPEC.measurement.seedBases;
const LEVELS = SPEC.measurement.levels;
const CAT = SPEC.measurement.tracks;
const N = QUICK ? 60 : SPEC.measurement.minRacesPerCell;
const SEASONS = QUICK ? 20 : SPEC.measurement.minSeasonsPerFalconessPerBase;
const SHARD = QUICK ? 20 : 125;
const BENCH_RUNS = QUICK ? 1 : Number(argString(args, "bench-runs", String(gate("B7").runs ?? 5)));

// ---- engine key: every input of a measurement ----
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir).sort()) {
    if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(ts|json|mjs)$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}
const keyHash = createHash("sha1");
for (const d of [
  "packages/sim/src",
  "packages/schema/src",
  "packages/rng/src",
  "packages/content",
  "apps/cli/src/balance",
])
  for (const f of filesUnder(join(ROOT, d)))
    keyHash.update(relative(ROOT, f)).update(readFileSync(f));
keyHash.update(readFileSync(join(ROOT, "apps/cli/src/policy.ts")));
const ENGINE = keyHash.digest("hex").slice(0, 12);
const git = (...a: string[]) => {
  try {
    return execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const HEAD = git("rev-parse", "--short", "HEAD") || "sin-git";
const DIRTY = git("status", "--porcelain", "--", "packages", "apps/cli") !== "";
const LABEL = argString(args, "label", `${HEAD}${DIRTY ? "-dirty" : ""}`) + (QUICK ? "-quick" : "");
const CACHE = join(OUT, "cache", ENGINE);
mkdirSync(CACHE, { recursive: true });

// ---- record the B8 references (leader only) ----
if (args["record-invariance"] === true) {
  const full = invarianceDigests(localInvarianceApi, [...GATED_GROUPS]);
  const quick = invarianceDigests(localInvarianceApi, [...GATED_GROUPS], true);
  const prev = existsSync(INV_FILE) ? JSON.parse(readFileSync(INV_FILE, "utf8")) : {};
  writeFileSync(INV_FILE, `${JSON.stringify({ ...prev, full, quick }, null, 2)}\n`);
  console.log(`→ ${relative(ROOT, INV_FILE)}`);
  process.exit(0);
}

// ---- jobs ----
const V3 = "v3";
const jobs: BalanceJob[] = [];
for (const base of BASES) {
  for (const track of CAT)
    for (const stat of LEVELS)
      jobs.push({
        kind: "field",
        group: `field/${track}/${stat}/${base}`,
        rs: V3,
        track,
        stat,
        base,
        k0: 0,
        k1: N,
      });
  const b5 = gate("B5");
  for (const track of CAT)
    for (const [k0, k1] of [
      [0, N / 2],
      [N / 2, N],
    ] as const)
      jobs.push({
        kind: "statValue",
        group: `statValue/${track}/${base}`,
        rs: V3,
        track,
        stat: Number(b5.level),
        bump: Number(b5.bumpPts),
        base,
        k0,
        k1,
      });
  for (const rs of ["v3", "v2"])
    for (const track of CAT)
      jobs.push({
        kind: "sigma",
        group: `sigma/${rs}/${track}/${base}`,
        rs,
        track,
        base,
        k0: 0,
        k1: N,
      });
  for (const f of gate("B4").falconess as string[])
    for (let k0 = 0; k0 < SEASONS; k0 += SHARD)
      jobs.push({
        kind: "season",
        group: `m7/${f}/${base}`,
        rs: V3,
        falconess: f,
        base: `m7${base}`,
        k0,
        k1: Math.min(SEASONS, k0 + SHARD),
      });
}
const cacheOf = (j: BalanceJob) =>
  join(CACHE, `${createHash("sha1").update(JSON.stringify(j)).digest("hex")}.json`);

const BOOT = new URL("./balance/worker-boot.mjs", import.meta.url);
function startWorker(): Worker {
  return new Worker(BOOT);
}
function runIn(w: Worker, j: BalanceJob): Promise<JobResult> {
  return new Promise((resolve, reject) => {
    const onMsg = (m: { ok: boolean; result?: JobResult; error?: string }) => {
      w.off("error", onErr);
      if (m.ok && m.result) resolve(m.result);
      else reject(new Error(`job ${j.group}: ${m.error ?? "no result"}`));
    };
    const onErr = (e: Error) => {
      w.off("message", onMsg);
      reject(e);
    };
    w.once("message", onMsg);
    w.once("error", onErr);
    w.postMessage(j);
  });
}

async function pool(list: BalanceJob[], par: number): Promise<void> {
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  const one = async () => {
    const w = startWorker();
    try {
      while (next < list.length) {
        const j = list[next++];
        if (!j) break;
        const r = await runIn(w, j);
        writeFileSync(cacheOf(j), JSON.stringify(r));
        done++;
        if (done % 25 === 0 || done === list.length)
          console.log(
            `  ${done}/${list.length} trabajos, ${((Date.now() - t0) / 1000).toFixed(0)} s`,
          );
      }
    } finally {
      await w.terminate();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, par) }, one));
}

const cost = (j: BalanceJob) => (j.kind === "season" ? 30 : j.kind === "statValue" ? 6 : 4);
const todo = jobs.filter((j) => !existsSync(cacheOf(j))).sort((a, b) => cost(b) - cost(a));
console.log(
  `barandas ${LABEL} (motor ${ENGINE}): ${jobs.length} trabajos, ${todo.length} sin caché${QUICK ? " (rápido: humo, no veredicto)" : ""}`,
);
await pool(todo, WORKERS);

const merged: Merged = {};
for (const j of jobs) {
  const f = cacheOf(j);
  if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, "utf8")) as JobResult;
  const m = merged[j.group] ?? { acc: {} };
  merged[j.group] = m;
  for (const [k, v] of Object.entries(r.acc)) m.acc[k] = k === "L" ? v : (m.acc[k] ?? 0) + v;
  if (r.t) {
    const t = m.t ?? r.t.map(() => []);
    m.t = t;
    r.t.forEach((col, q) => {
      t[q]?.push(...col);
    });
  }
}

// ---- B7: the bench alone, longest track, a fresh worker per run ----
const LONGEST =
  [...CAT].sort((a, b) => courseLengthM(courseOf(b)) - courseLengthM(courseOf(a)))[0] ?? "crossing";
const bench: BenchRun[] = [];
for (let k = 0; k < BENCH_RUNS; k++)
  for (const detail of ["results", "full"] as const) {
    const w = startWorker();
    try {
      const r = await runIn(w, {
        kind: "bench",
        group: "bench",
        rs: V3,
        track: LONGEST,
        detail,
        k1: QUICK ? 100 : 700,
      });
      bench.push({ detail, v3: r.acc.p95v3 ?? Number.NaN, v2: r.acc.p95v2 ?? Number.NaN });
    } finally {
      await w.terminate();
    }
  }

// ---- B8 ----
let b8: B8Check[] | null = null;
if (!SKIP_B8) {
  console.log("  B8: golden, invariancia de v1, registros v1/v2, temporadas v2, interruptores");
  b8 = [];
  const sh = (cmd: string, a: string[]) => {
    try {
      execFileSync(cmd, a, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
      return { ok: true, out: "" };
    } catch (e) {
      const x = e as { stdout?: Buffer; stderr?: Buffer };
      return { ok: false, out: `${x.stdout ?? ""}\n${x.stderr ?? ""}` };
    }
  };
  const tail = (s: string) => s.trim().split("\n").slice(-3).join(" ");
  const golden = sh("pnpm", ["-s", "test:golden"]);
  b8.push({
    id: "golden",
    ok: golden.ok,
    detail: golden.ok ? "pnpm test:golden pasa" : tail(golden.out),
  });
  const inv = sh("pnpm", ["-s", "vitest", "run", "packages/sim/src/season/v1-invariance.test.ts"]);
  b8.push({
    id: "v1-invariance",
    ok: inv.ok,
    detail: inv.ok ? "v1-invariance pasa" : tail(inv.out),
  });
  const refs = JSON.parse(readFileSync(INV_FILE, "utf8")) as Record<string, Record<string, string>>;
  const ref = refs[QUICK ? "quick" : "full"] ?? {};
  const now = invarianceDigests(localInvarianceApi, [...GATED_GROUPS, "v3"], QUICK);
  for (const g of GATED_GROUPS) {
    const ok = ref[g] !== undefined && ref[g] === now[g];
    b8.push({
      id: g,
      ok,
      detail: `${g}: ${ok ? "igual" : `distinto (ref ${ref[g] ?? "—"})`} (${now[g] ?? "—"})`,
    });
  }
  console.log(`  v3 (informe, lo vigilan sus golden): ${now.v3}`);
}

// ---- evaluation ----
const FAL = gate("B4").falconess as string[];
const goalsPerSeason: Record<string, number> = {};
for (const f of FAL)
  for (const g of loadSeasonContent(V3).getFalconess(f).seasonGoals)
    goalsPerSeason[g.courseId] = (goalsPerSeason[g.courseId] ?? 0) + 1 / FAL.length;
const results = evaluateGuardrails({
  spec: SPEC,
  merged,
  bench,
  b8,
  calendar: loadCalendar("v3"),
  goalsPerSeason,
  lengthM: (t) => courseLengthM(courseOf(t)),
  longest: LONGEST,
  quick: QUICK,
});
const verdict = guardrailVerdict(Object.fromEntries(results.map((r) => [r.id, r.status])));
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
const verdictLine = `${verdict.pass ? "PASA" : `FALLA (${verdict.blocking.join(", ")})`}${verdict.fragile.length ? ` · frágiles: ${verdict.fragile.join(", ")}` : ""}`;
const table = [
  `Barandas ADR-0010 · ${LABEL} · motor ${ENGINE} · bases ${BASES.join(", ")}${QUICK ? " · RÁPIDO (humo, no veredicto)" : ""}`,
  ...GUARDRAIL_IDS.map((id) => {
    const r = results.find((x) => x.id === id);
    return `${id}  ${pad(r?.name ?? "", 33)} ${pad(r?.status ?? "SIN DATOS", 9)} ${r?.key ?? ""}`;
  }),
  `Veredicto: ${verdictLine}`,
].join("\n");
const md = [
  `# Barandas de balance · ${LABEL}`,
  "",
  `Commit \`${HEAD}\`${DIRTY ? " (con cambios sin commit)" : ""}, motor \`${ENGINE}\`. Medida según \`apps/cli/src/balance/barandas.json\` (ADR-0010): bases ${BASES.join(" y ")}, campo equal y default, niveles ${LEVELS.join(", ")}, ${CAT.length} pistas, ${N} carreras por celda, ${SEASONS} temporadas por Falconess y base, Wilson 95 %. Frágil = pasa pero el intervalo cruza el umbral (no bloquea).${QUICK ? " **Corrida rápida: humo, no es un veredicto.**" : ""}`,
  "",
  "| # | Baranda | Estado | Número clave |",
  "|---|---|---|---|",
  ...results.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${r.key} |`),
  "",
  `**Veredicto: ${verdictLine}**.`,
  "",
  ...results.flatMap((r) => [
    `## ${r.id} · ${r.name} · ${r.status}`,
    "",
    ...r.notes.map((n) => `- ${n}`),
    "",
  ]),
].join("\n");
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, `barandas-${LABEL}.json`),
  JSON.stringify(
    { label: LABEL, head: HEAD, dirty: DIRTY, engine: ENGINE, quick: QUICK, verdict, results },
    null,
    1,
  ),
);
writeFileSync(join(OUT, `barandas-${LABEL}.md`), md);
console.log(table);
console.log(`→ ${relative(ROOT, join(OUT, `barandas-${LABEL}.md`))}`);
if (QUICK) {
  const b8r = results.find((r) => r.id === "B8");
  const noData = results.filter((r) => r.status === "SIN DATOS" && !(r.id === "B8" && SKIP_B8));
  process.exit(b8r?.status === "FALLA" || noData.length > 0 ? 1 : 0);
}
process.exit(verdict.exitCode);
