/**
 * Job executors for `sim:batch`: in-process (`--workers 1`) or a pool of node:worker_threads.
 * Seeds belong to jobs and results are returned in job order, so the merged results, and hence the
 * report, are identical for any worker count. Each worker owns one engine port, one arena and one
 * geometry cache for its whole life.
 */
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { ContentIndex } from "@falconess/schema";
import type { Ruleset } from "@falconess/sim";
import type { Catalog } from "./catalog.js";
import { createEngineAdapter } from "./engine-adapter.js";
import type { RaceEnginePort } from "./engine-port.js";
import { createExecContext, emptyTiming, type JobResult, runJob, type Timing } from "./execute.js";
import { createFakeEngine, type FakeEngineOptions } from "./fake-engine.js";
import type { Job } from "./plan.js";

export type EngineChoice = { kind: "real" } | { kind: "fake"; options: FakeEngineOptions };

export function createPort(engine: EngineChoice): RaceEnginePort {
  return engine.kind === "fake" ? createFakeEngine(engine.options) : createEngineAdapter();
}

/** Default `--workers`: min(4, cpus − 1), at least 1. */
export function defaultWorkers(): number {
  return Math.max(1, Math.min(4, availableParallelism() - 1));
}

export type Executor = {
  readonly workers: number;
  /** Runs the jobs and returns their results in the order of `jobs`. */
  run(jobs: readonly Job[]): Promise<JobResult[]>;
  /** Stops the workers and returns the engine and season time summed over them. */
  close(): Promise<Timing>;
};

export type ExecutorOptions = {
  workers: number;
  engine: EngineChoice;
  ruleset: Ruleset;
  content: ContentIndex;
  catalog: Catalog;
};

function addTiming(a: Timing, b: Timing): Timing {
  return {
    races: a.races + b.races,
    engineMs: a.engineMs + b.engineMs,
    seasons: a.seasons + b.seasons,
    seasonMs: a.seasonMs + b.seasonMs,
  };
}

export function createInProcessExecutor(opts: ExecutorOptions): Executor {
  const ctx = createExecContext(createPort(opts.engine), opts.ruleset, opts.content, opts.catalog);
  return {
    workers: 1,
    run: async (jobs) => jobs.map((job) => runJob(ctx, job)),
    close: async () => ({ ...ctx.timing }),
  };
}

/** Messages of the worker protocol (`worker.ts`). */
export type ToWorker = { type: "run"; jobs: Job[] } | { type: "close" };
export type FromWorker =
  | { type: "results"; results: JobResult[] }
  | { type: "timing"; timing: Timing }
  | { type: "error"; message: string };

export type WorkerData = { engine: EngineChoice; rulesetVersion: string };

const BOOT = new URL("./worker-boot.mjs", import.meta.url);

function isFromWorker(m: unknown): m is FromWorker {
  return typeof m === "object" && m !== null && "type" in m;
}

export function createWorkerPoolExecutor(opts: ExecutorOptions): Executor {
  const data: WorkerData = { engine: opts.engine, rulesetVersion: opts.ruleset.version };
  const workers = Array.from(
    { length: Math.max(1, opts.workers) },
    () => new Worker(BOOT, { workerData: data }),
  );
  let failure: Error | undefined;
  let onFailure: ((e: Error) => void) | undefined;
  let closing = false;
  const exited = new Set<Worker>();
  const fail = (e: Error) => {
    failure ??= e;
    onFailure?.(e);
  };
  for (const w of workers) {
    w.on("error", (e) => fail(e instanceof Error ? e : new Error(String(e))));
    w.on("message", (m: unknown) => {
      if (isFromWorker(m) && m.type === "error") fail(new Error(`worker: ${m.message}`));
    });
    w.on("exit", (code) => {
      exited.add(w);
      if (!closing) fail(new Error(`sim:batch worker exited early with code ${code}`));
    });
  }

  const run = (jobs: readonly Job[]): Promise<JobResult[]> =>
    new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      const results = new Map<number, JobResult>();
      const chunk = Math.max(1, Math.min(64, Math.ceil(jobs.length / (workers.length * 8))));
      let next = 0;
      let pending = 0;
      const listeners: Array<[Worker, (m: unknown) => void]> = [];
      const finish = (err?: Error) => {
        for (const [w, l] of listeners) w.off("message", l);
        onFailure = undefined;
        if (err) return reject(err);
        const ordered: JobResult[] = [];
        for (const j of jobs) {
          const r = results.get(j.id);
          if (!r) return reject(new Error(`missing result for job ${j.id}`));
          ordered.push(r);
        }
        resolve(ordered);
      };
      onFailure = (e) => finish(e);
      const feed = (w: Worker) => {
        if (next >= jobs.length) return;
        const slice = jobs.slice(next, next + chunk);
        next += slice.length;
        pending++;
        const msg: ToWorker = { type: "run", jobs: slice };
        w.postMessage(msg);
      };
      for (const w of workers) {
        const listener = (m: unknown) => {
          if (!isFromWorker(m) || m.type !== "results") return;
          for (const r of m.results) results.set(r.id, r);
          pending--;
          feed(w);
          if (pending === 0 && next >= jobs.length) finish();
        };
        listeners.push([w, listener]);
        w.on("message", listener);
      }
      for (const w of workers) feed(w);
      if (jobs.length === 0) finish();
    });

  /** Asks every live worker for its timing; a worker that already died contributes nothing. */
  const close = async (): Promise<Timing> => {
    closing = true;
    const timings = await Promise.all(
      workers.map(
        (w) =>
          new Promise<Timing>((resolve) => {
            if (exited.has(w)) return resolve(emptyTiming());
            const listener = (m: unknown) => {
              if (isFromWorker(m) && m.type === "timing") {
                w.off("message", listener);
                resolve(m.timing);
              }
            };
            w.on("message", listener);
            w.once("exit", () => resolve(emptyTiming()));
            const msg: ToWorker = { type: "close" };
            w.postMessage(msg);
          }),
      ),
    );
    await Promise.all(workers.map((w) => w.terminate()));
    return timings.reduce(addTiming, emptyTiming());
  };

  return { workers: workers.length, run, close };
}

/** `--workers 1` runs in process; more spawns a pool. */
export function createExecutor(opts: ExecutorOptions): Executor {
  return opts.workers <= 1 ? createInProcessExecutor(opts) : createWorkerPoolExecutor(opts);
}
