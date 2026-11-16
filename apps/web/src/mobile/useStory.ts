import { useSyncExternalStore } from "react";
import { type StoryStore, storyStore } from "./storyModel";

/** The scenes seen and the chat read, kept up to date: a mark re-renders the component. */
export function useStory(): StoryStore {
  useSyncExternalStore(storyStore.subscribe, storyStore.version, storyStore.version);
  return storyStore;
}
