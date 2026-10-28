import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { describeActiveSkill, describeModifier, describeSource } from "../screens/model/describe";
import { BRIEF_UI_KEYS, gameBrief, uiAt } from "./brief";

/**
 * Every explanation a card can shorten has a brief variant in es.json (`<full key>.brief`): it
 * exists, says something, is shorter than the full text, uses no value the full text lacks and
 * drops none of its downsides.
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

/**
 * What a brief line may shorten but never drop: each downside its full text states (a cap, a lower
 * value, a weaker chance, the season ending…), and the subject of a skill-chance bonus, which
 * without "activación" reads as stronger skills. `full` finds the term in the full text, `brief`
 * the way the brief must say it.
 */
const KEPT_TERMS: readonly { name: string; full: RegExp; brief: RegExp }[] = [
  { name: "the cap", full: /\btope\b/i, brief: /\btope\b/i },
  { name: "less durability", full: /Durabilidad −/, brief: /menos durabilidad|frágil/i },
  { name: "less energy", full: /Energía −/, brief: /menos energía/i },
  { name: "less dissipation", full: /Disipación −/, brief: /menos calor/i },
  { name: "less power", full: /Potencia\/peso −/, brief: /lenta/i },
  { name: "a slower terrain", full: /Velocidad en [^·]*×0,/, brief: /peor|lenta/i },
  { name: "a weaker chance", full: /activación ×0,/i, brief: /se activa menos/i },
  // a brief may leave a chance bonus out, but one it states says "activación"
  {
    name: "the subject of the chance bonus",
    full: /activación (de habilidades )?\+/i,
    brief: /activación|^(?![\s\S]*habilidades? \+)/i,
  },
  { name: "a low capacity", full: /capacidad baja/i, brief: /chic|baja|poca/i },
  { name: "the drain", full: /\bdrena\b/i, brief: /gasta|drena/i },
  { name: "the slowdown", full: /\bfrena\b|más lenta/i, brief: /frena|lenta|rotas/i },
  { name: "the missing boost", full: /no hay boost/i, brief: /no hay boost/i },
  { name: "the halved gain", full: /\bresta\b/i, brief: /\bresta\b/i },
  { name: "the lower mood", full: /baja el ánimo/i, brief: /ánimo/i },
  { name: "the rising cost", full: /cada vez más/i, brief: /cuesta más|cada vez más|más caro/i },
  {
    name: "the season ending",
    full: /temporada (termina|se acaba)|(termina|se acaba) la temporada/i,
    brief: /temporada (termina|se acaba)|(termina|se acaba) la temporada/i,
  },
];

/** Every full text with a brief line, as the cards show them. */
function briefPairs(): { owner: string; full: string; brief: string }[] {
  const pairs: { owner: string; full: string; brief: string }[] = [];
  for (const key of BRIEF_UI_KEYS)
    pairs.push({ owner: key, full: content.t(key), brief: content.t(`${key}.brief`) });
  const game = (owner: string, full: string) => {
    const brief = gameBrief(owner);
    if (brief !== undefined) pairs.push({ owner, full, brief });
  };
  for (const skill of content.skills.values()) game(skill.textKey, fullOfSkill(skill.id));
  for (const source of [...content.parts.values(), ...content.quirks.values()])
    game(source.textKey, describeSource(source).join(" · "));
  for (const m of content.manufacturers.values())
    game(`rule.${m.rule}`, content.t(`rule.${m.rule}`));
  return pairs;
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

  it("keeps every downside of its full text, and what a bonus applies to", () => {
    const missing: string[] = [];
    for (const { owner, full, brief } of briefPairs())
      for (const term of KEPT_TERMS)
        if (term.full.test(full) && !term.brief.test(brief))
          missing.push(`${owner}: «${brief}» drops ${term.name}`);
    expect(missing).toEqual([]);
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
