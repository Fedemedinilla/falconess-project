import type { RunInput, SeasonState } from "@falconess/schema";
import { type SimContext, seasonGoalsOf, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import type { KeyValueStore } from "../game/storage";
import { CHAT_KEY, createStoryStore, STORY_KEY, triggerHolds } from "./storyModel";

// her season on v3, with the calendar's goals (the Larga is the fifth)
const ctx: SimContext = simContext("v3");
const start: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** Her season over, every goal run, the Larga (her last goal) at `larga`. */
function endedWith(larga: number): SeasonState {
  const s = startSeason(ctx, "story-1", start);
  const goals = seasonGoalsOf(ctx, s);
  const raceResults: SeasonState["raceResults"] = goals.map((g, i) => ({
    courseId: g.courseId,
    turn: g.turn,
    place: i === goals.length - 1 ? larga : 1,
    fieldSize: 8,
    timeTicks: 1000,
    frameId: s.equippedFrame,
    position: "lead",
    engine: "v1",
  }));
  return { ...s, turn: 48, status: "ended", endReason: "completed", raceResults };
}

describe("goal-after triggers (ADR-0014)", () => {
  const larga = { kind: "goal-after", goal: 4 } as const;
  it("«placed» holds when she ran the Larga without winning it, «win» when she won", () => {
    const lost = endedWith(5);
    expect(triggerHolds(ctx, lost, { ...larga, result: "placed" })).toBe(true);
    expect(triggerHolds(ctx, lost, { ...larga, result: "win" })).toBe(false);
    expect(triggerHolds(ctx, lost, { ...larga, result: "pass" })).toBe(true);
    const won = endedWith(1);
    expect(triggerHolds(ctx, won, { ...larga, result: "placed" })).toBe(false);
    expect(triggerHolds(ctx, won, { ...larga, result: "win" })).toBe(true);
  });
});

describe("week triggers (owner 2026-11-13)", () => {
  it("a week's scene holds after that week's decision, not when the week starts", () => {
    const s = startSeason(ctx, "story-1", start);
    const t = { kind: "turn", turn: 16 } as const;
    expect(triggerHolds(ctx, { ...s, turn: 16 }, t)).toBe(false);
    expect(triggerHolds(ctx, { ...s, turn: 17 }, t)).toBe(true);
  });
});

function memoryStore(seed: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const blocked: KeyValueStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("the story store (scenes seen, chat read)", () => {
  it("keeps the browser's two keys, apart from the controller's read step", () => {
    expect(STORY_KEY).toBe("falconess.juego.historia");
    expect(CHAT_KEY).toBe("falconess.juego.chat");
  });

  it("a scene marked seen persists, in its season and ever, and tells every subscriber", () => {
    const kv = memoryStore();
    const story = createStoryStore(kv);
    let calls = 0;
    const stop = story.subscribe(() => {
      calls += 1;
    });
    const v0 = story.version();
    story.markSeen("s1", "peregrina-prologue");
    expect(calls).toBe(1);
    expect(story.version()).not.toBe(v0);
    expect([...story.seenInRun("s1")]).toEqual(["peregrina-prologue"]);
    expect([...story.seenInRun("s2")]).toEqual([]);
    expect([...story.seenEver()]).toEqual(["peregrina-prologue"]);
    expect(JSON.parse(kv.data.get(STORY_KEY) ?? "null")).toEqual({
      runs: { s1: ["peregrina-prologue"] },
      ever: ["peregrina-prologue"],
    });
    // a reload reads it back
    const again = createStoryStore(kv);
    expect(again.seenInRun("s1").has("peregrina-prologue")).toBe(true);
    expect(again.seenEver().has("peregrina-prologue")).toBe(true);
    // a mark that changes nothing tells no one; after the unsubscribe, nothing is told
    story.markSeen("s1", "peregrina-prologue");
    expect(calls).toBe(1);
    stop();
    story.markSeen("s2", "peregrina-prologue");
    expect(calls).toBe(1);
    expect(story.seenInRun("s2").has("peregrina-prologue")).toBe(true);
  });

  it("a chat topic marked read persists and tells every subscriber", () => {
    const kv = memoryStore();
    const story = createStoryStore(kv);
    let calls = 0;
    story.subscribe(() => {
      calls += 1;
    });
    story.markRead("peregrina-wings");
    story.markRead("peregrina-wings");
    expect(calls).toBe(1);
    expect([...story.readTopics()]).toEqual(["peregrina-wings"]);
    expect(JSON.parse(kv.data.get(CHAT_KEY) ?? "null")).toEqual(["peregrina-wings"]);
    expect(createStoryStore(kv).readTopics().has("peregrina-wings")).toBe(true);
  });

  it("two tabs: a scene one of them marked is kept when the other marks later (no scene plays again)", () => {
    const kv = memoryStore();
    // both tabs read the storage before either marked a scene
    const a = createStoryStore(kv);
    const b = createStoryStore(kv);
    a.seenEver();
    b.seenEver();
    a.markSeen("s1", "peregrina-prologue");
    b.markSeen("s1", "peregrina-debut");
    b.markSeen("s2", "peregrina-prologue");
    a.markSeen("s3", "peregrina-tears");
    const later = createStoryStore(kv);
    expect([...later.seenInRun("s1")]).toEqual(["peregrina-prologue", "peregrina-debut"]);
    expect([...later.seenInRun("s2")]).toEqual(["peregrina-prologue"]);
    expect([...later.seenInRun("s3")]).toEqual(["peregrina-tears"]);
    expect([...later.seenEver()]).toEqual([
      "peregrina-prologue",
      "peregrina-debut",
      "peregrina-tears",
    ]);
    // a tab that writes reads the other's marks too
    expect(a.seenInRun("s1").has("peregrina-debut")).toBe(true);
    expect(a.seenInRun("s2").has("peregrina-prologue")).toBe(true);
    // one that marks a scene the other already stored writes it once
    b.markSeen("s3", "peregrina-tears");
    expect(JSON.parse(kv.data.get(STORY_KEY) ?? "null")).toEqual({
      runs: {
        s1: ["peregrina-prologue", "peregrina-debut"],
        s2: ["peregrina-prologue"],
        s3: ["peregrina-tears"],
      },
      ever: ["peregrina-prologue", "peregrina-debut", "peregrina-tears"],
    });
    // a season neither tab changed keeps its reading (no new set for the game to compare)
    const kept = b.seenInRun("s2");
    b.markSeen("s4", "peregrina-debut");
    expect(b.seenInRun("s2")).toBe(kept);
  });

  it("two tabs: a topic one of them read stays read when the other reads another", () => {
    const kv = memoryStore();
    const a = createStoryStore(kv);
    const b = createStoryStore(kv);
    a.readTopics();
    b.readTopics();
    a.markRead("peregrina-wings");
    b.markRead("peregrina-why-race");
    expect([...createStoryStore(kv).readTopics()]).toEqual([
      "peregrina-wings",
      "peregrina-why-race",
    ]);
    expect(b.readTopics().has("peregrina-wings")).toBe(true);
  });

  it("a mark over a corrupt stored value keeps this tab's scenes and topics", () => {
    const kv = memoryStore({
      [STORY_KEY]: JSON.stringify({ runs: { s1: ["a"] }, ever: ["a"] }),
      [CHAT_KEY]: JSON.stringify(["t1"]),
    });
    const story = createStoryStore(kv);
    story.seenEver();
    story.readTopics();
    kv.data.set(STORY_KEY, "{");
    kv.data.set(CHAT_KEY, '{"t":1}');
    story.markSeen("s1", "b");
    story.markRead("t2");
    const later = createStoryStore(kv);
    expect([...later.seenInRun("s1")]).toEqual(["a", "b"]);
    expect([...later.seenEver()]).toEqual(["a", "b"]);
    expect([...later.readTopics()]).toEqual(["t1", "t2"]);
  });

  it("reads what earlier builds stored, and a reading keeps its identity until a mark", () => {
    const kv = memoryStore({
      [STORY_KEY]: JSON.stringify({ runs: { s1: ["a", "b"], s2: ["a"] }, ever: ["a", "b"] }),
      [CHAT_KEY]: JSON.stringify(["t1"]),
    });
    const story = createStoryStore(kv);
    expect([...story.seenInRun("s1")]).toEqual(["a", "b"]);
    expect([...story.seenInRun("s2")]).toEqual(["a"]);
    expect([...story.seenEver()]).toEqual(["a", "b"]);
    expect([...story.readTopics()]).toEqual(["t1"]);
    const run = story.seenInRun("s1");
    const ever = story.seenEver();
    const read = story.readTopics();
    const v = story.version();
    expect(story.seenInRun("s1")).toBe(run);
    expect(story.seenEver()).toBe(ever);
    expect(story.readTopics()).toBe(read);
    expect(story.version()).toBe(v);
    story.markSeen("s1", "c");
    expect(story.seenInRun("s1")).not.toBe(run);
    expect(story.seenEver()).not.toBe(ever);
    expect(story.readTopics()).toBe(read);
  });

  it("two tabs: a tab that read the store before the other one marked reads the mark at its next reading (no scene shows twice)", () => {
    const kv = memoryStore();
    // a tab that read what was seen (its menu was up), and the tab that plays on
    const waiting = createStoryStore(kv);
    const playing = createStoryStore(kv);
    const run = waiting.seenInRun("s1");
    waiting.seenEver();
    waiting.readTopics();
    const v = waiting.version();
    playing.markSeen("s1", "peregrina-debut");
    playing.markRead("peregrina-wings");
    // its next snapshot: a new version, and the readings that changed
    expect(waiting.version()).not.toBe(v);
    expect(waiting.seenInRun("s1")).not.toBe(run);
    expect([...waiting.seenInRun("s1")]).toEqual(["peregrina-debut"]);
    expect([...waiting.seenEver()]).toEqual(["peregrina-debut"]);
    expect([...waiting.readTopics()]).toEqual(["peregrina-wings"]);
    // a reading alone tells no one (a mark does): its subscribers read it at their next render
    let told = 0;
    waiting.subscribe(() => {
      told += 1;
    });
    playing.markSeen("s1", "peregrina-debut-win");
    expect(waiting.seenInRun("s1").has("peregrina-debut-win")).toBe(true);
    expect(told).toBe(0);
  });

  it("a snapshot with nothing new stored keeps every reading's identity, and another season's mark keeps this one's", () => {
    const kv = memoryStore({
      [STORY_KEY]: JSON.stringify({ runs: { s1: ["a"], s2: ["b"] }, ever: ["a", "b"] }),
      [CHAT_KEY]: JSON.stringify(["t1"]),
    });
    const a = createStoryStore(kv);
    const b = createStoryStore(kv);
    const s1 = a.seenInRun("s1");
    const s2 = a.seenInRun("s2");
    const read = a.readTopics();
    const v = a.version();
    expect(a.version()).toBe(v);
    expect(a.seenInRun("s1")).toBe(s1);
    expect(a.readTopics()).toBe(read);
    b.markSeen("s2", "c");
    const v2 = a.version();
    expect(v2).not.toBe(v);
    expect(a.seenInRun("s1")).toBe(s1);
    expect(a.seenInRun("s2")).not.toBe(s2);
    expect([...a.seenInRun("s2")]).toEqual(["b", "c"]);
    expect(a.readTopics()).toBe(read);
    // the same scenes stored in another text: nothing changed
    const ever = a.seenEver();
    const s2now = a.seenInRun("s2");
    kv.data.set(STORY_KEY, JSON.stringify(JSON.parse(kv.data.get(STORY_KEY) ?? "null"), null, 2));
    kv.data.set(CHAT_KEY, JSON.stringify(["t1"], null, 2));
    expect(a.version()).toBe(v2);
    expect(a.seenInRun("s2")).toBe(s2now);
    expect(a.seenEver()).toBe(ever);
    expect(a.readTopics()).toBe(read);
  });

  it("a value another tab broke or removed keeps what this tab read (each scene seen stays seen)", () => {
    const kv = memoryStore({
      [STORY_KEY]: JSON.stringify({ runs: { s1: ["a"] }, ever: ["a"] }),
      [CHAT_KEY]: JSON.stringify(["t1"]),
    });
    const story = createStoryStore(kv);
    story.seenInRun("s1");
    story.readTopics();
    kv.data.set(STORY_KEY, "{");
    kv.data.delete(CHAT_KEY);
    expect([...story.seenInRun("s1")]).toEqual(["a"]);
    expect([...story.seenEver()]).toEqual(["a"]);
    expect([...story.readTopics()]).toEqual(["t1"]);
  });

  it("without storage, or with blocked or broken storage, it lasts the visit", () => {
    const broken = memoryStore({ [STORY_KEY]: "{not json", [CHAT_KEY]: '{"ever":3}' });
    for (const kv of [undefined, blocked, broken]) {
      const story = createStoryStore(kv);
      expect(story.seenEver().size).toBe(0);
      expect(story.readTopics().size).toBe(0);
      story.markSeen("s1", "peregrina-prologue");
      story.markRead("peregrina-wings");
      expect(story.seenInRun("s1").has("peregrina-prologue")).toBe(true);
      expect(story.seenEver().has("peregrina-prologue")).toBe(true);
      expect(story.readTopics().has("peregrina-wings")).toBe(true);
    }
  });
});
