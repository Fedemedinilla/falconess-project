import { loadContent } from "@falconess/content";
import { describe, expect, it } from "vitest";
import { loadRaceFixture, RACE_FIXTURES } from "./__fixtures__/load.js";
import { contentLabels } from "./labels.js";
import type { RaceGeometry, RaceLog, RaceResult } from "./log-view.js";
import {
  barSecondsPerColumn,
  crossingMilliTicks,
  fixed,
  formatMargin,
  formatTime,
  renderRace,
  runnerEvents,
  segmentStrip,
  timelineBar,
} from "./render-race.js";

const labels = contentLabels(loadContent());
const names = Object.keys(RACE_FIXTURES) as (keyof typeof RACE_FIXTURES)[];

function laneOf(log: RaceLog, runnerId: string): number {
  const entry = log.entries.find((e) => e.runnerId === runnerId);
  if (!entry) throw new Error(`no runner ${runnerId}`);
  return entry.laneIndex;
}

function resultOf(log: RaceLog, runnerId: string): RaceResult {
  const result = log.results.find((r) => r.lane === laneOf(log, runnerId));
  if (!result) throw new Error(`no result for ${runnerId}`);
  return result;
}

describe("renderRace snapshots", () => {
  for (const name of names) {
    it(`renders the ${name} fixture`, () => {
      const lines = renderRace(loadRaceFixture(name), labels);
      expect(lines.join("\n")).toMatchSnapshot();
    });
  }

  it("is deterministic and does not mutate the log", () => {
    for (const name of names) {
      const log = loadRaceFixture(name);
      const before = JSON.stringify(log);
      const a = renderRace(log, labels).join("\n");
      const b = renderRace(log, labels).join("\n");
      expect(a).toBe(b);
      expect(JSON.stringify(log)).toBe(before);
    }
  });
});

describe("header: segment strip", () => {
  it("scales one char per segment type to the course length", () => {
    const ridge = segmentStrip(loadRaceFixture("ridge").geometry);
    // 50 m per char: flat 300, descent 400, jump 100, flat 400, descent 300, jump 80, flat 420.
    expect(ridge).toEqual({
      strip: `______${"\\".repeat(8)}^^________${"\\".repeat(6)}^^________`,
      unitM: 50,
    });
    const sprint = segmentStrip(loadRaceFixture("sprint").geometry);
    expect(sprint.unitM).toBe(25);
    expect(sprint.strip).toBe(
      `${"_".repeat(12)}${")".repeat(8)}${"_".repeat(12)}${")".repeat(6)}${"_".repeat(10)}`,
    );
    expect(segmentStrip(loadRaceFixture("canyon").geometry).strip).toBe(
      `${"_".repeat(8)}${"/".repeat(10)}${"|".repeat(12)}${"_".repeat(10)}${"|".repeat(8)}~~~~${"_".repeat(8)}`,
    );
  });

  it("never drops a segment shorter than half a char", () => {
    const geometry: RaceGeometry = {
      lengthMm: 3_000_000,
      startEndMm: 500_000,
      finalStartMm: 2_000_000,
      segments: [
        { type: "flat", startMm: 0, endMm: 2_985_000 },
        { type: "jump", startMm: 2_985_000, endMm: 3_000_000 },
      ],
    };
    expect(segmentStrip(geometry).strip).toBe(`${"_".repeat(60)}^`);
  });

  it("prints course name, length, biome, seed, ruleset and a legend of the types present", () => {
    const [title, strip, legend] = renderRace(loadRaceFixture("ridge"), labels);
    expect(title).toBe(
      "Cresta del Espinazo · 2000 m · Desierto · semilla pt1-ridge · ruleset v1 · motor v1",
    );
    expect(strip).toContain("1 car = 50 m");
    expect(legend?.trim()).toBe("_ Llano  \\ Bajada  ^ Salto");
  });
});

