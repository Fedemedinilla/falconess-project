import type { z } from "zod";
import { Course } from "./course.js";
import { GameEvent } from "./event.js";
import { Falconess } from "./falconess.js";
import { Frame, Part, type Quirk, QuirkList } from "./frame.js";
import { Economy } from "./gacha.js";
import { Manufacturer } from "./manufacturer.js";
import { type PassiveSkill, Skill } from "./skill.js";

/** What a loader hands us: parsed JSON, not yet validated. One entry per file. */
export type RawContent = {
  falconess: unknown[];
  manufacturers: unknown[];
  frames: unknown[];
  parts: unknown[];
  quirks: unknown;
  skills: unknown[];
  events: unknown[];
  courses: unknown[];
  economy?: unknown;
  text: Record<string, unknown>;
};

export class ContentError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(
      `Content validation failed with ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`,
    );
    this.name = "ContentError";
    this.problems = problems;
  }
}

export type ContentIndex = {
  readonly falconess: ReadonlyMap<string, Falconess>;
  readonly manufacturers: ReadonlyMap<string, Manufacturer>;
  readonly frames: ReadonlyMap<string, Frame>;
  readonly parts: ReadonlyMap<string, Part>;
  readonly quirks: ReadonlyMap<string, Quirk>;
  readonly skills: ReadonlyMap<string, Skill>;
  readonly events: ReadonlyMap<string, GameEvent>;
  readonly courses: ReadonlyMap<string, Course>;
  readonly economy: Economy | undefined;
  readonly text: ReadonlyMap<string, string>;
  /** Throwing getters: an unknown id is a programming error, never a runtime branch. */
  getFalconess(id: string): Falconess;
  getManufacturer(id: string): Manufacturer;
  getFrame(id: string): Frame;
  getPart(id: string): Part;
  getQuirk(id: string): Quirk;
  getSkill(id: string): Skill;
  getPassive(id: string): PassiveSkill;
  getEvent(id: string): GameEvent;
  getCourse(id: string): Course;
  t(key: string): string;
};

function parseAll<T>(
  schema: z.ZodType<T>,
  items: unknown[],
  kind: string,
  problems: string[],
): Map<string, T> {
  const out = new Map<string, T>();
  items.forEach((item, i) => {
    const res = schema.safeParse(item);
    const label = `${kind}[${i}]${hasId(item) ? ` (${item.id})` : ""}`;
    if (!res.success) {
      for (const issue of res.error.issues)
        problems.push(`${label}: ${issue.path.join(".") || "<root>"}: ${issue.message}`);
      return;
    }
    const id = (res.data as { id: string }).id;
    if (out.has(id)) problems.push(`${label}: duplicate id "${id}"`);
    out.set(id, res.data);
  });
  return out;
}

function hasId(x: unknown): x is { id: string } {
  return typeof x === "object" && x !== null && typeof (x as { id?: unknown }).id === "string";
}

/**
 * Validate every entity, then every cross-reference and text key. Pure: no IO. Throws ContentError
 * listing all problems at once so a content PR fails with the full picture.
 */
