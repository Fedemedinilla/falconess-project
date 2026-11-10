import { loadContent } from "@falconess/content";
import type { Position, RaceEntry, RaceLog, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V3 } from "../rulesets/index.js";
import { FLIGHT_OFF_LINES, rulesetV3With } from "../rulesets/v3/switches.js";
import { simulateRace, simulateRaceProbed, simulateRaceReversed } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";

/**
 * Two lines per altitude band (owner, 2026-11-08): inside and outside. The wake is only in her
 * line, nobody flies through the one ahead in her line, she passes by the side (metres) or over
 * (energy), the one ahead may close the door, someone alongside boxes her in. No lines on the
 * ground. Lines off (`FLIGHT_OFF_LINES`) is round 5 byte for byte (harness/inv7.ts, 6bb4615).
 */

const content = loadContent();
const ORDER: Style[] = ["glide", "ground", "hover", "dive"];
const DEFAULT: Record<Style, Position> = {
  glide: "lead",
  ground: "pack",
  hover: "stalk",
  dive: "closer",
};
const stats = (st: number) => ({
  agility: st,
  stamina: st,
  technique: st,
  courage: st,
  intelligence: st,
});
function field(
  st = 600,
  pick?: (lane: number) => { style: Style; position: Position },
): RaceEntry[] {
  return Array.from({ length: 8 }, (_, lane) => {
    const style = ORDER[lane % 4] ?? "glide";
    const p = pick?.(lane) ?? { style, position: DEFAULT[style] };
    return neutralFixtureEntry({ runnerId: `r${lane}`, laneIndex: lane, ...p, stats: stats(st) });
  });
}
type Ev = NonNullable<RaceLog["events"]>[number];
const events = <K extends Ev["kind"]>(log: RaceLog, kind: K) =>
  (log.events ?? []).filter((e): e is Extract<Ev, { kind: K }> => e.kind === kind);
const crowd = field(600, (lane) => ({ style: ORDER[lane % 3] ?? "hover", position: "stalk" }));
const TRACKS = ["sprint", "ridge", "canyon"];

