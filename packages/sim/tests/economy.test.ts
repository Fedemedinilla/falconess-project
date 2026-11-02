import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, loadRawContent } from "@falconess/content";
import {
  BlackBox,
  Build,
  buildContentIndex,
  DEFAULT_POSITION,
  Economy,
  EntryInput,
  Falconess,
  Frame,
  FrameStats,
  GachaPool,
  Part,
  QuirkList,
  RaceEntry,
  RunInput,
  SeasonState,
  STAT_NAMES,
} from "@falconess/schema";
import { describe, expect, it } from "vitest";
import {
  advanceSeason,
  effectiveStats,
  freezeEntry,
  goalForTurn,
  lowestStat,
  RULESET_V1,
  type SimContext,
  startSeason,
} from "../src/index.js";

/**
 * Anti pay-to-win invariants of BRIEF §9, as executable checks over the content and the code.
 * The economy ships as an open door (ADR-0001): `gacha.json` is validated, premium is off and no
 * pull is implemented, so "purchasable" here means what a pull could hand out (the Falconess and
 * frames of the pools, and the quirks rolled onto a pulled Boneyard frame); parts cost scrap,
 * which premium never buys (§9: premium is "equivalente a plumas, nunca a chatarra").
 *
 * 1. No Part or Quirk appears in gacha.json: below, on the real content and against the validator.
 * 2. Generic vs signature 0.85-0.90 in the home cells at equal stats: metric 3 of the balance batch
 *    (`pnpm sim:batch`, scenario S3, docs/race-engine.md 25.2, ADR-0005), not a unit test.
 * 3. No purchasable item modifies FalconessStats, growth or aptitudes: below, on the schemas, the
 *    content, the race entry and the season.
 * 4. The duplicate rank appears in no formula of packages/sim: below, on the sim's inputs (no
 *    schema the sim reads has such a field) and on its sources.
 * 5. The scrap-class league (every entry re-simulated on mule or kite): deferred with
 *    multiplayer (ADR-0001); the pure engine and seed + inputs that it needs are kept.
 */

const content = loadContent();
const ctx: SimContext = { ruleset: RULESET_V1, content };
const economy = content.economy;
const POOLS = economy?.pools ?? [];
const poolFrames = [
  ...new Set(POOLS.filter((p) => p.kind === "frames").flatMap((p) => [...p.items, ...p.featured])),
].sort();
const poolFalconess = [
  ...new Set(
    POOLS.filter((p) => p.kind === "falconess").flatMap((p) => [...p.items, ...p.featured]),
  ),
].sort();

/** Field names of a schema, at every depth (properties of its JSON Schema, input side). */
function fieldNames(schema: { toJSONSchema(p: object): unknown }): string[] {
  const out = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "properties" && typeof v === "object" && v !== null)
        for (const name of Object.keys(v)) out.add(name);
      walk(v);
    }
  };
  walk(schema.toJSONSchema({ io: "input", unrepresentable: "any" }));
  return [...out].sort();
}

/** Keys of a plain value, at every depth. */
function valueKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) valueKeys(v, out);
  else if (typeof value === "object" && value !== null)
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      valueKeys(v, out);
    }
  return out;
}

describe("BRIEF §9 invariant 1: no Part or Quirk in gacha.json", () => {
  it("the content has pools, and every pooled id is a Falconess or a frame of the pool's kind", () => {
    expect(economy?.premiumEnabled).toBe(false);
    expect(poolFalconess.length).toBeGreaterThan(0);
    expect(poolFrames.length).toBeGreaterThan(0);
    for (const pool of POOLS)
      for (const id of [...pool.items, ...pool.featured]) {
        expect(content.parts.has(id), `${pool.id}: ${id} is a part`).toBe(false);
        expect(content.quirks.has(id), `${pool.id}: ${id} is a quirk`).toBe(false);
        const target = pool.kind === "falconess" ? content.falconess : content.frames;
        expect(target.has(id), `${pool.id}: ${id}`).toBe(true);
      }
  });

  it("a pool can only hold falconess or frames, and the validator rejects any part or quirk put in one", () => {
    expect(GachaPool.shape.kind.options).toEqual(["falconess", "frames"]);
    const partId = [...content.parts.keys()][0] ?? "";
    const quirkId = [...content.quirks.keys()][0] ?? "";
    for (const kind of ["falconess", "frames"] as const)
      for (const field of ["items", "featured"] as const)
        for (const id of [partId, quirkId]) {
          const raw = loadRawContent();
          const eco = Economy.parse(raw.economy);
          const pools = eco.pools.map((p) =>
            p.kind === kind ? { ...p, [field]: [...p[field], id] } : p,
          );
          raw.economy = { ...eco, pools };
          expect(() => buildContentIndex(raw), `${kind}.${field} + ${id}`).toThrow(
            /never in gacha/,
          );
        }
  });
});

