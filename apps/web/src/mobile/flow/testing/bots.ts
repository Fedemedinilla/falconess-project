/**
 * Players for the season walks (plan §3.4): a bot acts on the flow's top beat as the screen would
 * let a player act (a timer's end, a tap on the button that is there), plays its week by a policy
 * when the game is idle, and reloads the page at a seeded random beat of every decided race week
 * and of every race it ran. Deterministic: every draw comes from its own seeded generator.
 */
import {
  type BlackBox,
  type Difficulty,
  POSITIONS,
  type Position,
  type SeasonState,
  type TrainingKind,
} from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { vigorOf } from "../../../screens/model/actions";
import { isRaceWeek, type WeekActionInput } from "../../../screens/model/position";
import type { Pace } from "../../pace";
import { isInstant } from "../beats";
import { ACTIVE_POLICY, type FlowPolicy, TARGET_POLICY } from "../policy";
import type { Beat } from "../types";
import { loadSave } from "./game";
import type { Walk } from "./invariants";
import { createWorld, type World } from "./world";

/** A small seeded generator (mulberry32): the same walk every run. */
export function random(seed: string): () => number {
  let h = 1779033703;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a bot wants to do with its week, before the screens it takes to do it. */
export type Intent =
  | { readonly kind: "train"; readonly training: TrainingKind }
  | { readonly kind: "rest" }
  | { readonly kind: "outing" }
  | {
      readonly kind: "workshop";
      readonly tab: "wings" | "skills";
      readonly input: WeekActionInput;
    };

/** A bot's choice of week. `raceWeeks` counts the race weeks it played before this one. */
export type IdlePolicy = (ctx: SimContext, s: SeasonState, raceWeeks: number) => Intent;

const LOWEST: readonly ("agility" | "stamina" | "technique")[] = [
  "agility",
  "stamina",
  "technique",
];
const TRAINING: Readonly<Record<(typeof LOWEST)[number], TrainingKind>> = {
  agility: "train:agility",
  stamina: "train:stamina",
  technique: "train:technique",
};

/** Rests, with an Agility training every third week. */
export const restHeavy: IdlePolicy = (_ctx, s) =>
  s.turn % 3 === 0 ? { kind: "train", training: "train:agility" } : { kind: "rest" };

/** The cheapest active skill she could learn, if any is left (the sim may still refuse it). */
function cheapestSkill(ctx: SimContext, s: SeasonState): string | undefined {
  let best: { id: string; cost: number } | undefined;
  for (const [id, skill] of ctx.content.skills) {
    if (skill.kind !== "active" || s.learnedSkills.includes(id)) continue;
    if (skill.uniqueTo !== undefined && skill.uniqueTo !== s.falconessId) continue;
    if (!best || skill.cost < best.cost) best = { id, cost: skill.cost };
  }
  return best?.id;
}

/**
 * Rests below 45 vigor, else trains the lowest of Agility, Stamina and Technique; every sixth week
 * learns a skill (a rest if the workshop refuses). Race weeks cycle a training, a rest, an outing
 * and a workshop that equips another frame.
 */
export const trainer: IdlePolicy = (ctx, s, raceWeeks) => {
  let low: (typeof LOWEST)[number] = "agility";
  for (const stat of LOWEST) if (s.stats[stat] < s.stats[low]) low = stat;
  const train: Intent = { kind: "train", training: TRAINING[low] };
  if (isRaceWeek(ctx, s)) {
    const frame = s.hangar.find((f) => f !== s.equippedFrame);
    switch (raceWeeks % 4) {
      case 0:
        return train;
      case 1:
        return { kind: "rest" };
      case 2:
        return { kind: "outing" };
      default:
        return frame
          ? {
              kind: "workshop",
              tab: "wings",
              input: { kind: "workshop", ops: [{ op: "equip-frame", frameId: frame }] },
            }
          : { kind: "rest" };
    }
  }
  if (s.turn % 6 === 0) {
    const skill = cheapestSkill(ctx, s);
    if (skill)
      return {
        kind: "workshop",
        tab: "skills",
        input: { kind: "workshop", ops: [{ op: "learn-skill", skillId: skill }] },
      };
  }
  return vigorOf(ctx, s) < 45 ? { kind: "rest" } : train;
};

export type BotOptions = {
  readonly policy: IdlePolicy;
  /** Seeds the bot's draws. */
  readonly seed: string;
};

/** Moves before a season counts as a dead end (I13). */
export const MAX_MOVES = 600;

/** How a walk ended. */
export type WalkEnd = {
  readonly moves: number;
  /** The season's end shown, idle. */
  readonly ended: boolean;
  /** The move nothing changed, if one did not (a dead end). */
  readonly stuck: string | undefined;
};

const keyOf = (b: Beat): string => (b.kind === "emblem" && b.covered ? `${b.key}#covered` : b.key);

/**
 * Play the season in play to its end, reloading the page once at a random beat of each decided
 * week and of each race it ran. Returns how many moves it took and whether a move changed nothing
 * (a dead end: no flow may leave the player without a way on).
 */
export function playSeason(w: World, o: BotOptions): WalkEnd {
  const rnd = random(o.seed);
  /** The beat a reload waits for, and the weeks and races that already reloaded once. */
  let target: string | undefined;
  const reloaded = new Set<string>();
  const intents = new Map<string, Intent>();
  const refused = new Set<string>();
  const planned = new Set<string>();
  const watchedTurns = new Set<number>();
  const watchedAgain = new Set<string>();
  let raceWeeks = 0;
  let skipNext = false;
  let rewatched = false;

  /** A reload at one of these beats, drawn now (a decided week's, or the race's up to its effects). */
  const aim = (scope: string, beats: readonly Beat[]): void => {
    if (reloaded.has(scope)) return;
    const keys = beats.flatMap((b) =>
      b.kind === "emblem" && !b.covered ? [b.key, `${b.key}#covered`] : [b.key],
    );
    target = keys[Math.floor(rnd() * keys.length)];
    reloaded.add(scope);
  };

  for (let moves = 0; moves < MAX_MOVES; moves++) {
    w.move();
    const { flow, facts, ui } = w.now();
    const state = facts.run.run.state;
    const top = flow.top;
    const before = w.signature();
    let label = top.kind;

    if (target !== undefined && keyOf(top) === target) {
      target = undefined;
      w.reload();
      continue;
    }
    if (ui.notice) {
      w.dismiss();
      continue;
    }
    if (flow.layer?.kind === "scene" && flow.layer.replay) {
      w.cmd.sceneDone(flow.layer.key, rnd() < 0.5);
    } else if (
      (top.kind === "race-result" || top.kind === "idle") &&
      ui.nav.at === "watch" &&
      flow.screen.kind === "race" &&
      flow.screen.watch
    ) {
      // a watch: «Saltar» or the natural end, then «Continuar» (or once «Ver otra vez» again)
      const play = flow.screen.play;
      label = "idle";
      const again = `${ui.nav.from}:${ui.nav.turn}`;
      if (flow.screen.stage === "result" && !watchedAgain.has(again) && rnd() < 0.5) {
        watchedAgain.add(again);
        w.cmd.raceAgain();
      } else if (flow.screen.stage === "result") w.cmd.raceContinue();
      else if (flow.screen.stage === "finish") w.cmd.raceNext(play);
      else {
        skipNext = !skipNext;
        if (skipNext) w.cmd.raceSkip(play);
        else w.cmd.raceNext(play);
      }
    } else if (isInstant(top)) {
      w.cmd.resolve(top);
    } else {
      switch (top.kind) {
        case "train-result":
        case "fx":
        case "inspiration":
          w.cmd.complete(top.key);
          break;
        case "race-result":
          if (!watchedTurns.has(top.turn) && rnd() < 0.3) {
            watchedTurns.add(top.turn);
            w.cmd.raceAgain();
          } else if (rnd() < 0.5) w.cmd.raceContinue();
          else w.cmd.complete(top.key);
          break;
        case "finish":
          if (rnd() < 0.25) w.cmd.raceSkip(top.key);
          else w.cmd.raceNext(top.key);
          break;
        case "replay":
          skipNext = !skipNext;
          if (skipNext) w.cmd.raceSkip(top.key);
          else w.cmd.raceNext(top.key);
          break;
        case "scene":
          w.cmd.sceneDone(top.key, rnd() < 0.5);
          break;
        case "emblem":
          if (!top.covered) w.cmd.covered(top.key);
          else w.cmd.complete(top.key);
          break;
        case "position":
          // the decided card has no way back: «Volver» is not there, and a back to the menu is ignored
          w.probe("back on the decided card", (c) => c.open("menu"));
          if (rnd() < 0.3) {
            const p: Position | undefined =
              rnd() < 0.2 ? undefined : POSITIONS[Math.floor(rnd() * POSITIONS.length)];
            w.cmd.position(p);
            if (w.signature().some((v, i) => v !== before[i])) break;
          }
          w.cmd.run();
          if (w.now().flow.top.kind !== "position") {
            const fp = w.now().facts.run.fp;
            const race = w.beats();
            const end = race.findIndex((b) => b.key === `${fp}/fx` || b.key === `${fp}/ack`);
            aim(`race:${fp}`, end < 0 ? race : race.slice(0, end + 1));
          }
          break;
        case "event":
          w.answer(0);
          break;
        case "idle": {
          if (state.status === "ended") {
            const race = state.raceResults.at(Math.floor(rnd() * state.raceResults.length));
            if (!rewatched && race && rnd() < 0.5) {
              rewatched = true;
              w.cmd.rewatch(race.turn);
              break;
            }
            return { moves, ended: flow.screen.kind === "end", stuck: undefined };
          }
          const fp = facts.run.fp;
          const ctx = w.ctx();
          const race = isRaceWeek(ctx, state);
          // a seen scene again, now and then («Historia»)
          const seen = [...facts.seenInRun];
          if (flow.canReplay && seen.length > 0 && rnd() < 0.03) {
            const id = seen[Math.floor(rnd() * seen.length)];
            const scene = facts.scenes.find((sc) => sc.id === id);
            if (scene) {
              w.cmd.watchScene(scene);
              break;
            }
          }
          if (ui.nav.at === "plan") {
            if (rnd() < 0.6) {
              const p = POSITIONS[Math.floor(rnd() * POSITIONS.length)];
              const was = w.signature();
              w.cmd.position(p);
              if (w.signature().some((v, i) => v !== was[i])) break;
            }
            w.cmd.open("menu"); // «Listo»
            break;
          }
          if (race && !planned.has(fp)) {
            planned.add(fp);
            if (rnd() < 0.3) {
              w.cmd.open("plan");
              break;
            }
          }
          let intent = intents.get(fp);
          if (!intent) {
            intent = refused.has(fp) ? { kind: "rest" } : o.policy(ctx, state, raceWeeks);
            intents.set(fp, intent);
          }
          const decided = w.trace.length;
          if (!playIntent(w, intent)) break;
          const acted = w.trace.slice(decided).some((e) => e.type === "act" || e.type === "decide");
          if (acted) {
            if (race) {
              raceWeeks += 1;
              aim(`week:${fp}`, w.beats());
            }
          } else if (w.ui().notice) {
            // refused (the workshop, a preview): rest instead
            refused.add(fp);
            intents.set(fp, { kind: "rest" });
          }
          break;
        }
      }
    }
    if (!w.signature().some((v, i) => v !== before[i]))
      return { moves, ended: false, stuck: `${label} ${top.key}: nothing changed` };
  }
  return { moves: MAX_MOVES, ended: false, stuck: `no end within ${MAX_MOVES} moves` };
}

/**
 * One screen's step towards the intent: open its screen, pick its card, act. True when the step
 * was the act itself (`choose`).
 */
function playIntent(w: World, intent: Intent): boolean {
  const nav = w.ui().nav;
  switch (intent.kind) {
    case "train":
      if (nav.at !== "train") w.cmd.open("train");
      else if (nav.selected !== intent.training) w.cmd.selectTraining(intent.training);
      else {
        w.cmd.choose({ kind: intent.training });
        return true;
      }
      return false;
    case "workshop":
      if (nav.at !== "workshop") w.cmd.open(intent.tab === "skills" ? "skills" : "workshop");
      else if (nav.tab !== intent.tab) w.cmd.workshopTab(intent.tab);
      else {
        w.cmd.choose(intent.input);
        return true;
      }
      return false;
    case "rest":
    case "outing":
      if (nav.at !== "menu") w.cmd.open("menu");
      else {
        w.cmd.choose({ kind: intent.kind });
        return true;
      }
      return false;
  }
}

/** A walk: one world, a bot, and the seasons it plays there one after the other. */
export type WalkSpec = {
  readonly name: string;
  readonly policy: FlowPolicy;
  readonly falconessId: string;
  /** Each a season, played in the same browser (a later one passes the scenes an earlier one saw). */
  readonly seeds: readonly string[];
  readonly bot: "restHeavy" | "trainer";
  readonly pace?: Pace;
  readonly reduced?: boolean;
  readonly difficulty?: Difficulty;
  readonly parents?: readonly BlackBox[];
  readonly rulesetVersion?: string;
};

const BOTS: Readonly<Record<WalkSpec["bot"], IdlePolicy>> = { restHeavy, trainer };

/** Play the walk's seasons, each to its end. */
export function runWalk(spec: WalkSpec): Walk {
  const w = createWorld({
    policy: spec.policy,
    ...(spec.pace === undefined ? {} : { pace: spec.pace }),
    ...(spec.reduced === undefined ? {} : { reduced: spec.reduced }),
  });
  const ends = spec.seeds.map((seed) => {
    w.start(spec.falconessId, seed, {
      ...(spec.difficulty === undefined ? {} : { difficulty: spec.difficulty }),
      ...(spec.parents === undefined ? {} : { parents: spec.parents }),
      ...(spec.rulesetVersion === undefined ? {} : { rulesetVersion: spec.rulesetVersion }),
    });
    return playSeason(w, {
      policy: BOTS[spec.bot],
      seed: `${spec.falconessId}/${spec.name}/${seed}`,
    });
  });
  return {
    name: spec.name,
    policy: spec.policy,
    pace: w.pace,
    reduced: w.reduced,
    ctx: w.ctx(),
    trace: w.trace,
    ends,
  };
}

let boxes: readonly BlackBox[] | undefined;

/** Two 3★ boxes of Peregrina's (the `peregrina-w39-insp` save's): parents that inspire her. */
export function parents(): readonly BlackBox[] {
  if (!boxes) {
    const start = loadSave("peregrina-w39-insp").game.getSnapshot().run?.inputs[0];
    if (start?.kind !== "start" || start.parents.length === 0) throw new Error("no parents");
    boxes = start.parents;
  }
  return boxes;
}

/** The walks of one Falconess (plan §3.4's matrix): the core, and the extra ones `FLOW_WALKS=all` adds. */
export function walkMatrix(
  falconessId: string,
  o: { readonly all: boolean; readonly exigente?: boolean },
): WalkSpec[] {
  const seeds = ["walk-3", "walk-4"];
  const core = (policy: FlowPolicy, tag: string): WalkSpec[] => [
    { name: `${tag} trainer`, policy, falconessId, seeds, bot: "trainer", parents: parents() },
    { name: `${tag} restHeavy`, policy, falconessId, seeds, bot: "restHeavy" },
  ];
  const specs = [...core(TARGET_POLICY, "target"), ...core(ACTIVE_POLICY, "active")];
  if (!o.all) return specs;
  const one = (name: string, extra: Partial<WalkSpec>): WalkSpec => ({
    name: `target trainer ${name}`,
    policy: TARGET_POLICY,
    falconessId,
    seeds: ["walk-5"],
    bot: "trainer",
    parents: parents(),
    ...extra,
  });
  for (const pace of ["fast", "direct"] as const)
    for (const reduced of [false, true])
      specs.push(one(`${pace}${reduced ? " reduced" : ""}`, { pace, reduced }));
  specs.push(one("normal reduced", { reduced: true }));
  if (o.exigente) specs.push(one("exigente", { difficulty: "exigente" }));
  return specs;
}