describe("classification", () => {
  it("formats finish times with two decimals from finishMilli", () => {
    const log = loadRaceFixture("sprint");
    // 619 842 milli-ticks / 15 000 = 41.3228 s
    expect(formatTime(resultOf(log, "rival-1"))).toBe("41.32 s");
    expect(formatTime(resultOf(log, "player"))).toBe("42.38 s");
  });

  it("formats margins in metres from the log's marginMm", () => {
    const log = loadRaceFixture("sprint");
    expect(formatMargin(resultOf(log, "rival-1"))).toBe("—");
    expect(formatMargin(resultOf(log, "player"))).toBe("+35.60 m"); // 35 601 mm
    expect(formatMargin(resultOf(log, "rival-2"))).toBe("+26.78 m"); // 26 782 mm
    const second = resultOf(log, "player");
    expect(formatMargin({ ...second, marginMm: 0, deadHeat: true })).toBe("empate");
    expect(formatMargin({ ...second, marginMm: 5, deadHeat: false })).toBe("+0.01 m");
  });

  it("lists runners in place order with frame, manufacturer and style, the player marked", () => {
    const lines = renderRace(loadRaceFixture("sprint"), labels);
    const start = lines.indexOf("CLASIFICACIÓN");
    const rows = lines.slice(start + 2, start + 5);
    expect(rows[0]).toMatch(/^ {3}1 {2}rival-1 +41\.32 s +— {2}Étoile · Lumière Aéronef · Picada$/);
    expect(rows[1]).toMatch(
      /^ {2}»2 {2}Peregrina +42\.38 s +\+35\.60 m {2}Shiden Kaminari \(firma de Peregrina\) · Kōryū Racing · Picada$/,
    );
    expect(rows[2]).toMatch(/^ {3}3 {2}rival-2 +43\.20 s +\+26\.78 m/);
  });

  it("prints a DNF line without time or margin, and fixture ids content does not know", () => {
    const log = loadRaceFixture("dnf");
    const dnf = resultOf(log, "neutral-hover-1");
    expect(dnf.dnf).toBe(true);
    expect(formatTime(dnf)).toBe("DNF");
    expect(formatMargin(dnf)).toBe("");
    const lines = renderRace(log, labels);
    expect(lines).toContain(
      "   2  neutral-hover-1       DNF          fixture-neutral · none · Suspensión",
    );
    expect(lines).toContain("  2º neutral-hover-1  DNF");
    expect(lines).toContain('  (sin frames: detail "results")');
    expect(lines).toContain('  (sin eventos: detail "results")');
  });
});

