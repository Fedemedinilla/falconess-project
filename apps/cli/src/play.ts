/**
 * `pnpm play -- --seed 42 --falconess peregrina [--hangar a,b,c,d]`
 * Interactive text season for PT0. It owns no game state: every choice becomes a RunInput and the
 * state comes back from advanceSeason. On exit it prints seed + inputs so the run can be replayed.
 */

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState, WorkshopOp } from "@falconess/schema";
import {
  advanceSeason,
  blackBoxFor,
  RULESET_V1,
  rerollCost,
  type SimContext,
  startSeason,
  WorkshopError,
} from "@falconess/sim";
import { argString, parseArgs } from "./args.js";
import { goalRaceView } from "./goal-race-view.js";
import {
  finalSummary,
  frameLine,
  headerLine,
  statsLine,
  trainingMenu,
  turnSummary,
} from "./render.js";

const args = parseArgs(process.argv.slice(2));
const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const c = ctx.content;
const seed = argString(args, "seed", String(Math.floor(Math.random() * 1_000_000)));
const falconessId = argString(args, "falconess", "peregrina");
const hangar = argString(args, "hangar", "shiden,mule,nimbus,falke").split(",");
const rl = createInterface({ input: stdin, output: stdout });
let closed = false;
rl.on("close", () => {
  if (!closed) {
    closed = true;
    console.log("\n(entrada cerrada)");
    process.exit(0);
  }
});

async function ask(prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

async function workshopMenu(s: SeasonState): Promise<WorkshopOp[] | undefined> {
  const ops: WorkshopOp[] = [];
  console.log(
    "  Taller: e <bastidor> equipar · p <pieza> instalar · r reparar · q <bastidor> re-sortear (" +
      rerollCost(ctx, s as never) +
      " chatarra) · s <habilidad> aprender · fin",
  );
  console.log(`  hangar: ${s.hangar.join(", ")}`);
  console.log(`  piezas: ${[...c.parts.keys()].join(", ")}`);
  console.log(
    `  habilidades (coste): ${[...c.skills.values()]
      .filter(
        (k) => k.kind === "active" && k.uniqueTo === undefined && !s.learnedSkills.includes(k.id),
      )
      .map((k) => `${k.id}(${k.cost})`)
      .join(", ")}`,
  );
  for (;;) {
    const line = await ask("  taller> ");
    const [cmd, arg] = line.split(/\s+/);
    if (cmd === "fin" || cmd === "") return ops.length ? ops : undefined;
    if (cmd === "e" && arg) ops.push({ op: "equip-frame", frameId: arg });
    else if (cmd === "p" && arg) ops.push({ op: "install-part", partId: arg });
    else if (cmd === "r") ops.push({ op: "repair" });
    else if (cmd === "q" && arg) ops.push({ op: "reroll-quirks", frameId: arg });
    else if (cmd === "s" && arg) ops.push({ op: "learn-skill", skillId: arg });
    else console.log("  no entendí");
  }
}

async function chooseInput(s: SeasonState): Promise<RunInput> {
  if (s.pendingEvent) {
    const e = c.getEvent(s.pendingEvent.eventId);
    console.log(`\n  ★ ${c.t(e.textKey)}`);
    e.options.forEach((o, i) => {
      console.log(`    ${i + 1}. ${c.t(o.textKey)}`);
    });
    for (;;) {
      const n = Number.parseInt(await ask("  opción> "), 10);
      if (n >= 1 && n <= e.options.length) return { kind: "event:choose", option: n - 1 };
    }
  }
  console.log(`\n${headerLine(ctx, s)}`);
  console.log(statsLine(s));
  console.log(frameLine(ctx, s));
  if (s.injuryTurns > 0)
    console.log(
      `  (lesionada: ${s.injuryTurns} turno(s) de recuperación; cualquier acción descansa)`,
    );
  if (s.fatigue >= ctx.ruleset.season.forcedRestAt)
    console.log("  (fatiga alta: entrenar se convierte en descanso)");
  for (const line of trainingMenu(ctx, s)) console.log(line);
  console.log("6. Taller   7. Descansar   8. Salida   (x salir)");
  for (;;) {
    const a = await ask("acción> ");
    if (a === "x") throw new Error("quit");
    if (a === "1") return { kind: "train:agility" };
    if (a === "2") return { kind: "train:stamina" };
    if (a === "3") return { kind: "train:technique" };
    if (a === "4") return { kind: "train:risk-flight" };
    if (a === "5") return { kind: "train:simulator" };
    if (a === "7") return { kind: "rest" };
    if (a === "8") return { kind: "outing" };
    if (a === "6") {
      const ops = await workshopMenu(s);
      if (ops) return { kind: "workshop", ops };
    }
  }
}

async function main(): Promise<void> {
  const start: RunInput = { kind: "start", falconessId, hangar, parents: [] };
  let state = startSeason(ctx, seed, start);
  const inputs: RunInput[] = [start];
  console.log(
    `Falconess · temporada en texto · seed ${seed} · ${c.t(c.getFalconess(falconessId).textKey)}`,
  );
  try {
    while (state.status === "active") {
      const input = await chooseInput(state);
      try {
        const next = advanceSeason(ctx, state, input);
        inputs.push(input);
        for (const line of turnSummary(ctx, next, state)) console.log(line);
        if (next.raceResults.length > state.raceResults.length)
          for (const line of goalRaceView(ctx, state, input)) console.log(line);
        state = next;
      } catch (e) {
        if (e instanceof WorkshopError) console.log(`  taller: ${e.message}`);
        else throw e;
      }
    }
    for (const line of finalSummary(ctx, state)) console.log(line);
    console.log(JSON.stringify({ blackBox: blackBoxFor(ctx, state, inputs) }, null, 2));
  } catch (e) {
    if (!(e instanceof Error && e.message === "quit")) throw e;
  } finally {
    console.log(`\nreplay: ${JSON.stringify({ seed, inputs })}`);
    closed = true;
    rl.close();
  }
}

await main();
