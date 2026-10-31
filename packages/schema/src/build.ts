import { z } from "zod";
import { FalconessStats, RulesetVersion, Slug, StyleAptitudes } from "./core.js";
import { RunInput } from "./season.js";

/** The only object that travels between players (BRIEF §10). Exportable from the MVP; signed later. */
export const Build = z.strictObject({
  rulesetVersion: RulesetVersion,
  falconessId: Slug,
  finalStats: FalconessStats,
  styleAptitude: StyleAptitudes,
  frameId: Slug,
  parts: z.array(Slug).max(4),
  quirks: z.array(Slug).max(2),
  skills: z.array(Slug),
  seed: z.string().min(1),
  inputs: z.array(RunInput),
  hash: z.string().min(1),
  signature: z.string().optional(),
});
export type Build = z.infer<typeof Build>;
