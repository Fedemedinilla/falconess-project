import { loadContent } from "@falconess/content";
import { neutralFixtureEntry } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { loadRaceFixture, RACE_FIXTURES, type RaceFixtureName } from "./__fixtures__/load.js";
import { contentLabels } from "./labels.js";
import {
  type BoostMode,
  RACE_FRAME_FLAGS,
  type RaceEvent,
  type RaceGeometry,
  type RaceLog,
  type RaceResult,
} from "./log-view.js";
import {
  barSecondsPerColumn,
  compressSequence,
  crossingMilliTicks,
  fixed,
  formatMargin,
  formatTime,
  renderRace,
  runnerEvents,
  segmentStrip,
  timelineBar,
} from "./render-race.js";

// The fixtures are real engine logs (see __fixtures__/load.ts). Expectations read their numbers
// from the log itself, so regenerating them after an engine change only refreshes the snapshots.

const labels = contentLabels(loadContent());
const names = Object.keys(RACE_FIXTURES) as RaceFixtureName[];
const full = ["sprint", "ridge", "canyon"] as const;

function laneOf(log: RaceLog, runnerId: string): number {
  const entry = log.entries.find((e) => e.runnerId === runnerId);
  if (!entry) throw new Error(`no runner ${runnerId}`);
  return entry.laneIndex;
}

function resultOf(log: RaceLog, lane: number): RaceResult {
  const result = log.results.find((r) => r.lane === lane);
  if (!result) throw new Error(`no result for lane ${lane}`);
  return result;
}

function eventsOf<K extends RaceEvent["kind"]>(log: RaceLog, kind: K): (RaceEvent & { kind: K })[] {
  return (log.events ?? []).filter((e): e is RaceEvent & { kind: K } => e.kind === kind);
}

const nameOf = (log: RaceLog, lane: number) => {
  const entry = log.entries[lane];
  if (!entry) throw new Error(`no entry in lane ${lane}`);
  return labels.runnerName(entry);
};
const texts = (log: RaceLog, lane: number) => runnerEvents(log, lane, labels).map((l) => l.text);
const tenths = (milli: number) => fixed(milli, 1000, 1);
/** The log with every runner's broken-wing speed factor set (`derived.brokenSpeedPm`, 8.4). */
const slowBroken = (log: RaceLog, brokenSpeedPm: number): RaceLog => ({
  ...log,
  derived: log.derived.map((d) => ({ ...d, brokenSpeedPm })),
});

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

describe("header", () => {
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
      hoverAttackMm: 2_400_000,
      reserveAtMm: 2_940_000,
      denseFromMm: 2_975_000,
      segments: [
        { type: "flat", startMm: 0, endMm: 2_985_000, param: 0 },
        { type: "jump", startMm: 2_985_000, endMm: 3_000_000, param: 20_000 },
      ],
    };
    expect(segmentStrip(geometry).strip).toBe(`${"_".repeat(60)}^`);
  });

  it("prints course name, length, seed, ruleset and a legend of the types present", () => {
    const [title, strip, legend, phases] = renderRace(loadRaceFixture("ridge"), labels);
    expect(title).toBe(
      "Pista de saltos · 2000 m · semilla pt1-ridge · ruleset v1 · motor v1",
    );
    expect(strip).toContain("1 car = 50 m");
    expect(legend?.trim()).toBe("_ Llano  \\ Bajada  ^ Salto");
    expect(phases?.trim()).toBe(
      "fases: salida hasta 333 m · medio hasta 1333 m · final hasta 2000 m",
    );
  });

});

