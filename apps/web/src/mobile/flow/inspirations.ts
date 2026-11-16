/**
 * The inheritance cards this browser has shown (ADR-0013, F19): a card shows once per key
 * (`${seed}:start`, `${seed}:24`, `${seed}:40`), across reloads and the language's remount.
 * Framework-free and subscribable, like the story store; pure and text-free (flow/imports.test.ts).
 */
import type { ContentIndex, SeasonState } from "@falconess/schema";
import { z } from "zod";
import { GameController, type Step } from "../../game/controller";
import { type KeyValueStore, readKey, writeKey } from "../../game/storage";
import { cardKeys, stepCardKey } from "../inspirationScene";

export const CARDS_KEY = "falconess.juego.herencia";
/** The seasons kept: the ones marked last. */
export const MAX_SEEDS = 20;

/**
 * `{ v: 1, seeds: [[seed, keys], …] }`, the season marked last at the end. A list, not an object
 * keyed by seed: seeds are digits, and an object's integer keys sort by number, not by age.
 */
const Stored = z.strictObject({
  v: z.literal(1),
  seeds: z.array(z.tuple([z.string(), z.array(z.string())])),
});

/** What the controller loaded from the save: the run the one-time migration marks. */
export type LoadedRun = {
  readonly seed: string;
  readonly state: SeasonState;
  readonly step: Step | undefined;
  readonly stepSeen: boolean;
};

/**
 * The run «Continuar» would load from `kv`, with its last step and whether that step was read:
 * replayed by a controller of its own on a read-only view of the storage, so nothing is written
 * (not the save, not the history). What Boot gives the store as `saved`; the store asks only on a
 * load with no key stored.
 */
export function savedRun(
  content: ContentIndex | ((rulesetVersion: string) => ContentIndex),
  kv: KeyValueStore | undefined,
): LoadedRun | undefined {
  if (!kv) return undefined;
  const readOnly: KeyValueStore = {
    getItem: (key) => kv.getItem(key),
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  const game = new GameController(content, readOnly);
  if (!game.continueSaved()) return undefined;
  const { run, lastStep, lastStepSeen } = game.getSnapshot();
  return run && { seed: run.seed, state: run.state, step: lastStep, stepSeen: lastStepSeen };
}

function decode(raw: string): Map<string, readonly string[]> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return new Map();
  }
  const parsed = Stored.safeParse(data);
  return new Map(parsed.success ? parsed.data.seeds : []);
}

/**
 * The cards shown. On the first load with no key stored (an earlier build kept nothing), it marks
 * the saved run's cards that build already showed: the start's (shown at «Empezar») and every
 * week's whose step was read (it showed before its step was read); an unread step's card plays in
 * D2's order. Then the key exists, so no later season is migrated. Every access to the storage is
 * guarded; without it the cards last the visit.
 */
export class InspirationStore {
  readonly #kv: KeyValueStore | undefined;
  readonly #seeds: Map<string, readonly string[]>;
  readonly #sets = new Map<string, ReadonlySet<string>>();
  readonly #listeners = new Set<() => void>();
  #version = 0;

  constructor(kv: KeyValueStore | undefined, saved?: () => LoadedRun | undefined) {
    this.#kv = kv;
    const raw = readKey(kv, CARDS_KEY);
    this.#seeds = raw === undefined ? new Map() : decode(raw);
    if (raw !== undefined) return;
    const run = saved?.();
    if (run) {
      const unread = run.stepSeen ? undefined : stepCardKey(run.seed, run.state, run.step);
      const keys = cardKeys(run.seed, run.state).filter((k) => k !== unread);
      if (keys.length > 0) this.#seeds.set(run.seed, keys);
    }
    this.#write();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Changes with every mark that changed something; until then each reading keeps its identity. */
  readonly version = (): number => this.#version;

  /** The cards shown in a season (by its seed). */
  shown(seed: string): ReadonlySet<string> {
    let set = this.#sets.get(seed);
    if (!set) {
      set = new Set(this.#seeds.get(seed) ?? []);
      this.#sets.set(seed, set);
    }
    return set;
  }

  /** Mark a card shown: its season becomes the newest kept. */
  markShown(seed: string, key: string): void {
    const keys = this.#seeds.get(seed) ?? [];
    if (keys.includes(key)) return;
    this.#seeds.delete(seed);
    this.#seeds.set(seed, [...keys, key]);
    for (const old of [...this.#seeds.keys()].slice(0, Math.max(0, this.#seeds.size - MAX_SEEDS))) {
      this.#seeds.delete(old);
      this.#sets.delete(old);
    }
    this.#sets.delete(seed);
    this.#write();
    this.#version += 1;
    for (const listener of [...this.#listeners]) listener();
  }

  #write(): void {
    writeKey(this.#kv, CARDS_KEY, JSON.stringify({ v: 1, seeds: [...this.#seeds] }));
  }
}
