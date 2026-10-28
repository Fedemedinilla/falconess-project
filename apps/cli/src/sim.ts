/**
 * `pnpm sim -- --seed 42 --falconess peregrina [--hangar shiden,mule,nimbus,falke] [--json]`
 * Plays one season with the reference policy and prints it turn by turn. Deterministic: the same
 * arguments print the same bytes. Used by the determinism test and by PT0 as a baseline.
 */
import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  blackBoxFor,
  RULESET_V1,
  type SimContext,
  startSeason,
} from "@falconess/sim";
import { argString, parseArgs } from "./args.js";
import { lowestStatPolicy } from "./policy.js";
import {
  describeInput,
  finalSummary,
  frameLine,
  headerLine,
  statsLine,
  turnSummary,
} from "./render.js";

export function runSeason(
  ctx: SimContext,
  seed: string,
  start: RunInput & { kind: "start" },
): { lines: string[]; state: SeasonState; inputs: RunInput[] } {
  const lines: string[] = [];
  let state = startSeason(ctx, seed, start);
  const inputs: RunInput[] = [start];
  lines.push(`seed ${seed}  ruleset ${ctx.ruleset.version}`, frameLine(ctx, state), "");
  while (state.status === "active") {
    const input = lowestStatPolicy(ctx, state);
    inputs.push(input);
    const prev = state;
    state = advanceSeason(ctx, state, input);
    if (input.kind !== "event:choose") lines.push(`${headerLine(ctx, prev)}  ${statsLine(prev)}`);
    lines.push(`  ${describeInput(ctx.content, input)}`);
    lines.push(...turnSummary(ctx, state, prev));
    if (state.pendingEvent)
      lines.push(`  ? ${ctx.content.t(ctx.content.getEvent(state.pendingEvent.eventId).textKey)}`);
  }
  lines.push(...finalSummary(ctx, state));
  return { lines, state, inputs };
}

const isMain = process.argv[1]?.endsWith("sim.ts") || process.argv[1]?.endsWith("sim.js");
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
  const seed = argString(args, "seed", "42");
  const falconessId = argString(args, "falconess", "peregrina");
  const hangar = argString(args, "hangar", "shiden,mule,nimbus,falke").split(",");
  const { lines, state, inputs } = runSeason(ctx, seed, {
    kind: "start",
    falconessId,
    hangar,
    parents: [],
  });
  if (args.json) {
    console.log(
      JSON.stringify({ seed, inputs, state, blackBox: blackBoxFor(ctx, state, inputs) }, null, 2),
    );
  } else {
    console.log(lines.join("\n"));
  }
}
