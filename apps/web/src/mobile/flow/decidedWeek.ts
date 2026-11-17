/**
 * The decided race week (D5, F1, C5): once a race week's action was previewed it is decided (no
 * way back, owner 2026-11-12), so it is kept in the browser with its stage and its position. A
 * reload plays the same week on, the race mode once it began, and the race «Correr» ran until its
 * result was seen. One record, keyed by the run's fingerprint; a record of any other run is
 * ignored. Framework-free and subscribable like the controller; pure and text-free
 * (flow/imports.test.ts).
 */
import { Position, RunInput } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { z } from "zod";
import type { ActiveRun } from "../../game/controller";
import { type KeyValueStore, readKey, removeKey, writeKey } from "../../game/storage";
import { isRaceWeek } from "../../screens/model/position";
import type { DecidedWeek, WeekRecord } from "./types";
import { isWeekAction, previewResult } from "./week";

export const WEEK_KEY = "falconess.juego.semana";

const Fp = z.string().min(1);
const Turn = z.number().int().min(1);

/** `{ v: 1, ...WeekRecord }`, an unpicked position left out. */
const Stored = z.discriminatedUnion("phase", [
  z.strictObject({
    v: z.literal(1),
    phase: z.literal("planned"),
    fp: Fp,
    turn: Turn,
    position: Position.optional(),
  }),
  z.strictObject({
    v: z.literal(1),
    phase: z.literal("decided"),
    fp: Fp,
    turn: Turn,
    inputs: z.number().int().min(1),
    input: RunInput,
    position: Position.optional(),
    stage: z.enum(["action", "race"]),
  }),
  z.strictObject({ v: z.literal(1), phase: z.literal("raced"), fp: Fp }),
  z.strictObject({ v: z.literal(1), phase: z.literal("raceSeen"), fp: Fp }),
]);

/**
 * The stored record, or undefined when the text is missing, not JSON or not a record: a decided
 * input must be a week's action without a position (the record holds it).
 */
export function decodeWeek(text: string | undefined): WeekRecord | undefined {
  if (text === undefined) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = Stored.safeParse(data);
  if (!parsed.success) return undefined;
  const r = parsed.data;
  switch (r.phase) {
    case "planned":
      return { phase: "planned", fp: r.fp, turn: r.turn, position: r.position };
    case "raced":
    case "raceSeen":
      return { phase: r.phase, fp: r.fp };
    case "decided": {
      const { input } = r;
      if (!isWeekAction(input) || input.position !== undefined) return undefined;
      return {
        phase: "decided",
        fp: r.fp,
        turn: r.turn,
        inputs: r.inputs,
        input,
        position: r.position,
        stage: r.stage,
      };
    }
  }
}

/** One line of JSON, the version first. */
export function encodeWeek(r: WeekRecord): string {
  return JSON.stringify({ v: 1, ...r });
}

/**
 * The record if it belongs to this run (`fp` is its fingerprint): a planned position or a decided
 * week of this race week (same fingerprint and week; a decided one also the same input count, and
 * its preview plays, read from the one preview cache), or the race that led to this run, run or
 * seen.
 */
export function validRecord(
  ctx: SimContext,
  run: ActiveRun,
  fp: string,
  r: WeekRecord | undefined,
): WeekRecord | undefined {
  if (!r || r.fp !== fp) return undefined;
  if (r.phase === "raced" || r.phase === "raceSeen") return r;
  if (r.turn !== run.state.turn || !isRaceWeek(ctx, run.state)) return undefined;
  if (r.phase === "planned") return r;
  if (r.inputs !== run.inputs.length) return undefined;
  return previewResult(ctx, run.state, r.input).ok ? r : undefined;
}

/**
 * The week's record, kept under `WEEK_KEY`: one writer per moment of the week (plan §1.8). A write
 * that changes nothing keeps the snapshot and tells no one; without storage the record lasts the
 * visit. It reads the storage again, as the controller reads the save again at «Continuar»: a tab
 * left on the title continues the week another tab decided, and never drops it as stale.
 */
export class WeekStore {
  readonly #kv: KeyValueStore | undefined;
  readonly #listeners = new Set<() => void>();
  /** What the storage held when the record was last read from it or written to it. */
  #stored: string | undefined;
  #record: WeekRecord | undefined;

  constructor(kv: KeyValueStore | undefined) {
    this.#kv = kv;
    this.#stored = readKey(kv, WEEK_KEY);
    this.#record = decodeWeek(this.#stored);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * The record as the storage holds it now (another tab of the game may have written it since),
   * the same object while the stored text is the same; without storage, the one this tab wrote.
   */
  readonly getSnapshot = (): WeekRecord | undefined => {
    const stored = readKey(this.#kv, WEEK_KEY);
    if (stored !== this.#stored) {
      this.#stored = stored;
      this.#record = decodeWeek(stored);
    }
    return this.#record;
  };

  /** A position picked on the planning card (undefined: her wings'). */
  plan(fp: string, turn: number, position: Position | undefined): void {
    this.#set({ phase: "planned", fp, turn, position });
  }

  /** A race week's action, its preview fine: decided. */
  decide(w: DecidedWeek): void {
    this.#set({ phase: "decided", ...w });
  }

  /** A position picked on the planning card or the decided one, for the same week. */
  setPosition(fp: string, position: Position | undefined): void {
    const r = this.getSnapshot();
    if (r?.fp !== fp || (r.phase !== "planned" && r.phase !== "decided")) return;
    this.#set({ ...r, position });
  }

  /** The race mode began (the emblem, or straight in): a reload skips the action's part. */
  enterRace(fp: string): void {
    const r = this.getSnapshot();
    if (r?.phase !== "decided" || r.fp !== fp || r.stage !== "action") return;
    this.#set({ ...r, stage: "race" });
  }

  /**
   * «Correr» committed the week (`fp`: the run the race led to): a reload plays its race on until
   * its result was seen, the season's last race too.
   */
  markRaced(fp: string): void {
    this.#set({ phase: "raced", fp });
  }

  /** The race's result was seen (`fp`: the run the race led to). */
  markRaceSeen(fp: string): void {
    this.#set({ phase: "raceSeen", fp });
  }

  /** A record of no run in play (the run's view drops it). */
  clear(): void {
    this.#set(undefined);
  }

  #set(next: WeekRecord | undefined): void {
    const now = this.getSnapshot();
    const text = next && encodeWeek(next);
    if (text === (now && encodeWeek(now))) return;
    this.#record = next;
    if (text === undefined) removeKey(this.#kv, WEEK_KEY);
    else writeKey(this.#kv, WEEK_KEY, text);
    // what the storage holds now: one that refused the write leaves this tab's record for the visit
    this.#stored = readKey(this.#kv, WEEK_KEY);
    for (const listener of [...this.#listeners]) listener();
  }
}
