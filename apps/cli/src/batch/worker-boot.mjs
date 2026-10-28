// Entry of every sim:batch worker thread. tsx's loader hooks registered by the parent process do
// not reach worker threads, so each worker registers tsx itself before loading the TypeScript.
import { register } from "tsx/esm/api";

register();
await import("./worker.ts");
