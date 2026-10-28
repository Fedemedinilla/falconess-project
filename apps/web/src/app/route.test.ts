import { describe, expect, it } from "vitest";
import { isRoute, parseHash, ROUTES, routeHref } from "./route";

describe("hash routes", () => {
  it("are plain names", () => {
    for (const route of ROUTES) {
      expect(route).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(routeHref(route)).toBe(`#${route}`);
      expect(parseHash(routeHref(route))).toBe(route);
    }
  });

  it("fall back to the start view", () => {
    expect(parseHash("")).toBe("inicio");
    expect(parseHash("#")).toBe("inicio");
    expect(parseHash("#/temporada")).toBe("inicio");
    expect(parseHash("#ajustes")).toBe("inicio");
    expect(isRoute("carrera-libre")).toBe(true);
    expect(isRoute("settings")).toBe(false);
  });
});
