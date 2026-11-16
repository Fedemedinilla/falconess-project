/**
 * When a story scene shows, and which chat topics are open (owner 2026-11-12). Pure: read from the
 * season state and the goals' results, plus what this browser has already seen.
 */
import type { ChatTopic, SeasonState, StoryScene, StoryTrigger } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { browserStore, type KeyValueStore, readKey, writeKey } from "../game/storage";
import { goalStatuses } from "../screens/model/goals";

/** Whether a trigger holds for the season now. */
export function triggerHolds(ctx: SimContext, state: SeasonState, t: StoryTrigger): boolean {
  switch (t.kind) {
    case "start":
      return state.turn <= 1 && state.status === "active";
    case "turn":
      // after that week's decision (owner 2026-11-13), not when the week starts
      return state.turn > t.turn && state.status === "active";
    case "goal-before": {
      const g = goalStatuses(ctx, state)[t.goal];
      return (
        state.status === "active" &&
        g !== undefined &&
        g.result === undefined &&
        state.turn === g.goal.turn
      );
    }
    case "goal-after": {
      const g = goalStatuses(ctx, state)[t.goal];
      if (!g?.result || g.met !== true) return false;
      if (t.result === "win") return g.result.place === 1;
      return t.result === "placed" ? g.result.place !== 1 : true;
    }
    case "end":
      return state.status === "ended" && state.endReason === t.result;
  }
}

/**
 * The first scene of her story due now and not seen in this season yet, in file order: the order
 * the game shipped, pinned (F13) until 5.2. The game asks `dueScenes` (flow/scenes.ts), whose
 * legacy policy gives this order.
 */
export function dueScene(
  scenes: readonly StoryScene[],
  ctx: SimContext,
  state: SeasonState,
  seen: ReadonlySet<string>,
): StoryScene | undefined {
  return scenes.find(
    (s) =>
      s.falconess === state.falconessId && !seen.has(s.id) && triggerHolds(ctx, state, s.trigger),
  );
}

/** Her chat topics open this week, in order. */
export function openTopics(topics: readonly ChatTopic[], state: SeasonState): ChatTopic[] {
  return topics.filter((t) => t.falconess === state.falconessId && state.turn >= t.fromTurn);
}

// --- what this browser has seen ------------------------------------------------------------------

/**
 * The scenes shown, per season (by its seed) and ever. Not the controller's read step
 * (`game/storage`'s `SEEN_KEY`): two different things (critic (c)6).
 */
export const STORY_KEY = "falconess.juego.historia";
/** The chat topics read. */
export const CHAT_KEY = "falconess.juego.chat";

type Seen = {
  readonly runs: Readonly<Record<string, readonly string[]>>;
  readonly ever: readonly string[];
};

/**
 * What this browser has seen of the stories: framework-free and subscribable, like the
 * controller. Every mark that changes something is stored (without storage it lasts the visit)
 * and told to every subscriber, so a screen that shows it re-renders (`useStory`).
 */
export type StoryStore = {
  /** The scenes already shown in this season (by its seed). */
  readonly seenInRun: (seed: string) => ReadonlySet<string>;
  /** Every scene this browser has shown, in any season: «Historia» lists them. */
  readonly seenEver: () => ReadonlySet<string>;
  /** Mark a scene shown (watched or skipped) in this season. */
  readonly markSeen: (seed: string, sceneId: string) => void;
  /** The chat topics this browser has read. */
  readonly readTopics: () => ReadonlySet<string>;
  readonly markRead: (topicId: string) => void;
  /** Calls `listener` after every mark that changed something; returns the unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Changes with every such mark: the snapshot a subscriber compares. Until then every reading
   * keeps its identity.
   */
  readonly version: () => number;
};

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v): v is string => typeof v === "string")
    ? value
    : undefined;
}

function parse(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The stored scenes, or nothing seen when the value is missing or not of this shape. */
function decodeSeen(raw: string | undefined): Seen {
  const v = parse(raw);
  if (typeof v !== "object" || v === null || !("runs" in v) || !("ever" in v))
    return { runs: {}, ever: [] };
  const ever = strings(v.ever);
  const runs: Record<string, readonly string[]> = {};
  if (typeof v.runs === "object" && v.runs !== null)
    for (const [seed, ids] of Object.entries(v.runs)) {
      const list = strings(ids);
      if (list) runs[seed] = list;
    }
  return { runs, ever: ever ?? [] };
}

/** The store over a key-value storage that may be missing or throw (every access is guarded). */
export function createStoryStore(kv: KeyValueStore | undefined): StoryStore {
  let seen: Seen | undefined;
  let read: ReadonlySet<string> | undefined;
  let ever: ReadonlySet<string> | undefined;
  const runs = new Map<string, ReadonlySet<string>>();
  let version = 0;
  const listeners = new Set<() => void>();
  const seenData = (): Seen => {
    seen ??= decodeSeen(readKey(kv, STORY_KEY));
    return seen;
  };
  const readTopics = (): ReadonlySet<string> => {
    read ??= new Set(strings(parse(readKey(kv, CHAT_KEY))) ?? []);
    return read;
  };
  const changed = () => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };
  return {
    seenInRun: (seed) => {
      let set = runs.get(seed);
      if (!set) {
        set = new Set(seenData().runs[seed] ?? []);
        runs.set(seed, set);
      }
      return set;
    },
    seenEver: () => {
      ever ??= new Set(seenData().ever);
      return ever;
    },
    markSeen: (seed, sceneId) => {
      const d = seenData();
      const inRun = d.runs[seed] ?? [];
      if (inRun.includes(sceneId) && d.ever.includes(sceneId)) return;
      seen = {
        runs: { ...d.runs, [seed]: inRun.includes(sceneId) ? inRun : [...inRun, sceneId] },
        ever: d.ever.includes(sceneId) ? d.ever : [...d.ever, sceneId],
      };
      ever = undefined;
      runs.delete(seed);
      writeKey(kv, STORY_KEY, JSON.stringify(seen));
      changed();
    },
    readTopics,
    markRead: (topicId) => {
      const r = readTopics();
      if (r.has(topicId)) return;
      read = new Set([...r, topicId]);
      writeKey(kv, CHAT_KEY, JSON.stringify([...read]));
      changed();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}

/** This browser's store: `localStorage` when the page may use it. */
export const storyStore: StoryStore = createStoryStore(browserStore());

/** The lines a digest keeps: evenly spread, at least three, the first and the last. */
export function digestLines<T>(lines: readonly T[]): T[] {
  const n = lines.length;
  const keep = Math.min(n, Math.max(3, Math.ceil(n / 3)));
  if (keep >= n) return [...lines];
  const picks = new Set<number>();
  for (let k = 0; k < keep; k++) picks.add(Math.round((k * (n - 1)) / (keep - 1)));
  return lines.filter((_, i) => picks.has(i));
}
