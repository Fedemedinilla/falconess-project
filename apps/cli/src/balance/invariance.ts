/**
 * B8 «lo viejo no se mueve» (ADR-0010) for `pnpm balance:barandas`: byte digests of race logs and
 * seasons that must never move. v1 and v2 (logs and reference-policy seasons) and v3 with each
 * invariance switch off (ADR-0011 §7: a switch off is an earlier prototype engine byte for byte).
 * The references live in `invariance.json`, recorded on the prototype (`race-v3-proto`, c3c801a)
 * and reproduced on `race-v3`. v3 itself is printed but not gated here: its goldens gate it.
 *
 * The digest is a function of an API object so the same code can digest another checkout.
 */
import { createHash } from "node:crypto";
import type { Course, Position, RaceEntry, RaceLog, RaceStats, Style } from "@falconess/schema";

/** What the digest needs from a checkout. */
export type InvarianceApi<R> = {
  /** `null` = the group does not exist in that checkout. */
  ruleset(group: string): R | null;
  simulateRace(
    R: R,
    entries: RaceEntry[],
    course: Course,
    seed: string,
    opts: { detail: "results" | "full" },
  ): RaceLog;
  neutralFixtureEntry(args: {
    runnerId: string;
    laneIndex: number;
    style: Style;
    position: Position;
    stats: RaceStats;
  }): RaceEntry;
  /** Whether the ruleset reads distance letters (the field is B then). */
  letters(R: R): boolean;
  courseOf(id: string): Course;
  /** End states of reference-policy seasons, canonical JSON. */
  seasons(R: R, falconessId: string, seed: string): string;
};

/** The groups B8 gates: v1, v2 and every switch, in order. */
export const GATED_GROUPS = [
  "v1",
  "v2",
  "v2-seasons",
  "off-jumpskim",
  "off-trim",
  "off-homes",
  "off-polish",
  "off-kick",
  "off-stamina",
  "off-neutral",
  "off-allfly",
  "off-lines",
  "off-r5",
  "off-1-3",
  "off-1-2",
] as const;

const OLD_TRACKS = ["sprint", "ridge", "canyon"];
const CATALOGUE = [
  "sprint",
  "steps",
  "overlook",
  "ridge",
  "breakaway",
  "circuit",
  "open-sky",
  "canyon",
  "crossing",
];
const STYLES: Style[] = ["glide", "ground", "hover", "dive"];
const POSITIONS: Position[] = ["lead", "pack", "stalk", "closer"];

function entries<R>(api: InvarianceApi<R>, R: R, k: number, st: number): RaceEntry[] {
  const letter = api.letters(R);
  return Array.from({ length: 8 }, (_, j) => {
    const e = api.neutralFixtureEntry({
      runnerId: `r${j}`,
      laneIndex: (j + k) % 8,
      style: STYLES[j % 4] ?? "glide",
      position: POSITIONS[(j + (k % 3 === 0 ? 0 : k)) % 4] ?? "lead",
      stats: {
        agility: st + j * 10,
        stamina: st,
        technique: st - j * 5,
        courage: st + 20,
        intelligence: st,
      },
    });
    return letter ? { ...e, distanceAptitude: "B" as const } : e;
  }).sort((a, b) => a.laneIndex - b.laneIndex);
}

/** One digest per group (24 hex), `quick` with fewer races. Unknown groups are skipped. */
export function invarianceDigests<R>(
  api: InvarianceApi<R>,
  groups: readonly string[],
  quick = false,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of groups) {
    const R = api.ruleset(g === "v2-seasons" ? "v2" : g);
    if (R === null) continue;
    const h = createHash("sha256");
    if (g === "v2-seasons") {
      for (const f of ["peregrina", "cernicala", "caracara"])
        for (let i = 0; i < (quick ? 1 : 4); i++) h.update(api.seasons(R, f, `inv/${f}/${i}`));
    } else {
      const old = g === "v1" || g === "v2";
      const tracks = old ? OLD_TRACKS : CATALOGUE;
      const per = old ? (quick ? 20 : 150) : quick ? 4 : 16;
      for (const track of tracks) {
        const course = api.courseOf(track);
        for (let k = 0; k < per; k++) {
          const st = 300 + (k % 4) * 150;
          const log = api.simulateRace(
            R,
            entries(api, R, k, st),
            course,
            `inv/${g}/${track}/${k}`,
            {
              detail: k % 2 ? "full" : "results",
            },
          );
          h.update(JSON.stringify(log));
        }
      }
    }
    out[g] = h.digest("hex").slice(0, 24);
  }
  return out;
}
