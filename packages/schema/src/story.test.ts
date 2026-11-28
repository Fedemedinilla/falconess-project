import { describe, expect, it } from "vitest";
import { ChatTopic } from "./story.js";

const topic = {
  id: "peregrina-ever-lost",
  version: 2,
  falconess: "peregrina",
  questionKey: "chat.peregrina-ever-lost.q",
  fromTurn: 10,
  replyKeys: ["chat.peregrina-ever-lost.1", "chat.peregrina-ever-lost.3"],
};

describe("chat topic: the reply after a scene (usted → tú, chapter 6)", () => {
  it("parses without afterScene, as before", () => {
    expect(ChatTopic.parse(topic).afterScene).toBeUndefined();
  });

  it("parses an alternate reply list of the same length", () => {
    const t = ChatTopic.parse({
      ...topic,
      afterScene: {
        sceneId: "peregrina-first-vos",
        replyKeys: ["chat.peregrina-ever-lost.1", "chat.peregrina-ever-lost.3-tu"],
      },
    });
    expect(t.afterScene?.replyKeys).toEqual([
      "chat.peregrina-ever-lost.1",
      "chat.peregrina-ever-lost.3-tu",
    ]);
  });

  it("rejects an alternate reply list of a different length", () => {
    const res = ChatTopic.safeParse({
      ...topic,
      afterScene: { sceneId: "peregrina-first-vos", replyKeys: ["chat.peregrina-ever-lost.1"] },
    });
    expect(res.success).toBe(false);
  });

  it("rejects unknown keys inside afterScene", () => {
    const res = ChatTopic.safeParse({
      ...topic,
      afterScene: { sceneId: "peregrina-first-vos", replyKeys: topic.replyKeys, turn: 39 },
    });
    expect(res.success).toBe(false);
  });
});
