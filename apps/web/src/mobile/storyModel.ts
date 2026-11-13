/**
 * When a story scene shows, and which chat topics are open (owner 2026-11-12). Pure: read from the
 * season state and the goals' results, plus what this browser has already seen.
 */
import type { ChatTopic, SeasonState, StoryScene, StoryTrigger } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { goalStatuses } from "../screens/model/season";

/** Whether a trigger holds for the season now. */
export function triggerHolds(ctx: SimContext, state: SeasonState, t: StoryTrigger): boolean {
  switch (t.kind) {
    case "start":
      return state.turn <= 1 && state.status === "active";
    case "turn":
      return state.turn >= t.turn && state.status === "active";
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

/** The first scene of her story due now and not seen in this season yet. */
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

const SEEN_KEY = "falconess.juego.historia";
const READ_KEY = "falconess.juego.chat";

type Seen = { runs: Record<string, string[]>; ever: string[] };

function read<T>(key: string, empty: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : empty;
  } catch {
    return empty;
  }
}
function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // no storage: it lasts this visit
  }
}

let seenCache: Seen | undefined;
let readCache: string[] | undefined;
function seenData(): Seen {
  seenCache ??= read<Seen>(SEEN_KEY, { runs: {}, ever: [] });
  return seenCache;
}

/** The scenes already shown in this season (by its seed). */
export function seenInRun(seed: string): ReadonlySet<string> {
  return new Set(seenData().runs[seed] ?? []);
}

/** Every scene this browser has shown, in any season: «Historia» lists them. */
export function seenEver(): ReadonlySet<string> {
  return new Set(seenData().ever);
}

/** Mark a scene shown (watched or skipped) in this season. */
export function markSeen(seed: string, sceneId: string): void {
  const d = seenData();
  const run = new Set(d.runs[seed] ?? []);
  run.add(sceneId);
  const ever = new Set(d.ever);
  ever.add(sceneId);
  seenCache = { runs: { ...d.runs, [seed]: [...run] }, ever: [...ever] };
  write(SEEN_KEY, seenCache);
}

/** The chat topics this browser has read. */
export function readTopics(): ReadonlySet<string> {
  readCache ??= read<string[]>(READ_KEY, []);
  return new Set(readCache);
}

export function markRead(topicId: string): void {
  const r = new Set(readTopics());
  r.add(topicId);
  readCache = [...r];
  write(READ_KEY, readCache);
}
