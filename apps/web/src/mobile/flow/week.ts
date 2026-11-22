/**
 * A week's action in the phone's flow (plan §1.5): what a training's result shows, the race
 * week's preview (one simulation per state and input, shared by every reader), the wings' default
 * position. Pure and text-free (flow/imports.test.ts).
 */
import type { Position, RunInput, SeasonState, TrainingKind } from "@falconess/schema";
import { advanceSeason, InvalidInputError, type SimContext, WorkshopError } from "@falconess/sim";
import type { GameErrorKind, Step } from "../../game/controller";
import { raceFrame, type WeekActionInput, wingsPosition } from "../../screens/model/position";
import { type TrainOutcome, trainResultOf } from "./trainResult";
import type { Nav, TrainBeat } from "./types";

/** A week's action: any input but the season's start and an event's answer. */
export function isWeekAction(input: RunInput): input is WeekActionInput {
  return input.kind !== "start" && input.kind !== "event:choose";
}

/** The training a week's input asked for, if it is one. */
function trainingOf(input: RunInput): TrainingKind | undefined {
  switch (input.kind) {
    case "train:agility":
    case "train:stamina":
    case "train:technique":
    case "train:risk-flight":
    case "train:simulator":
      return input.kind;
    default:
      return undefined;
  }
}

/**
 * What a training's result shows: a success (a boost with a crew there), or a fail when it failed
 * or hurt her. A training that rested by rule (an injured week, a v1 forced rest) did not train, so
 * it has no result (F4, O2: the week's effects tell it). Undefined for any other action.
 */
export function trainingOutcome(step: Step): TrainOutcome | undefined {
  const kind = trainingOf(step.input);
  if (!kind) return undefined;
  const entry = step.after.log.find((e) => e.turn === step.before.turn && e.input?.kind === kind);
  if (!entry) return undefined;
  if (entry.notes.includes("log.train.ok"))
    return (step.before.crewPresence[kind] ?? []).length > 0 ? "boost" : "success";
  if (entry.notes.includes("log.train.fail") || entry.notes.includes("log.train.injury"))
    return "fail";
  return undefined;
}

const beats = new WeakMap<Step, Map<string, TrainBeat>>();

/**
 * A training's result as a beat: a committed step (`step`) counts up its own skill points, a race
 * week's preview (`preview`) only the Simulator's (rule 46: the race's are not hers yet). The same
 * object for the same step, key and outcome on every call, so a derive never churns it.
 */
export function trainBeat(
  ctx: SimContext,
  step: Step,
  source: "step" | "preview",
  key: string,
): TrainBeat | undefined {
  const kind = trainingOf(step.input);
  const outcome = trainingOutcome(step);
  if (!kind || !outcome) return undefined;
  const id = `${source}|${key}|${outcome}`;
  let byId = beats.get(step);
  if (!byId) {
    byId = new Map();
    beats.set(step, byId);
  }
  const hit = byId.get(id);
  if (hit) return hit;
  const points =
    source === "step"
      ? Math.max(0, step.after.skillPoints - step.before.skillPoints)
      : kind === "train:simulator" && outcome !== "fail"
        ? ctx.ruleset.season.simulatorSkillPoints
        : 0;
  const beat: TrainBeat = {
    kind: "train-result",
    key,
    result: trainResultOf(ctx, kind, outcome, step, points),
    before: step.before,
    after: step.after,
  };
  byId.set(id, beat);
  return beat;
}

/** Why a preview was refused, named as the controller names a refused act. */
export type PreviewErrorKind = Extract<GameErrorKind, "invalid-input" | "workshop" | "unexpected">;

export type PreviewResult =
  | { readonly ok: true; readonly step: Step }
  | { readonly ok: false; readonly kind: PreviewErrorKind };

const previews = new WeakMap<SeasonState, Map<string, PreviewResult>>();

/** The input without a race position: the action's part does not depend on it (rule 44). */
function bare(input: WeekActionInput): WeekActionInput {
  if (input.position === undefined) return input;
  const { position: _, ...rest } = input;
  return rest;
}

/**
 * A race week's action played on the season's own pure step before it is committed (owner
 * 2026-11-12): what it did shows first, then the race mode. Always without a position (rule 44).
 * One simulation per state and input, refusals included: the confirm tap, the facts and the
 * record's check all read this one cache, and a failing preview never runs again on a render.
 */
export function previewResult(
  ctx: SimContext,
  state: SeasonState,
  input: WeekActionInput,
  advance: typeof advanceSeason = advanceSeason,
): PreviewResult {
  const action = bare(input);
  const key = JSON.stringify(action);
  let byInput = previews.get(state);
  if (!byInput) {
    byInput = new Map();
    previews.set(state, byInput);
  }
  const hit = byInput.get(key);
  if (hit) return hit;
  let result: PreviewResult;
  try {
    result = {
      ok: true,
      step: { before: state, input: action, after: advance(ctx, state, action) },
    };
  } catch (e) {
    const kind =
      e instanceof WorkshopError
        ? "workshop"
        : e instanceof InvalidInputError
          ? "invalid-input"
          : "unexpected";
    result = { ok: false, kind };
  }
  byInput.set(key, result);
  return result;
}

/** The preview a tap asks for: its step, or why it was refused (a notice, F7). */
export function tryPreview(
  ctx: SimContext,
  state: SeasonState,
  input: WeekActionInput,
): PreviewResult {
  return previewResult(ctx, state, input);
}

/** The decided week's preview, if it plays. */
export function previewOf(
  ctx: SimContext,
  state: SeasonState,
  input: WeekActionInput,
): Step | undefined {
  const r = previewResult(ctx, state, input);
  return r.ok ? r.step : undefined;
}

/**
 * The position her wings race in when none is picked: the default of the frame she races with
 * after the week's action (F5): the one its workshop order equips, else the equipped one (an
 * injured week rests, so its order equips nothing). The planning card, before any action, reads
 * the equipped frame's.
 */
export function raceWings(
  ctx: SimContext,
  state: Pick<SeasonState, "equippedFrame" | "injuryTurns" | "fatigue">,
  input?: WeekActionInput,
): Position {
  const ops = input?.kind === "workshop" ? input.ops : [];
  return wingsPosition(ctx.content, raceFrame(ctx.ruleset, state, ops));
}

/** Where a race week's action was decided: the screen the emblem rises over. */
export function screenFrom(nav: Nav): "menu" | "train" | "workshop" {
  return nav.at === "train" || nav.at === "workshop" ? nav.at : "menu";
}
