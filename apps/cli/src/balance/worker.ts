/** Worker of `pnpm balance:barandas` (started through `worker-boot.mjs`): one job per message. */
import { parentPort } from "node:worker_threads";
import { type BalanceJob, runBalanceJob } from "./jobs.js";

parentPort?.on("message", (job: BalanceJob) => {
  try {
    parentPort?.postMessage({ ok: true, result: runBalanceJob(job) });
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: e instanceof Error ? e.stack : String(e) });
  }
});