describe("BRIEF §9 invariant 3: no purchasable item modifies FalconessStats, growth or aptitudes", () => {
  const FALCONESS_FIELDS = ["baseStats", "growth", "positionAptitude"];

  it("a frame carries no Falconess stat, growth or aptitude field; growth lives only in the Falconess content", () => {
    // `Frame.stats` is the wing's own FrameStats (PW, energy, dissipation, durability)
    for (const name of fieldNames(Frame)) {
      expect(FALCONESS_FIELDS, `Frame.${name}`).not.toContain(name);
      expect(STAT_NAMES, `Frame.${name}`).not.toContain(name);
    }
    for (const name of Object.keys(FrameStats.shape)) expect(STAT_NAMES).not.toContain(name);
    // the season state holds stats and aptitudes, never growth: no input can rewrite it
    expect(Object.keys(SeasonState.shape)).not.toContain("growth");
    expect(Object.keys(Falconess.shape)).toContain("growth");
  });

  it("the only Falconess-stat modifier of the content sits on parts (scrap), never on a pooled frame's passive or on a quirk", () => {
    const statMods = (mods: readonly { kind: string }[]) =>
      mods.filter((m) => m.kind === "falconess-stat");
    for (const id of poolFrames) {
      const frame = content.getFrame(id);
      if (frame.passive !== undefined)
        expect(statMods(content.getPassive(frame.passive).modifiers), id).toEqual([]);
    }
    for (const q of content.quirks.values()) expect(statMods(q.modifiers), q.id).toEqual([]);
    // the carriers that do exist are parts: a firmware gives intelligence for the race
    const carriers = [...content.parts.values()].filter((p) => statMods(p.modifiers).length > 0);
    expect(carriers.length).toBeGreaterThan(0);
    for (const p of carriers) expect(Part.parse(p).id).toBe(p.id);
    // parts never enter a pool (invariant 1) and premium is off: scrap is earned, not bought
    expect(Economy.shape.premiumEnabled.parse(false)).toBe(false);
    expect(() => Economy.shape.premiumEnabled.parse(true)).toThrow();
  });

  it("in a race any frame, pooled or not, with any quirk it can roll only picks the default position and its letter: the stats are the Falconess's", () => {
    // every frame, not only the pooled ones: quirks roll only on Boneyard frames (two slots), and
    // the pool's one Boneyard frame (caracara-signature) has none
    const quirkIds = [...content.quirks.keys()].sort();
    const allFrames = [...content.frames.keys()].sort();
    expect(allFrames.some((id) => content.getFrame(id).quirkSlots > 1)).toBe(true);
    for (const fid of poolFalconess) {
      const f = content.getFalconess(fid);
      for (const course of content.courses.values())
        for (const frameId of allFrames) {
          const frame = content.getFrame(frameId);
          const quirkSets: string[][] = [[]];
          if (frame.quirkSlots > 0) for (const q of quirkIds) quirkSets.push([q]);
          if (frame.quirkSlots > 1) quirkSets.push(quirkIds.slice(0, 2), quirkIds.slice(-2));
          for (const quirks of quirkSets)
            for (const mood of [-2, 0, 2]) {
              const input: EntryInput = {
                runnerId: "p",
                kind: "player",
                falconessId: fid,
                baseStats: f.baseStats,
                mood,
                positionAptitude: f.positionAptitude,
                frameId,
                parts: [],
                quirks,
                learnedSkills: [],
                durability: null,
              };
              const entry = freezeEntry(RULESET_V1, content, input, course, 0);
              const own = effectiveStats(
                RULESET_V1,
                f.baseStats,
                mood,
                f.positionAptitude,
                DEFAULT_POSITION[frame.style],
              );
              expect(entry.stats, `${fid} ${frameId} ${quirks.join("+")} ${course.id}`).toEqual(
                own,
              );
              expect(entry.position).toBe(DEFAULT_POSITION[frame.style]);
              expect(entry.positionAptitude).toBe(f.positionAptitude[entry.position]);
            }
        }
    }
  });

  it("in the season a pooled frame changes no stat or aptitude: same-manufacturer hangars train identically until the first goal race", () => {
    // The season reads a hangar frame's manufacturer (crews, bond, crew events) and, in races, its
    // build. Two hangars that differ only by a frame of the same manufacturer (SR against SSR,
    // signature against generic) play the same inputs to the same stats and aptitudes.
    const byMfr = new Map<string, string[]>();
    for (const id of poolFrames) {
      const m = content.getFrame(id).manufacturer;
      byMfr.set(m, [...(byMfr.get(m) ?? []), id]);
    }
    const groups = [...byMfr.values()].filter((g) => g.length > 1);
    expect(groups.length).toBeGreaterThan(0);
    for (const fid of poolFalconess) {
      const firstGoal = Math.min(...content.getFalconess(fid).seasonGoals.map((g) => g.turn));
      for (const group of groups)
        for (const seed of ["eco-1", "eco-2"]) {
          const trajectories = group.map((frameId) => {
            let s = startSeason(ctx, seed, {
              kind: "start",
              falconessId: fid,
              hangar: [frameId],
              parents: [],
            });
            const mfr = content.getFrame(frameId).manufacturer;
            const seen: unknown[] = [];
            for (let k = 0; s.status === "active" && s.turn < firstGoal; k++) {
              expect(goalForTurn(ctx, s)).toBeUndefined();
              const input: RunInput = s.pendingEvent
                ? { kind: "event:choose", option: 0 }
                : s.fatigue >= 60
                  ? { kind: "rest" }
                  : k % 5 === 4
                    ? { kind: "outing", manufacturer: mfr }
                    : {
                        kind: (
                          {
                            agility: "train:agility",
                            stamina: "train:stamina",
                            technique: "train:technique",
                            courage: "train:risk-flight",
                            intelligence: "train:simulator",
                          } as const
                        )[lowestStat(s.stats)],
                      };
              s = advanceSeason(ctx, s, input);
              seen.push([s.turn, s.stats, s.positionAptitude]);
            }
            return seen;
          });
          expect(trajectories[0]?.length ?? 0).toBeGreaterThanOrEqual(firstGoal - 1);
          for (const t of trajectories.slice(1))
            expect(t, `${fid} ${group.join("/")} ${seed}`).toEqual(trajectories[0]);
        }
    }
  });
});

