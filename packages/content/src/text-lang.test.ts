import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildContentIndex } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { CONTENT_ROOT, loadRawContent } from "./node";

function table(lang: string): Record<string, string> {
  return JSON.parse(readFileSync(join(CONTENT_ROOT, "text", `${lang}.json`), "utf8"));
}

const placeholders = (s: string) => (s.match(/\{[A-Za-z0-9_]+\}/g) ?? []).sort();

describe("English text (owner 2026-11-11: the demo in Spanish and English)", () => {
  const es = table("es");
  const en = table("en");

  it("has every Spanish key and no other", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it("keeps every placeholder of the Spanish text", () => {
    const off = Object.keys(es).filter(
      (k) => placeholders(es[k] ?? "").join() !== placeholders(en[k] ?? "").join(),
    );
    expect(off).toEqual([]);
  });

  it("builds a valid content index", () => {
    expect(() => buildContentIndex(loadRawContent("en"))).not.toThrow();
  });
});