describe("two lines per band (2026-11-08)", () => {
  it("lines off log no line event, no outside bit and no line ledger", () => {
    const log = simulateRace(
      rulesetV3With(FLIGHT_OFF_LINES),
      crowd,
      content.getCourse("sprint"),
      "l",
    );
    const kinds = new Set<string>((log.events ?? []).map((e) => e.kind));
    for (const k of ["lineSwitch", "boxedIn", "doorClosed", "passSide"])
      expect(kinds.has(k)).toBe(false);
    for (const r of log.frames?.runners ?? [])
      for (const f of r.flags) expect(f & RACE_FRAME_FLAGS.lineOut).toBe(0);
    for (const r of log.results) expect(r.ledger.flight?.lineSwitches).toBeUndefined();
  });

  it("in her band and line nobody flies through the runner ahead; side by side is clean air", () => {
    let side = 0;
    let checked = 0;
    for (const id of TRACKS) {
      const snaps: {
        pos: number[];
        alt: number[];
        line: number[];
        ph: number[];
        dirty: number[];
      }[] = [];
      const log = simulateRaceProbed(
        RULESET_V3,
        crowd,
        content.getCourse(id),
        `block/${id}`,
        (_t, A) => {
          const S = A.state;
          snaps.push({
            pos: [...S.pos.slice(0, 8)],
            alt: [...S.alt.slice(0, 8)],
            line: [...S.line.slice(0, 8)],
            ph: [...S.flPhase.slice(0, 8)],
            dirty: [...S.dirty.slice(0, 8)],
          });
        },
      );
      for (let t = 1; t < snaps.length; t++) {
        const a = snaps[t - 1];
        const b = snaps[t];
        if (a === undefined || b === undefined) continue;
        for (let i = 0; i < 8; i++)
          for (let j = 0; j < 8; j++) {
            if (i === j) continue;
            const holdBoth = a.ph[i] === 2 && b.ph[i] === 2 && (a.alt[i] ?? 0) >= 1;
            const same =
              a.alt[i] === a.alt[j] &&
              b.alt[i] === b.alt[j] &&
              a.line[i] === a.line[j] &&
              b.line[i] === b.line[j];
            if (!holdBoth || !same || (a.alt[j] ?? 0) < 1) continue;
            checked++;
            // behind her in the same band and line at t − 1: still behind at t
            if ((a.pos[i] ?? 0) < (a.pos[j] ?? 0))
              expect(b.pos[i] ?? 0).toBeLessThan(b.pos[j] ?? 0);
          }
      }
      side += events(log, "passSide").length;
      for (const p of events(log, "passSide")) {
        const pass = events(log, "pass").find(
          (e) => e.tick === p.tick && e.lane === p.lane && e.otherLane === p.otherLane,
        );
        expect(pass?.band).toBe(p.band);
        expect(pass?.otherBand).toBe(p.band);
        expect(p.by).toBe(p.line === 1 ? "outside" : "inside");
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(side).toBeGreaterThan(0);
  });

  it("a line switch costs metres, not energy; technique makes it cheaper", () => {
    const mm = (st: number) => {
      let lost = 0;
      let sw = 0;
      for (const id of TRACKS) {
        const E = crowd.map((e) => ({ ...e, stats: { ...e.stats, technique: st } }));
        const log = simulateRace(RULESET_V3, E, content.getCourse(id), "tech", {
          detail: "results",
        });
        for (const r of log.results) {
          lost += r.ledger.flight?.lineMm ?? 0;
          sw += r.ledger.flight?.lineSwitches ?? 0;
        }
      }
      return { lost, sw };
    };
    const lo = mm(300);
    const hi = mm(900);
    expect(lo.sw).toBeGreaterThan(0);
    expect(hi.sw).toBeGreaterThan(0);
    expect(lo.lost / lo.sw).toBeGreaterThan(hi.lost / hi.sw);
  });

  it("the events tell the moves: switches, doors and boxes come with their lanes and lines", () => {
    let doors = 0;
    for (const id of TRACKS)
      for (const st of [300, 600, 900]) {
        const log = simulateRace(RULESET_V3, field(st), content.getCourse(id), `ev/${st}`);
        for (const d of events(log, "doorClosed")) {
          doors++;
          const sw = events(log, "lineSwitch").find((e) => e.lane === d.lane && e.tick === d.tick);
          expect(sw?.cause).toBe("door");
          expect(sw?.to).toBe(d.line);
          // the one she closed it on had just moved to that line to pass her
          const hers = events(log, "lineSwitch").filter(
            (e) => e.lane === d.otherLane && e.tick < d.tick && e.cause === "pass",
          );
          expect(hers.at(-1)?.to).toBe(d.line);
        }
        for (const b of events(log, "boxedIn")) expect(b.otherLane).not.toBe(b.lane);
        for (const r of log.results)
          expect(r.ledger.flight?.doorsClosed ?? 0).toBeLessThanOrEqual(4);
      }
    expect(doors).toBeGreaterThan(0);
  });

  it("reads the start-of-tick snapshot: lane order never changes a result", () => {
    for (const id of TRACKS)
      for (const E of [crowd, field(600), field(300)]) {
        const a = simulateRace(RULESET_V3, E, content.getCourse(id), "lanes");
        const b = simulateRaceReversed(RULESET_V3, E, content.getCourse(id), "lanes", {
          detail: "full",
        });
        expect(JSON.stringify(b.results)).toBe(JSON.stringify(a.results));
        expect(JSON.stringify(b.frames)).toBe(JSON.stringify(a.frames));
      }
  });

  it("on the ground there are no lines: the outside bit only in the air", () => {
    const log = simulateRace(RULESET_V3, crowd, content.getCourse("canyon"), "ground");
    for (const r of log.frames?.runners ?? [])
      r.flags.forEach((f) => {
        if ((f & RACE_FRAME_FLAGS.lineOut) !== 0)
          expect(f & (RACE_FRAME_FLAGS.altLow | RACE_FRAME_FLAGS.altHigh)).not.toBe(0);
      });
  });
});
