import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { describeActiveSkill, describeModifier, describeSource } from "../screens/model/describe";
import { BRIEF_UI_KEYS, gameBrief, uiAt } from "./brief";

/**
 * Every explanation a card can shorten has a brief variant in es.json (`<full key>.brief`): it
 * exists, says something, is shorter than the full text and uses no value the full text lacks.
 */
const content = getContent();

/** A text's length with its placeholders as two digits, so `{crew}` does not count as 6. */
const len = (template: string) => template.replace(/\{[A-Za-z0-9_]+\}/g, "00").length;
const vars = (template: string) => [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);

/** A part's or quirk's full text is "long" from here on: it needs a brief line. */
const LONG = 30;

function fullOfSkill(id: string): string {
  const skill = content.getSkill(id);
  return skill.kind === "active"
    ? describeActiveSkill(skill)
    : skill.modifiers.map(describeModifier).join(" · ");
}

describe("brief texts", () => {
  it("has a brief variant, shorter and with the same values, for every interface explanation", () => {
    for (const key of BRIEF_UI_KEYS) {
      const full = content.text.get(key);
      const brief = content.text.get(`${key}.brief`);
      expect(full, key).toBeTruthy();
      expect(brief?.trim(), `${key}.brief`).toBeTruthy();
      if (!full || !brief) continue;
      expect(len(brief), `${key}.brief is not shorter`).toBeLessThan(len(full));
      for (const v of vars(brief)) expect(vars(full), `${key}.brief uses {${v}}`).toContain(v);
    }
  });

  it("gives every skill and every manufacturer rule a brief line shorter than its full text", () => {
    for (const skill of content.skills.values()) {
      const brief = gameBrief(skill.textKey);
      expect(brief?.trim(), skill.id).toBeTruthy();
      expect(brief?.length ?? 0, skill.id).toBeLessThan(fullOfSkill(skill.id).length);
    }
    for (const m of content.manufacturers.values()) {
      const key = `rule.${m.rule}`;
      const brief = gameBrief(key);
      expect(brief?.trim(), key).toBeTruthy();
      expect(brief?.length ?? 0, key).toBeLessThan(content.t(key).length);
    }
  });

  it("gives every part and quirk with a long text a brief line, always shorter", () => {
    for (const source of [...content.parts.values(), ...content.quirks.values()]) {
      const full = describeSource(source).join(" · ");
      const brief = gameBrief(source.textKey);
      if (full.length > LONG) expect(brief?.trim(), source.textKey).toBeTruthy();
      if (brief !== undefined) {
        expect(brief.trim(), source.textKey).not.toBe("");
        expect(brief.length, source.textKey).toBeLessThan(full.length);
      }
    }
  });

  it("keeps no brief text that nothing shows", () => {
    const owners = new Set<string>([
      ...BRIEF_UI_KEYS,
      ...[...content.skills.values()].map((x) => x.textKey),
      ...[...content.quirks.values()].map((x) => x.textKey),
      ...[...content.parts.values()].map((x) => x.textKey),
      ...[...content.manufacturers.values()].map((m) => `rule.${m.rule}`),
    ]);
    const orphans = [...content.text.keys()]
      .filter((k) => k.endsWith(".brief"))
      .filter((k) => !owners.has(k.slice(0, -".brief".length)));
    expect(orphans).toEqual([]);
  });

  it("picks the brief or the full text by the detail asked", () => {
    expect(uiAt("brief", "ui.goals.consequence")).toBe(content.t("ui.goals.consequence.brief"));
    expect(uiAt("full", "ui.goals.consequence")).toBe(content.t("ui.goals.consequence"));
    expect(gameBrief("rule.pulse")).toBe("Boost en ráfagas cortas");
    expect(gameBrief("part.altair-battery")).toBeUndefined();
  });
});