describe("timeline", () => {
  it("interpolates each 10 % mark between the sampled rows around it", () => {
    const log = loadRaceFixture("sprint");
    const marks = crossingMilliTicks(log, laneOf(log, "player"));
    expect(marks).toHaveLength(10);
    // 10 % = 120 000 mm between row 75 (100 686 mm) and row 90 (123 792 mm):
    // 75 + (120 000 − 100 686) × 15 / 23 106 = 87.538 ticks.
    expect(marks[0]).toBe(87_538);
    // 50 % = 600 000 mm between row 360 (588 475 mm) and row 375 (619 217 mm).
    expect(marks[4]).toBe(365_623);
    // 100 % is the exact finishMilli of the results.
    expect(marks[9]).toBe(resultOf(log, "player").finishMilli);
    const sorted = [...marks].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(marks).toEqual(sorted);
  });

  it("returns null for marks never reached and nothing without frames", () => {
    const log = loadRaceFixture("sprint");
    const lane = laneOf(log, "player");
    const frames = log.frames;
    if (!frames) throw new Error("fixture has frames");
    const cut: RaceLog = {
      ...log,
      results: log.results.map((r) =>
        r.lane === lane ? { ...r, finishMilli: null, dnf: true, marginMm: null } : r,
      ),
      frames: {
        tick: [0, 15, 30],
        runners: frames.runners.map((r, i) =>
          i === lane ? { posMm: [0, 60_000, 130_000], boost: [0, 0, 0], flags: [0, 0, 0] } : r,
        ),
      },
    };
    const marks = crossingMilliTicks(cut, lane);
    // 120 000 mm: 15 + (120 000 − 60 000) × 15 / 70 000 = 27.857 ticks.
    expect(marks[0]).toBe(27_857);
    expect(marks.slice(1)).toEqual(Array(9).fill(null));
    expect(crossingMilliTicks(loadRaceFixture("dnf"), 0)).toEqual([]);
  });

  it("prints the crossing table in seconds with one decimal", () => {
    const lines = renderRace(loadRaceFixture("sprint"), labels);
    const header = lines.findIndex((l) => l.startsWith("LÍNEA DE TIEMPO"));
    expect(lines[header + 1]).toMatch(/10%\s+20%.*100%$/);
    expect(lines[header + 3]).toMatch(/^ {2}Peregrina {2}5\.8 .* 24\.4 .* 42\.4$/);
  });

  it("draws one bar column per whole second slice, with the race events visible", () => {
    const sprint = loadRaceFixture("sprint");
    expect(barSecondsPerColumn(sprint.ticks)).toBe(1);
    expect(barSecondsPerColumn(1377)).toBe(2);
    expect(barSecondsPerColumn(2046)).toBe(3);
    for (const name of ["sprint", "ridge", "canyon"] as const) {
      const log = loadRaceFixture(name);
      const width = Math.ceil(log.ticks / (barSecondsPerColumn(log.ticks) * 15));
      for (const e of log.entries) expect(timelineBar(log, e.laneIndex)).toHaveLength(width);
    }
    // Pulse frame: bursts show as `*`; étoile empties before the line: `_` then the finish `|`.
    expect(timelineBar(sprint, laneOf(sprint, "player")).startsWith("*")).toBe(true);
    expect(timelineBar(sprint, laneOf(sprint, "rival-1"))).toMatch(/_+\| *$/);
    const ridge = loadRaceFixture("ridge");
    // The failed jump at tick 482 stalls 20 ticks: the slice holding row 495 (col 16 of 2 s).
    expect(timelineBar(ridge, laneOf(ridge, "neutral-hover-1"))[16]).toBe("x");
    expect(timelineBar(ridge, laneOf(ridge, "neutral-dive-1"))).toContain("^^");
    const canyon = loadRaceFixture("canyon");
    // falke overheats in the kick until the line; light plan boost (0.18 m/s) shows as `+`.
    expect(timelineBar(canyon, laneOf(canyon, "rival-1"))).toMatch(/\+{5,}!\| *$/);
    expect(timelineBar(canyon, laneOf(canyon, "player"))).toMatch(/\*_+\|/);
    expect(timelineBar(loadRaceFixture("dnf"), 0)).toBe("");
  });
});

describe("events", () => {
  it("keeps each runner's events in time order and groups consecutive pulses", () => {
    for (const name of ["sprint", "ridge", "canyon"] as const) {
      const log = loadRaceFixture(name);
      for (const e of log.entries) {
        const ticks = runnerEvents(log, e.laneIndex, labels).map((l) => l.tick);
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
      }
    }
    const sprint = loadRaceFixture("sprint");
    const texts = runnerEvents(sprint, laneOf(sprint, "player"), labels).map((l) => l.text);
    expect(texts[0]).toBe("pulsos ×3 hasta 5.6 s · cadena máx 3");
    expect(texts).toContain("falla Trazadora de curvas (u 912 ≥ p 859)");
    expect(texts).toContain("habilidad Último suspiro (p 787 > u 214)");
    expect(texts.at(-1)).toBe("meta 2º");
  });

  it("explains a failed jump, a landing and the plans of the 25-energy hover", () => {
    const ridge = loadRaceFixture("ridge");
    const texts = runnerEvents(ridge, laneOf(ridge, "neutral-hover-1"), labels).map((l) => l.text);
    expect(texts).toEqual([
      "salto FALLIDO (lift 18.8 < 20.0) · -25.0 durabilidad · 20 ticks detenida",
      "plan de sprint #1 (phase): ninguno (no-energy)",
      "salto OK (lift 18.8 ≥ 15.0)",
      "aterrizaje -4.00 m/s",
      "plan de sprint #2 (jump): ninguno (no-energy)",
      "meta 4º",
    ]);
  });

  it("shows hp-empty position, broken wings, water, heat conversion and overheat spans", () => {
    const canyon = loadRaceFixture("canyon");
    const player = runnerEvents(canyon, laneOf(canyon, "player"), labels);
    const empty = player.find((l) => l.text.startsWith("hp agotada"));
    expect(empty?.posMm).toBe(resultOf(canyon, "player").ledger.hpEmptyMm);
    expect(player.map((l) => l.text)).toEqual(
      expect.arrayContaining([
        "agua -10.0 durabilidad",
        "alas rotas (P/W 1.05)",
        "plan de sprint #2 (broken): ninguno (exhausted)",
      ]),
    );
    const falke = runnerEvents(canyon, laneOf(canyon, "rival-1"), labels).map((l) => l.text);
    expect(falke).toContain("sobrecalentada hasta el final (calor 54.0)");
    const horizon = runnerEvents(canyon, laneOf(canyon, "rival-2"), labels).map((l) => l.text);
    expect(horizon).toContain("calor a energía: 72.0 calor → +36.0 energía");
  });

  it("pairs overheat on and off events into one span", () => {
    const canyon = loadRaceFixture("canyon");
    const lane = laneOf(canyon, "rival-1");
    const events = canyon.events ?? [];
    const on = events.find((e) => e.lane === lane && e.kind === "overheat");
    if (!on) throw new Error("fixture has an overheat");
    const log: RaceLog = {
      ...canyon,
      events: [...events, { ...on, kind: "overheat", on: false, heat: 51_000, tick: on.tick + 4 }],
    };
    const texts = runnerEvents(log, lane, labels).map((l) => l.text);
    expect(texts).toContain("sobrecalentada 4 ticks (calor 54.0 → 51.0)");
  });
});