describe("BRIEF §9 invariant 4: the duplicate rank appears in no formula of packages/sim", () => {
  /** camelCase, snake_case and kebab-case names split into lower-case words. */
  const words = (name: string) =>
    name
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/);
  const DUP = ["dup", "dupe", "dupes", "duplicate", "duplicates", "copies", "rango"];
  /** A field naming a rank or a duplicate count (no schema the sim reads has a `rank` today). */
  const rankField = (name: string) => words(name).some((w) => w === "rank" || DUP.includes(w));

  it("no schema the sim reads, and no ruleset constant, has a duplicate-rank or copy-count field", () => {
    // A formula of packages/sim can only read its inputs: the ruleset, the content, the season
    // state and inputs, race entries, builds and black boxes. All are strict objects, so a value
    // that parses carries no field outside these names.
    const schemas = {
      SeasonState,
      RunInput,
      Falconess,
      Frame,
      Part,
      QuirkList,
      EntryInput,
      RaceEntry,
      Build,
      BlackBox,
      Economy,
    };
    for (const [label, schema] of Object.entries(schemas)) {
      const names = fieldNames(schema);
      expect(names.length, label).toBeGreaterThan(3);
      expect(names.filter(rankField), label).toEqual([]);
    }
    expect([...valueKeys(RULESET_V1)].filter(rankField)).toEqual([]);
  });

  it("a duplicate cannot reach a season: the hangar rejects the same frame twice", () => {
    const frameId = poolFrames[0] ?? "";
    const fid = poolFalconess[0] ?? "";
    expect(() =>
      startSeason(ctx, "dup", {
        kind: "start",
        falconessId: fid,
        hangar: [frameId, frameId],
        parents: [],
      }),
    ).toThrow(/duplicate/);
  });

  it("no identifier of packages/sim/src names a duplicate rank or a copy count", () => {
    // Comments and string literals are blanked first; what remains is code.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
    const files: string[] = [];
    const walkDir = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walkDir(p);
        else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(p);
      }
    };
    walkDir(root);
    expect(files.length).toBeGreaterThan(20);
    const found: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/.*$/gm, " ")
        .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
      // the race's own position rank (rankSnapshot) is legitimate: only the duplicate words count
      for (const id of code.match(/[A-Za-z_$][\w$]*/g) ?? [])
        if (words(id).some((w) => DUP.includes(w))) found.push(`${file}: ${id}`);
    }
    expect(found).toEqual([]);
  });
});

// Invariant 2 is metric 3 of `pnpm sim:batch` (S3, 0.85-0.90; its pr statistic in ADR-0005).
describe("BRIEF §9 invariant 5: deferred", () => {
  it.todo(
    "5. scrap-class league: every entry re-simulated on mule or kite by style, no parts or quirks (deferred with multiplayer, ADR-0001)",
  );
});
