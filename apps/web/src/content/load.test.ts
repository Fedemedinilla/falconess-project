import { loadContent } from "@falconess/content";
import { describe, expect, it } from "vitest";
import { getContent, rawText, simContext } from "./load";

describe("browser content loader", () => {
  const web = getContent();
  const node = loadContent();

  it("builds the same index as the Node loader, in the same order", () => {
    for (const key of [
      "falconess",
      "manufacturers",
      "frames",
      "parts",
      "quirks",
      "skills",
      "events",
      "courses",
      "text",
    ] as const) {
      expect([...web[key].keys()], key).toEqual([...node[key].keys()]);
      expect([...web[key].values()], key).toEqual([...node[key].values()]);
    }
    expect(web.economy).toEqual(node.economy);
  });

  it("is built once", () => {
    expect(getContent()).toBe(web);
  });

  it("gives the context of a ruleset and refuses an unknown one", () => {
    expect(simContext().ruleset.version).toBe("v1");
    expect(simContext().content).toBe(web);
    expect(() => simContext("v999")).toThrow(/unknown ruleset/);
  });

  it("reads a raw text without the index, for the crash screen", () => {
    expect(rawText("ui.crash.title")).toBe(web.t("ui.crash.title"));
    expect(rawText("ui.no-such-key")).toBeUndefined();
  });
});