describe("classification", () => {
  const sprint = loadRaceFixture("sprint");
  const second = sprint.results[1];
  if (!second) throw new Error("the sprint has eight results");

  it("formats finish times with two decimals from finishMilli", () => {
    // 619 842 milli-ticks / 15 000 = 41.3228 s
    expect(formatTime({ ...second, finishMilli: 619_842 })).toBe("41.32 s");
    expect(formatTime({ ...second, finishMilli: 15_075 })).toBe("1.01 s");
    expect(formatTime({ ...second, dnf: true, finishMilli: null })).toBe("DNF");
  });

  it("formats margins in metres from the log's marginMm", () => {
    expect(formatMargin({ ...second, place: 1, marginMm: 0 })).toBe("—");
    expect(formatMargin({ ...second, marginMm: 35_601, deadHeat: false })).toBe("+35.60 m");
    expect(formatMargin({ ...second, marginMm: 0, deadHeat: true })).toBe("empate");
    expect(formatMargin({ ...second, marginMm: 5, deadHeat: false })).toBe("+0.01 m");
  });

  it("lists runners in place order with frame, manufacturer and style, the player marked", () => {
    for (const name of full) {
      const log = loadRaceFixture(name);
      const lines = renderRace(log, labels);
      const start = lines.indexOf("CLASIFICACIÓN");
      log.results.forEach((r, k) => {
        const entry = log.entries[r.lane];
        if (!entry) throw new Error("entry per result");
        const row = lines[start + 2 + k] ?? "";
        const mark = entry.kind === "player" ? "»" : " ";
        expect(row.startsWith(`  ${mark}${r.place}  ${labels.runnerName(entry)} `)).toBe(true);
        expect(row).toContain(` ${formatTime(r)} `);
        expect(
          row.endsWith(
            `${labels.frameName(entry.frameId)} · ${labels.manufacturerName(entry.manufacturer)} · ${labels.styleName(entry.style)}`,
          ),
        ).toBe(true);
      });
    }
    const canyon = renderRace(loadRaceFixture("canyon"), labels);
    expect(canyon).toContain(
      "  »2  Peregrina  109.66 s   +83.45 m  Shiden Kaminari (firma de Peregrina) · Kōryū Racing · Picada",
    );
  });

  it("prints a DNF line without time or margin, and fixture ids content does not know", () => {
    const log = loadRaceFixture("results");
    const last = log.results[log.results.length - 1];
    if (!last) throw new Error("results");
    const dnfLog: RaceLog = {
      ...log,
      entries: log.entries.map((e) =>
        e.laneIndex === last.lane
          ? neutralFixtureEntry({
              runnerId: "neutral-hover-1",
              laneIndex: e.laneIndex,
              style: "hover",
              stats: e.stats,
            })
          : e,
      ),
      results: log.results.map((r) =>
        r === last
          ? {
              ...r,
              dnf: true,
              finishMilli: null,
              timeTicks: null,
              marginMm: null,
              vFinishMms: null,
            }
          : r,
      ),
    };
    const lines = renderRace(dnfLog, labels);
    expect(lines.find((l) => l.startsWith(`   ${last.place}  neutral-hover-1 `))).toMatch(
      / {2}neutral-hover-1 +DNF +fixture-neutral · none · Suspensión$/,
    );
    expect(lines).toContain(`  ${last.place}º neutral-hover-1  DNF`);
    expect(lines).toContain('  (sin frames: detail "results")');
    expect(lines).toContain('  (sin eventos: detail "results")');
  });
});

