import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ChatTopic, StoryScene } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { CONTENT_ROOT } from "./node";

function files(dir: string): unknown[] {
  const full = join(CONTENT_ROOT, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(full, f), "utf8")));
}
const text = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(join(CONTENT_ROOT, "text", `${lang}.json`), "utf8"));

/** Speakers without a name plate. */
const UNNAMED = new Set(["narrator", "sfx"]);

describe("story scenes and chat topics (owner 2026-11-12)", () => {
  const scenes = files("story").map((s) => StoryScene.parse(s));
  const topics = files("chat").map((c) => ChatTopic.parse(c));
  const es = text("es");
  const en = text("en");
  const falconess = new Set(readdirSync(join(CONTENT_ROOT, "falconess")).map((f) => f.replace(/\.json$/, "")));

  it("validate, with unique ids, for Falconess that exist", () => {
    expect(scenes.length).toBeGreaterThan(0);
    expect(new Set(scenes.map((s) => s.id)).size).toBe(scenes.length);
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
    for (const x of [...scenes, ...topics]) expect(falconess.has(x.falconess), x.id).toBe(true);
  });

  it("every text and every speaker's name is in Spanish and in English", () => {
    const keys = [
      ...scenes.flatMap((s) => [
        s.titleKey,
        s.kickerKey,
        ...s.lines.map((l) => l.textKey),
        ...s.lines.filter((l) => !UNNAMED.has(l.speaker)).map((l) => `speaker.${l.speaker}`),
      ]),
      ...topics.flatMap((t) => [t.questionKey, ...t.replyKeys]),
    ];
    const missing = keys.filter((k) => es[k] === undefined || en[k] === undefined);
    expect(missing).toEqual([]);
  });

  it("one scene per trigger and Falconess", () => {
    const seen = scenes.map((s) => `${s.falconess}/${JSON.stringify(s.trigger)}`);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
