/**
 * PROTOTYPE «3 + 1» (owner 2026-11-13): crews at one training, bonus by bond («sintonía»).
 * Runs seasons for each config × Falconess × policy and prints one JSON line per cell.
 *   tsx apps/cli/src/proto/bond.ts <runs> <configJson> [seedPrefix] [difficulty]
 * Policies: «atenta» (ignores crews, today's reference) and «sigue» (trains with the crews when
 * the stat is still needed and the crew's training pays more; goes out with the crew she is
 * closest to sintonía with).
 */
import { loadSeasonContent } from "@falconess/content";
import type { RunInput, SeasonState, TrainingKind } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { advanceSeason, getRuleset, hangarManufacturers, startSeason, trainingGain } from "@falconess/sim";
import { ATTENTIVE_COURAGE, ATTENTIVE_TECHNIQUE, attentivePolicy, intendedBuild, REFERENCE_HANGAR } from "../policy.js";

type Config = {
  name: string;
  sync?: { basePm: number; minBond: number; syncPm: number };
  bondPerTraining?: number;
  bondPerOuting?: number;
  presenceBase?: number;
};
const RUNS = Number(process.argv[2] ?? 100);
const cfg: Config = JSON.parse(process.argv[3] ?? '{"name":"hoy"}');
const PREFIX = process.argv[4] ?? "bp";
const DIFF = process.argv[5] ?? "normal";

const content = loadSeasonContent("v3");
const base = getRuleset("v3");
const season = {
  ...base.season,
  ...(cfg.bondPerTraining !== undefined ? { bondPerTraining: cfg.bondPerTraining } : {}),
  ...(cfg.bondPerOuting !== undefined ? { bondPerOuting: cfg.bondPerOuting } : {}),
  ...(cfg.presenceBase !== undefined ? { crewPresenceBase: cfg.presenceBase } : {}),
  ...(cfg.sync ? { crewSync: cfg.sync } : {}),
};
const ctx: SimContext = { ruleset: { ...base, season }, content };
const minBond = cfg.sync?.minBond ?? 1e9;

const STAT_OF: Record<string, keyof SeasonState["stats"]> = {
  "train:agility": "agility",
  "train:stamina": "stamina",
  "train:technique": "technique",
  "train:risk-flight": "courage",
};

/** Whether a stat is still below its share of the build (Agility always is, under its cap). */
function needed(state: SeasonState, kind: TrainingKind): boolean {
  const s = state.stats;
  const cap = DIFF === "exigente" ? 1200 : 900;
  const stat = STAT_OF[kind];
  if (!stat) return false;
  if (s[stat] >= cap) return false;
  if (stat === "agility") return true;
  const b = intendedBuild(ctx, state);
  const target = stat === "stamina" ? b.stamina : stat === "technique" ? ATTENTIVE_TECHNIQUE : ATTENTIVE_COURAGE;
  return s[stat] * 1000 < Math.max(1, s.agility) * target;
}

function follows(c: SimContext, state: SeasonState): RunInput {
  const input = attentivePolicy(c, state);
  if (input.kind === "outing") {
    // the crew closest to sintonía (still under it), else the default
    const crews = hangarManufacturers(c, { hangar: state.hangar } as never)
      .filter((m) => (state.bond[m] ?? 0) < minBond)
      .sort((a, b) => (state.bond[b] ?? 0) - (state.bond[a] ?? 0));
    return crews[0] ? { ...input, manufacturer: crews[0] } : input;
  }
  const target = input.kind as TrainingKind;
  if (!STAT_OF[target]) return input; // rest, simulator, workshop, event: as she would
  const value = (k: TrainingKind) => {
    const stat = STAT_OF[k];
    return stat ? trainingGain(c, state, k, stat) : 0;
  };
  let best = target;
  let bestValue = value(target) * 1.1; // her plan, unless a crew pays clearly more
  for (const k of Object.keys(STAT_OF) as TrainingKind[]) {
    if (k === target || k === "train:risk-flight") continue;
    if ((state.crewPresence[k] ?? []).length === 0 || !needed(state, k)) continue;
    // a crew still below sintonía is worth a little more: the bond is an investment
    const building = (state.crewPresence[k] ?? []).some((m) => (state.bond[m] ?? 0) < minBond);
    const v = value(k) * (building && cfg.sync ? 1.12 : 1);
    if (v > bestValue) {
      best = k;
      bestValue = v;
    }
  }
  return best === target ? input : { ...input, kind: best } as RunInput;
}

const POLICIES = { atenta: attentivePolicy, sigue: follows } as const;
const GOOD = new Set(["SS", "S", "A", "B"]);
for (const fal of ["peregrina", "cernicala", "caracara"]) {
  for (const [pname, policy] of Object.entries(POLICIES)) {
    let total = 0, done = 0, good = 0, bondMax = 0, trained = 0, withCrew = 0, inSync = 0, syncWeekSum = 0, syncReached = 0;
    for (let i = 0; i < RUNS; i++) {
      let s: SeasonState = startSeason(ctx, `${PREFIX}-${fal}-${i}`, {
        kind: "start", falconessId: fal, hangar: [...REFERENCE_HANGAR], parents: [],
        ...(DIFF === "exigente" ? { difficulty: "exigente" } : {}),
      } as RunInput);
      let firstSync = 0;
      while (s.status === "active") {
        const inp = policy(ctx, s);
        if (inp.kind.startsWith("train:") && inp.kind !== "train:simulator") {
          trained++;
          const crews = s.crewPresence[inp.kind as TrainingKind] ?? [];
          if (crews.length) withCrew++;
          if (crews.some((m) => (s.bond[m] ?? 0) >= minBond)) inSync++;
        }
        s = advanceSeason(ctx, s, inp);
        if (!firstSync && Object.values(s.bond).some((b) => b >= minBond)) firstSync = s.turn;
      }
      total += Object.values(s.stats).reduce((a, b) => a + b, 0);
      if (s.endReason === "completed") done++;
      if (s.grade && GOOD.has(s.grade)) good++;
      bondMax += Math.max(0, ...Object.values(s.bond));
      if (firstSync) { syncReached++; syncWeekSum += firstSync; }
    }
    console.log(JSON.stringify({
      cfg: cfg.name, fal, policy: pname, n: RUNS,
      stats: Math.round(total / RUNS), completa: +(100 * done / RUNS).toFixed(1), bOrBetter: +(100 * good / RUNS).toFixed(1),
      bondMax: Math.round(bondMax / RUNS), crewPct: +(100 * withCrew / Math.max(1, trained)).toFixed(1),
      syncPct: +(100 * inSync / Math.max(1, trained)).toFixed(1),
      syncSeasons: +(100 * syncReached / RUNS).toFixed(1), syncWeek: syncReached ? Math.round(syncWeekSum / syncReached) : null,
    }));
  }
}
