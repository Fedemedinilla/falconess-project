/**
 * Worker of the `sim:batch` pool (started through `worker-boot.mjs`, which registers tsx: the
 * parent's TypeScript loader does not reach worker threads). One engine port, arena and geometry
 * cache per worker; jobs arrive in chunks and their results go back keyed by job id.
 */
import { parentPort, workerData } from "node:worker_threads";
import { loadContent } from "@falconess/content";
import { RULESET_V1 } from "@falconess/sim";
import { buildCatalog } from "./catalog.js";
import { createExecContext, runJob } from "./execute.js";
import type { FakeEngineOptions } from "./fake-engine.js";
import type { EngineChoice, FromWorker, ToWorker } from "./pool.js";
import { createPort } from "./pool.js";

function engineOf(data: unknown): EngineChoice {
  if (typeof data === "object" && data !== null && "engine" in data) {
    const engine: unknown = data.engine;
    if (typeof engine === "object" && engine !== null && "kind" in engine) {
      if (engine.kind === "real") return { kind: "real" };
      if (engine.kind === "fake" && "options" in engine) {
        const o: unknown = engine.options;
        const options: FakeEngineOptions = {};
        if (typeof o === "object" && o !== null) {
          if ("tieGranularityMilli" in o && typeof o.tieGranularityMilli === "number")
            options.tieGranularityMilli = o.tieGranularityMilli;
          if ("paceHalfWidthPm" in o && typeof o.paceHalfWidthPm === "number")
            options.paceHalfWidthPm = o.paceHalfWidthPm;
          if ("costMsPer8Runners" in o && typeof o.costMsPer8Runners === "number")
            options.costMsPer8Runners = o.costMsPer8Runners;
        }
        return { kind: "fake", options };
      }
    }
  }
  throw new Error("sim:batch worker: bad workerData");
}

function isToWorker(m: unknown): m is ToWorker {
  return typeof m === "object" && m !== null && "type" in m;
}

const port = parentPort;
if (!port) throw new Error("sim:batch worker must run in a worker thread");
const send = (m: FromWorker) => port.postMessage(m);

try {
  const content = loadContent();
  const ctx = createExecContext(
    createPort(engineOf(workerData)),
    RULESET_V1,
    content,
    buildCatalog(content),
  );
  port.on("message", (m: unknown) => {
    if (!isToWorker(m)) return;
    if (m.type === "close") {
      send({ type: "timing", timing: { ...ctx.timing } });
      port.close();
      return;
    }
    try {
      send({ type: "results", results: m.jobs.map((job) => runJob(ctx, job)) });
    } catch (e) {
      send({ type: "error", message: e instanceof Error ? (e.stack ?? e.message) : String(e) });
    }
  });
} catch (e) {
  send({ type: "error", message: e instanceof Error ? (e.stack ?? e.message) : String(e) });
}