export function buildContentIndex(raw: RawContent): ContentIndex {
  const problems: string[] = [];

  const falconess = parseAll(Falconess, raw.falconess, "falconess", problems);
  const manufacturers = parseAll(Manufacturer, raw.manufacturers, "manufacturers", problems);
  const frames = parseAll(Frame, raw.frames, "frames", problems);
  const parts = parseAll(Part, raw.parts, "parts", problems);
  const skills = parseAll(Skill, raw.skills, "skills", problems);
  const events = parseAll(GameEvent, raw.events, "events", problems);
  const courses = parseAll(Course, raw.courses, "courses", problems);

  const quirks = new Map<string, Quirk>();
  const quirkRes = QuirkList.safeParse(raw.quirks);
  if (!quirkRes.success) {
    for (const issue of quirkRes.error.issues)
      problems.push(`quirks: ${issue.path.join(".")}: ${issue.message}`);
  } else {
    for (const q of quirkRes.data.quirks) {
      if (quirks.has(q.id)) problems.push(`quirks: duplicate id "${q.id}"`);
      quirks.set(q.id, q);
    }
  }

  let economy: Economy | undefined;
  if (raw.economy !== undefined) {
    const eco = Economy.safeParse(raw.economy);
    if (!eco.success)
      for (const issue of eco.error.issues)
        problems.push(`economy: ${issue.path.join(".")}: ${issue.message}`);
    else economy = eco.data;
  }

  const text = new Map<string, string>();
  for (const [k, v] of Object.entries(raw.text)) {
    if (typeof v !== "string") problems.push(`text: "${k}" is not a string`);
    else text.set(k, v);
  }

  // --- cross references -------------------------------------------------------------------------
  const need = (map: ReadonlyMap<string, unknown>, id: string, where: string, kind: string) => {
    if (!map.has(id)) problems.push(`${where}: unknown ${kind} "${id}"`);
  };
  const needText = (key: string, where: string) => {
    if (!text.has(key)) problems.push(`${where}: missing text key "${key}"`);
  };

  for (const f of falconess.values()) {
    const w = `falconess/${f.id}`;
    need(manufacturers, f.sponsor, w, "manufacturer");
    for (const s of f.uniqueSkills) need(skills, s, w, "skill");
    for (const g of f.seasonGoals) need(courses, g.courseId, w, "course");
    needText(f.textKey, w);
    const m = manufacturers.get(f.sponsor);
    if (m && !m.sponsors.includes(f.id))
      problems.push(`${w}: sponsor "${m.id}" does not list it in sponsors`);
  }
  for (const m of manufacturers.values()) {
    const w = `manufacturers/${m.id}`;
    for (const s of m.sponsors) need(falconess, s, w, "falconess");
    need(events, m.crew.signatureEvent, w, "event");
    needText(m.textKey, w);
    needText(m.crew.textKey, w);
  }
  for (const fr of frames.values()) {
    const w = `frames/${fr.id}`;
    need(manufacturers, fr.manufacturer, w, "manufacturer");
    if (fr.passive !== undefined) {
      need(skills, fr.passive, w, "skill");
      const sk = skills.get(fr.passive);
      if (sk && sk.kind !== "passive")
        problems.push(`${w}: passive "${fr.passive}" is not a passive skill`);
    }
    if (fr.signatureOf !== undefined) need(falconess, fr.signatureOf, w, "falconess");
    if (fr.quirkSlots > 0 && fr.passive !== undefined)
      problems.push(`${w}: a frame has quirk slots or a passive, not both`);
    needText(fr.textKey, w);
  }
  for (const p of parts.values()) {
    const w = `parts/${p.id}`;
    need(manufacturers, p.manufacturer, w, "manufacturer");
    needText(p.textKey, w);
  }
  for (const q of quirks.values()) needText(q.textKey, `quirks/${q.id}`);
  for (const s of skills.values()) {
    const w = `skills/${s.id}`;
    if (s.uniqueTo !== undefined) need(falconess, s.uniqueTo, w, "falconess");
    needText(s.textKey, w);
  }
  for (const e of events.values()) {
    const w = `events/${e.id}`;
    needText(e.textKey, w);
    e.options.forEach((o, i) => {
      needText(o.textKey, `${w}.options[${i}]`);
      o.chance?.forEach((b, j) => {
        if (b.textKey !== undefined) needText(b.textKey, `${w}.options[${i}].chance[${j}]`);
      });
      for (const b of Object.keys(o.effects.bond)) need(manufacturers, b, w, "manufacturer");
      if (o.effects.learnSkill !== undefined) need(skills, o.effects.learnSkill, w, "skill");
    });
    if (e.source.kind === "crew") need(manufacturers, e.source.manufacturer, w, "manufacturer");
    if (e.source.kind === "falconess") need(falconess, e.source.falconess, w, "falconess");
    for (const r of e.conditions.requires) need(events, r, w, "event");
  }
  for (const c of courses.values()) needText(c.textKey, `courses/${c.id}`);
  if (economy) {
    for (const pool of economy.pools) {
      const w = `economy.pools/${pool.id}`;
      const target = pool.kind === "falconess" ? falconess : frames;
      for (const id of [...pool.items, ...pool.featured]) {
        need(target, id, w, pool.kind === "falconess" ? "falconess" : "frame");
        // Anti pay-to-win invariant 1: parts and quirks never appear in gacha.
        if (parts.has(id) || quirks.has(id))
          problems.push(`${w}: "${id}" is a part or quirk; never in gacha`);
      }
    }
  }

  if (problems.length > 0) throw new ContentError(problems);

  const getter =
    <T>(map: ReadonlyMap<string, T>, kind: string) =>
    (id: string): T => {
      const v = map.get(id);
      if (v === undefined) throw new Error(`unknown ${kind} "${id}"`);
      return v;
    };

  const getSkill = getter(skills, "skill");
  return {
    falconess,
    manufacturers,
    frames,
    parts,
    quirks,
    skills,
    events,
    courses,
    economy,
    text,
    getFalconess: getter(falconess, "falconess"),
    getManufacturer: getter(manufacturers, "manufacturer"),
    getFrame: getter(frames, "frame"),
    getPart: getter(parts, "part"),
    getQuirk: getter(quirks, "quirk"),
    getSkill,
    getPassive: (id) => {
      const s = getSkill(id);
      if (s.kind !== "passive") throw new Error(`skill "${id}" is not passive`);
      return s;
    },
    getEvent: getter(events, "event"),
    getCourse: getter(courses, "course"),
    t: (key) => {
      const v = text.get(key);
      if (v === undefined) throw new Error(`missing text key "${key}"`);
      return v;
    },
  };
}
