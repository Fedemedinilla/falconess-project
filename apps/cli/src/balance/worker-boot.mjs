// Entry of every balance:barandas worker thread: tsx's hooks do not reach worker threads, so each
// worker registers tsx itself before loading the TypeScript (as sim:batch's worker-boot.mjs).
import { register } from "tsx/esm/api";

register();
await import("./worker.ts");