describe("why", () => {
  it("prints per-phase times with the difference to the winner from the ledger", () => {
    const log = loadRaceFixture("sprint");
    const lines = renderRace(log, labels);
    const i = lines.indexOf("  2º Peregrina  42.38 s  (+1.06 s)");
    expect(i).toBeGreaterThan(0);
    // phaseTicks 141/318/177 vs the winner's 140/303/177.
    expect(lines[i + 1]).toBe(
      "     fases        salida 9.40 s (+0.07) · medio 21.20 s (+1.00) · final 11.80 s (+0.00)",
    );
    const winner = resultOf(log, "rival-1").ledger.phaseTicks;
    const player = resultOf(log, "player").ledger.phaseTicks;
    expect(winner).toEqual([140, 303, 177]);
    expect(player).toEqual([141, 318, 177]);
  });

  it("lists sinks and gains: stall, exhaustion, landings, overheat, unused energy, modes", () => {
    const text = (name: keyof typeof RACE_FIXTURES) => renderRace(loadRaceFixture(name), labels);
    expect(text("ridge")).toContain(
      "     pérdidas   detenida 1.33 s (1 salto(s) fallido(s)) · 1 aterrizaje(s) -4.00 m/s en total",
    );
    const canyon = text("canyon");
    expect(canyon).toContain(
      "     pérdidas     agotada en 2249 m (751 m a velocidad mínima) · energía sin usar 13.6",
    );
    expect(canyon).toContain("     pérdidas     sobrecalor 6 ticks · energía sin usar 3.0");
    expect(canyon).toContain(
      "     modos        glide-chase ×4 → preheat → hold → plan 1.20 → kick",
    );
    expect(text("sprint")).toContain("     modos        regen-overflow ×148 → plan 3.08 → kick");
  });

  it("falls back to the ledger's skill lists without events", () => {
    const sprint = loadRaceFixture("sprint");
    const { frames: _f, events: _e, ...rest } = sprint;
    const lines = renderRace(rest, labels);
    expect(lines).toContain("     habilidades  ✓ Salida limpia");
    expect(lines).toContain(
      "     habilidades  ✓ Trazadora de curvas · ✓ Último suspiro · ✗ Trazadora de curvas",
    );
  });
});

describe("fixed", () => {
  it("rounds half away from zero with integer arithmetic", () => {
    expect(fixed(619_842, 15_000, 2)).toBe("41.32");
    expect(fixed(5, 1000, 2)).toBe("0.01");
    expect(fixed(4, 1000, 2)).toBe("0.00");
    expect(fixed(-1, 15, 2)).toBe("-0.07");
    expect(fixed(-1, 1000, 2)).toBe("0.00");
    expect(fixed(1400, 1000, 0)).toBe("1");
    expect(fixed(1500, 1000, 0)).toBe("2");
  });
});
