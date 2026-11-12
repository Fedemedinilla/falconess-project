/**
 * Story scenes and chat topics (owner 2026-11-12): the JSON files of packages/content/story and
 * packages/content/chat, validated once. Outside the content index: the simulation never reads
 * them, they only decide what the page tells.
 */
import { ChatTopic, StoryScene } from "@falconess/schema";

const SCENES: Record<string, unknown> = import.meta.glob<unknown>(
  "../../../../packages/content/story/*.json",
  { eager: true, import: "default" },
);
const TOPICS: Record<string, unknown> = import.meta.glob<unknown>(
  "../../../../packages/content/chat/*.json",
  { eager: true, import: "default" },
);

let scenes: readonly StoryScene[] | undefined;
let topics: readonly ChatTopic[] | undefined;

/** Every story scene, in file order. */
export function allScenes(): readonly StoryScene[] {
  scenes ??= Object.keys(SCENES)
    .sort()
    .map((k) => StoryScene.parse(SCENES[k]));
  return scenes;
}

/** Every chat topic, in file order. */
export function allTopics(): readonly ChatTopic[] {
  topics ??= Object.keys(TOPICS)
    .sort()
    .map((k) => ChatTopic.parse(TOPICS[k]));
  return topics;
}
