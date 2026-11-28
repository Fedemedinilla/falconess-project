/**
 * When a story scene shows, and which chat topics are open (owner 2026-11-12). Pure: read from the
 * season state and the goals' results, plus what this browser has already seen.
 */
import type { ChatTopic, SeasonState, StoryTrigger } from "@falconess/schema";
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

/** Her chat topics open this week, in order. */
export function openTopics(topics: readonly ChatTopic[], state: SeasonState): ChatTopic[] {
  return topics.filter((t) => t.falconess === state.falconessId && state.turn >= t.fromTurn);
}

/**
 * Her answer to a topic: the `afterScene` one once its scene has been seen in this season (a
 * skipped scene counts), else the first one. Peregrina drops «usted» for «tú» in chapter 6, and
 * each season the relationship starts over, so `seen` is the season's (`seenInRun`), not ever.
 */
export function replyKeysFor(topic: ChatTopic, seen: ReadonlySet<string>): readonly string[] {
  return topic.afterScene !== undefined && seen.has(topic.afterScene.sceneId)
    ? topic.afterScene.replyKeys
    : topic.replyKeys;
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
   * Changes with every such mark, here or in another tab (the storage is read again at this call):
   * the snapshot a subscriber compares. Until then every reading keeps its identity.
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

/** `theirs`, then what `mine` adds to it, in each one's order. */
function union(theirs: readonly string[], mine: readonly string[]): readonly string[] {
  const extra = mine.filter((id) => !theirs.includes(id));
  return extra.length === 0 ? theirs : [...theirs, ...extra];
}

function sameIds(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  return (a ?? []).length === (b ?? []).length && (a ?? []).every((id, i) => id === b?.[i]);
}

/**
 * What this tab knows merged with what the storage holds now: another tab of the game may have
 * marked scenes since this one read it (each one either tab marked stays marked).
 */
function mergeSeen(stored: Seen, mine: Seen): Seen {
  const runs: Record<string, readonly string[]> = { ...mine.runs };
  for (const [seed, ids] of Object.entries(stored.runs))
    runs[seed] = union(ids, mine.runs[seed] ?? []);
  return { runs, ever: union(stored.ever, mine.ever) };
}

/**
 * The store over a key-value storage that may be missing or throw (every access is guarded). Each
 * reading reads the storage again (another tab of the game may have marked a scene or a topic
 * since: neither shows twice) and keeps what this tab knew (each one either tab marked stays
 * marked: the union); a mark writes that union. A reading with nothing new stored keeps its
 * identity, and only a mark tells the subscribers (a reading's change shows at their next render).
 */
export function createStoryStore(kv: KeyValueStore | undefined): StoryStore {
  let seen: Seen | undefined;
  let read: ReadonlySet<string> | undefined;
  let ever: ReadonlySet<string> | undefined;
  /** What the storage held when each key was last read or written. */
  let storedSeen: string | undefined;
  let storedRead: string | undefined;
  const runs = new Map<string, ReadonlySet<string>>();
  let version = 0;
  const listeners = new Set<() => void>();
  /** The scenes as stored now, merged into what this tab knew when the stored text changed. */
  const seenData = (): Seen => {
    const raw = readKey(kv, STORY_KEY);
    if (seen !== undefined && raw === storedSeen) return seen;
    storedSeen = raw;
    const stored = decodeSeen(raw);
    if (seen === undefined) {
      seen = stored;
      return seen;
    }
    const mine = seen;
    const merged = mergeSeen(stored, mine);
    const differs = (s: string) => !sameIds(merged.runs[s], mine.runs[s]);
    const seeds = new Set([...Object.keys(merged.runs), ...Object.keys(mine.runs)]);
    const moved = [...seeds].filter(differs);
    if (moved.length === 0 && sameIds(merged.ever, mine.ever)) return seen;
    seen = merged;
    for (const s of moved) runs.delete(s);
    if (!sameIds(merged.ever, mine.ever)) ever = undefined;
    version += 1;
    return seen;
  };
  /** The topics as stored now, with the ones this tab read. */
  const readTopics = (): ReadonlySet<string> => {
    const raw = readKey(kv, CHAT_KEY);
    if (read !== undefined && raw === storedRead) return read;
    storedRead = raw;
    const stored = strings(parse(raw)) ?? [];
    if (read === undefined) {
      read = new Set(stored);
      return read;
    }
    const merged = union(stored, [...read]);
    if (sameIds(merged, [...read])) return read;
    read = new Set(merged);
    version += 1;
    return read;
  };
  const changed = () => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };
  return {
    seenInRun: (seed) => {
      const data = seenData();
      let set = runs.get(seed);
      if (!set) {
        set = new Set(data.runs[seed] ?? []);
        runs.set(seed, set);
      }
      return set;
    },
    seenEver: () => {
      const data = seenData();
      ever ??= new Set(data.ever);
      return ever;
    },
    markSeen: (seed, sceneId) => {
      const mine = seenData();
      if (mine.runs[seed]?.includes(sceneId) && mine.ever.includes(sceneId)) return;
      seen = {
        runs: { ...mine.runs, [seed]: union(mine.runs[seed] ?? [], [sceneId]) },
        ever: union(mine.ever, [sceneId]),
      };
      ever = undefined;
      runs.delete(seed);
      writeKey(kv, STORY_KEY, JSON.stringify(seen));
      // what the storage holds now: one that refused the write leaves this tab's marks for the visit
      storedSeen = readKey(kv, STORY_KEY);
      changed();
    },
    readTopics,
    markRead: (topicId) => {
      const r = readTopics();
      if (r.has(topicId)) return;
      read = new Set(union([...r], [topicId]));
      writeKey(kv, CHAT_KEY, JSON.stringify([...read]));
      storedRead = readKey(kv, CHAT_KEY);
      changed();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => {
      seenData();
      readTopics();
      return version;
    },
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
