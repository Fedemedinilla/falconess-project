/**
 * The measurement jobs of `pnpm balance:barandas` (ADR-0010), ported from the prototype's
 * harness (`.work/design7/harness/job.ts`) with the same seeds: a job is a pure function of its
 * JSON, so its result can be cached by the hash of the job and the engine.
 */
import { loadSeasonContent } from "@falconess/content";
import {
  advanceSeason,
  flightOf,
  getRuleset,
  type Ruleset,
  type SimContext,
  startSeason,
} from "@falconess/sim";
import { REFERENCE_HANGAR, referencePolicy } from "../policy.js";
import {
  courseLengthM,
  courseOf,
  defaultRoles,
  entriesOf,
  equalRoles,
  type Role,
  race,
  roleIdx,
  winShares,
} from "./field.js";

export type BalanceJob =
  | {
      kind: "field";
      group: string;
      rs: string;
      track: string;
      stat: number;
      base: string;
      k0: number;
      k1: number;
    }
  | {
      kind: "statValue";
      group: string;
      rs: string;
      track: string;
      stat: number;
      bump: number;
      base: string;
      k0: number;
      k1: number;
    }
  | {
      kind: "sigma";
      group: string;
      rs: string;
      track: string;
      base: string;
      k0: number;
      k1: number;
    }
  | {
      kind: "season";
      group: string;
      rs: string;
      falconess: string;
      base: string;
      k0: number;
      k1: number;
    }
  | {
      kind: "bench";
      group: string;
      rs: string;
      track: string;
      detail: "results" | "full";
      k1: number;
    };

/** A job's sums (merged by addition over shards) and, for `sigma`, raw finish times per runner. */
export type JobResult = { acc: Record<string, number>; t?: number[][] };

const STATS = ["agility", "stamina", "technique", "courage", "intelligence"] as const;

/** The field's letter: B with the distance letters on (rivals are B everywhere), else none. */
const letterOf = (R: Ruleset) => (flightOf(R)?.distanceLetters ? "B" : undefined);

export function runBalanceJob(job: BalanceJob): JobResult {
  const R = getRuleset(job.rs);
  const letter = letterOf(R);
  const acc: Record<string, number> = {};
  const add = (k: string, v: number) => {
    acc[k] = (acc[k] ?? 0) + v;
  };
  const finish = (
    log: { results: { runnerId: string; finishMilli: number | null }[] },
    id: string,
  ) => log.results.find((x) => x.runnerId === id)?.finishMilli ?? 0;
  switch (job.kind) {
    case "field": {
      // B1-B3: the equal field, win share per position
      const course = courseOf(job.track);
      for (let k = job.k0; k < job.k1; k++) {
        const roles = equalRoles(k);
        const log = race(
          R,
          course,
          entriesOf(roles, job.stat, k, letter),
          `${job.base}/equal/${job.track}/${job.stat}/${k}`,
        );
        const w = winShares(log);
        add("races", 1);
        log.results.forEach((res, q) => {
          const ro = roles[roleIdx(res.runnerId)];
          if (ro) add(`pos.${ro.p}`, w[q] ?? 0);
          if (res.dnf) add("dnf", 1);
        });
      }
      return { acc };
    }
    case "statValue": {
      // B5: metres of +bump of each stat for one runner of the default field
      const course = courseOf(job.track);
      const L = courseLengthM(course);
      for (let k = job.k0; k < job.k1; k++) {
        const roles = defaultRoles();
        const pj = k % roles.length;
        const seed = `${job.base}/statValue/${job.track}/${job.stat}/${k}`;
        const me = `r${pj}`;
        const t0 = finish(race(R, course, entriesOf(roles, job.stat, k, letter), seed), me);
        const m: Record<string, number> = {};
        for (const st of STATS) {
          const alt: Role[] = roles.map((r, j) =>
            j === pj ? { ...r, over: { [st]: job.stat + job.bump } } : r,
          );
          const t1 = finish(race(R, course, entriesOf(alt, job.stat, k, letter), seed), me);
          const v = ((t0 - t1) / t0) * L;
          m[st] = v;
          add(`m.${st}`, v);
          add(`mq.${st}`, v * v);
        }
        for (const st of STATS) {
          if (st === "agility") continue;
          const d = (m.agility ?? 0) - (m[st] ?? 0);
          add(`d.${st}`, d);
          add(`dq.${st}`, d * d);
        }
        add("n", 1);
      }
      return { acc };
    }
    case "sigma": {
      // B6: finish times of the same builds over seeds, default field at 600
      const course = courseOf(job.track);
      const roles = defaultRoles();
      const t: number[][] = roles.map(() => []);
      for (let k = job.k0; k < job.k1; k++) {
        const log = race(
          R,
          course,
          entriesOf(roles, 600, 0, letter),
          `${job.base}/sig/${job.track}/${k}`,
        );
        for (const x of log.results) t[roleIdx(x.runnerId)]?.push(x.finishMilli ?? 0);
      }
      return { acc: { L: courseLengthM(course) }, t };
    }
    case "season": {
      // B4: metric 7, seasons with the reference policy
      const ctx: SimContext = { ruleset: R, content: loadSeasonContent(R.version) };
      for (let i = job.k0; i < job.k1; i++) {
        let s = startSeason(ctx, `${job.base}-${i}`, {
          kind: "start",
          falconessId: job.falconess,
          hangar: [...REFERENCE_HANGAR],
          parents: [],
        });
        while (s.status === "active") s = advanceSeason(ctx, s, referencePolicy(ctx, s));
        add("runs", 1);
        if (["SS", "S", "A", "B"].includes(s.grade ?? "G")) add("bOrBetter", 1);
        if (s.endReason === "completed") add("completed", 1);
      }
      return { acc };
    }
    case "bench": {
      // B7: p95 of an 8-runner race on the job's track, v2 against this ruleset, same entries
      const course = courseOf(job.track);
      const RB = getRuleset("v2");
      const entries = entriesOf(equalRoles(7), 600, 0, letter);
      const times: Record<"v2" | "v3", number[]> = { v2: [], v3: [] };
      for (let k = 0; k < job.k1; k++)
        for (const [name, rs] of [
          ["v2", RB],
          ["v3", R],
        ] as const) {
          const t0 = performance.now();
          race(rs, course, entries, `bench/${k % 50}`, job.detail);
          times[name].push(performance.now() - t0);
        }
      const p95 = (a: number[]) => {
        const s = [...a].sort((x, y) => x - y);
        return s[Math.floor(s.length * 0.95)] ?? Number.NaN;
      };
      return { acc: { p95v2: p95(times.v2.slice(50)), p95v3: p95(times.v3.slice(50)) } };
    }
  }
}