describe("timeline", () => {
  it("interpolates each 10 % mark between the sampled rows around it", () => {
    for (const name of full) {
      const log = loadRaceFixture(name);
      const frames = log.frames;
      if (!frames) throw new Error("full fixture");
      for (const { laneIndex: lane } of log.entries) {
        const marks = crossingMilliTicks(log, lane);
        const pos = frames.runners[lane]?.posMm ?? [];
        expect(marks).toHaveLength(10);
        expect(marks[9]).toBe(resultOf(log, lane).finishMilli);
        expect(marks).toEqual([...marks].sort((a, b) => (a ?? 0) - (b ?? 0)));
        for (let k = 1; k <= 9; k++) {
          const mark = Math.floor((k * log.geometry.lengthMm) / 10);
          const i = pos.findIndex((p) => p >= mark);
          const t0 = frames.tick[i - 1] ?? 0;
          const t1 = frames.tick[i] ?? 0;
          expect(marks[k - 1]).toBeGreaterThanOrEqual(1000 * t0);
          expect(marks[k - 1]).toBeLessThanOrEqual(1000 * t1);
        }
      }
    }
  });

  it("returns null for marks never reached and nothing without frames", () => {
    const log = loadRaceFixture("sprint");
    const lane = laneOf(log, "player");
    const frames = log.frames;
    if (!frames) throw new Error("fixture has frames");
    const flat = [0, 0, 0];
    const cut: RaceLog = {
      ...log,
      results: log.results.map((r) =>
        r.lane === lane ? { ...r, finishMilli: null, dnf: true, marginMm: null } : r,
      ),
      frames: {
        tick: [0, 15, 30],
        runners: frames.runners.map((r, i) =>
          i === lane
            ? {
                posMm: [0, 60_000, 130_000],
                vMms: flat,
                hp: flat,
                energy: flat,
                heat: flat,
                durability: flat,
                boost: flat,
                flags: flat,
              }
            : r,
        ),
      },
    };
    const marks = crossingMilliTicks(cut, lane);
    // 120 000 mm: 15 + (120 000 − 60 000) × 15 / 70 000 = 27.857 ticks.
    expect(marks[0]).toBe(27_857);
    expect(marks.slice(1)).toEqual(Array(9).fill(null));
    expect(crossingMilliTicks(loadRaceFixture("results"), 0)).toEqual([]);
  });

  it("prints the crossing table in seconds with one decimal", () => {
    const log = loadRaceFixture("sprint");
    const lines = renderRace(log, labels);
    const header = lines.findIndex((l) => l.startsWith("LÍNEA DE TIEMPO"));
    expect(lines[header + 1]).toMatch(/10%\s+20%.*100%$/);
    const winner = log.results[0];
    if (!winner) throw new Error("results");
    const marks = crossingMilliTicks(log, winner.lane).map((m) => fixed(m ?? 0, 15_000, 1));
    expect(lines[header + 2]).toMatch(
      new RegExp(`^ {2}${nameOf(log, winner.lane)} +${marks.join(" +").replaceAll(".", "\\.")}$`),
    );
  });

  it("draws one bar column per whole second slice, with the race events visible", () => {
    expect(barSecondsPerColumn(900)).toBe(1);
    expect(barSecondsPerColumn(1377)).toBe(2);
    expect(barSecondsPerColumn(2046)).toBe(3);
    for (const name of full) {
      const log = loadRaceFixture(name);
      const width = Math.ceil(log.ticks / (barSecondsPerColumn(log.ticks) * 15));
      for (const e of log.entries) {
        const bar = timelineBar(log, e.laneIndex);
        expect(bar).toHaveLength(width);
        expect(bar).toMatch(/^[^|]*\| *$/);
        const result = resultOf(log, e.laneIndex);
        // Pulse frames burst from the start: `*`.
        if ((log.derived[e.laneIndex]?.pulseMms ?? 0) > 0) expect(bar[0]).toBe("*");
        // Airborne over every cleared jump: `^`.
        if (result.ledger.jumpsOk > 0) expect(bar).toContain("^");
        // An overheat shows as `!` however short, unless the finish slice `|` covers it.
        const colTicks = barSecondsPerColumn(log.ticks) * 15;
        const finishTick = Math.ceil((result.finishMilli ?? 0) / 1000);
        const early = eventsOf(log, "overheat").some(
          (o) => o.lane === e.laneIndex && o.on && o.tick + 2 * colTicks <= finishTick,
        );
        if (early) expect(bar).toContain("!");
      }
    }
    // Hover slipstream (`=`) for the ridge's drafting nimbus; exhaustion (`_`) before the line.
    const ridge = loadRaceFixture("ridge");
    expect(timelineBar(ridge, laneOf(ridge, "rival-2"))).toContain("=====");
    const sprint = loadRaceFixture("sprint");
    expect(timelineBar(sprint, sprint.results[0]?.lane ?? 0)).toMatch(/_+\| *$/);
    expect(timelineBar(loadRaceFixture("results"), 0)).toBe("");
  });

  it("marks a stalled slice with `x` and a DNF with `X`", () => {
    const log = loadRaceFixture("ridge");
    const frames = log.frames;
    if (!frames) throw new Error("full fixture");
    const lane = 0;
    const colTicks = barSecondsPerColumn(log.ticks) * 15;
    const stalled = (col: number, flag: number) => ({
      ...frames,
      runners: frames.runners.map((r, i) =>
        i === lane
          ? {
              ...r,
              flags: r.flags.map((f, j) => {
                const t = frames.tick[j] ?? 0;
                return t > col * colTicks && t <= (col + 1) * colTicks ? f | flag : f;
              }),
            }
          : r,
      ),
    });
    expect(timelineBar({ ...log, frames: stalled(10, RACE_FRAME_FLAGS.stalled) }, lane)[10]).toBe(
      "x",
    );
    expect(timelineBar({ ...log, frames: stalled(12, RACE_FRAME_FLAGS.dnf) }, lane)[12]).toBe("X");
    // broken wings: `#`, under stalled and DNF
    expect(timelineBar({ ...log, frames: stalled(14, RACE_FRAME_FLAGS.broken) }, lane)[14]).toBe(
      "#",
    );
    const both = stalled(16, RACE_FRAME_FLAGS.broken | RACE_FRAME_FLAGS.stalled);
    expect(timelineBar({ ...log, frames: both }, lane)[16]).toBe("x");
  });

  it("draws broken wings with `#` from the break to the line, and lists `#` in the legend", () => {
    const canyon = loadRaceFixture("canyon");
    const e = eventsOf(canyon, "durabilityBroken")[0];
    if (!e) throw new Error("the canyon fixture has a break");
    const colTicks = barSecondsPerColumn(canyon.ticks) * 15;
    const bar = timelineBar(canyon, e.lane);
    const firstBroken = bar.indexOf("#");
    expect(firstBroken).toBeGreaterThan(0);
    expect(firstBroken).toBeLessThanOrEqual(Math.ceil((e.tick + 1) / colTicks));
    expect(bar.slice(firstBroken)).toMatch(/^#+\| *$/);
    expect(renderRace(canyon, labels).join("\n")).toContain("# alas rotas");
  });
});

describe("events", () => {
  it("keeps each runner's events in time order, ending with the finish at the line", () => {
    for (const name of full) {
      const log = loadRaceFixture(name);
      for (const e of log.entries) {
        const lines = runnerEvents(log, e.laneIndex, labels);
        const ticks = lines.map((l) => l.tick);
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
        const result = resultOf(log, e.laneIndex);
        const last = lines.at(-1);
        expect(last?.text).toBe(`meta ${result.place}º`);
        expect(last?.milli).toBe(result.finishMilli);
        expect(last?.posMm).toBe(log.geometry.lengthMm);
      }
    }
  });

  it("groups consecutive pulses into one line and counts every pulse", () => {
    const log = loadRaceFixture("sprint");
    for (const { laneIndex: lane } of log.entries) {
      const pulses = eventsOf(log, "pulse").filter((e) => e.lane === lane).length;
      const grouped = texts(log, lane)
        .filter((t) => t.startsWith("pulso"))
        .map((t) => Number(/^pulsos ×(\d+)/.exec(t)?.[1] ?? 1));
      expect(grouped.reduce((a, b) => a + b, 0)).toBe(pulses);
    }
    expect(texts(log, laneOf(log, "player"))[0]).toMatch(
      /^pulsos ×\d+ hasta \d+\.\d s · cadena máx \d+$/,
    );
  });

  it("explains skills with p and u, and names the plan and its replans", () => {
    for (const name of full) {
      const log = loadRaceFixture(name);
      for (const e of eventsOf(log, "skill"))
        expect(texts(log, e.lane)).toContain(
          `habilidad ${labels.skillName(e.skillId)} (p ${e.p} > u ${e.u})${e.activation > 1 ? ` #${e.activation}` : ""}`,
        );
      for (const e of eventsOf(log, "skillMiss"))
        expect(texts(log, e.lane)).toContain(
          `falla ${labels.skillName(e.skillId)} (u ${e.u} ≥ p ${e.p})`,
        );
      for (const e of eventsOf(log, "sprintPlan")) {
        const prefix = e.index === 0 ? "plan de sprint" : `replan ${e.index}`;
        expect(texts(log, e.lane).some((t) => t.startsWith(`${prefix} (${e.cause}): `))).toBe(true);
      }
    }
  });

  it("shows cleared jumps with lift against required, landings, detours and repairs", () => {
    const ridge = loadRaceFixture("ridge");
    const jumps = eventsOf(ridge, "jumpOk");
    expect(jumps.length).toBeGreaterThan(0);
    for (const e of jumps)
      expect(texts(ridge, e.lane)).toContain(
        `salto OK (lift ${tenths(e.lift)} ≥ ${tenths(e.required)})`,
      );
    for (const e of eventsOf(ridge, "landing"))
      expect(texts(ridge, e.lane)).toContain(`aterrizaje -${fixed(e.speedLossMms, 1000, 2)} m/s`);
    for (const e of eventsOf(ridge, "detour"))
      expect(texts(ridge, e.lane)).toContain(`desvío por tierra (tramo ${e.segment + 1})`);
    const repairs = eventsOf(ridge, "repair");
    expect(repairs.length).toBeGreaterThan(0);
    for (const e of repairs)
      expect(texts(ridge, e.lane)).toContain(`reparación +${tenths(e.amount)} durabilidad`);
  });

  it("explains a failed jump (unreachable with v1 content, so the event is added here)", () => {
    const log = loadRaceFixture("ridge");
    const lane = laneOf(log, "rival-1");
    const fail: RaceEvent = {
      kind: "jumpFail",
      tick: 300,
      lane,
      posMm: 700_000,
      lift: 18_800,
      required: 20_000,
      energyBefore: 25_000,
      damage: 25_000,
      stallTicks: 20,
    };
    const one: RaceEvent = { ...fail, stallTicks: 1 };
    expect(texts({ ...log, events: [fail] }, lane)).toEqual([
      "salto FALLIDO (lift 18.8 < 20.0) · -25.0 durabilidad · 20 ticks detenida",
    ]);
    expect(texts({ ...log, events: [one] }, lane)[0]).toMatch(/ · 1 tick detenida$/);
  });

  it("shows hp-empty position, broken wings, water, heat conversion and overheat spans", () => {
    const canyon = loadRaceFixture("canyon");
    for (const r of canyon.results) {
      if (r.ledger.hpEmptyMm === null) continue;
      const empty = runnerEvents(canyon, r.lane, labels).find((l) =>
        l.text.startsWith("hp agotada"),
      );
      expect(empty?.posMm).toBe(r.ledger.hpEmptyMm);
    }
    const broken = eventsOf(canyon, "durabilityBroken");
    expect(broken.length).toBeGreaterThan(0);
    for (const e of broken) {
      const speedPm = canyon.derived[e.lane]?.brokenSpeedPm ?? 1000;
      const speed = speedPm === 1000 ? "" : `, velocidad ×${fixed(speedPm, 1000, 2)}`;
      expect(texts(canyon, e.lane)).toContain(
        `alas rotas (P/W ${fixed(e.powerToWeight, 1000, 2)}${speed})`,
      );
      expect(texts(canyon, e.lane)).toContain("replan 1 (broken): ninguno (exhausted)");
    }
    for (const e of eventsOf(canyon, "waterHit"))
      expect(texts(canyon, e.lane)).toContain(
        e.damage === 0
          ? "terreno líquido sin daño"
          : `terreno líquido -${tenths(e.damage)} durabilidad`,
      );
    const heat = eventsOf(canyon, "heatToEnergy");
    expect(heat.length).toBeGreaterThan(0);
    for (const e of heat)
      expect(texts(canyon, e.lane)).toContain(
        `calor a energía: ${tenths(e.heat)} calor → +${tenths(e.energy)} energía`,
      );
  });

  it("pairs overheat on and off events into one span, or runs it to the finish", () => {
    const canyon = loadRaceFixture("canyon");
    const on = eventsOf(canyon, "overheat").find((e) => e.on);
    if (!on) throw new Error("the canyon fixture has an overheat");
    const off: RaceEvent = { ...on, on: false, heat: 51_000, tick: on.tick + 4 };
    expect(texts({ ...canyon, events: [on, off] }, on.lane)).toEqual([
      `sobrecalentada 4 ticks (calor ${tenths(on.heat)} → 51.0)`,
    ]);
    expect(texts({ ...canyon, events: [on] }, on.lane)).toEqual([
      `sobrecalentada hasta el final (calor ${tenths(on.heat)})`,
    ]);
  });
});

describe("why", () => {
  it("prints per-phase times with the difference to the winner from the ledger", () => {
    const log = loadRaceFixture("sprint");
    const [winner, second] = log.results;
    if (!winner || !second || winner.finishMilli === null || second.finishMilli === null)
      throw new Error("results");
    const lines = renderRace(log, labels);
    const gap = fixed(second.finishMilli - winner.finishMilli, 15_000, 2);
    const i = lines.indexOf(`  2º ${nameOf(log, second.lane)}  ${formatTime(second)}  (+${gap} s)`);
    expect(i).toBeGreaterThan(0);
    const phase = (k: number, name: string) => {
      const t = second.ledger.phaseTicks[k] ?? 0;
      const d = fixed(t - (winner.ledger.phaseTicks[k] ?? 0), 15, 2);
      return `${name} ${fixed(t, 15, 2)} s (${d.startsWith("-") ? d : `+${d}`})`;
    };
    expect(lines[i + 1]).toBe(
      `     fases        ${phase(0, "salida")} · ${phase(1, "medio")} · ${phase(2, "final")}`,
    );
  });

  it("lists sinks from the ledger: exhaustion, landings, detours, overheat, unused energy", () => {
    const sinks = (name: (typeof full)[number]) => {
      const log = loadRaceFixture(name);
      const lines = renderRace(log, labels);
      return { log, lines: lines.filter((l) => l.startsWith("     pérdidas ")) };
    };
    const canyon = sinks("canyon");
    canyon.log.results.forEach((r, k) => {
      const line = canyon.lines[k] ?? "";
      const L = r.ledger;
      if (L.hpEmptyMm !== null)
        expect(line).toContain(
          `agotada en ${fixed(L.hpEmptyMm, 1000, 0)} m (${fixed(canyon.log.geometry.lengthMm - L.hpEmptyMm, 1000, 0)} m a velocidad mínima)`,
        );
      if (L.overheatTicks > 0) expect(line).toContain(`sobrecalor ${L.overheatTicks} tick`);
      if (L.energyLeft > 0) expect(line).toContain(`energía sin usar ${tenths(L.energyLeft)}`);
      const broke = eventsOf(canyon.log, "durabilityBroken").find((e) => e.lane === r.lane);
      const pw = canyon.log.entries[r.lane]?.powerToWeight ?? 0;
      const speedPm = canyon.log.derived[r.lane]?.brokenSpeedPm ?? 1000;
      if (broke) {
        const costs = [
          ...(broke.powerToWeight === pw
            ? []
            : [`P/W ${fixed(pw, 1000, 2)} → ${fixed(broke.powerToWeight, 1000, 2)}`]),
          ...(speedPm === 1000 ? [] : [`velocidad ×${fixed(speedPm, 1000, 2)}`]),
        ];
        expect(line).toContain(
          `alas rotas en ${fixed(broke.posMm, 1000, 0)} m${costs.length > 0 ? ` (${costs.join(", ")})` : ""}`,
        );
      } else expect(line).not.toContain("alas rotas");
    });
    expect(canyon.lines.filter((l) => l.includes("alas rotas en "))).not.toEqual([]);
    const ridge = sinks("ridge");
    ridge.log.results.forEach((r, k) => {
      const line = ridge.lines[k] ?? "";
      const L = r.ledger;
      if (L.jumpsOk > 0)
        expect(line).toContain(
          `${L.jumpsOk} aterrizaje(s) -${fixed(L.landingLossMms, 1000, 2)} m/s en total`,
        );
      if (L.detours > 0) expect(line).toContain(`${L.detours} desvío(s) por tierra`);
    });
  });

  it("compresses the boost-mode churn into repeated blocks", () => {
    for (const name of full) {
      for (const line of renderRace(loadRaceFixture(name), labels)) {
        if (!line.startsWith("     modos ")) continue;
        expect(line.split(" → ").length).toBeLessThanOrEqual(15);
      }
    }
    // Real v1 logs no longer churn (ADR-0003 D54 hysteresis), so build a churny log by hand: lane
    // 0 of the canyon log alternates regen-overflow and a ground-constant level twelve times, then
    // plans and kicks. Its own boostMode events are replaced; every other event stays.
    const log = loadRaceFixture("canyon");
    const mode = (tick: number, m: BoostMode, levelMms = 0): RaceEvent => ({
      kind: "boostMode",
      tick,
      lane: 0,
      posMm: tick * 20_000,
      mode: m,
      levelMms,
    });
    const churn: RaceEvent[] = [];
    for (let i = 1; i <= 12; i++) {
      churn.push(mode(30 * i - 15, "regen-overflow"), mode(30 * i, "ground-constant", 1_310));
    }
    churn.push(mode(400, "off"), mode(1_035, "plan", 2_608), mode(1_606, "kick"));
    const events = [
      ...(log.events ?? []).filter((e) => e.lane !== 0 || e.kind !== "boostMode"),
      ...churn,
    ].sort((a, b) => a.tick - b.tick || a.lane - b.lane);
    const modes = renderRace({ ...log, events }, labels).filter((l) => l.startsWith("     modos "));
    expect(modes).toContain(
      `     modos        (regen-overflow → ground-constant 1.31) ×12 → plan 2.61 → kick`,
    );
  });

  it("keeps one label column for every runner", () => {
    const lines = renderRace(loadRaceFixture("canyon"), labels);
    const why = lines.slice(lines.findIndex((l) => l.startsWith("POR QUÉ")) + 1);
    for (const line of why.filter((l) => l.startsWith("     "))) {
      expect(line.slice(16, 18)).toBe("  ");
      expect(line[18]).not.toBe(" ");
    }
  });

  it("falls back to the ledger's skill lists without events", () => {
    const log = loadRaceFixture("results");
    const lines = renderRace(log, labels);
    for (const r of log.results) {
      const list = [
        ...r.ledger.skillsActivated.map((id) => `✓ ${labels.skillName(id)}`),
        ...r.ledger.skillsMissed.map((id) => `✗ ${labels.skillName(id)}`),
      ];
      if (list.length > 0) expect(lines).toContain(`     habilidades  ${list.join(" · ")}`);
    }
  });

  it("names broken wings without a break event: from the start, or without events", () => {
    const canyon = loadRaceFixture("canyon");
    const lane = canyon.results[0]?.lane ?? 0;
    const sinksOf = (log: RaceLog) =>
      renderRace(log, labels).filter((l) => l.startsWith("     pérdidas "))[0] ?? "";
    const broken = (log: RaceLog, durabilityStart: number): RaceLog => ({
      ...log,
      entries: log.entries.map((e) => (e.laneIndex === lane ? { ...e, durabilityStart } : e)),
      results: log.results.map((r) => (r.lane === lane ? { ...r, broken: true } : r)),
      ...(log.events
        ? { events: log.events.filter((e) => e.kind !== "durabilityBroken" || e.lane !== lane) }
        : {}),
    });
    expect(sinksOf(broken(canyon, 0))).toMatch(/alas rotas desde la salida( ·|$)/);
    const { events: _events, frames: _frames, ...results } = canyon;
    const noEvents: RaceLog = { ...results, detail: "results" };
    expect(sinksOf(broken(noEvents, 50))).toMatch(/alas rotas( ·|$)/);
    // v1 breaks wings through `derived.brokenSpeedPm` (ADR-0003 D56): both cases name the factor
    expect(sinksOf(slowBroken(broken(canyon, 0), 750))).toContain(
      "alas rotas desde la salida (velocidad ×0.75)",
    );
    expect(sinksOf(slowBroken(broken(noEvents, 50), 750))).toMatch(
      /alas rotas \(velocidad ×0\.75\)( ·|$)/,
    );
  });

  it("names the broken-wing speed factor of `derived` when the PW does not change (v1, ADR-0003 D56)", () => {
    const canyon = loadRaceFixture("canyon");
    const e = eventsOf(canyon, "durabilityBroken")[0];
    if (!e) throw new Error("the canyon fixture has a break");
    const pw = canyon.entries[e.lane]?.powerToWeight ?? 0;
    // the v1 shape: the event keeps the PW (durabilityZeroPowerMult 1000), the factor does the cost
    const v1 = slowBroken(
      {
        ...canyon,
        events: (canyon.events ?? []).map((x) => (x === e ? { ...e, powerToWeight: pw } : x)),
      },
      750,
    );
    expect(texts(v1, e.lane)).toContain(`alas rotas (P/W ${fixed(pw, 1000, 2)}, velocidad ×0.75)`);
    const line = renderRace(v1, labels).filter((l) => l.startsWith("     pérdidas "))[
      v1.results.findIndex((r) => r.lane === e.lane)
    ];
    expect(line).toContain(`alas rotas en ${fixed(e.posMm, 1000, 0)} m (velocidad ×0.75)`);
    // both routes at once: PW before → after, then the factor
    const both = slowBroken(canyon, 750);
    const bothLine = renderRace(both, labels).filter((l) => l.startsWith("     pérdidas "))[
      both.results.findIndex((r) => r.lane === e.lane)
    ];
    expect(bothLine).toContain(
      `(P/W ${fixed(pw, 1000, 2)} → ${fixed(e.powerToWeight, 1000, 2)}, velocidad ×0.75)`,
    );
  });
});

describe("compressSequence", () => {
  it("run-lengths repeated items and repeated blocks of up to four", () => {
    expect(compressSequence([])).toEqual([]);
    expect(compressSequence(["a", "a", "a", "b"])).toEqual(["a ×3", "b"]);
    expect(compressSequence(["a", "b", "a", "b", "a", "c"])).toEqual(["(a → b) ×2", "a", "c"]);
    expect(compressSequence(["x", "a", "b", "c", "a", "b", "c"])).toEqual(["x", "(a → b → c) ×2"]);
    // a tie in coverage keeps the shorter block
    expect(compressSequence(["a", "a", "a", "a"])).toEqual(["a ×4"]);
  });

  it("keeps the first seven and the last four parts of a long sequence", () => {
    const items = Array.from({ length: 20 }, (_, i) => `m${i}`);
    expect(compressSequence(items)).toEqual([
      "m0",
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "… 9 más",
      "m16",
      "m17",
      "m18",
      "m19",
    ]);
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
