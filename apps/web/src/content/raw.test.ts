import { describe, expect, it } from "vitest";
import { contentPath, rawContentFromModules } from "./raw";

const ROOT = "../../../../packages/content";

function modules(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [`${ROOT}/frames/zeta.json`]: { id: "zeta" },
    [`${ROOT}/frames/alpha.json`]: { id: "alpha" },
    [`${ROOT}/frames/_draft.json`]: { id: "draft" },
    [`${ROOT}/quirks.json`]: { quirks: [] },
    [`${ROOT}/gacha.json`]: { pools: [] },
    [`${ROOT}/text/es.json`]: { "a.b": "texto" },
    ...extra,
  };
}

describe("rawContentFromModules", () => {
  it("strips the path down to packages/content", () => {
    expect(contentPath(`${ROOT}/frames/kite.json`)).toBe("frames/kite.json");
    expect(contentPath("/abs/packages/content/text/es.json")).toBe("text/es.json");
    expect(contentPath("/elsewhere/kite.json")).toBeUndefined();
  });

  it("sorts each folder by file name and skips files starting with _", () => {
    const raw = rawContentFromModules(modules());
    expect(raw.frames).toEqual([{ id: "alpha" }, { id: "zeta" }]);
    expect(raw.falconess).toEqual([]);
    expect(raw.quirks).toEqual({ quirks: [] });
    expect(raw.economy).toEqual({ pools: [] });
    expect(raw.text).toEqual({ "a.b": "texto" });
  });

  it("ignores nested folders", () => {
    const raw = rawContentFromModules(modules({ [`${ROOT}/frames/old/beta.json`]: { id: "b" } }));
    expect(raw.frames).toHaveLength(2);
  });

  it("fails loudly when a required file is missing", () => {
    const m = modules();
    delete m[`${ROOT}/quirks.json`];
    expect(() => rawContentFromModules(m)).toThrow(/quirks\.json/);
    expect(() => rawContentFromModules(modules(), "en")).toThrow(/text\/en\.json/);
  });
});
