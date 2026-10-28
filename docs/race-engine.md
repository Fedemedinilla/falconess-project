# Race engine v1: implementation spec

- Status: final spec for ROADMAP Fase 2 (D8-D14). **D8 is blocked until the gate of section 0.2
  is passed** (owner acceptance of the whole ADR-0003, CLAUDE.md convention line, protected ruleset
  files). Every decision is listed and tagged (deviation, gap, literal) in section 27 and proposed
  in `docs/decisions/ADR-0003-race-engine-interpretations.md`.
- Date: 2026-10-28 (revision 4: third critic round, see section 28.3; revision 3: second critic
  round, section 28.2; revision 2: section 28.1).
  Scope:
  `packages/sim/src/race/`, `packages/sim/src/rules/`, `packages/schema/src/race.ts`,
  `packages/rng` (three helpers), `season/goals.ts` (wiring).
- Sources of truth: BRIEF §2, §5, §6, §7, §12; ROADMAP Fase 2; docs/formulas.md; the schema
  (`modifiers.ts`, `skill.ts`, `course.ts`, `frame.ts`, `manufacturer.ts`, `season.ts`); the
  existing `resolveFrameBuild`, `effectiveStats`, `RACE` constants and `@falconess/rng`.
- This document stands alone: an implementer needs nothing else from the design round.

## 0. How this spec was built, and how to read it

Three independent designs (fidelity, determinism-perf, balance) were scored by two judges. The
judges disagreed on the winner (judge 1: determinism-perf; judge 2: fidelity). The combined plain
totals decide: determinism-perf 47 + 47 = **94**, fidelity 45 + 46 = 91, balance 39 + 42 = 81.
The skeleton is therefore determinism-perf (units, pre-drawn RNG block, instantaneous thrust,
accumulator, overflow discipline, SoA loop), with every graft of both judges, except where the two
judges contradict each other; there the choice and its reason are in section 28 (resolution index).

Fatal flaws found by the judges and how this spec fixes them:

| Flaw (judge) | Fix here |
| --- | --- |
| A failed jump costs ~12-35 s with literal 0.4 m/s² (J1, J2) | Recovery dash after a crash (5.3); obstacle-armor keeps speed (14.3) |
| Absolute exhaustion speed blinds stamina for slow frames (J1) | `vMin` relative to the runner's PW and terrain (6) |
| Judgement bias on the gates turns Intelligence into a hidden jump lottery (J1, J2) | Perception error only inside the sprint plan; gates read true values (10) |
| Courage tolerance as a boost gate above the penalty threshold makes courage harmful (J2) | Courage tolerance is the overheat threshold for everyone except telemetry; every non-licensed runner is governed below it (8, 9) |
| Glide lead drain ×0.9 lets a leading glide skip canyon exhaustion (J2) | `glideLeadDrainPm = 980` (9.7; 950 in revision 1) |
| Unique skills always firing skews the signature metric (J1) | Uniques follow the brief formula (15) |
| Water clause of obstacle-armor turned into a stall (J1) | Armor removes water damage at no time cost (14.6) |
| PW literal with no boost-side knob (J1, J2) | `pwCruiseWeight` and `pwBoostWeight`, default 1000 = brief (3, 25) |
| In-loop draws whose order depends on dynamics (J1, J2) | `n × 32` u32 drawn before tick 0; zero draws in the loop (17) |
| Rank ties broken by lane break symmetry (J1, J2) | Competition ranking: equal keys share a rank (9.1) |
| Telemetry heat above dissipation (J1) | Telemetry gate and clamp at raw dissipation (13) |
| Jump resolved before skills can see the jump segment (J1) | Jump resolves at the start of the next tick, after skills (14.1, 18) |
| Balance's float-tuned constants baked into v1 (J1, J2) | Brief constants kept; balance's set is the documented D14 hypothesis (25.3) |

The spec was then checked with an integer prototype written from this text (section 25.4). It
found four more defects, fixed here and listed in section 28: the accumulator cap dropped the
overflow (9.5), `capFinal` ignored projected exhaustion (9.3), the pulse plan counted fractional
pulses (11.3), and an overheat licence used by the plan burned durability for no gain (9.3).

Revision 2 answers a critic round (eleven findings, all accepted; index in 28.1): a gate before D8
(0.2), a schema-level neutral fixture (3.4), a plan that never spends inside a jump (11.3), a
landing cost and a shorter ground detour (14.2, 14.4), one phase term per style (9.8), one terrain
term per manufacturer rule (13.1), an Intelligence window whose centre rises with I (10), a
relative field band (21.1), and measured risks for the signature metric (R14). Every number in
25.4 was re-measured with the revision-2 rules.

Revision 3 answers a second critic round (eight findings, all accepted; index in 28.2): one
definition of the pulse plan quantities everywhere (3.3, 9.5, 12, 24.1), a run budget per batch
scenario that adds up to `--runs` with a nightly `full` profile (25.2.1), an exact skill ablation
switch and fixture builds (3.2, 3.4, S4, S5), metric 7 gated on the grade itself (21.1), rivals
without quirks (21.1), a risk entry and content tickets for metric 5 (R18, 25.3), and every
ADR-0003 item tagged, with G1 requiring the whole ADR (0.2, 27). No physics rule and no constant
of section 26 changed, so the sanity numbers of 25.4 stand.

Revision 4 answers a third critic round (three findings, all accepted; index in 28.3):
- an exact counting rule for metric 2: one designated entry per manufacturer plus three
  non-attributed `none` fixtures, fair share 12.5 % (25.2, D40);
- an exact S3 build: base stats 600 with her aptitude letters and her unique skill as the only
  active, a per-cell verdict, and "bioma casa" read as desert in v1 (25.2, R14, D47);
- D45 restated as a deviation from BRIEF §7 "no como bonificación numérica", with each rule term's
  stat equivalent, and no longer claimed to act inside every rule's own mechanism (13.1).

No physics rule and no constant changed. The R14 table was re-measured at the defined S3 build and
moved by at most 0.01 in ratio.

### 0.1 Notation

- `fl(a, b)` = `floorDiv(a, b)` from `@falconess/rng` (floor toward −∞). Every division in race
  math is written as `fl(product, divisor)` with an exact integer product `< 2^53` (bounds in 1.5).
- `ceilDiv(a, b)` = `fl(a + b − 1, b)` for `a ≥ 0`, `b > 0` (new helper in `@falconess/rng`).
- `sub0(x, d)` = `max(0, x − d)`; `addCap(x, d, cap)` = `min(cap, x + d)`.
- `‰` = per-mille integer, `1000 = ×1.0`.
- `A, St, T, C, I` = the runner's frozen effective agility, stamina, technique, courage,
  intelligence (integers 1..2000).
- `R.x` = `ruleset.race.x` (constants of section 26). `F.x` = `ruleset.field.x`.
- "lane order" = ascending `laneIndex`. "id order" = ascending skill id (string compare).
- Phases are indexed `PH_START = 0`, `PH_MIDDLE = 1`, `PH_FINAL = 2`.
- Segment types are indexed in `SEGMENT_TYPES` order: flat 0, climb 1, descent 2, jump 3,
  water 4, canyon 5, curves 6.

### 0.2 Gate before D8 (nobody writes engine code until all four hold)

The spec needs decisions that the implementer may not take and files the implementer may not
edit. Each item names who acts. The implementer checks all four before the first D8 commit and
stops (CLAUDE.md "preguntar antes de decidir") if one is missing.

| # | Action | Who | Why it blocks |
| --- | --- | --- | --- |
| G1 | ADR-0003 moves from "propuesto" to "aceptado" **whole** (D1-D49; revision 3 removes the partial-acceptance option). If the owner rejects an item, the spec editor revises that item and ADR-0003 is accepted whole again before D8; there is no accepted subset | project owner | 32 items change or reinterpret a written brief rule (tagged **[deviation]** in section 27 and in the ADR, with the brief section named; D1 changes the internal scale of BRIEF §2 rule 2) and 16 fill silences (**[gap]**) that CLAUDE.md forbids the implementer to decide ("preguntar antes de decidir"). CLAUDE.md requires an accepted ADR to change a brief rule. The implementer checks G1 mechanically: the ADR status line reads "aceptado" and lists no excluded item |
| G2 | CLAUDE.md "Convenciones" line `Distancias y velocidades ×1000 dentro del motor.` becomes: `Unidades públicas ×1000 (1 m = 1000, 1 m/s = 1000) en constantes, log y docs; dentro del motor de carrera, posición en pu = 1/225 mm y velocidad en vu = 1/15 mm/s (ADR-0003 D1).` | lead | otherwise two mandatory sources contradict section 1.1 |
| G3 | The `RACE` and `FIELD` blocks of section 26 and the widened `RaceConstants` / `FieldConstants` types (`Ruleset.race`, `Ruleset.field`) land in `packages/sim/src/rulesets/` | lead (protected path) | the engine reads `vStart`, `kStartDash`, `hpBase`, `paceHalfWidth`, the style and rule terms, etc.; the implementer may not add them |
| G4 | `docs/formulas.md` header states the same convention as G2 | done in this revision | |

`RaceRule` (section 3.4) and `RaceSkill.disabled` (3.2) are new schema members, not renamed
fields: they are part of D8 and need no protected-file gate (their ADR lines D42 and D49 are covered
by G1). Until G1-G3 hold, ROADMAP D8 is "blocked", not "in progress".

## 1. Units and state representation (item 1)

### 1.1 Engine units

| Quantity | Engine unit | Relation to public units |
| --- | --- | --- |
| position | **pu** = 1/225 mm | `1 mm = 225 pu`, `1 m = 225 000 pu` (`225 = tps²`) |
| speed | **vu** = 1/15 mm/s | `1 mm/s = 15 vu`, `1 m/s = 15 000 vu`; **1 vu = 1 pu per tick** |
| acceleration | mm/s² | **`a` mm/s² changes speed by exactly `a` vu per tick** |
| hp | µhp | `1 hp = 1 000 000 µhp` |
| energy, heat, durability | me, mh, md | content unit × 1000 |
| multipliers, probabilities, fractions | ‰ | 1000 = ×1.0 |
| time | tick = 1/15 s; finish in milli-ticks (mt) | 1 tick = 1000 mt |

Derived once from `R.ticksPerSecond` (never hard-coded): `VEL_PER_MMS = tps = 15`,
`POS_PER_MM = tps × tps = 225`.

**No drift.** One tick at speed `v` (vu) moves exactly `v` pu: `pos += disp` with no division and
nothing to carry. An acceleration of `a` mm/s² raises the speed by `a/15` mm/s per tick, which is
exactly `a` vu. Constants stay in public units (mm/s, mm/s², milli-units) and are converted once
per race: `VBASE = R.vBase × 15 = 300 000 vu`, `KBOOST = R.kBoost × 15 = 45 000 vu`,
`VSTART = R.vStart × 15 = 45 000 vu`; accelerations (`kAcc`, `kStartDash`, `kDecel`, skill
`accel`) need no conversion.

Log conversions only: `posMm = fl(pos, 225)`, `vMms = fl(v, 15)`, `hpMilli = fl(hp, 1000)`.
The public convention of BRIEF §2 ("1 m = 1000, 1 m/s = 1000") holds at every boundary (log,
constants, docs).

**Why this is a deviation that needs G1 (section 0.2), and why it is the smallest one.** BRIEF §2
rule 2 fixes the scale of race arithmetic at mm and mm/s. At 15 ticks per second that scale cannot
represent the brief's own constants exactly: one tick at 23.5 m/s moves 1566.67 mm, and
`k_acc = 0.40 m/s²` changes the speed by 26.67 mm/s per tick. An engine held literally to mm and
mm/s must round both every tick (drift that depends on the tick rate) or carry the remainders.
pu and vu **are** mm and mm/s with that remainder kept in the same integer:
`pos = 225 × posMm + posRem` (`posRem ∈ [0, 225)`) and `v = 15 × vMms + vRem` (`vRem ∈ [0, 15)`).
A two-field representation (`posMm` + `posRem`, `vMms` + `vRem`) performs the same integer
operations and produces byte-identical logs; it is the fallback if the owner rejects D1, at the
cost of two extra fields per runner and a carry on every update. Either way the arithmetic stays
integer with a defined rounding (rule 2's intent); only the stated scale differs.

### 1.2 Per-runner dynamic state (struct of arrays, section 22)

| Field | Storage | Unit | Notes |
| --- | --- | --- | --- |
| `pos`, `prevPos`, `disp` | Float64Array | pu | `pos` up to `10 km = 2.25e9` (exceeds Int32) |
| `vCore` | Int32Array | vu | speed under accel/decel physics, `≥ 0` |
| `vOut` | Int32Array | vu | speed moved this tick (after thrust, skills, heat penalty) |
| `hp` | Float64Array | µhp | `[0, hpMax]`; hpMax up to `4.4e9` |
| `energy`, `heat`, `dur` | Int32Array | me, mh, md | clamps in 8.4 |
| `seg` | Int32Array | index | segment holding the runner at tick start |
| `stall` | Int32Array | ticks | lost ticks left (14.3) |
| `flags` | Uint16Array | bits | exhausted, broken, airborne, pendingJump, dash, finished, dnf, finalEntered, planActive, replan, over |
| `pulseLeft`, `pulseCd`, `readyAt`, `chain`, `cdFire`, `burstFree`, `burstChain` | Int32Array | ticks / count / flag | pulse state (12) |
| `acc` | Float64Array | vu | level accumulator (9.5) |
| `mode`, `modeLevel` | Int32Array | enum, vu | controller mode of the last tick (for events) |
| `holdLeft` | Int32Array | ticks | style hold (9.4) |
| `planLevel`, `planStartPos`, `planEndPos`, `planCount` | Float64Array / Int32Array | vu, pu, count | sprint plan (11) |
| `freeMask`, `freeLeft`, `freeSeg` | Int32Array | bits, ticks, index | free-first-boost (16) |
| `guardLeft`, `skillSpeed`, `skillAccel` | Int32Array | ticks, vu, vu/tick | sums of active skill effects |
| per skill slot: `acts`, `activeLeft`, `armed`, `missLogged` | Int32Array(8 × 8) | | (15) |
| `finishMilli` | Float64Array | mt | set once |
| `b` | Uint8Array | 0/1 | table variant: 0 intact, 1 broken |
| ledger counters | Int32Array / Float64Array | | section 20.5 |

### 1.3 Initial state (before tick 0)

`pos = 0`, `vCore = VSTART` (3 m/s), `dash = 1`, `hp = hpMax`, `energy = Emax`, `heat = 0`,
`dur = durabilityStart × 1000`, `broken = (dur == 0)`, `b = broken`, `seg = 0`,
`freeMask = traits.freeFirstBoostMask`, `chain = 0`, `readyAt = 0`, all timers 0,
`planActive = 0`, `acc = 0`. Segment 0 is not "entered" (no repair, no water hit; a jump or water
segment at index 0 is resolved as if entered at tick 0: `pendingJump` or a water hit is applied
in a pre-tick step, in lane order).

### 1.4 Validator (throws; programming error, never a game branch)

`simulateRace` checks before anything else: `1 ≤ n ≤ R.maxRunners` (8); `laneIndex` is a
permutation of `0..n−1`; `runnerId` distinct; `rule ∈ RaceRule` (3.4); every effective stat in `[1, R.maxEffectiveStat]`
(2000); `powerToWeight` in
`[500, 1600]`; `energy` in `[20, 200]`; `dissipation` in `[20, 120]`; `durabilityMax` in
`[20, 260]`; `durabilityStart` in `[0, durabilityMax]`; `skills.length ≤ 8`, unique, id-sorted;
course length `≤ R.maxCourseMeters` (10 000 m; the schema allows 72 km, but 10 km keeps every
product of 1.5 below 2^53 and all content is ≤ 3 km); `1 ≤ segments ≤ 24`.

### 1.5 Overflow table (max |intermediate| vs 2^53 ≈ 9.007e15)

Worst case under the validator: stats ≤ 2000, PW ≤ 1600 ‰, f ≤ 1500 ‰, stylePace ≤ 1200 ‰,
pace ≤ +65 ‰ (`paceHalfWidth + paceCentreSpan/2`), style and rule multipliers (`diveStoopPm`,
`pulseAirPm`, `pulseBiomePm`, `hoverDraftPm`, `glideStartAccelPm`, `telemetry*Pm`) ≤ 2000 ‰ each,
applied one floor at a time, energy ≤ 200 000 me, speeds ≤ 2e6 vu (≈ 133 m/s), L ≤ 2.25e9 pu.
The moved speed is cruise + thrust + skill speed: under v1 the fastest is 1 949 680 vu (dive
cruise 1 214 100 at A 2000, PW 1600, f 1500, pace +65; + the chained pulse burst on a desert
descent with the stoop, 375 580; + 8 skills × 45 000), and every speed product below stays more
than 100 times under 2^53 (implementation review erratum: the bound read 1.5e6 vu, below what v1
reaches; no product changes side).

| Product | Bound |
| --- | --- |
| `vA × pwc × f × stylePace` (cruise) | 4.75e5 × 1600 × 1500 × 1200 = 1.37e15 |
| `kAcc × (600 + T) × pwc × f` | 4e2 × 2600 × 1600 × 1500 = 2.5e12 (×10 if `kAcc` is raised to 4000) |
| `kHp × 1000 × 1.2e6 × fat` | 1e6 × 1.2e6 × 1500 = 1.8e15 |
| `rPm × rPm × dK` (drain) | 6667² × 1.5e6 = 6.7e13 |
| `s × Ep × Bon` (plan gain) | 1.1e5 × 2e5 × 1.1e5 = 2.4e15 |
| `Ep × Bon` (plan ticks) | 2e5 × 1.1e5 = 2.2e10 |
| `(L − prevPos) × 1000` (finish) | 2e6 × 1e3 = 2e9 |
| `disp × fA` (margins) | 2e6 × 1000 = 2e9 |
| `u32 × 1000`, `u32 × (2W + 1)` (draws) | 4.3e9 × 1001 = 4.3e12 |
| `energy × liftF` (lift) | 2e5 × 2700 = 5.4e8 |
| `thrust × multiplier` (stoop, air, biome; one floor each) | 1.5e5 × 2000 = 3e8 |
| `vCore × landPm`, `tgt × hoverDraftPm`, `acc × glideStartAccelPm` | 1.5e6 × 2000 = 3e9 |
| `B × Emax × share` (ground level) | 1.1e5 × 2e5 × 1000 = 2.2e13 |
| `ticks × v` in the plan's exhaustion walk | ≤ one segment length ≤ 3000 m = 6.75e8 pu |

A unit test asserts `Number.isSafeInteger` at each maximum (section 24). `Math.floor(a / b)` is
the exact integer quotient for `|a| < 2^53`, so the existing `mulDiv`, `scale` and `floorDiv` are
exact under these bounds.

## 2. Course geometry (item 2)

`buildCourseGeometry(ruleset, course): CourseGeometry` is pure and allocation-heavy only once;
callers (the batch) may cache it by `courseId@version`.

```ts
type CourseGeometry = {
  courseId: string; courseVersion: number; biome: Biome;
  lengthMm: number; L: number;                      // L = lengthMm × 225 (pu)
  S: number;                                        // segment count, 1..24
  segStart: Float64Array; segEnd: Float64Array;     // pu; segEnd[S − 1] = L
  segType: Uint8Array;                              // index into SEGMENT_TYPES
  gradePm: Int32Array; dragPm: Int32Array; windPm: Int32Array;   // ‰; wind signed (+ tail)
  radius: Int32Array; liftReq: Int32Array;          // content ints; 0 where not applicable
  jumpIdx: Int32Array;                              // indices of jump segments, ascending
  startEndMm: number; finalStartMm: number; hoverAttackMm: number;
  reserveAtMm: number; denseFromMm: number;         // and the same five values in pu
};
```

- Segment lengths `len_s = length_m × 225 000`; `segStart[0] = 0`; `segEnd[s] = segStart[s] + len_s`;
  `segStart[s + 1] = segEnd[s]`.
- Content decimals become ‰ here, with `toPermille` (content-load rounding, the only one of a course):
  `gradePm`, `dragPm`, `windPm`.
- Boundaries in mm, then × 225: `startEndMm = fl(Lmm, 6)`, `finalStartMm = fl(2 × Lmm, 3)`,
  `hoverAttackMm = fl(Lmm × R.style.hoverAttackAt, 1000)`,
  `reserveAtMm = max(0, Lmm − R.finalSprintReserveMeters × 1000)`, `denseFromMm = Lmm − R.log.denseLastMeters × 1000`.
  ADR-0003 D53: on a course shorter than the sprint reserve (60 m) `reserveAt` and `kickAt` (9.4)
  are 0, never negative; the validator of 1.4 still accepts every course the schema accepts.
- **Phase of a position** `x` (pu): `x < startEnd` → start; `x < finalStart` → middle; else final.
  A runner exactly on a boundary belongs to the later phase. Two comparisons per runner per tick.
- **Segment lookup without allocation:** each runner keeps `seg`. After its move (step B12 of
  section 18): `while (seg < S − 1 && pos ≥ segEnd[seg]) { leave(seg); seg++; enter(seg) }`. The
  minimum segment is 50 m and the maximum move is under 7 m per tick, so the loop runs 0 or 1
  times. The segment that governs tick t is the one that held the runner at the **start** of tick t.

| Course | L (m) | startEnd | finalStart | hoverAttack | reserveAt | denseFrom |
| --- | --- | --- | --- | --- | --- | --- |
| desert-sprint | 1200 | 200 000 mm | 800 000 | 840 000 | 1 140 000 | 1 175 000 |
| desert-ridge | 2000 | 333 333 | 1 333 333 | 1 400 000 | 1 940 000 | 1 975 000 |
| desert-canyon | 3000 | 500 000 | 2 000 000 | 2 100 000 | 2 940 000 | 2 975 000 |

Ridge segments: flat 0-300 m, descent 0.3 300-700, jump (20) 700-800, flat 800-1200, descent 0.2
1200-1500, jump (15) 1500-1580, flat 1580-2000. The second jump lies in the final phase.

## 3. RaceEntry (frozen) and per-race tables (item 3)

### 3.1 `freezeEntry` (content side; outside the pure race)

```ts
freezeEntry(ruleset: Ruleset, content: ContentIndex, input: EntryInput, course: Course,
            laneIndex: number): RaceEntry
EntryInput = {                       // zod schema in packages/schema/src/race.ts
  runnerId: string;                  // "player", "rival-1".."rival-7", batch ids
  kind: "player" | "rival" | "ghost";
  falconessId: Slug | null;
  baseStats: FalconessStats; mood: Mood;
  biomeAptitude: BiomeAptitudes; styleAptitude: StyleAptitudes;
  frameId: Slug; parts: Slug[]; quirks: Slug[];
  learnedSkills: Slug[];
  durability: number | null;         // season frameDurability; null = full
}
```

Steps (integers only):

1. `fb = resolveFrameBuild(content, frameId, parts, quirks)` (existing). It already applies the
   telemetry PW cap 1100 and `power-cap`, and clamps PW to [500, 1600], energy to [20, 200],
   dissipation to [20, 120], durability to [20, 260].
2. `eff = effectiveStats(ruleset, baseStats, mood, biomeAptitude, styleAptitude, course.biome,
   fb.style)` (existing): mood on all five stats, biome letter on agility, style letter **of the
   frame's style** on intelligence.
3. `falconess-stat` modifiers: `eff[stat] = clamp(eff[stat] + Σ delta, 1, 2000)`, after step 2
   ("intelligence efectiva +30" is +30 effective).
4. Skills: every id of `learnedSkills` resolved through content; it must be `kind: "active"` (a
   passive id is a freeze error: the workshop never allows it); a `uniqueTo` different from
   `falconessId` is a freeze error (defensive; the workshop already enforces it); deduplicate;
   **sort by id**; at most `R.maxSkills` (8); convert each with `freezeSkill` (3.2).
5. `traits = compileTraits(fb.modifiers)` (section 16): commutative aggregation into integers.
6. `durabilityStart = min(fb.durabilityMax, input.durability ?? fb.durabilityMax)`.

`RaceEntry` (zod, `packages/schema/src/race.ts`, integers only):

```
runnerId: string, kind, falconessId: Slug | null, laneIndex: 0..7,
frameId, manufacturer, rule: RaceRule, style: Style,            // RaceRule: section 3.4
passive: Slug | null, parts: Slug[] (≤ 4), quirks: Slug[] (≤ 2),
mood, biomeAptitude: Aptitude, styleAptitude: Aptitude,       // the letters actually applied
stats: { agility, stamina, technique, courage, intelligence },  // effective, 1..2000
powerToWeight: 500..1600 (‰, after caps), energy: 20..200, dissipation: 20..120,
durabilityMax: 20..260, durabilityStart: 0..durabilityMax,      // content units
skills: RaceSkill[] (≤ 8, id-sorted),
traits: RaceTraits                                               // section 16
```

`passive`, `parts` and `quirks` name the sources of the traits for the "why" panel; the engine
reads only `traits`. No decimals are stored anywhere in the log (property P8). `freezeEntry`
always writes the frame manufacturer's `ManufacturerRule` into `rule`; only the fixture builder of
3.4 writes `"none"`.

### 3.2 `RaceSkill` (frozen active skill)

```
id: Slug, uniqueTo: Slug | null, activationBasePm: 0..1000,
trigger: { phase: RacePhase, segment: SegmentType | null,
           posLoPm: 0..1000 | null, posHiPm: 0..1000 | null,      // both null or both set
           heatAboveMilli: Int | null, energyBelowMilli: Int | null, once: boolean },
effect:  { speedMms: −3000..3000, accelMms2: −1000..1000, energyRefundMilli: 0..60 000,
           heatCoolMilli: 0..60 000, durabilityGuard: boolean, durationTicks: 0..300 },
disabled: boolean                                                 // revision 3; batch ablation only (15.2)
```

Conversions (content-load rounding with `toPermille`, only here): `positionRange` → ‰;
`heatAbove`, `energyBelow`, `energyRefund`, `heatCool` → × 1000; `speed` m/s → mm/s;
`accel` m/s² → mm/s²; `activationBase` → ‰.

The conversion is one exported function, `freezeSkill(content: ContentIndex, id: Slug): RaceSkill`
(`packages/sim/src/race/entry.ts`), used by `freezeEntry` step 4 and by the batch (S4). It resolves
the id, requires `kind: "active"` (a passive id throws), applies the conversions above and writes
`disabled: false`. It does **not** check `uniqueTo` (that check belongs to `freezeEntry`, which knows
the Falconess), so the batch can measure a unique skill on a neutral fixture.

**`disabled` (ablation switch, ADR-0003 D49).** `disabled: true` makes the skill's probability 0
before any bonus, telemetry term or lucky override (15.2), while the skill keeps its id-order
index `j`, its pre-drawn slots `4 + 3j + k` (17.1) and its place in the lucky pick's `nActive`
(16 #15). Removing the skill instead would shift the slots of every later skill and break the
draw alignment the paired ablation needs. `freezeEntry` and `freezeSkill` always write `false`;
only `disableSkill` (3.4) writes `true`; `goalRaceSetup` asserts that no season entry has a
disabled skill, so season logs and goldens never contain one.

### 3.3 Per-race tables (built inside `simulateRace` before tick 0)

Built from entry + geometry + ruleset + the pre-drawn block (section 17). Never stored; their key
values are copied to `log.derived` (20.3). Two PW variants `b ∈ {0 intact, 1 broken}` with
`PW₀ = PW`, `PW₁ = fl(PW × R.durabilityZeroPowerMult, 1000)`; three pace phases `ph`.

| Table | Formula | 600-balanced, PW 1000, flat, noise off |
| --- | --- | --- |
| `pwc[b]` | `1000 + fl(R.pwCruiseWeight × (PW_b − 1000), 1000)` | 1000 |
| `pwb[b]` | `1000 + fl(R.pwBoostWeight × (PW_b − 1000), 1000)` | 1000 |
| `vA` | `fl(VBASE × (1 200 000 + R.kA × A), 1 200 000)` | 352 500 vu (23.5 m/s) |
| `f[s]` | section 7 (per runner: curves use A; Boneyard curves term of 13.1) | 1000 |
| `vC[b][ph][s]` | `fl(fl(vA × pwc[b] × f[s] × stylePace[style][ph], 10^9) × (1000 + pace[ph]), 1000)` | 352 500 |
| `acc[b][s]` | `fl(fl(R.kAcc × (600 + T) × pwc[b] × f[s], 1 200 000 000) × accRule, 1000)` (brief `k_acc·(0.5 + T/1200)·PW·f`); `accRule = rule == telemetry ? R.telemetryAccelPm : 1000` (13.1) | 400 vu/tick (0.4 m/s²) |
| `accStart[b][s]` | glide only: `fl(acc[b][s] × R.style.glideStartAccelPm, 1000)`, used in the start phase (9.8) | 440 |
| `vMin[b][ph][s]` | `fl(fl(VBASE × R.exhaustSpeedPm × pwc[b] × f[s], 10^9) × (1000 + pace[ph]), 1000)` | 255 000 (17 m/s) |
| `B[b]` | `fl(KBOOST × pwb[b], 1000)` | 45 000 (3 m/s) |
| `Bp[b]` | `fl(KBOOST × pwb[b] × R.pulseBoostMult, 1 000 000)` | 60 750 (4.05 m/s) |
| `Bpc[b]` | `fl(Bp[b] × (1000 + traits.pulseChainBonusPm), 1000)` | 60 750 (no chain trait) |
| `hpMax` | section 4 | 1 235 × 10^6 µhp (ridge) |
| `stamDiv` | `1 200 000 + R.kS × St` | 1 920 000 |
| `fat` | `max(1000, R.fatigueBase − fl(R.fatigueCourage × C, 1200))` | 1300 |
| `dK[q]` | section 6 (telemetry term of 13.1 included) | 625 000 / 812 500 µhp |
| `tol` | `1000 + fl(R.heatToleranceCourage × C, 1200)` | 1150 |
| `D` | `dissipation × 1000` | 60 000 mh |
| `heatCap` | `fl(D × tol, 1000)` (overheat threshold, everyone) | 69 000 |
| `capLim` | `rule == telemetry ? D : heatCap` (boost governor limit) | 69 000 |
| `coolTick` | `max(1, fl(cool0 × coolRule, 1000))`, `cool0 = max(1, fl(R.kCool × R.biomeCool[biome] × dissF, 1 000 000))`, `dissF = 1000 + fl(R.coolDissWeight × (fl(dissipation × 1000, R.dissRef) − 1000), 1000)`, `coolRule = rule == mass-thrust ? R.massThrustCoolPm[biome] : 1000` (13.1) | 1000 (neutral knobs; Steinhaus in the desert 500) |
| `dmgTick` | `fl(R.overheatDurPerTick × ruleMult × styleDmg, 1 000 000)`, `ruleMult = rule == mass-thrust ? R.massThrustDurMult : 1000`, `styleDmg = style == ground ? R.groundDamagePm : 1000` | 1000 md |
| `regenTick` | `(rule == regen ? R.regenPerTick : 0) + traits.regenMe` | 0 |
| `liftF` | `fl((600 + T) × (1000 + traits.liftBonusPm), 1200)` (‰ of energy) | 1000 |
| `landPm` | 14.2: `landBase = R.landBasePm + fl(R.landTechPm × min(T, 1200), 1200)`; `landPm = max(0, 1000 − fl((1000 − landBase) × landRule, 1000))`, `landRule = R.regenLandLossPm` (Lumière), `R.repairableRuggedPm` (Boneyard), else 1000 | 860 (Lumière 720, Boneyard 930) |
| `detour` | ground only: `1000 + fl((R.groundDetourMult − 1000) × (rule == repairable ? R.repairableRuggedPm : 1000), 1000)` | 1100 (Boneyard 1050) |
| `kickAt` | 9.4: `reserveAt`, or for non-ground runners `min(reserveAt, segStart[j])` of the first jump `j` with `segEnd[j] > reserveAt` | `reserveAt` on the v1 courses |
| `need[j]` | `ceilDiv(liftReq_j × 1 000 000, liftF)` me | 20 000 / 15 000 (ridge) |
| `jr[s]` | 14.4 (jump reserve; 0 for ground) | ridge before jump 1: 35 000 |
| `pulseFrame` | `rule == pulse && !traits.noPulse` | false |
| `airPm[s]` | pulse frames: `fl(R.pulseAirPm[segType[s]] × R.pulseBiomePm[biome], 1000)` (13.1); others 1000 | desert flat 1150, descent 1380, water 690 |
| `stoop[s][ph]` | dive only: `R.style.diveStoopPm` when `segType[s] == descent` or `ph == PH_FINAL` (9.8); else 1000 | 1000 (dive final 1400) |
| `Bon[b]`, `costOn`, `unit[b]`, `sMax[b]` | the plan's thrust per on-tick, cost, accumulator unit, top level: `base = pulseFrame ? fl(Bp[b] × R.pulseBiomePm[biome], 1000) : B[b]`; `Bon = fl(base × (style == dive ? R.style.diveStoopPm : 1000), 1000)`; `pulseFrame ? (Bon, pulseCostMe, Bon × R.pulseTicks, fl(unit, R.pulseTicks + R.pulseCooldownTicks)) : (Bon, R.kE, Bon, Bon)`; `pulseCostMe = fl(R.kE × R.pulseCostMult, 1000)`. Ground's level mode uses the same formula without the stoop (ground is never dive). Section 12's Plan row and the accumulator of 9.5 use exactly these values | 45 000, 1000, 45 000, 45 000 (dive 63 000); desert pulse frames: shiden 136 929, 1200, 1 643 148, 39 122; hayate 83 835, 1200, 1 006 020, 23 952 |
| `capFinal[b]` | 9.3 (thrust-capable ticks only) | sprint 99 000 me |
| `groundLevel[b]` | 9.3 (ground only) | |
| `pAct`, `pSkill[j]` | section 15 | 850 |
| `luckyIdx` | section 16 (#15) | −1 |

`stylePace` is `R.stylePace[style]` (all 1000 by default); `pace[ph]` is the pace judgement of
section 10 (0 with noise off). Every style term (9.8) and rule term (13.1) is folded into these
tables at race start, so the loop reads one scalar per term and never branches on a manufacturer
name. The two floors in `vC` and `vMin` are forced by the 2^53 bound,
lose less than 1 vu each, and are monotone non-decreasing in every input (needed by property P3).
The intact/broken switch is a table-index change (`b = 1` from the break tick on).

### 3.4 `RaceRule` and neutral fixture entries (tests and batch; S1, S4, S5, S8, sanity anchors)

The style metric S1 (D40), the paired ablations S4 and S5, the Intelligence gate S8 and the
"neutral" anchors of 25.4 need a runner with no manufacturer rule, to which the batch can add one
skill or one part. That runner is expressible without casts:

```ts
// packages/schema/src/race.ts
export const RaceRule = z.enum([...ManufacturerRule.options, "none"]);
export type RaceRule = z.infer<typeof RaceRule>;
// RaceEntry.rule: RaceRule.  Manufacturer.rule stays ManufacturerRule (content never says "none").
```

- `packages/sim/src/rules/index.ts` is an exhaustive `Record<RaceRule, RuleSpec>`; `rules/none.ts`
  is the no-op spec (no regen, `capLim = heatCap`, `ruleMult = 1000`, no activation bonus, no
  repair, no licence, no pulses, no rule term of 13.1). Internal code `RULE_NONE = 5`.
- `neutralFixtureEntry(args: { runnerId: string; laneIndex: number; style: Style;
  stats: RaceEntry["stats"]; skills?: readonly RaceSkill[]; build?: FixtureBuild }): RaceEntry` in
  `packages/sim/src/race/fixtures.ts`, exported from `@falconess/sim` (the batch in `apps/cli` and
  the tests use it). It builds the entry directly, without `freezeEntry` and without content, with
  these fixed values: `kind: "rival"`, `falconessId: null`, `frameId: "fixture-neutral"`,
  `manufacturer: "none"`, `rule: "none"`, `passive: null`, `mood: 0`, `biomeAptitude: "B"`,
  `styleAptitude: "B"`, `stats` as given (already effective), and, when `build` is absent,
  `parts: []`, `quirks: []`, `powerToWeight: 1000`, `energy: 100`, `dissipation: 60`,
  `durabilityMax: 100`, `durabilityStart: 100`, `traits: compileTraits([])` (every default).
  `skills` (default `[]`) must already be frozen (`freezeSkill`), unique and id-sorted, at most
  `R.maxSkills`; the function throws otherwise. This is how S4 gives fixtures a skill.
- `fixtureBuild(content: ContentIndex, parts: readonly Slug[], quirks: readonly Slug[]): FixtureBuild`
  (same file; content side, never called by `simulateRace`) applies parts and quirks to the neutral
  frame values: it starts from PW 1000, energy 100, dissipation 60, durability 100, no passive,
  rule `none`, and adds every `mods` and `modifiers` entry with the arithmetic, `power-cap` and
  clamps of `resolveFrameBuild` (one shared internal helper extracted from `frame-build.ts`, no
  behaviour change, covered by its existing tests; the telemetry PW cap does not apply to rule
  `none`). `FixtureBuild = { parts, quirks, powerToWeight, energy, dissipation, durabilityMax,
  statDelta: RaceEntry["stats"], traits: RaceTraits }`; `statDelta` holds the summed
  `falconess-stat` deltas, which `neutralFixtureEntry` adds to `stats` with the clamp of 3.1 step 3
  (koryu-firmware +30 I). `durabilityStart = durabilityMax`. This is how S5 gives a fixture a part.
- `disableSkill(entry: RaceEntry, skillId: Slug): RaceEntry` (same file) returns a copy with that
  skill's `disabled: true` and everything else unchanged; it throws if the entry does not carry the
  skill. It is the only writer of `disabled: true` (S4's "off" run).
- In a `RaceLog` such an entry appears as `rule: "none"`, `manufacturer: "none"`,
  `frameId: "fixture-neutral"`. Season logs and goldens never contain one: `freezeEntry` cannot
  produce it, and `goalRaceSetup` asserts `rule ≠ "none"` for every entry. The enum value is a new
  schema member recorded in ADR-0003 (D42), not a renamed field.

## 4. Max HP (item 4; the brief is silent)

```
hpMax = (R.hpBase + fl(R.hpPerKm × Lmm, 1 000 000)) × 1 000 000      // µhp
```

with `hpBase = 435` hp and `hpPerKm = 400` hp/km: sprint 915 hp, ridge 1235 hp, canyon 1635 hp.

- **Stamina is not in hpMax.** The brief already divides the drain by `1 + k_s·St/1200`, which is
  the same as multiplying the reserve. Counting stamina twice would square its effect. The log
  shows the "effective reserve" `fl(fl(hpMax, 1000) × stamDiv, 1 200 000)` milli-hp (600 St →
  1.6 × hpMax).
- **Why a fixed part:** with a budget proportional to length, drain per metre and budget per metre
  are both constant and stamina matters equally on every course. `hpBase > 0` gives the Umamusume
  shape: sprints forgive, long courses demand stamina.
- **Arithmetic** (600-balanced, PW 1.0, ridge, noise off): flat cruise 352 500 vu → `rPm = 1175`,
  `rPm² = 1 380 625`; `dK[nonfinal] = fl(10^6 × 1 200 000, 1 920 000) = 625 000` → drain
  `fl(1 380 625 × 625 000, 10^6) = 862 890` µhp/tick (0.863 hp); final `fat = 1500 − 200 = 1300`,
  `dK[final] = 812 500` → 1 121 757 µhp/tick. About 870 ticks before the final at or below cruise
  (the start ramp drains less, the 0.3 descent more) ≈ 730 hp, about 420 final ticks ≈ 470 hp,
  plus ~65 boosted ticks ≈ +10 hp: ≈ 1210 of 1235 hp, **about 2 % left**. Same runner: sprint
  ≈ 24 % left; canyon empties at ≈ 2.8 km (stamina matters on the long course; risk R5).

## 5. Speed: cruise, acceleration, approach, deceleration (item 5)

The moved speed has three components: `vCore` (physics, rate-limited), `thrust` (boost,
instantaneous) and `skillSpeed` (instantaneous).

```
tgt = exhausted ? vMin[b][ph][seg] : vC[b][ph][seg]
if style == hover && ph == PH_MIDDLE && inPack && !exhausted:          // 9.8 slipstream
    tgt = fl(tgt × R.style.hoverDraftPm, 1000)
if airborne:                 // 14.2: speed held at takeoff value, no approach
    (vCore unchanged)
else:
    if dash && vCore ≥ fl(min(VBASE, tgt) × R.dashUntilPm, 1000): dash = 0      // cleared until set again
    a  = (style == glide && ph == PH_START) ? accStart[b][seg] : acc[b][seg]   // 9.8 launch
    up = a + skillAccel + (dash ? R.kStartDash : 0);  if up < 0: up = 0
    if vCore < tgt:      vCore = min(tgt, vCore + up)
    else if vCore > tgt: vCore = max(tgt, vCore − R.kDecel)
raw    = isPulseTick ? fl((burstChain ? Bpc[b] : Bp[b]) × airPm[seg], 1000) : B[b]
thrust = boostOn ? fl(raw × stoop[seg][ph], 1000) : 0                          // 9.8 stoop, 13.1 air
vTot   = airborne ? vCore : max(0, vCore + thrust + skillSpeed)
vOut   = penalised ? fl(vTot × R.heatPenaltyMult, 1000) : vTot                   // 8.3
```

`thrust` here replaces the per-mode values written in 9.6 and 12 (`B[b]`, `Bp[b]`, `Bpc[b]`): the
controller decides `boostOn`, `isPulseTick` and `burstChain`; the moved thrust always goes through
`airPm` and `stoop` (both 1000 for runners they do not apply to).

### 5.1 Cruise and acceleration

- Cruise is the brief's `v_base·(1 + k_a·A/1200)·PW·f_seg`, times the style pace knob and the
  pace judgement (section 10): table `vC` of 3.3.
- Acceleration is the brief's `k_acc·(0.5 + T/1200)·PW·f_seg` **in m/s², literally**: 400 mm/s²
  at T 600, PW 1.0 on flat = 400 vu per tick (0.0267 m/s per tick). Table `acc` of 3.3.
- `f` multiplies cruise, acceleration and `vMin`; never thrust or skill speed.
- Style and rule terms on these quantities (9.8, 13.1): hover's slipstream raises the target in the
  middle pack; glide's launch raises acceleration in the start phase; telemetry lowers
  acceleration; dive's stoop and the pulse air factor scale thrust. None of them touches `vMin`.

### 5.2 Start (gap decision)

The brief gives no initial speed. From rest at 0.4 m/s² a runner needs ~59 s to reach cruise,
longer than the sprint. The engine reconstructs the Umamusume start: `vCore = VSTART` (3 m/s) at
the gun and a **start dash** of `R.kStartDash = 24 000 mm/s²` (1.6 m/s per tick) while
`vCore < 0.85 × min(vBase, target)`. A PW 1.0 runner reaches 17 m/s in 9 ticks (6.7 m), then the
brief's acceleration closes the rest: cruise is reached after ≈ 15.3 s (309 m) at T 600, ≈ 12.2 s
at T 900, ≈ 20.3 s at T 300; a PW 1.4 frame needs ≈ 27.7 s (695 m) because its gap from 17 m/s to
its 32.9 m/s cruise is larger (spec prototype; every launch distance here is thrust-free).
Technique is therefore worth ≈ 5 m per +100 on the launch alone, more on courses with terrain
transitions. The `min(vBase, tgt)` makes slow frames (PW 0.7, target 16.45 m/s) dash to
13.98 m/s instead of overshooting their own cruise.

### 5.3 Recovery dash (fixes judge fatal flaw "a failed jump is unrecoverable")

A failed jump without armor sets `dash = 1` again (14.3): after its stall the runner dashes from
0.4·v to 0.85·min(vBase, target) in a few ticks and then accelerates normally. Measured (judge-1
prototype, confirmed by the spec prototype): one crash on a 2000 m course costs ≈ 3.35 s (79 m)
instead of 11.9 s (279 m).
The dash is never set by anything else.

### 5.4 Deceleration (gap decision)

Every target drop (segment change, exhaustion, broken wings, phase pace change) is rate-limited at
`R.kDecel = 3000 mm/s²` (0.2 m/s per tick), independent of stats. A 4.7 m/s drop into water
completes in ~1.6 s (~35 m). With 0.4 m/s² for both directions a runner would cross a 200 m water
segment barely slowing (judge measurement). Thrust and skill speed switch off instantly, so
momentum is never free. `skillAccel` only acts on the upward step.

### 5.5 Why thrust is not part of the approach target

The brief's pseudocode puts `boostBonus` inside the target of `approach(v, target, accel)`, but its
boost text says "mientras está activo, `v += k_boost·PW`". With 0.4 m/s² a 12-tick pulse whose
target is raised by 4.05 m/s would realise 0.32 m/s of it, and the Kōryū rule would be worthless.
With instantaneous thrust the distance a boost tick gains is exactly `thrust` pu, which is also the
most legible quantity in the log.

## 6. HP drain, final fatigue, exhaustion (item 6)

```
dK0[nonfinal]      = fl(R.kHp × 1000 × 1 200 000, stamDiv)                      // µhp per tick at v = vBase
dK0[final]         = fl(R.kHp × 1000 × 1 200 000 × fat, stamDiv × 1000)          // × (1.5 − 0.4·C/1200)
dK[x]              = fl(dK0[x] × drainRule, 1000)    // drainRule = rule == telemetry ? R.telemetryDrainPm : 1000 (13.1)
dK[nonfinal+lead]  = fl(dK[nonfinal] × R.glideLeadDrainPm, 1000)                 // glide holding the lead
dK[final+lead]     = fl(dK[final] × R.glideLeadDrainPm, 1000)
q    = (ph == PH_FINAL ? final : nonfinal) + (style == glide && ahead == 0 ? lead : none)
rPm  = fl(vOut × 1000, VBASE)                    // v / v_base in ‰ (vOut = the speed moved this tick)
drain = fl(rPm × rPm × dK[q], 1 000 000)         // the square is an integer product, never Math.pow
hp    = sub0(hp, drain)
```

- `stamDiv = 1 200 000 + R.kS × St` is `(1 + 1.2·St/1200) × 1.2e6`. `fat` is floored at 1000
  (binds only above C = 1500).
- Drained on every non-stalled tick at `vOut`, including airborne and detour ticks. Stalled ticks
  do not drain.
- **hp reaches 0 (exhaustion, permanent):** `exhausted = 1`, event `hpEmpty`. From the next tick:
  the body target becomes `vMin[b][ph][seg] = 0.85 × vBase × PWc × f_seg × (1 + pace)` (no
  agility), approached at `kDecel`; **thrust is disabled** (`canThrust = false`, BRIEF §5 "se
  agota → velocidad cae a mínimo"); a pulse in progress ends; active skill speed still adds (it
  is a discrete event the log explains). Energy left at that point is visible in the ledger
  (`energyLeft`) and the sprint plan prices it (11).
- **vMin is relative** (fixes judge fatal flaw "absolute 17 m/s blinds stamina for slow frames"):
  a PW 0.7 frame cruising at 16.45 m/s still slows to 11.9 m/s when it empties. vMin feels terrain
  and broken wings, not agility. Monotonicity in agility: with no agility term,
  `v / vMin ≤ (1 + 0.35 × 2000/1200) / 0.85 < 2` for every validated build, so for constant speeds
  `t(v) = d/v + (L − d)/vMin` with `d ∝ 1/v` still decreases in v.

## 7. Segment factor f_seg (item 7)

Computed once per runner per segment at race start (`gradePm`, `dragPm`, `windPm` from geometry):

| Type | Base `f` (‰) | Content values |
| --- | --- | --- |
| flat | `1000` | 1000 |
| climb | `1000 − fl(R.kClimb × gradePm, 1000)`, kClimb 150 | grade 0.25 → 963 |
| descent | `1000 + fl(R.kDescent × gradePm, 1000)`, kDescent 100 | 0.3 → 1030; 0.2 → 1020 |
| water | `1000 − fl(R.kWater × dragPm, 1000)`, kWater 1000 | drag 0.2 → 800 |
| canyon | `1000 + fl(R.kWind × windPm, 1000)`, kWind 1000; wind signed (+ tail, − head) | −0.1 → 900; +0.15 → 1150 |
| curves | `1000 − fl(R.kCurves × (1200 − min(A, 1200)) × curvesScale, 1 200 000)`, kCurves 200 | A 600 → 900; with lumiere-stabilizer (500) → 950 |
| jump | `1000` (the brief lists none; used by the airborne crossing, the crash run-through and the ground detour) | 1000 |

Modifiers, applied per runner per segment type (all commutative):

1. `curvesScale = traits.curvesScalePm` (sorted product of every `curves-penalty-scale`, default 1000).
2. `segment-factor` with `mode: override` for that type: `f = traits.segOverridePm[type]` when set
   (the **max** of the override values: order-free).
3. `segment-factor` with `mode: multiply`: `f = fl(f × traits.segMultiplyPm[type], 1000)`
   (sorted product of the multiply values, floor per step, default 1000).
4. Clamp `f` to `[R.segFactorMin, R.segFactorMax]` = [500, 1500] (the schema bounds of
   `segment-factor.value`).

Examples: falke `no-climb-loss` → climb 1000; quirk `thin-air` → climb `fl(963 × 1050, 1000) =
1011`, descent `fl(1030 × 950, 1000) = 978`; `mud-runner` and `scrap-armor` → water 1000.
`radius` is not used in v1 (reserved for lanes; the brief formula has no radius term). Agility
appears only in the curves term and in `vA`, both monotone non-decreasing.

## 8. Boost, energy, heat, durability (item 8)

### 8.1 Per-tick resource update (step B9 of section 18)

`boostOn`, `isPulseTick`, `freeTick` and `thrust` were fixed by the controller (section 9, 12).

```
if boostOn:
    cost   = freeTick ? 0 : (isPulseTick ? pulseCostMe : R.kE)        // 1200 or 1000 me
    energy = sub0(energy, cost)                                        // gates guarantee energy ≥ cost
    heat   = heat + R.kH                                               // +2000 mh
else:
    regenEff = inPack ? fl(regenTick × traits.packRegenMultPm, 1000) : regenTick
    energy = addCap(energy, regenEff, Emax)                            // Lumière 500 me, regen traits
    heat   = sub0(heat, coolTick)                                      // −1000 mh
if rule == telemetry: heat = min(heat, D)                              // defensive; the gate already holds it
if over && guardLeft == 0: dur = sub0(dur, dmgTick)                    // `over` = the tick's flag (8.3)
if dur == 0 && !broken: broken = 1; b = 1; event durabilityBroken; if planActive: replan = 1 (cause broken)
```

- `inPack` = `R.style.packLo ≤ posFrac ≤ R.style.packHi` from the rank snapshot (9.1).
- Regen accrues on every non-boost, non-stalled tick (pulse cooldown, airborne, hold) and on
  stalled ticks (14.3); never during a burst tick.
- `Emax = energy × 1000`; `D = dissipation × 1000`; `durMax = durabilityMax × 1000`.

### 8.2 Courage tolerance is the overheat threshold (deviation; fixes judge 2's fatal flaw)

The brief writes `heat > dissipation` for the penalty and `dissipation × tolerancia` (tolerance
`1 + 0.3·C/1200`) for the Kōryū fire rule, and says courage "eleva la tolerancia al calor antes de
cortar el boost". Read literally (threshold D, courage only moving the boost cut-off), courage is
harmful: boosting from D to D + x costs x/2 boosted ticks at `0.92·(c + B)` and then x cooling
ticks at `0.92·c`, i.e. `0.44x − 1.88x = −1.44x` m/s-ticks per heat unit at c = 23.5, B = 3. This
spec uses **one threshold for everyone: `heatCap = D × tol`**, so courage is the owner of
dissipation (BRIEF §5 table: "dissipation, umbral, stat dueña courage, calor tolerable antes de
penalización"), the Kōryū rule "heat + burst ≤ dissipation × tolerancia" becomes "a pulse never
overheats", and "eleva la tolerancia antes de cortar el boost" is literal: the governor cuts boost
at `heatCap`. Telemetry keeps raw dissipation (13).

### 8.3 Overheat (one flag per tick)

```
over      = heat > heatCap                      // computed at step B5, after skills (heatCool) and heat-to-energy
penalised = over && rule ≠ mass-thrust && !airborne && !(traits.heatImmune && pos < immuneUntil)
immuneUntil = traits.heatImmuneUntilMm == null ? INF : traits.heatImmuneUntilMm × 225     // pu
```

- `over` drives both the ×0.92 penalty of this tick (5) and the durability loss of this tick
  (8.1). The heat update of this tick affects the next tick's flag.
- The penalty multiplies the moved speed only and is never stored in `vCore`, so it does not
  compound (the brief pseudocode order `e.v = applyHeatPenalty(e.v)` every tick would spiral
  towards 4.6 m/s).
- Non-licensed runners never overheat: their gate is `heat + heatAdd ≤ capLim ≤ heatCap` (9.3).
  Overheat is the signature of Steinhaus in the plan and the kick and of heat-immunity quirks
  inside their window (the overheat licence, 9.3). The ×0.92 bites only when an immunity holder's
  window ends earlier than projected (its `vOutPrev`-based projection is conservative, so in
  practice it does not happen); it stays in the engine as the brief's rule.
- Events `overheat {on: true, heat}` / `{on: false, heat}` on transitions of the tick flag.

### 8.4 Durability, broken wings, clamps

- `dmgTick` = 1000 md per overheated tick (Steinhaus ×2 = 2000; ground ×0.5) unless a
  `durabilityGuard` is active.
- **Durability 0:** the first time `dur` reaches 0 → `broken = 1` for the rest of the race, event
  `durabilityBroken {powerToWeight: PW₁}`, `b = 1` (every PW table switches to `PW × 0.75`:
  `vC`, `acc`, `vMin`, `B`, `Bp`, `Bpc`, `capFinal`, `groundLevel`), an active plan is recomputed.
  `vCore` is not changed (it decelerates to the new target). Repairs (Boneyard) raise `dur` but
  never clear `broken`. A runner that starts at durability 0 starts broken.
- **Clamps:** `energy ∈ [0, Emax]`, `heat ≥ 0` (telemetry `≤ D`), `hp ∈ [0, hpMax]`,
  `dur ∈ [0, durMax]`, `vCore ≥ 0`, `vOut ≥ 0`, `pos` non-decreasing. Every update uses `sub0` or
  `addCap`; the gates guarantee a paid boost tick never needs the clamp (property P4).
- Sanity: a runner that wants boost on every tick from cold (D 60, C 600: `capLim` 69 000) boosts
  34 ticks to 68 000 mh; the gate `heat + kH ≤ capLim` (9.3) refuses the 35th, the runner cools to
  67 000, and 69 000 is first reached at tick 36; from there the governor holds a duty of 1/3
  (67 000 → 69 000 → 68 000 → 67 000), which is exactly heat-neutral (`2d = 1 − d`).

## 9. Rank and style controllers (item 9)

The controller runs once per runner per tick (step B7) and fixes `boostOn`, `isPulseTick`,
`freeTick`, `thrust`. It is a pure function of the runner's own state, its tables and the rank
snapshot. It never draws randomness.

### 9.1 Rank snapshot, position fraction, middle of the pack

Step A of every tick, from positions at the **end of the previous tick**:

```
key[i]     = finished[i] ? KEY_FINISHED − finishMilli[i] : pos[i]     // KEY_FINISHED = 1e15
ahead[i]   = #{ j : key[j] > key[i] }                                  // competition ranking: ties share a rank
posFrac[i] = n > 1 ? fl(ahead[i] × 1000, n − 1) : 0                    // 0 = leader, 1000 = last
leader[i]  = ahead[i] == 0
inPack[i]  = R.style.packLo ≤ posFrac[i] ≤ R.style.packHi              // "middle of the pack"
```

- O(n²) = 64 compares into preallocated arrays; no sort. Every runner in the tick reads the same
  snapshot, so lane order never changes physics. Equal positions share a rank (two identical
  builds stay symmetric; balance's lane tie-break broke this).
- For n = 8: posFrac 0, 142, 285, 428, 571, 714, 857, 1000; the pack (250..750) is places 3-6.
- Finished runners rank ahead of every unfinished runner, by finish time.
- Consumers: style rules, skill `positionRange`, `regen-pack-multiplier`, glide lead drain.

### 9.2 Reserves and keeps

- `jr[seg]`: energy the jumps still ahead need (14.4); every boost keeps `energy − cost ≥ jr`.
- `keepOk(keepPm) = energy − costBoost − jr[seg] ≥ fl(Emax × keepPm, 1000)` with
  `costBoost = pulseFrame ? R.pulseTicks × pulseCostMe : R.kE`.

### 9.3 Gates and the overheat licence

```
canThrust = !exhausted && !airborne && !(segType[seg] == JUMP && style ≠ ground)   // stall handled before
heatAdd   = pulseFrame ? R.pulseTicks × R.kH : R.kH                                  // 24 000 or 2000
freeAvail = (freeLeft > 0) || (freeMask has bit segType[seg])
energyOk  = freeAvail || energy − costBoost ≥ jr[seg]
heatOk    = heat + heatAdd ≤ capMode || (licMode && licenceOk)
gatesOk   = canThrust && energyOk && heatOk
```

`capMode` is `capLim` (raw D for telemetry, `heatCap` otherwise) except in two modes:
`SURPLUS` uses `fl(capLim × R.surplusHeatPm, 1000)` (800) and `REGEN` uses
`fl(capLim × R.regenOverflowHeatPm, 1000)` (900), so pre-final spending leaves heat headroom.
`licMode` is true in modes `KICK` and `PLAN` for every licensed runner, and additionally in the
four style modes for a heat-immunity holder.

**Overheat licence** (generalises judge 2's "Steinhaus may run past heatCap while durability is
above a floor", with the cooling tail counted so a licensed runner can never break its own wings):

```
licensed  = rule ≠ telemetry && (rule == mass-thrust || traits.heatImmune)
projTicks = pulseFrame ? R.pulseTicks + ceilDiv(max(0, heat + R.pulseTicks × R.kH − heatCap), coolTick)
                       : ceilDiv(max(0, heat + R.kH − heatCap), coolTick)       // overheated ticks this boost causes
durAfter  = dur − (over ? dmgTick : 0) − dmgTick × projTicks
floorDur  = fl(durMax × R.overheatFloorPm, 1000)                                  // 25 % of durabilityMax
licenceOk = licensed && durAfter > floorDur
            && (rule == mass-thrust || immuneUntil == INF || pos + (projTicks + 1) × max(1, vOutPrev) < immuneUntil)
```

- Invariant (property P4): if a licensed runner stops boosting at any tick, its durability after
  the cooling tail stays above the floor; it never breaks itself. `vOutPrev` is the runner's
  `vOut` of its previous non-stalled tick.
- Mass-thrust has no speed penalty, so its only overheat cost is durability ×2: in the sprint
  plan and the kick, when the heat gate would strand energy, Steinhaus converts durability into
  heat headroom (down to 25 %). The licence is a runtime fallback only: the sprint plan prices heat
  at `capLim` for everyone (11.3). Reason (prototype): letting the plan or the style modes use the
  licence made falke burn 104 of 140 durability per race (and durability persists across the
  season) for **zero** time gain, because under brief constants energy, not heat, is the binding
  resource (R2); restricted to KICK and PLAN it overheats 0-7 ticks per race at equal time. The rule
  gains value when the balance pass lowers `kE` and heat starts to bind.
- An immunity holder (`hot-head`) may overheat only if it is projected to cool back below the cap
  before its immunity ends; otherwise it is governed like everyone.
- Non-licensed runners (everyone else) never overheat: with `heat + kH ≤ capLim` before a boost
  tick, heat after the tick is ≤ `capLim ≤ heatCap`. At the cap a governed runner settles at the
  heat-neutral duty `coolTick / (kH + coolTick)` = 1/3.

**Final absorption `capFinal[b]`** (energy the final plan window can actually spend; used by
`SURPLUS`): window `[planPoint, absorbEnd[b])` with `planPoint = finalStart` (hover:
`hoverAttack`) and `absorbEnd[b] = min(kickAt, exhaust0[b])`, where `exhaust0[b]` is the
position at which `hpMax` runs out at cruise from the gun: walk the pieces of the course (segments
split at `startEnd` and `finalStart`), each costing `ceilDiv(piece', vC[b][ph][s])` ticks at
`fl(r × r × dK[ph == PH_FINAL ? final : nonfinal], 10^6)` µhp per tick (`r = fl(vC × 1000,
VBASE)`); in the first piece where the running sum exceeds `hpMax`, `exhaust0 = min(pieceEnd,
pieceStart + fl(hpMax − sum, drain) × vC)`; if never, `L`. `finTicks[b] = Σ ceilDiv(overlap',
vC[b][PH_FINAL][s])` over the **thrust-capable** segments of the window (`'` = × `detour`/1000 on
jump segments for ground runners; for every other runner a jump segment is skipped, because thrust
is impossible there: airborne, or on foot after a crash). Continuous: `capFinal = min(finTicks, fl(capLim + finTicks × coolTick, R.kH + coolTick))
× R.kE` (heat-aware from cold). Pulse: `capFinal = fl(finTicks × R.pulseTicks, R.pulseTicks +
R.pulseCooldownTicks) × pulseCostMe` (max cadence). 0 if the window is empty. The hp cut matters:
without it an hp-tight Kōryū (PW 1.4) reached the canyon final with a full tank, exhausted at
2.24 km and wasted 86 energy (thrust is off at hp 0); with it `SURPLUS` spends the excess before the
final. Values (600 stats, PW 1.0, D 60, C 600, noise off): sprint 99 000 me; ridge 134 000 (jump 2's
80 m excluded; it was 152 000 when jump ticks counted); canyon 188 000 (`absorbEnd` 2778.6 m);
shiden canyon 16 800 (`absorbEnd` 2128.6 m), ridge 25 200 (`absorbEnd` 1519.7 m), sprint 52 800.

**Ground level `groundLevel[b]`** (vu): `preTicks[b] = Σ ceilDiv(piece', vC[b][ph][s])` over the
pieces of `[0, finalStart)` split at segment boundaries and at `startEnd` (`piece'` × `detour`/1000 on jump
segments); `groundLevel = min(sMax[b], fl(Bon[b] × fl(Emax × R.style.groundPreShare, 1000),
max(1, preTicks) × costOn))`: the level that spends `groundPreShare` (60 %) of the tank evenly
before the final.

### 9.4 Modes, precedence and the style table

First match wins. `prevMode`/`prevLevel` are the runner's mode and level of its previous
non-stalled tick.

| # | Mode | Condition | Want |
| --- | --- | --- | --- |
| 1 | `KICK` | `ph == PH_FINAL && pos ≥ kickAt` | every tick (pulse frame: fire when ready) |
| 2 | `PLAN` | `planActive && planLevel > 0 && planStartPos ≤ pos < planEndPos` | level mode at `planLevel` |
| 3 | `HOLD` | `planActive` | none |
| 4 | `PREHEAT` | `traits.heatToEnergyPm > 0 && ph ≠ PH_FINAL && finalStart − pos ≤ ceilDiv(max(0, capLim − heat), R.kH) × vC[b][ph][seg]` | every tick (gate at `capLim`, no licence) |
| 5 | `SURPLUS` | `ph ≠ PH_FINAL && energy − jr[seg] − capFinal[b] ≥ costBoost` | every tick (gate at 800 ‰) |
| 6 | `REGEN` | `ph ≠ PH_FINAL && regenTick > 0 && energy + 2 × regenTick ≥ Emax` | every tick (gate at 900 ‰) |
| 7 | style | style table below | per table |
| 8 | `OFF` | otherwise | none |

`planActive` becomes 1 at `planPoint` (finalStart; hover: hoverAttack, BRIEF "ataca al 70 %").
Hover between 2/3 and 70 % keeps its style rule.

**`kickAt` (where KICK starts).** For ground runners `kickAt = reserveAt`. For every other runner,
if a jump segment overlaps `[reserveAt, L)`, `kickAt = min(reserveAt, segStart)` of the first such
jump: a terminal jump that contains `reserveAt` (course `[flat 1000, jump 100]`, `reserveAt` 1040 m)
moves the kick and the plan's window end to the jump entry (1000 m), because nothing can be spent
inside the jump. On the three v1 courses `kickAt = reserveAt`. The jump reserve is still kept by
every gate, so the kick never spends the lift energy of the terminal jump.

| Style | Mode | Intent condition | Want | Brief text implemented |
| --- | --- | --- | --- | --- |
| dive | `DIVE_DESCENT` | `ph ≠ PH_FINAL && segType[seg] == DESCENT` | `keepOk(R.style.diveKeep)` (50 %) | "conserva energía y hp; gasta todo en descensos y en el sprint final" |
| hover | `HOVER_CATCHUP` | `posFrac > R.style.packHi` (behind the middle pack) | `keepOk(R.style.hoverKeep)` (50 %) | "se mantiene en el pelotón medio; ataca al 70 %" |
| glide | `GLIDE_CHASE` | `ph ≠ PH_FINAL && ahead > 0` (not leading) | `keepOk(R.style.glideKeep)` (60 %) | "toma la punta con crucero eficiente; boost mínimo" |
| ground | `GROUND_CONSTANT` | `ph ≠ PH_FINAL && energy − jr[seg] ≥ fl(Emax × (1000 − R.style.groundPreShare), 1000)` | level mode at `groundLevel[b]` | "constante" |

**Style hold** (judge 2's minimum block; legibility): for hover and glide on continuous frames,
when the intent condition produces `want = 1` and `holdLeft == 0`, set
`holdLeft = R.style.styleHoldTicks` (12). While `holdLeft > 0` the mode stays the same style mode
with `want = 1` (intent and keep ignored, gates still apply); `holdLeft` decrements at the end of
every non-stalled tick and is cleared when a mode of rows 1-6 is selected. This prevents 1-tick
on/off toggling when ranks swap; two glides fighting for the lead trade 12-tick spans.

### 9.5 Level modes and the accumulator (from level to binary per-tick boost)

```
levelMode = mode ∈ {PLAN, GROUND_CONSTANT}
if (mode, level) ≠ (prevMode, prevLevel): acc = 0; event boostMode {mode, levelMms: fl(level, 15)}
jumpBlocked = airborne || (segType[seg] == JUMP && style ≠ ground)
if levelMode && !jumpBlocked: acc = min(unit[b] + level, acc + level)
if levelMode: want = acc ≥ unit[b]
on a continuous boost tick in a level mode: acc −= unit[b]
on a pulse fire in a level mode:            acc −= unit[b]      // unit = Bon × pulseTicks (table 3.3); acc also accrues during burst and cooldown
```

Over N unblocked ticks the number of continuous on-ticks is exactly `fl(acc0 + N × level, unit)`,
so the average thrust equals the level with an error of at most one on-tick. The cap is
`unit + level`, not `unit`: in normal operation `acc` stays below `unit + level`, so the cap never
binds and no overflow is lost (a cap at `unit` silently drops the excess and realises a duty of
1/2, 1/3, … instead of the planned one: the prototype realised 1/3 for a planned 0.43). If a gate
blocks, `acc` saturates at `unit + level` and fires once as soon as the gate allows (bounded
catch-up of one on-tick). A jump segment is not a gate block: the plan (11.3) gives it no on-ticks,
so the accumulator does not accrue there (`jumpBlocked`) and resumes on landing exactly where the
plan expects it. Boost stays
binary per tick everywhere (the brief's `boostOn`), one mechanism serves continuous boost and
pulses, and the frames' per-row boost count shows the exact duty (20.4).

### 9.6 Continuous decision (non-pulse frames)

```
decide(i):                                          // step B7
  boostOn = 0; isPulseTick = 0; freeTick = 0; thrust = 0
  (mode, level, want) = selectMode(i)               // 9.4, 9.5
  if pulseFrame: pulseStep(i, mode, want); return   // section 12
  if want && gatesOk:
      boostOn = 1; thrust = B[b]
      if freeLeft > 0:                     freeTick = 1; freeLeft −= 1
      else if freeMask has bit segType[seg]: clear bit; freeLeft = R.freeBoostMaxTicks − 1; freeSeg = seg;
                                           freeTick = 1; event freeBoost {segment}
      if levelMode: acc −= unit[b]
```

### 9.7 What the qualitative styles mean mechanically

- **Glide "sufre si la alcanzan":** (a) "crucero eficiente": while a glide holds the lead
  (`ahead == 0`, shared lead included) its hp drain uses `dK × R.glideLeadDrainPm` (980); caught,
  it loses that efficiency; (b) when not leading in the start and middle phases it spends energy
  down to 60 % to retake the lead, so it reaches the sprint with less energy and more heat. Both
  are visible in the log (rank, `GLIDE_CHASE` mode events, ledger). 980 (revision 2, was 950):
  with the launch term of 9.8 glide leads more often, and at 950 it wins 44 % of the canyon in S1
  (revision-2 constants otherwise); at 980 it wins 33 % (at 900 a lone glide skipped canyon
  exhaustion entirely).
- **Ground "resiste daño":** every durability loss of a ground runner (overheat, water, crash) is
  multiplied by `R.groundDamagePm` (500); ground detours every jump (never crashes, never lands)
  and its low constant duty rarely heats.
- **Hover "regenera si el bastidor lo permite":** no regen of its own; it collects its frame's regen
  on unboosted ticks (Lumière, regen traits), multiplied in the pack by `regen-pack-multiplier`;
  `REGEN` mode spends what a full tank would waste.
- **Dive "conserva energía y hp":** no boost before the final except on descents, half the tank
  kept for the sprint; not boosting is how it conserves hp (a boosted tick at 26.5 m/s drains 27 %
  more than cruise).

### 9.8 Style terms: the phase where each style shines (BRIEF §5 column "Fase donde brilla")

Under brief constants every energy unit buys the same metres whenever it is spent (R2), so the
controllers of 9.4 alone give four styles with identical solo times (revision 1 measured dive,
hover and glide at 54.47 s on the sprint and S1 at 25/27/26 %, noise). Each style therefore has
**one term whose value depends on phase, position or terrain**, and its controller already
spends or positions where that term pays. All four are in `R.style` and in the log.

| Style | Term | Exact rule | Brief text | Phase it serves |
| --- | --- | --- | --- | --- |
| dive | **stoop** (`diveStoopPm` 1400) | thrust × 1.4 on `descent` segments and in the final phase (pulses included); the plan's `Bon` carries it | "gasta todo en descensos y en el sprint final" | final (and descents) |
| hover | **slipstream** (`hoverDraftPm` 1020) | in the middle phase, while `inPack` (snapshot of 9.1), the body target is × 1.02; never when exhausted; frame flag `drafting`, ledger `draftTicks` | "se mantiene en el pelotón medio" | middle |
| glide | **launch** (`glideStartAccelPm` 1100) | acceleration × 1.1 in the start phase (`accStart`), on top of the shared start dash | "toma la punta" | start (and middle, through the lead drain of 9.7) |
| ground | **obstacle route** (`groundDetourMult` 1100, landing of 14.2) | detours a jump at 1.1 × length with no lift energy and no landing loss; flyers pay lift and the landing loss | "evita `jump` por rutas de suelo más largas" | obstacle courses |

The hover slipstream is a position effect beyond BRIEF §6 "Pelotón" (which lists only
`positionRange` triggers and hover regen): ADR-0003 D44 records it. Measured (prototype, S1 at
800 races per course, neutral fixtures, v1 constants): desert mean dive 25.6 %, hover 26.3 %,
glide 26.2 %, ground 22.0 %; mean phase splits put glide fastest in the start phase on all three
courses, hover fastest in the middle on the sprint and the canyon (ground on the ridge, its
obstacle course), dive fastest in the final on all three, and ground wins the ridge (38 %).
Tables in 25.4. The constants are first values for the D14 pass, not tuned results.

## 10. How Intelligence acts (item 10)

`I` = effective intelligence: mood × **style aptitude of the frame's style** (`effectiveStats`)
plus `falconess-stat` deltas. A worse style aptitude lowers I and degrades all three channels: the
brief's "peor estilo = peores decisiones de boost". Every channel is drawn before tick 0 from the
runner's block (section 17); none draws in the loop.

1. **Skill activation** (main channel, brief formula; section 15): I 300 → 700 ‰, 600 → 850 ‰,
   900 → 900 ‰.
2. **Pace judgement (revision 2: fixed width, centre rising with I):**
   `W0 = R.paceHalfWidth` (43 ‰, the same for every I);
   `c = fl(R.paceCentreSpan × min(I, 1200), 1200) − fl(R.paceCentreSpan, 2)` ‰ (span 43:
   I 0 → −21, I 300 → −11, I 510 → −3, I 600 → 0, I 630 → +1, I 1000 → +14, I ≥ 1200 → +22);
   `pace[ph] = uRange(U[slot ph], c − W0, c + W0)` for ph = 0, 1, 2. It multiplies that phase's
   cruise and exhaustion speed (`vC`, `vMin`). A smarter runner judges a faster line on average;
   every runner keeps the same spread, so the window sets the §12 dispersion and the centre gives
   Intelligence a mean effect. This is the commonly reconstructed Umamusume section-speed rule
   (a fixed-width random window whose bound rises with Wisdom), per phase so it reads in the log as
   "she judged the middle phase well". Revision 1 used a zero-mean window that narrowed with I:
   it only reduced variance, which **lowers** the win rate of an equal runner in a field (measured:
   I 300 won 15.1 % and I 1000 won 6.9 % of an equal 8-runner sprint), and style aptitude, which
   acts through I, then rewarded the worse letter.
3. **Plan perception (boost decisions):** `We = fl(R.planErrorMax × (1200 − min(I, 1200)), 1200)` ‰
   (150 → 0; I 600: 75); `planErr = uRange(U[slot 3], −We, +We)`. The sprint plan (11) sees
   `Ep = fl(energy × (1000 + planErr), 1000)` and `hpP = fl(hp × (1000 + planErr), 1000)`.
   Over-estimation plans too long a spurt (energy runs out early, hp empties early: `hpEmpty`);
   under-estimation leaves energy for the kick, where the heat gate may waste some. Logged as
   perceived vs real values in the `sprintPlan` event. This channel is zero-mean but every error
   costs time, so narrowing it with I raises the expected result (it never inverts the ranking).

**Gates always use true values** (fixes judges' fatal flaw "judgement bias on the gates"): a jump
failure is a build problem (tank × technique), never an Intelligence lottery; an overheat is a rule
property (Steinhaus, immunity), never a misjudged gate. Measured effect sizes (spec prototype,
revision 2): +100 I from 600 is worth ≈ 0.36 % of speed through the pace centre (≈ 7 m on 2000 m)
plus 0.2-0.9 m through skills; agility +100 is ≈ 2.5 % (≈ 50 m). Win rate of one runner in an
otherwise equal 8-runner field (I 600 hovers, noise on, 1500 races per cell): sprint I 300 4.3 %,
I 510 8.8 %, I 600 11.1 %, I 630 12.3 %, I 1000 31.3 %; ridge 4.5 / 8.9 / 11.0 / 11.6 / 31.3 %;
canyon 4.2 / 8.6 / 10.5 / 11.3 / 32.5 %. Win rate is non-decreasing in I and in the style letter
(A → I 630, E → I 510 at base 600), which the batch now checks (S8, 25.2).

## 11. Final sprint plan (item 11)

### 11.1 When

- **First plan:** on the first tick with `pos ≥ planPoint` (finalStart; hover: hoverAttack), at
  step B1 `planActive = 1; replan = 1 (cause phase)`; executed at step B6, after heat-to-energy
  (B1), skills (B3) and jump resolution (B4).
- **Replans** (at most `R.maxReplans` = 4 after the first plan; a replan flag past the cap is
  dropped): (a) an `energyRefund` skill fires while `planActive` (brief); (b) a non-ground runner
  leaves a jump segment while `planActive` (its jump reserve is released: ridge jump 2 is inside
  the final; since the plan already skips jump distance, this replan only re-prices the released
  reserve and the landing loss, it no longer rescues a spurt stranded in the air); (c) the wings break while `planActive` (tables change). A replan always starts from
  the current position.
- Exhausted at plan time → `NONE("exhausted")`.

### 11.2 Brief mapping

"Compute the sustained boost level that leaves energy = 0 exactly 60 m before the finish" is the
uncapped candidate: its spurt ends at `kickAt` (`reserveAt` unless a jump contains it) and spends
all perceived energy. "If energy
cannot cover the whole phase, try candidates lowering the speed by 0.1 m/s and choose the one that
minimises the estimated total time" is the top-down loop: over a fixed window, maximising net
metres gained is minimising time. The level is an **average thrust** (vu); the accumulator of 9.5
turns it into binary per-tick boost (exact duty, no throttle in the physics). Heat and hp price the
candidates (they are the reason the candidate loop exists: with energy linear in metres the raw
gains tie).

### 11.3 Algorithm (exact integers)

**Thrust coordinates (revision 2).** A non-ground runner can never thrust on a jump segment
(airborne, or on foot after a crash), so the plan spends only over *thrust-capable* distance and
places no on-tick inside a jump. Revision 1 counted jump ticks as spendable: with a jump inside the
spurt the accumulator saturated there, the energy was stranded, and with a terminal jump
(`[flat 1000, jump 100]`, `reserveAt` inside the jump) the whole kick was airborne (prototype: 12-16
energy left at the line; hp-limited ridge spurts of PW 1.4 frames crossing jump 2 left 15-24).

Definitions over the segments overlapping `[x0, x1)` (`overlap_s` in pu, `vF[s] = vC[b][PH_FINAL][s]`):
`thrustable(s) = !(segType[s] == JUMP && style ≠ ground)`;
`route(s, d) = (style == ground && segType[s] == JUMP) ? fl(d × detour, 1000) : d` (the ground
detour is longer than the segment);
`thrustDist(x0, x1) = Σ_{thrustable s} route(s, overlap_s)`;
`thrustTicks(x0, x1) = Σ_{thrustable s} ceilDiv(route(s, overlap_s), vF[s])`;
`drainF(v) = fl(r × r × dK[final], 1 000 000)` with `r = fl(v × 1000, VBASE)`;
`cruiseHp(x0, x1) = Σ_{all s} ceilDiv(route(s, overlap_s), vF[s]) × drainF(vF[s])` (hp drains on
jump ticks too);
`exhaustPos(x0, budget)`: walk all segments from `x0`, accumulating `h_s = ceilDiv(route(s,
overlap_s), vF[s]) × drainF(vF[s])`; in the first segment where `acc + h_s > budget` let
`k = fl(budget − acc, drainF(vF[s]))` and return `min(segEnd', segStart' + adv)` with
`adv = k × vF[s]` (ground on a jump: `fl(k × vF[s] × 1000, detour)`; `'` = the overlap); if never,
return `L`;
`mapBack(xEnd, X)`: walk the thrust-capable overlaps of `[pos, xEnd)` backwards from `xEnd`,
subtracting `route(s, overlap_s)` from `X`; in the segment where the rest `X'` fits return
`overlapEnd − X'` (ground on a jump: `overlapEnd − fl(X' × 1000, detour)`); if never, `pos`. It
converts a spurt of thrust distance `X` that ends at `xEnd` into its start position, skipping jumps.

```
planSprint(i, cause):
  planCount += 1
  Dw0 = thrustDist(pos, kickAt);             if Dw0 ≤ 0: return NONE("past-reserve")
  Ep  = max(0, fl(energy × (1000 + planErr), 1000) − jr[seg])
  hpP = fl(hp × (1000 + planErr), 1000)
  if Bon[b] == 0: return NONE("no-thrust")
  if Ep < (pulseFrame ? R.pulseTicks × costOn : costOn): return NONE("no-energy")
  // 1. window end: cut where the projected hp runs out (thrust is disabled at hp 0)
  cbar0   = max(1, fl(Dw0, max(1, thrustTicks(pos, kickAt))))
  extraHp = fl(Ep, costOn) × max(0, drainF(cbar0 + Bon[b]) − drainF(cbar0))
  hpCruise = cruiseHp(pos, L);  wEnd = kickAt;  hpLimited = false
  if hpCruise + extraHp > hpP:
      xE = exhaustPos(pos, max(0, hpP − extraHp));  if xE < wEnd: wEnd = xE; hpLimited = true
  Dw = thrustDist(pos, wEnd);                 if Dw ≤ 0: return NONE("hp-limited")
  cbar = max(1, fl(Dw, max(1, thrustTicks(pos, wEnd))))   // mean cruise over thrust-capable ticks (vu)
  drainC = drainF(cbar); drainOn = drainF(cbar + Bon[b]); vMinF = vMin[b][PH_FINAL][S − 1]
  best = none; nCand = 0
  for (s = sMax[b]; s > 0; s −= R.sprintLevelStepMms × 15):        // 1500 vu = 0.1 m/s, top down
      nCand += 1
      v    = cbar + s
      TwS  = ceilDiv(Dw, v)                                        // ticks to cross the window at level s
      eTB  = s × costOn − (Bon[b] − s) × regenTick                  // energy per tick × Bon
      tbE  = eTB > 0 ? fl(Ep × Bon[b], eTB) : TwS
      capped = tbE ≥ TwS
      tb   = capped ? TwS : tbE;                                   if tb == 0: continue
      X    = capped ? Dw : tb × v                                   // spurt length (thrust distance, pu)
      nOn  = pulseFrame ? R.pulseTicks × fl(s × tb, unit[b]) : fl(s × tb, Bon[b])
      gainPlan = pulseFrame ? nOn × Bon[b]                          // pulses are whole: quantised gain
               : capped ? fl(s × Dw, v) : fl(s × Ep × Bon[b], eTB)  // pu gained by thrust; exact ties w/o regen
      hold = fl(Dw − X, cbar)                                       // jump ticks also cool: ignoring them is conservative
      h1   = sub0(heat, hold × coolTick)                            // heat when the spurt starts
      hOn  = capLim ≥ h1 ? fl(capLim − h1 + tb × coolTick, R.kH + coolTick) : 0   // on-ticks the gate allows
      clean = nOn ≤ hOn
      gain = clean ? gainPlan : min(gainPlan, hOn × Bon[b])
      need = hpCruise − (ceilDiv(X, cbar) − tb) × drainC + min(nOn, hOn) × (drainOn − drainC)
      pen  = need > hpP ? ceilDiv(need − hpP, max(1, drainC)) × (cbar − min(cbar, vMinF)) : 0
      net  = gain − pen
      if best == none || (clean && !best.clean) || (clean == best.clean && net > best.net):
          best = { s, X, tb, nOn, net, clean }
  if best == none: return NONE("no-candidate")
  planLevel = best.s; planStartPos = mapBack(wEnd, best.X); planEndPos = wEnd
  event sprintPlan {...}                                             // 20.4
```

`NONE(reason)`: `planLevel = 0`, `planStartPos = planEndPos = pos` (the runner holds until `KICK`),
event `sprintPlan` with that reason and `levelMms = 0`. Integer bounds: `s × Ep × Bon ≤ 2.4e15`,
`Ep × Bon ≤ 2.2e10`, `fl(Ep, costOn) × drain ≤ 200 × 1.5e6` (1.5).

- **Ties:** without regen, every uncapped clean candidate has exactly the same `gainPlan`
  (`fl(s × Ep × Bon, s × costOn) = fl(Ep × Bon, costOn)`), so the strict comparison keeps the
  **highest** clean level: the latest, shortest spurt (Umamusume's last spurt, legible as a sprint).
  Regen breaks ties towards lower levels (more off-ticks to regenerate), correct for Lumière.
- **Clean first:** a candidate whose planned on-ticks exceed what the heat gate allows is
  "unclean"; any clean candidate beats any unclean one. A clean candidate always exists when
  `Ep ≥ costOn` and `capLim ≥ 2 kH` (low levels spread the energy over the whole window).
- **Heat is priced at `capLim` for every rule** (telemetry: raw dissipation). The overheat licence
  (9.3) is a runtime fallback in `PLAN` and `KICK` only; planning on it burned durability for no
  time gain in the prototype.
- **Pulse frames** count only whole pulses (`nOn` quantised to bursts of 12): a level too low to
  fire a single pulse in the window gains nothing (the unquantised rational gain made the
  prototype pick a level with zero pulses on an hp-limited canyon window).
- **HP:** the window is cut where hp is projected to run out; a candidate that still empties hp is
  penalised by the metres lost at `vMin`. Energy left at exhaustion cannot be used (thrust off).
- **Kick:** from `kickAt` (9.4; `reserveAt` unless a jump overlaps the last 60 m) every runner boosts every tick (pulse: fires whenever ready) while
  energy and gates allow, so perception errors, refunds and rounding are used, not wasted. Leftover
  energy at the line is in the ledger.
- **Sustained level → per-tick boost:** the accumulator (9.5), `PLAN` mode in
  `[planStartPos, planEndPos)`, `HOLD` before the spurt (the runner cools and regenerates), `KICK`
  from `kickAt`.
- **Pulse frames:** `Bon = fl(Bp × pulseBiomePm, 1000)` (× stoop for dive), `costOn = 1200`, `unit = Bon × 12`, `sMax = fl(unit, 42)` (max
  cadence 12/42); `pulse-cooldown` shortenings and chain bonuses are ignored by the estimate (they
  only make spending easier). The heat estimate uses the same budget formula.
- **Cost:** ≤ ~70 candidates × ~25 integer ops + three O(S) walks, at most 5 times per runner per
  race: negligible.

### 11.4 Worked values (600-balanced, PW 1.0, E 100, D 60, C 600, dive, noise off)

Measured with the spec prototype (25.4, revision 2 constants). Dive carries the stoop (9.8), so
its `Bon` is 63 000 vu (4.2 m/s) in the final; a neutral hover (no style term solo) plans exactly
as revision 1 (sprint 1.30 m/s from 841 m).

- Sprint: `capFinal = 99 000`, so `SURPLUS` spends 1 energy at the gun; at 800.8 m `Ep = 99`,
  window 339 m (the 800-950 m curves included); a clean plan needs ≈ `3 × 99 − 69` spurt ticks, so
  the highest clean level is **1.80 m/s from 801 m** (90 planned on-ticks), the tank is empty at
  1140 m, finish 54.12 s.
- Ridge: dive spends 15 energy on the first descent (keeps 50 % + the 35-energy jump reserve), jump 1
  costs 20 and its landing −14 % of speed (14.2); at 1334 m `Ep = 65 − 15 (jump 2 reserve) = 50`,
  `thrustDist` skips jump 2 (1500-1580 m), and the plan picks **2.60 m/s from 1800 m** (after jump 2:
  the latest clean spurt); the jump-exit replan at 1580 m confirms it. Finish 86.91 s.
- Canyon: hp binds (600 St empties at ≈ 2.82 km): `hp-limited`, window `[2001, 2758)` m, **1.80 m/s
  from 2365 m**, 99 on-ticks; exhaustion at 2818 m with the tank empty (no energy wasted).
- Fixtures for the jump rules of this section (unit tests, 24.1): course `[flat 1000, jump 100
  (lift 20)]`: `kickAt = 1000 m`, the plan ends at 1000 m, no planned on-tick lies in the jump;
  revision 1 left 12 (dive) and 16 (hover) energy at the line, revision 2 leaves 6 and 4 (heat-gate
  and quantisation rest). Ridge, PW 1.4, 600 stats, hp-limited spurt across jump 2: energy at the
  line 15 → 1 (dive) and 24 → 0 (hover); St 350 hover 11 → 1.

## 12. Kōryū pulse rule (item 12)

Applies when `pulseFrame` (`rule == pulse && !traits.noPulse`).

| Item | Rule |
| --- | --- |
| Burst | `R.pulseTicks` = 12 ticks with `boostOn = 1`, thrust `Bp` (×1.35 k_boost·PW) or `Bpc`, × `airPm[seg]` (13.1: desert 1.15, descent ×1.2, water ×0.6) and dive's stoop (9.8), cost `pulseCostMe = 1200` me per tick (burst 14 400), heat `+kH` per tick (burst +24 000), no cooling and no regen during the burst |
| Fire | `pulseLeft == 0 && pulseCd == 0 && want && canThrust && (freeAvail \|\| energy − 14 400 ≥ jr[seg]) && (heat + 24 000 ≤ capMode \|\| (licMode && licenceOk))`, with `capMode = heatCap = D × (1 + 0.3·C/1200)` (800 ‰ / 900 ‰ of it in `SURPLUS` / `REGEN`): the brief rule verbatim, and a pulse never overheats |
| Running | runs all 12 ticks (its energy was checked for the whole burst); it ends early only when `canThrust` turns false (takeoff, crash/stall, jump segment, exhaustion); the cooldown then starts |
| Cooldown | `cdFire = min(R.pulseCooldownTicks, traits.pulseCooldown[segType at the fire tick])` (0 entries mean "none"); counts down on every non-stalled tick (airborne and hold included), frozen during a stall |
| Consecutive | the first tick on which a new pulse may fire is `readyAt`; a pulse fired exactly at `readyAt` continues the chain (`chain += 1`), any other pulse restarts it (`chain = 1`) |
| `pulse-chain-accel` | a pulse whose `chain % traits.pulseChainIndex == 0` uses `Bpc = Bp × (1 + accelBonus)` for its whole burst (third-pulse: every 3rd consecutive pulse +20 %; pulse, pulse, big pulse) |
| `no-pulse` | the frame boosts continuously (`B`, `kE`, `kH`, continuous gates); no effect on frames of other rules |
| `free-first-boost` | the first pulse fired on a segment of the masked type costs 0 for its 12 ticks |
| Plan | the definitions of table 3.3 and 11.3, nothing else: `Bon = fl(fl(Bp × R.pulseBiomePm[biome], 1000) × (style == dive ? R.style.diveStoopPm : 1000), 1000)`, `costOn = pulseCostMe`, `unit = Bon × R.pulseTicks`, `sMax = fl(unit, R.pulseTicks + R.pulseCooldownTicks)` (max cadence 12/42). Desert values: shiden (dive, PW 1.4) `Bp` 85 050 → 97 807 → `Bon` 136 929, `unit` 1 643 148, `sMax` **39 122 vu (2.61 m/s)**; hayate (ground, PW 1.2) `Bp` 72 900 → `Bon` 83 835, `unit` 1 006 020, `sMax` **23 952 vu (1.60 m/s)** (25.4 sanity rows). Accumulator accrues every tick (burst and cooldown included), capped at `unit + level` (9.5) |
| Kick | fire whenever ready |

```
pulseStep(i, mode, want):
  if pulseLeft > 0:                                   // burst in progress
      if !canThrust: pulseLeft = 0; pulseCd = cdFire; return            // aborted
      boostOn = 1; isPulseTick = 1; freeTick = burstFree; thrust = burstChain ? Bpc[b] : Bp[b]
      pulseLeft −= 1; if pulseLeft == 0: pulseCd = cdFire
      return
  if pulseCd > 0:                                     // cooldown tick
      pulseCd −= 1; if pulseCd == 0: readyAt = t + 1
      return
  if want && gatesOk(pulse):                          // fire
      chain = (t == readyAt && chain > 0) ? chain + 1 : 1
      burstChain = traits.pulseChainIndex > 0 && chain % traits.pulseChainIndex == 0
      cdFire = min(R.pulseCooldownTicks, traits.pulseCooldown[segType[seg]] or R.pulseCooldownTicks)
      burstFree = freeMask has bit segType[seg]; if burstFree: clear bit; event freeBoost
      boostOn = 1; isPulseTick = 1; freeTick = burstFree; thrust = burstChain ? Bpc[b] : Bp[b]
      pulseLeft = R.pulseTicks − 1; if pulseLeft == 0: pulseCd = cdFire
      if levelMode: acc −= unit[b]
      event pulse {chain, thrustMms, free: burstFree, cooldown: cdFire}
```

Timeline: fire at t0 (on-tick 1) … t0 + 11 (on-tick 12, cooldown set to 30); cooldown ticks
t0 + 12 … t0 + 41; `readyAt = t0 + 42`: one pulse every 42 ticks at max cadence. A takeoff at jump
resolution (14.2) also ends a running burst and starts its cooldown.

Sanity: at max cadence heat moves +24 −30 per cycle (never binds at D ≥ 60); with
`pulse-cooldown 20` it moves +24 −20 (binds after ~11 cycles at D 60). Per unit of thrust a pulse
costs 0.89× the energy of continuous boost (1.20 / 1.35), 0.77× in the desert with the intake term
of 13.1 (1.20 / (1.35 × 1.15)); its edge is yield per energy, its limit the cadence. `SURPLUS` spends before the final what the cadence cap would otherwise waste: a
final window of `finTicks` absorbs at most `fl(finTicks × 12, 42)` on-ticks; for shiden (PW 1.4,
100 tank) on the sprint that is 52.8 energy (its window is also cut at its projected exhaustion,
1123 m), so ≈ 3 pulses go out before the final.

## 13. The other four manufacturer rules (item 13)

Each rule lives in `packages/sim/src/rules/<rule>.ts` and exports a `RuleSpec` compiled at race
start into numeric fields of the runner (`ruleCode`, `capLim`, `ruleMult` in `dmgTick`, regen
base, activation bonus, repair amount, licence flag, pulse flag, the rule term of 13.1).
`rules/index.ts` is an exhaustive `Record<RaceRule, RuleSpec>` (3.4: `none` is the no-op spec of
the neutral fixture); the hot loop switches on small integers, no virtual dispatch.

| Rule | Exact semantics |
| --- | --- |
| `mass-thrust` (Steinhaus) | Overheated ticks never apply ×0.92. Each overheated tick costs `dmgTick = 2000` md (×0.5 for ground = 1000) unless guarded ("calor excedente drena durability ×2"). Holds the overheat licence (9.3): in `PLAN` and `KICK`, when the heat gate would block a wanted boost tick, it may boost past `heatCap` while its projected durability after the cooling tail stays above 25 %. The plan itself prices heat at `heatCap` like everyone (11.3). |
| `regen` (Lumière) | Every non-boost tick (cooldown, hold, airborne and stalled ticks included): `energy = addCap(energy, regenEff, Emax)`, `regenTick = R.regenPerTick (500 me) + traits.regenMe`, ×`packRegenMultPm` in the pack. "Capacidad baja" is the frames' low tank (content), not a rule. The same code path gives `regen` traits to frames of other rules (base 0). `REGEN` mode (9.4) spends a nearly full tank instead of wasting regen. |
| `telemetry` (Altair) | (1) `capLim = D` (raw dissipation, no courage tolerance): the gate `heat + heatAdd ≤ D` means heat never exceeds dissipation; (2) defensive clamp `heat = min(heat, D)` after every heat update, asserted as a no-op in tests; never overheated, never heat-damaged, no licence; at the cap the sustained duty is exactly 1/3; (3) `+R.telemetryActivationBonus` (150 ‰) additive on every skill check; (4) the PW cap 1100 is already applied by `resolveFrameBuild`; the engine does nothing more. A gate, not a clamp: a clamp would give free boost exactly where heat binds (balance measured Altair winning its weak sprint 50 % with a clamp, 2 % with a governor). |
| `repairable` (Boneyard) | On **entering** a `flat` segment by crossing its start (index ≥ 1; the starting segment is not entered): `dur = addCap(dur, R.repairablePerFlatSegment × 1000, durMax)`; event `repair {amount}` only if it rose; never clears `broken`. The two quirk slots are a frame property (content, `resolveFrameBuild`). |
| `pulse` (Kōryū) | Section 12. |
| `none` (fixture) | No effect (3.4). |

Each rule's term (13.1) is compiled with the rule's `RuleSpec`. That does not make it part of the
rule's mechanism: it is a numeric bonus or penalty, which BRIEF §7 excludes, and three of the five
terms act outside their rule's mechanism. ADR-0003 D45 records that deviation.

### 13.1 Rule terms: where home and weak cells come from (BRIEF §7, §12 metric 2; numeric, ADR-0003 D45)

Revision 1 had no rule term keyed to terrain, so no home or weak cell could come from a rule. At
equal PW its own tables inverted them: Lumière beat Kōryū on all three desert courses, Lumière was
the fastest frame on the ridge, and Steinhaus and Boneyard had no time term. Revision 2 gave each
`RuleSpec` one numeric term.

**These terms are numeric bonuses and penalties, which BRIEF §7 excludes** ("implementada como
`ManufacturerRule` en `packages/sim/rules/`, no como bonificación numérica"). They live in the
rule's file (`rules/<rule>.ts`), but that code location does not put them inside the rule's
mechanism.

- Two act inside their rule's mechanism, keyed to a biome or a segment type: Steinhaus's cooling
  (heat and the licence) and Kōryū's burst thrust (pulses).
- Three act outside it:
  - Lumière's landing loss is a jump term; regen is untouched.
  - Boneyard's landing, detour and curve terms are segment terms; repair is untouched.
  - Telemetry's drain and acceleration term is **global**: it applies on every segment of every
    course, with no segment or biome key. It is a flat stat swap (≈ +178 St and −180 T at 600 /
    600), and its home and weak cells come from course length: hp binds on a long race, and the
    launch is a large share of a short one.

Why the deviation: under brief constants the brief's own mechanisms cannot make these cells.
Regen, telemetry and repairable have no terrain key. Two of them are worth almost no time: repair
matters only once durability reaches 0, and at `kE` 1000 telemetry's heat gate hardly binds,
because energy, not heat, limits boost (R2). A term confined to those mechanisms could not
produce the §7 cells that metric 2 measures. ADR-0003 D45 names the deviation and the owner's
alternatives. Course traits (`sprint`,
`long`, `obstacles`, `pure-speed`) are labels of segment composition and length; no rule reads a
trait directly.

| Rule | Term (constants) | Exact rule | Where it acts | Stat equivalent (600 stats, PW 1.0) | Intended cells (v1 desert) |
| --- | --- | --- | --- | --- | --- |
| `mass-thrust` | **ambient cooling** `massThrustCoolPm[biome]` (desert 500, urban 500, coast 1000, mountain 1250, tundra 1250) | `coolTick × massThrustCoolPm[biome]` for Steinhaus frames (table `coolTick`, 3.3): the heavy engine needs cold air; its licence turns the missing headroom into ×2 durability wear | inside the rule (heat, licence); keyed to the biome | none: at the neutral knobs of D38 no stat moves cooling. At the heat cap a governed runner's sustained duty falls from 1/3 to 1/5 (`cool / (kH + cool)`), and the licence's cooling tail doubles | weak desert (all three courses); home tundra/mountain (no v1 course) |
| `regen` | **light airframe** `regenLandLossPm` 2000 | the landing loss of 14.2 is doubled for Lumière frames (table `landPm`) | outside the rule (landings on jump segments; regen untouched) | none: T 600 keeps 720 ‰ of speed, and no technique gives that (T 0 keeps 800). ≈ 54 m lost per landing against 13.5 m (+40 m), more than the whole technique range moves a landing (T 0 → 1200: 27.6 → 4.4 m) | weak on jump courses (ridge); home coast/urban (no v1 course) |
| `pulse` | **intake air** `pulseAirPm[segType]` (descent 1200, water 600, others 1000), `pulseBiomePm[biome]` (desert 1150, others 1000) | every burst tick's thrust × `airPm[seg]` (12, table `airPm`); the plan's `Bon` carries the biome factor | inside the rule (bursts); keyed to segment type and biome | no Falconess stat moves thrust. Burst thrust ×1.15 in the desert (descent ×1.38, water ×0.69) is the thrust of +0.15 PW at PW 1.0 (`pwBoostWeight` 1000; cruise unchanged) | home desert and descents; weak water (canyon: desert and water, neutral by D40) |
| `telemetry` | **power governor** `telemetryDrainPm` 900, `telemetryAccelPm` 850 | hp drain × 0.9 (`dK`, section 6) and acceleration × 0.85 (`acc`), on top of rules (1)-(4) | outside the rule (heat gate, activation and PW cap untouched); **global**: every segment of every course | drain ×0.9 ≈ **+178 St** at St 600 (+144 at 300, +211 at 900: `St' = (1000 + St) / 0.9 − 1000`); acceleration ×0.85 ≈ **−180 T** at T 600 (−135 at 300, −225 at 900: `T' = 0.85 T − 90`). The T swap acts on acceleration only; landing and lift read the true T | home long courses (hp binds: canyon); weak sprints (the launch is a large share of a short race) |
| `repairable` | **rugged but clumsy** `repairableRuggedPm` 500, `repairableCurvesPm` 1500 | the landing loss (14.2) and the extra length of the ground detour (`detour`) are halved; the curve penalty is × 1.5 (section 7, applied to `curvesScale`) | outside the rule (landings and detours on jump segments, curve segments; repair untouched) | landing: T 600 keeps 930 ‰, the landing of T 1300 (+700 T, beyond the 1200 cap of the landing formula; T 1200 keeps 920), ≈ 3.4 m per landing instead of 13.5 m. Detour 1.05 instead of 1.10, ≈ −9 m on the ridge's 180 m of jumps (ground only). Curves 850 instead of 900, the curve penalty of A 300 (−300 A on curve segments only) | home obstacles (ridge); weak pure speed (sprint, the only curvy course) |

Measured at equal PW and style (prototype, hover, PW 1.0, energy 100, dissipation 60,
durability 100, stats 600; solo time vs the `none` fixture, and win rate in an 8-runner field of
the five rules plus three `none` fixtures, i.e. the S2 field and counting of 25.2, 600 races per
course; full table in 25.4):

| Course | mass-thrust | regen | pulse | telemetry | repairable |
| --- | --- | --- | --- | --- | --- |
| sprint (desert; sprint, pure speed) | +0.01 % / 4 % | −2.93 % / 82 % | −0.13 % / 5 % | +0.77 % / 1 % | +2.89 % / 0 % |
| ridge (desert; obstacles; descents, jumps) | 0.00 % / 13 % | +0.60 % / 2 % | −0.09 % / 15 % | +0.71 % / 3 % | −0.99 % / 37 % |
| canyon (desert; long; water) | +0.07 % / 4 % | −2.09 % / 48 % | +0.09 % / 3 % | −1.22 % / 35 % | 0.00 % / 4 % |

At v1 constants the time-keyed terms produce their cells (telemetry home canyon 35 % and weak
sprint 1 %; Boneyard home ridge 37 % and weak sprint 0 %; Lumière weak ridge 2 %; Steinhaus ≤ 15 %
everywhere). The two terms that act through thrust or heat (pulse, mass-thrust) are below 0.2 %
because energy is worth about one sigma at `kE` 1000 (R2), and Lumière's regen of 0.5 per tick
still dominates the sprint and the canyon (R9). Under the D14 energy-game hypothesis (`kE` 250,
`regenPerTick` 60; 25.3 steps 2 and 3) the same terms give: sprint pulse 33 %, mass-thrust 1 %,
telemetry 6 %, repairable 0 %; ridge repairable 37 %, pulse 24 %, regen 0 %, mass-thrust 9 %;
canyon telemetry 56 %, mass-thrust 5 %. Every measurable cell then points the right way; Kōryū's
ridge (24 %) and Altair's canyon (56 %) are outside 30-45 % and are D14 tuning, done before PW
compression (25.3) so that the terms, not PW, carry the cells.

## 14. Jumps, detour, water (item 14)

### 14.1 Entry and timing

When a move crosses into a `jump` segment (step B12): non-ground → `pendingJump = 1`; ground →
detour (14.5), event `detour {segment}`. The jump resolves at **step B4 of the next tick**, after
skills, so a `segment: jump` skill (scavenger-stride's guard) can protect the landing.

### 14.2 Lift and success

```
lift = fl(energy × liftF, 1000)            // brief energyAvailable × (0.5 + T/1200) × (1 + liftBonus); true energy
req  = liftReq[seg] × 1000
if lift ≥ req:                             // jumpOk
    spent = min(energy, req); energy −= spent        // high technique can lift with less energy than req
    airborne = 1                           // until the runner leaves the segment
    vCore = exhausted ? vMin[b][ph][seg] : vC[b][ph][seg]      // f = 1000, pace and broken table apply; held
    if pulseLeft > 0: pulseLeft = 0; pulseCd = cdFire           // a running burst ends
    event jumpOk {lift, required: req, energyBefore}
```

While airborne: no approach (speed held: "cruza en length / v_cruise ticks", crossing takes
`ceilDiv(remaining, vCore)` ticks), no thrust, skill speed ignored, no heat penalty; hp drains at
`vOut = vCore`, heat cools, regen accrues, timers and the pulse cooldown run.

**Landing (gap decision, revision 2; BRIEF §5 technique "eficiencia en obstáculos").** When an
airborne runner leaves the jump segment (step B12), `vCore = fl(vCore × landPm, 1000)` and the
runner re-accelerates normally (no dash). `landPm` (table 3.3) =
`R.landBasePm + fl(R.landTechPm × min(T, 1200), 1200)` = 800 + 120·T/1200: T 300 → 830, T 600 →
860, T 1200 → 920 (−17 / −14 / −8 % of speed), then the rule term of 13.1 (Lumière loss × 2 → 720 at
T 600; Boneyard loss × 0.5 → 930). Event `landing {speedLossMms}`; ledger `landingLossMms`. A
crashed runner (14.3) crosses the rest of the jump on foot and does not land. Hand check (T 600,
PW 1.0): 23.5 m/s → 20.2 m/s, 8.2 s back to cruise at 0.4 m/s², ≈ 13.5 m (0.58 s) lost per landing;
neutral hover on the ridge 85.99 s → 87.13 s with two landings. Reason: the jump reserve (14.4)
guarantees that a flyer never fails a jump it can afford, so without a landing cost a jump cost a
flyer only its lift energy (35 energy ≈ 7 m on the ridge) and the ground detour (45 m at 1.25)
could never pay: ground lost the ridge (1 % in S1) on its own brief terrain.

### 14.3 Failure and "lose k ticks"

```
else:                                      // jumpFail; lift energy is not spent
    armor = traits.obstacleArmor
    dmg   = (guardLeft > 0 || armor) ? 0 : fl(R.kCrash × 1000 × styleDmg, 1000)     // 25 000 md
    dur   = sub0(dur, dmg); break check (8.4)
    if armor: stall = R.kJumpPenaltyTicks + traits.obstacleArmorExtraTicks          // speed kept
    else:     vCore = fl(vCore × R.crashSpeedMult, 1000); stall = R.kJumpPenaltyTicks; dash = 1
    if pulseLeft > 0: pulseLeft = 0; pulseCd = cdFire
    event jumpFail {lift, required: req, energyBefore, damage: dmg, stallTicks: stall}
    // the failing tick is the first lost tick: run the stalled-tick body (below) and end the runner's tick
```

**Stalled tick** (exact meaning of "pierde k_jumpPenalty ticks"): `stall −= 1`; the body is
frozen (`pos`, `vCore` unchanged, `disp = 0`, `vOut = 0` in the log); heat cools by `coolTick`;
regen accrues; skill effect timers and `guardLeft` count down; the pulse cooldown does **not**;
no hp drain, no skill checks, no decision, no overheat damage. The race clock runs for everyone,
so finish order stays crossing order (a time penalty added at the end would break it). After the
stall the runner crosses the rest of the jump segment on foot (`f = 1000`, no thrust for non-ground
on a jump segment), re-accelerating from `0.4·v` with the recovery dash (5.3). Measured cost of a
crash on a 2000 m course ≈ 3.35 s (79 m) plus 25 durability.

### 14.4 Jump reserve (precomputed, start of race)

```
for each jump j (course order), non-ground runner: need_j = ceilDiv(liftReq_j × 1 000 000, liftF)
R_after_last = 0
for j from last to first: R_j = need_j > Emax ? R_{j+1} : max(need_j, liftReq_j × 1000 + R_{j+1})
jr[s] = R_j of the first jump j whose segment index is > s; 0 if none; 0 for every s if style == ground
```

A jump the tank can never make is skipped (it fails anyway and a failure spends no lift energy).
Ridge, T 600: `R_2 = 15 000`, `R_1 = max(20 000, 35 000) = 35 000` me. Every gate keeps
`energy − cost ≥ jr`, so with v1 content (needs ≤ 40 energy for T ≥ 100) a non-ground runner fails
only a jump its tank × technique cannot make: a `jumpFail` reads as a build problem.

**What this costs ground (ADR-0003 D22, D43, D46).** With the reserve, jump *risk* is not part of
ground's niche: dive's "gasta todo en descensos" cannot strand it before a jump, and no
Intelligence error can (gates read true values, section 10). Ground's obstacle niche is instead a
time trade measured on every jump: flyers pay lift energy and the landing loss above; ground pays
the detour, now `R.groundDetourMult` 1100 (BRIEF 1.25; deviation D46). Ridge at T 600, PW 1.0:
flyers lose 35 energy (≈ 7 m) + 2 × 13.5 m ≈ 34 m; ground loses 18 m. Solo times: neutral ground
86.46 s, neutral dive / glide / hover 86.91 / 86.93 / 87.13 s; S1 ridge: ground 38 %. With the
brief's 1.25 the detour costs 45 m and ground wins 6 % of the ridge even with the landing loss.

### 14.5 Ground detour

While on a jump segment a ground runner moves `disp = fl(vOut × 1000, detour)` (table 3.3:
`R.groundDetourMult` 1100, Boneyard 1050): the longer route at full speed, implemented as progress
scaling (rounding loses < 1 pu per tick). No lift, no energy, no damage, no landing; thrust allowed
(ground running); hp drains at `vOut`.

### 14.6 Water

On **entering** a `water` segment: `hit = (guardLeft > 0 || traits.obstacleArmor) ? 0 :
fl(dragPm × R.waterHitPerDrag × styleDmg, 1000)` md (drag 0.2 → 10 durability; ground 5); no
stall, no speed effect beyond `f_seg`; break check; event `waterHit {damage}`. This gives meaning to
`obstacle-armor`'s water clause and to BRIEF §5 "durability: daño absorbible por saltos fallidos y
obstáculos" (both armor carriers in content are ground frames that never jump).

## 15. Skills (item 15)

### 15.1 What one "evaluation" is

Each active skill `j` (id order) has three pre-drawn values `u[j][k] = uPm(U[slot 4 + 3j + k])`,
`k = 0..2` (section 17). Skill `j` **fires on the first tick** where it is eligible, its trigger
holds and `u[j][acts_j] < p_j(t)`. Because `u` is fixed for the race, a trigger that holds for
1000 ticks gives no extra chances: over races, a once-skill whose trigger is reached fires with
probability exactly `p` (Umamusume's once-per-race wisdom check), independent of the tick rate and
of how many matching windows a course has. Rolling every tick would fire a 0.2-floor skill with
96 % probability within one second and make Intelligence irrelevant; rolling per window entry would
tie a skill's value to the number of windows. With a phase-scoped bonus, a skill whose `u` lies
between `p_start` and `p_middle` fires at its first eligible tick of the middle phase: exactly what
"+10 % activation in the middle phase" means.

### 15.2 Probability (‰)

```
pAct      = max(R.activationFloor, 1000 − ceilDiv(R.activationNumerator × 1000, I))   // floor of 1000·(1 − 90/I)
pSkill[j] = disabled_j ? 0 : fl(pAct × activationBasePm_j, 1000)
p_j(t)    = disabled_j ? 0                                     // first: no bonus or lucky pick overrides it (3.2)
          : j == luckyIdx ? 1000
          : clamp(pSkill[j] + traits.activationBonusPm[ph] + traits.activationBonusPm.any
                  + (rule == telemetry ? R.telemetryActivationBonus : 0), 0, 1000)
fires iff u < p                                                // u ∈ [0, 999]
```

A disabled skill (3.2, batch ablation only) is never evaluated: no `skill` or `skillMiss` event, no
effect, no replan; its `u` values are still drawn and logged (`derived.u[j]`), `derived.pSkill[j]`
is 0, and a lucky pick that lands on it is spent (no other skill is promoted), so every other draw
and every other skill's behaviour is identical with and without the switch.

I 600 → 850; I 300 → 700; I ≤ 112 → 200. last-gasp (0.8) at I 600 → 680; + talon-lock final +100
→ 780; on an Altair frame +150. **Unique skills follow the formula** (the brief's formula applies to
every skill; `uniqueTo` only gates learning).

### 15.3 Triggers (conjunction; tick-start state after step B1; rank snapshot)

| Field | Holds iff |
| --- | --- |
| `phase` | the runner's phase equals it (`any` always) |
| `segment` | `segType[seg]` equals it (an airborne runner, a stalled crash runner and a ground runner on a detour are "in" the jump segment) |
| `posLoPm, posHiPm` | `posLoPm ≤ posFrac ≤ posHiPm` (inclusive) |
| `heatAboveMilli` | `heat > heatAboveMilli` |
| `energyBelowMilli` | `energy < energyBelowMilli` |
| `once` (default true) | at most one activation |

`once: false`: up to `R.maxSkillActivations` (3) activations; the skill re-arms only after its
trigger has been false for at least one tick **after** its previous effect has ended (ADR-0003 D50:
a false tick while the effect still runs does not re-arm it); activation k uses `u[j][k]`. Skills are not evaluated while stalled or finished. Evaluation order is lane, then id;
because ranks are snapshotted and draws pre-drawn, the order affects only event order (and an
earlier skill's refund can satisfy a later skill's `energyBelow` of the same runner: deterministic).

### 15.4 Effects

From the activation tick (inclusive) for `durationTicks` ticks; effects of different skills stack
additively; timers decrement at the end of every tick, stalled ticks included.

| Effect | Engine action |
| --- | --- |
| `speedMms` | `skillSpeed += speedMms × 15` vu while active; instantaneous like thrust; ignored while airborne; adds on top of `vMin` when exhausted; `vTot` clamped at 0 |
| `accelMms2` | `skillAccel += accelMms2` vu/tick while active; acts only on the upward step (`vCore < tgt`) |
| `energyRefundMilli` | instant `energy = addCap(energy, refund, Emax)`; if `planActive`: `replan = 1 (cause refund)` |
| `heatCoolMilli` | instant `heat = sub0(heat, cool)` |
| `durabilityGuard` | `guardLeft = max(guardLeft, durationTicks)`; every durability loss (overheat, crash, water) is 0 while `guardLeft > 0` |
| `durationTicks = 0` | only the instant parts apply |

### 15.5 Passives, uniques, slots, log

- **Passives** are never rolled: they arrive as frame, part and quirk modifiers compiled into
  `traits` (section 16).
- **skillSlots** (altair-firmware) has no race meaning: the race runs every learned active (≤ 8).
  Proposed season change (ADR-0003): the learn cap becomes `maxLearnedSkills + skillSlots`.
- Events: `skill {skillId, p, u, activation}` when it fires; `skillMiss {skillId, p, u}` once per
  skill, at the first tick its trigger held with `u ≥ p` ("trigger reached, roll 812 vs p 780").
- Expected value order (instant speed: gain ≈ speed × duration × p): corner-carver 1.6 m,
  canyon-sense 1.5 m, hill-lungs 1.8 m, water-skimmer 1.4 m, last-gasp 2.0 m, pack-shadow 1.6 m,
  stoop-strike 4.5 m, refunds ≈ 0.2 m per energy at PW 1.0. clean-start (+0.3 m/s² for 2 s on the
  17 → 23.5 m/s ramp) ≈ 5-6 m. gravity-friend ≈ 0.3 m and iron-wings ≈ 0 m are content findings.

## 16. The 16 RaceModifier kinds (item 16)

`compileTraits(modifiers)` (`packages/sim/src/race/modifiers.ts`, exhaustive `switch` with a
`never` check, one handler per kind as the schema comment requires) runs inside `freezeEntry`.
Aggregation is commutative (sum, min, max, OR, product in ascending value order with a floor per
step), so the order of modifiers never matters. Decimals become ‰ with `toPermille` there (the only
content-load rounding). F = freeze, P = race prep (tables), T = tick hook reading a scalar,
D = pre-race draw.

`RaceTraits` (zod, integers only; arrays of length 7 are indexed by `SEGMENT_TYPES`):

```
segOverridePm: Int[7]       // 0 = none, else max of override values (500..1500)
segMultiplyPm: Int[7]       // default 1000
curvesScalePm: Int          // default 1000
heatImmune: boolean; heatImmuneUntilMm: Int | null   // null = whole race
obstacleArmor: boolean; obstacleArmorExtraTicks: Int
regenMe: Int                // me per non-boost tick
packRegenMultPm: Int        // default 1000
freeFirstBoostMask: Int     // bit k = SEGMENT_TYPES[k]
pulseChainIndex: Int (0 = none); pulseChainBonusPm: Int
pulseCooldown: Int[7]       // 0 = none
activationBonusPm: { start: Int, middle: Int, final: Int, any: Int }
heatToEnergyPm: Int         // 0..1000
liftBonusPm: Int
noPulse: boolean; randomSkillGuaranteed: boolean
```

| # | Kind | Where | Exact semantics | Aggregation |
| --- | --- | --- | --- | --- |
| 1 | `falconess-stat` | F | `eff[stat] = clamp(eff + Σ delta, 1, 2000)` after mood and aptitude (3.1); not a trait | sum per stat |
| 2 | `segment-factor` | P | section 7 steps 2-4: override → `f = max(values)`, then multiply, clamp [500, 1500] | override max; multiply sorted product |
| 3 | `curves-penalty-scale` | P | scales only the curve penalty term (section 7); stabilizer 0.5 → curves 950 at A 600 | sorted product |
| 4 | `heat-penalty-immunity` | T | no ×0.92 while `pos < untilMeters × 225 000` (absent: whole race); durability damage still applies; grants the overheat licence inside its window (9.3) | absent wins, else max untilMeters |
| 5 | `obstacle-armor` | T | failed jump: no damage, **no crash slowdown**, stall `kJumpPenaltyTicks + extraTicks` ("cost ticks instead of durability"); water entry: no damage, no stall | max extraTicks |
| 6 | `regen` | P/T | `regenTick += toPermille(perTick)` me on non-boost ticks, added to Lumière's 500 or to 0 (scrap-heart, still-air: 250) | sum |
| 7 | `regen-pack-multiplier` | T | regen × factor while `inPack`; no regen source → no effect (sylphe pack-regen ×2) | sorted product |
| 8 | `free-first-boost` | T | continuous frames: the first `R.freeBoostMaxTicks` (12) boost ticks taken on a segment of the masked type cost 0 energy, starting at the first boost tick there and ending when the 12 are used or the runner leaves that segment (the bit is cleared at the first free tick; one use per type per race); pulse frames: the first pulse fired on that type is free for its 12 ticks; heat and gates apply as normal; event `freeBoost` (etoile free-first-pulse: descent) | OR of bits |
| 9 | `pulse-chain-accel` | T | every `chainIndex`-th consecutive pulse (`chain % chainIndex == 0`) uses thrust `Bp × (1 + accelBonus)`; no pulses → no effect | min index, max bonus |
| 10 | `pulse-cooldown` | T | a pulse fired on a segment of that type cools down `min(30, cooldownTicks)` ticks (flat-cooldown: flat 20; talon-lock: descent 20) | min per type |
| 11 | `activation-bonus` | T | `+bonus` ‰ added in 15.2 when the runner's phase at the check matches (`any`: always) | sum per phase |
| 12 | `heat-to-energy` | T | on the first tick of the final phase, before the plan: `gained = min(Emax − energy, fl(heat × ratioPm, 1000))`, `energy += gained`, `heat = 0` (the heat is converted); event `heatToEnergy {heat, energy: gained}`; also enables the `PREHEAT` mode (9.4) | sum of ratios, cap 1000 |
| 13 | `lift-bonus` | P | `liftF = fl((600 + T) × (1000 + liftBonusPm), 1200)`; used by lift, `need` and `jr` (glider-tape +100) | sum |
| 14 | `no-pulse` | P | a pulse frame boosts continuously (`pulseFrame = false`); on other rules no effect (`stutter` rolls only on Boneyard frames: inert content, R7) | OR |
| 15 | `random-skill-guaranteed` | D | after the race block, for each holder in lane order: `x = rng.nextU32("quirks")` (drawn even with 0 actives); if `nActive > 0`, `luckyIdx = fl(x × nActive, 4 294 967 296)` over the id-sorted actives (disabled ones included, so the pick does not move when S4 disables a skill), and that skill has `p = 1000` this race (0 if it is disabled, 15.2); logged in `derived.luckySkill`. Stream `quirks` (the schema says so) of the race's own `Rng`, so no `race` draw shifts; resolved per race so `RaceEntry` stays seed-free | OR |
| 16 | `power-cap` | F | already applied by `resolveFrameBuild` (as is the telemetry cap 1.1); the engine does nothing | min (frame-build) |

A new kind adds a member to `RaceModifier`, a field (or reuse) in `RaceTraits`, a case in
`compileTraits` (the `never` check fails the build until it exists) and, if it acts per tick, one
scalar read in the loop.

## 17. Randomness: the pre-drawn block, and race variance (item 17)

### 17.1 Draw order that cannot shift

`simulateRace` creates `rng = new Rng(seed)` and, **before tick 0**, draws exactly
`n × R.rngBlock` (32) values with `rng.nextU32("race")`, runner by runner in lane order, slot by
slot:

| Slot | Use |
| --- | --- |
| 0, 1, 2 | pace judgement of the start, middle, final phase (10) |
| 3 | plan perception error (10) |
| 4 + 3j + k (j = 0..7, k = 0..2) | `u` of the j-th skill in id order, activation k (15); a disabled skill keeps its j (3.2) |
| 28..31 | reserved: drawn and unused in v1, so a future rule can use them without shifting anything |

Then, for each runner holding `random-skill-guaranteed` (lane order), one `rng.nextU32("quirks")`.
Nothing else draws: zero draws inside the tick loop.

Consumption still follows the brief's order (tick → lane → skill id), but the **values** are fixed
before the race. Consequences: (1) a runner's draws depend only on `(seed, laneIndex)`: adding a
skill, changing a rival's build, a skill firing or a jump failing cannot shift anyone's draws
(common random numbers: the §12 ablations compare like with like); (2) the draw count is a
constant, testable with `rng.drawCount("race") == 32 n`; (3) no rejection loop.

### 17.2 Integer mapping of a u32 (new helpers in `@falconess/rng`, no floats, no rejection)

```
uPm(u)           = fl(u × 1000, 4 294 967 296)                  ∈ [0, 999]
uRange(u, lo, hi) = lo + fl(u × (hi − lo + 1), 4 294 967 296)    (hi − lo + 1 ≤ 10^6)
```

Products < 4.3e15 (exact). The bias is < (hi − lo + 1)/2^32 and, more importantly, deterministic.
`nextInt` keeps its rejection loop for pre-race uses where the draw count does not matter
(`generateField`).

### 17.3 Variance sources and magnitudes

Target (BRIEF §12): same build, different seeds, finish-time σ between 0.8 % and 2 % of the mean.

| Source | Mechanism | Magnitude (σ of time) |
| --- | --- | --- |
| Skill activation (brief) | Bernoulli(p) per skill, 1-4.5 m each | ≈ 0.36 × gain each: +0.05-0.15 points with 2-4 skills |
| Plan perception (Int) | ±We on perceived energy and hp | < 0.05 % (linear economy; the kick recovers leftovers); up to ~0.3 % when hp binds |
| Field interactions | glide/hover rules, pack regen, `positionRange` | 0 solo; ≤ 0.1 % in fields |
| Lucky skill | which skill is guaranteed | only with the quirk |
| Jumps | deterministic lift with a hard reserve | 0 for valid content builds |
| **Pace judgement (added)** | 3 pre-drawn offsets in `[c(I) − W0, c(I) + W0]` on cruise and `vMin`, one per phase (fixed half-width `W0` 43 ‰; centre `c` rising with I, section 10) | ≈ 0.27 × W0 for builds with hp margin; damped where hp binds; the same for every I. Spec-prototype measurement (solo, noise only, 300 seeds, revision 2): neutral dive I 600: sprint 1.18 %, ridge 1.31 %, canyon 0.99 %; I 300: 1.21 / 1.33 / 1.00 % (mean time +0.8 %); I 1000: 1.14 / 1.27 / 0.99 % (mean −1.0 %); hp-tight shiden (PW 1.4, Kōryū): 0.61 / 0.78 / 1.08 %; falke 1.21 / 1.32 / 1.00 % |

The brief's own mechanics give 0.1-0.3 % (all three designs measured this independently), an order
of magnitude below the floor. **Why the pace draw is not "inventing a rule":** §12 makes 0.8-2 % an
acceptance criterion that the brief's mechanics cannot reach, so a source must be chosen; §6 says
the engine reconstructs Umamusume, whose section speed randomness is exactly a Wisdom-bounded
random offset on target speed; §5 gives Intelligence "decisión ... y posicionamiento". Only the
granularity (per phase: three numbers in the log, zero per-tick cost), the width and the centre
slope (two constants) are ours. The window has the same width for every I and its centre rises
with I, so Intelligence raises the expected speed and never lowers a runner's win rate (10, S8);
it is logged in `derived.pace` with `paceCentrePm`, and `paceHalfWidth = paceCentreSpan = 0`
turns it off for the symmetry and monotonicity properties. Rejected: race-day form (one draw, tied
to no stat, duplicates the season's mood), 12 sections of ±8-11 % (reads as a lottery).

## 18. Tick order (item 18)

```
simulateRace(ruleset, entries, course, seed, opts = {}):
  validate(entries, course)                                            // 1.4
  E = entries sorted by laneIndex; n = E.length
  G = opts.geometry ?? buildCourseGeometry(ruleset, course)
  S = opts.arena ? opts.arena.reset(n, G) : allocRaceState(n, G)       // all typed arrays, sized once
  rng = new Rng(seed)
  P1. for lane 0..n−1: for slot 0..31: U[lane][slot] = rng.nextU32("race")
  P2. for lane 0..n−1: if traits.randomSkillGuaranteed: luckyIdx = pick(rng.nextU32("quirks"))   // 16 #15
  P3. per runner: pace[3], planErr, u[j][k] (17); tables of 3.3 for b = 0, 1; capFinal, groundLevel,
      need, jr, pAct, pSkill; event-free
  P4. initial state (1.3); segment-0 pre-step in lane order (water hit / pendingJump / detour event)
  P5. if detail == "full": frame row T = 0
  maxTicks = R.dnfTicksPerMeter × fl(Lmm, 1000) + R.dnfTicksBase      // 3000 m: 26 400
  for (t = 0; t < maxTicks && unfinished > 0; t++):
    A. rank snapshot (9.1) from end-of-(t−1) positions
    B. for i in lane order, skipping finished runners:
       B1. ph = phaseOf(pos)
           if ph == PH_FINAL && !finalEntered: finalEntered = 1; heat-to-energy (16 #12)
           if !planActive && pos ≥ planPoint: planActive = 1; replan = 1 (cause phase)
       B2. if stall > 0: stalledTick(i); continue                       // 14.3
       B3. skills in id order (15): eligible && trigger && u < p → activate (instant effects now)
       B4. if pendingJump: resolveJump(i) (14.2, 14.3); if it failed: stalledTick(i); continue
       B5. over = heat > heatCap                                        // the tick's single overheat flag
       B6. if replan: replan = 0; if planCount ≤ R.maxReplans: planSprint(i, cause) (11)
       B7. decide(i) (9.6 / 12): mode, accumulator, gates, licence, free boost, pulse state machine
       B8. speed (5): tgt (hover slipstream), dash, approach with acc or accStart (or airborne hold),
           thrust × airPm × stoop, vTot, vOut (×0.92 if penalised)
       B9. resources (8.1): energy, regen, heat, telemetry clamp, overheat damage, break → replan
       B10. hp drain at vOut (6); hp == 0 → exhausted, event hpEmpty
       B11. disp = (style == ground && segType[seg] == JUMP) ? fl(vOut × 1000, detour) : vOut
            prevPos = pos; pos += disp; vOutPrev = vOut; ledger (phase ticks, boost ticks, energy flows)
       B12. if pos ≥ L: finished = 1; finishMilli = t × 1000 + fl((L − prevPos) × 1000, disp); unfinished −= 1
            else while seg < S − 1 && pos ≥ segEnd[seg]:
                if segType[seg] == JUMP:
                    if airborne: vCore = fl(vCore × landPm, 1000); event landing (14.2)
                    airborne = 0; if planActive && style ≠ ground: replan = 1 (cause jump)
                seg += 1; freeLeft = 0
                enter(seg): flat && rule == repairable → repair; water → water hit (14.6);
                            jump → ground ? event detour : pendingJump = 1
       B13. tickTimers(i): skill activeLeft −= 1 (effects removed at 0, re-arm bookkeeping);
            guardLeft = sub0(guardLeft, 1); holdLeft = sub0(holdLeft, 1)
    C. finishers of tick t: places by (finishMilli, lane); dead heats; margins (19); events finish
    D. if detail == "full": frame row T = t + 1 if due (20.4)
  E. runners unfinished at maxTicks: dnf (19)
  F. materialise the log (detail "results" skips frames and events; derived and results identical)

stalledTick(i): stall −= 1; heat = sub0(heat, coolTick); energy = addCap(energy, regenEff, Emax);
                skill timers and guardLeft count down (not the pulse cooldown, not holdLeft);
                prevPos = pos; disp = 0; vOut = 0; ledger.stallTicks += 1
```

- **Differences from the brief pseudocode** (ADR-0003): skills run before the decision (refunds,
  cooling and guards act on the same tick); the jump resolves at the start of the next tick, after
  skills; the heat penalty multiplies the moved speed with one flag per tick instead of compounding
  on the stored `v`; boost and skill speed are added outside `approach`.
- **Order independence within a tick:** each runner's update reads only its own state, its tables
  and the step-A snapshot. Lane order changes only the order of events in the log, never physics,
  so the symmetry property holds by construction.
- **Finished runners** leave the loop: position frozen at the crossing value, ranked ahead of every
  unfinished runner by finish time, no drain, no events after `finish`; their frame columns repeat
  the final state with the `finished` flag.

## 19. Finish, ties, margins, DNF (item 19)

- **Fractional finish:** tick t covers race time `[t, t + 1)`. A runner crossing during tick t
  (`prevPos < L ≤ pos`, so `disp > 0`) gets `finishMilli = t × 1000 + fl((L − prevPos) × 1000, disp)`
  ∈ `[1000 t, 1000 t + 1000]`; `timeTicks = t + 1` (what `RaceResultEntry.timeTicks` stores);
  `vFinishMms = fl(vOut, 15)`.
- **Places:** finishers sorted by `(finishMilli asc, laneIndex asc)`. Equal `finishMilli` is a dead
  heat: `deadHeat: true` on every runner of the group, margin 0, places still distinct by lane (the
  documented tie-break; with the noise-off ruleset two identical builds tie exactly).
- **Margins (mm):** in step C of tick t, for each runner A that crossed in tick t, with
  `fA = finishMilli_A − 1000 t`, and each runner B that was unfinished at the start of tick t
  (B ≠ A): `posB = prevPos_B + fl(disp_B × fA, 1000)` (B's own tick-t move; `disp = 0` if stalled)
  and `gap[A][B] = max(0, fl(L − posB, 225))`. `marginMm` of the k-th finisher is
  `gap[(k − 1)-th][k-th]` (0 for the winner and for dead heats). This is the true distance behind at
  the instant the runner ahead crossed (better than time gap × speed when the trailer accelerates or
  crawls), independent of lane order. Storage: preallocated `Float64Array(64)`.
- **DNF guard:** `maxTicks = R.dnfTicksPerMeter × fl(Lmm, 1000) + R.dnfTicksBase` (8 ticks/m + 2400:
  an average 1.9 m/s plus 160 s of stalls; 3000 m → 26 400 ticks). Runners unfinished then get
  `dnf: true`, `finishMilli`, `timeTicks`, `marginMm`, `vFinishMms` null, places after every
  finisher by position desc then lane, event `dnf`. The slowest legal runner (PW 0.5 broken, water
  f 0.5, exhausted) still exceeds 3 m/s, so a DNF means a bug; the batch asserts zero. The season
  maps a DNF to last place with `timeTicks = maxTicks`.

## 20. RaceLog (item 20; zod in `packages/schema/src/race.ts`)

Integers only, public units (mm, mm/s, milli-units, milli-hp, ‰, ticks, milli-ticks). Types are
`z.infer` of these schemas (CLAUDE.md: no parallel interfaces). `CourseGeometry` and `RaceArena`
are internal TS types, not data formats.

### 20.1 Top level

```
RaceLog = z.strictObject({
  rulesetVersion: RulesetVersion, engine: z.literal("v1"), seed: z.string().min(1),
  courseId: Slug, courseVersion: Int, tickHz: z.literal(15),
  detail: z.enum(["full", "results"]), ticks: Int /* ticks simulated */, maxTicks: Int,
  geometry: { biome: Biome,             // ADR-0003 D55: the viewer never reads content for it
              lengthMm, startEndMm, finalStartMm, hoverAttackMm, reserveAtMm, denseFromMm: Int,
              // reserveAtMm ≥ 0 (ADR-0003 D53, section 2)
              segments: [{ type: SegmentType, startMm: Int, endMm: Int, param: Int }] },
              // param: grade‰ (climb, descent), drag‰ (water), wind‰ signed (canyon), radius (curves), liftRequired (jump), 0 (flat)
  entries: RaceEntry[1..8],             // lane order (3.1)
  derived: RunnerDerived[],             // lane order (20.3)
  frames: RaceFrames.optional(),        // absent with detail "results"
  events: RaceEvent[].optional(),       // absent with detail "results"
  results: RaceResult[],                // place order (20.5)
})
```

### 20.2 Entries

`RaceEntry`, `RaceSkill`, `RaceTraits` as in 3.1, 3.2 and section 16; `RaceRule` as in 3.4. Also
exported: `EntryInput` (3.1, the `freezeEntry` input; used by the season and the batch).

### 20.3 Derived (the explanation table, one per runner)

```
RunnerDerived = {
  lane, hpMax /* milli-hp */, effectiveReserve /* milli-hp */, stamDiv, fatiguePm, tolerancePm,
  heatCap, capLim, coolTick, dmgTick,                           // milli-units
  pAct, pSkill: Int[], u: Int[][3], luckySkill: Slug | null,    // ‰, per skill in id order; pSkill 0 for a disabled skill (3.2)
  paceHalfWidthPm, paceCentrePm, pace: [Int, Int, Int], planErrWindowPm, planErrPm,
  landPm, detourPm /* 0 if not ground */, kickAtMm, stoopPm /* 1000 if not dive */,
  airPm: Int[] /* per segment, 1000 if not a pulse frame */,
  boostMms, pulseMms /* 0 if not a pulse frame */, chainMms,
  liftPm, jumpNeed: Int[] /* me, per jump */, capFinal /* me */, groundLevelMms,
  segments: [{ fPm, cruiseMms: [Int, Int, Int] /* per phase */, accelMms2, vMinMms: [Int, Int, Int],
               jumpReserve /* me */ }]                           // intact PW table
}
```

### 20.4 Frames (race-wide sampling) and events

```
RaceFrames = { tick: Int[],             // ticks elapsed at the sample: row T is the state after tick T − 1; T = 0 before tick 0
  runners: [{ posMm: Int[], vMms: Int[], hp: Int[], energy: Int[], heat: Int[], durability: Int[],
              boost: Int[],             // on-ticks since the previous row: exact duty between sparse rows
              flags: Int[] }] }         // columns aligned with `tick`, lane order
flags: 1 boosting (last tick), 2 pulse burst, 4 pulse cooldown, 8 overheated, 16 exhausted,
       32 airborne, 64 detour, 128 stalled, 256 broken, 512 plan spurt, 1024 kick,
       2048 skill effect active, 4096 finished, 8192 dnf, 16384 drafting (hover slipstream, 9.8)
```

**Sampling is race-wide:** row `T = t + 1` is written after tick t iff `T ≤ R.log.denseFirstTicks`
(first second) or `T % R.log.sampleEveryTicks == 0` or some runner finished in tick t or some
unfinished runner ended tick t with `pos ≥ denseFrom` (its last 25 m) or t is the last simulated
tick; plus row `T = 0`. Every row holds every runner (one time base for Phaser and uPlot); the
brief's per-runner "last 25 m" becomes the union of the runners' windows. Size on the canyon
(≈ 2050 ticks): ≈ 1 + 15 + 137 + ≤ 8 × 17 rows × 8 runners × 8 columns ≈ 18 k integers; events
30-60 per runner.

```
RaceEvent = discriminated union on `kind`; every member has { tick: Int, lane: Int, posMm: Int }:
  boostMode    { mode: BoostMode, levelMms: Int }
  pulse        { chain: Int, thrustMms: Int, free: boolean, cooldown: Int }
  freeBoost    { segment: SegmentType }
  sprintPlan   { cause: "phase" | "refund" | "jump" | "broken", index: Int,
                 reason: "planned" | "hp-limited" | "past-reserve" | "no-energy" | "no-thrust" | "exhausted" | "no-candidate",
                 energy, energyPerceived, hp, hpPerceived, jumpReserve: Int,
                 startMm, endMm, levelMms, candidates, onTicks: Int, clean: boolean }
  skill        { skillId: Slug, p: Int, u: Int, activation: Int }
  skillMiss    { skillId: Slug, p: Int, u: Int }
  jumpOk       { lift, required, energyBefore: Int }
  jumpFail     { lift, required, energyBefore, damage, stallTicks: Int }
  detour       { segment: Int }
  waterHit     { damage: Int }
  overheat     { on: boolean, heat: Int }
  hpEmpty      { }
  durabilityBroken { powerToWeight: Int }
  landing      { speedLossMms: Int }                                  // 14.2
  repair       { amount: Int }
  heatToEnergy { heat: Int, energy: Int }
  finish       { finishMilli: Int, place: Int }
  dnf          { }
BoostMode = "off" | "kick" | "plan" | "hold" | "preheat" | "surplus" | "regen-overflow"
          | "dive-descent" | "hover-catchup" | "glide-chase" | "ground-constant"
```

Events are ordered by emission: per tick, step-B events in lane order (each runner's in step
order), then step-C finish events in place order. Segment and phase entries are not events
(`posMm` + `geometry` determine them) except those carrying data (`detour`, `waterHit`, `repair`).
Boost on/off is explained by `boostMode` changes (reason) plus the per-row `boost` count (exact
duty); per-tick toggles are never logged. **`boostMode` hysteresis (ADR-0003 D54):** a
`(mode, level)` is logged only if it holds at least `R.log.sampleEveryTicks` ticks (1 s) and
differs from the runner's last logged pair, with the tick (and `posMm`) where it began; every
runner starts in `("off", 0)` without an event. Physics never reads the log: results are
unchanged. A regen frame that alternates REGEN/OFF every 2-3 ticks (≈ 300 changes per runner on
the sprint) now logs only its long spans (an etoile on the sprint: `plan`, `kick`). Measured on an
8-frame field of the three v1 courses: 8-14 events per runner, 68-109 before D54.

### 20.5 Results and ledger

```
RaceResult = {
  lane, runnerId, place: Int ≥ 1,
  finishMilli: Int | null, timeTicks: Int | null, marginMm: Int | null, vFinishMms: Int | null,
  deadHeat: boolean, dnf: boolean,
  hpEnd /* milli-hp */, energyEnd, durabilityEnd /* milli */, exhausted: boolean, broken: boolean,
  ledger: { phaseTicks: [3], boostTicks: [3], pulses, stallTicks,
            energySpent, energyRegen, energyRefunded, energyFromHeat, energyLift, energyLeft,
            overheatTicks, durabilityLost, durabilityRepaired, hpEmptyMm: Int | null,
            draftTicks, landingLossMms,
            jumpsOk, jumpsFailed, detours, skillsActivated: Slug[], skillsMissed: Slug[] }
}
```

Identity (property P5): `energyStart − energySpent − energyLift + energyRegen + energyRefunded +
energyFromHeat = energyEnd` (every flow counts only what actually moved after clamps).
`results` and `derived` are byte-identical in both detail modes.

### 20.6 "Why did I lose" from the log alone

`ledger` (where the time went, by phase; energy and durability flows), `derived.segments` (what
stats and frame give on each terrain), `derived.pace` and `planErrPm` (judgement), `sprintPlan`
(perceived vs real energy and hp, level, start, candidates, clean), `boostMode` changes (why boost
was on), frame `boost` counts (how much), `overheat`, `hpEmpty` position, `jumpOk`/`jumpFail`
(lift vs required), `landing` (speed lost, 14.2), the `drafting` flag and `draftTicks` (hover
slipstream), `derived.stoopPm`/`airPm`/`landPm`/`detourPm` (style and rule terms, 9.8 and 13.1),
`skill`/`skillMiss` (p vs u). `pnpm sim:race` prints exactly these per runner
(ROADMAP D14 CLI timeline).

## 21. Field generation and season wiring (item 21)

### 21.1 `generateField`

```
generateField(ruleset, content, { course, turn, raceSeed, player: EntryInput }): RaceEntry[]
  frng = new Rng(`${raceSeed}/field`)          // own instance: never shifts the race or season draws
  n = course.entries
  generic = frames without signatureOf, sorted by id; pwOf(f) = resolveFrameBuild(content, f.id, [], []).powerToWeight
  pw0  = pwOf(player.frameId)                  // the player's frame class: base PW, no parts, no quirks
  pool = generic.filter(|pwOf(f) − pw0| × 1000 ≤ F.rivalPwBandPm × pw0)       // relative band: ±5 % of pw0
  if pool.length < F.rivalMinPool: pool = the F.rivalMinPool generic frames with the smallest |pwOf − pw0| (ties by id)
  skillPool = active skills without uniqueTo, sorted by id
  playerLane = frng.nextInt("race", n); k = 0
  for lane in 0..n−1, lane ≠ playerLane (ascending):
    k += 1
    frame  = pool[frng.nextInt("race", pool.length)]; style = frame.style
    quirks = []                                  // revision 3: rivals carry no quirks (and no parts): built PW = base PW
    mu     = F.rivalBase + F.rivalPerTurn × turn                       // 95 + 9t: T12 203, T24 311, T36 419, T46 509
    total  = fl(5 × mu × (1000 + frng.nextRange("race", −F.rivalNoise, F.rivalNoise)), 1000)
    for stat in STAT_ORDER:
      base[stat] = clamp(fl(total × F.rivalWeights[style][stat] × (1000 + frng.nextRange("race",
                   −F.rivalStatJitter, F.rivalStatJitter)), 1 000 000), 1, 1200)
    m      = min(F.rivalMaxSkills, fl(turn, F.rivalTurnsPerSkill))
    skills = frng.shuffle("race", skillPool).slice(0, m)
    entry  = freezeEntry(ruleset, content, { runnerId: `rival-${k}`, kind: "rival", falconessId: null,
               baseStats: base, mood: 0, biomeAptitude: every biome "B",
               styleAptitude: "A" for `style`, "B" for the others, frameId: frame.id, parts: [],
               quirks, learnedSkills: skills, durability: null }, course, lane)
  player entry = freezeEntry(ruleset, content, player, course, playerLane)
  return all entries sorted by laneIndex
```

`F.rivalWeights` (‰, each row sums to 1000; agility / stamina / technique / courage /
intelligence): glide 240/210/170/180/200, dive 250/180/170/220/180, hover 220/200/170/170/240,
ground 200/230/220/190/160. The relative curve is the stub's (`5 × (95 + 9 t) ± 20 %`).

Class-matching implements pillar 2's "clase de equipo igualado" for goal races: with literal PW an
unrestricted pool makes Peregrina (1.4) win everything and Caracara (0.7) nothing (judges'
measurement). **Revision 2: the band is relative and the minimum pool is 1.** Revision 1's
absolute ±150 ‰ band with a minimum of 3 was not class-matched at low PW: Caracara-sig (0.7) drew
nimbus (0.85, 19-24 % faster at equal stats) and Cernícala-sig (0.85) drew three PW 1.0 frames
(≈ 13 % faster), gaps no stat lead can close (≈ +470 and +710 agility at T46). Picks are with
replacement, so a one-frame pool is a legal field. Pools with v1 content (band 50 ‰ of `pw0`):
PW 1.4 → {etoile, shiden}; 1.2 → {hayate, sylphe}; 1.0 → {erzherzog, falke, horizon};
0.85 → {nimbus}; 0.7 → {kite, mule}. `pw0` is the base PW of the player's frame: rivals carry no
parts, and matching on the built PW would let each PW part the player installs pull a faster class
into the field (a +0.1 turbine on a 0.7 frame would move its pool to nimbus).
`rivalPwBandPm = 2000` disables matching once the balance pass compresses PW.

**Rivals carry no quirks (revision 3; ADR-0003 D37).** Revision 2 rolled `quirkSlots` = 2 random
quirks of the 12 for every kite and mule rival, and `resolveFrameBuild` adds quirk PW
(`frame-build.ts`), so the band on base PW did not hold for the built frame: `loose-rivets`
(+0.1 PW) turns a 0.7 rival into 0.8 (+14 % cruise; the band allows ±0.035), and Caracara's pool
is {kite, mule}, so all seven rivals rolled. Each rival gets `loose-rivets` with probability 1/6:
P(≥ 1 of 7) = 72 %, P(≥ 2) = 33 %, P(≥ 3) = 9.6 %. Other quirks are not time-neutral either
(`scrap-heart` regen 0.25 ≈ 2.4 %, like still-air in R14; `mud-runner` ≈ 2 % on the canyon;
`cheap-fuel` +15 energy). Measured (spec prototype, par Caracara, 800 races per goal): rivals
without quirks 52 / 29 / 53 / 6 % (T12 / T24 / T36 / T46, the table below within noise); with
rolled quirks 59 / 24 / **24** / 4 %, and in the races with at least one `loose-rivets` rival
55 / 20 / 18 / **2 %** against 70 / 36 / 39 / 10 % without one. So rivals run their frame with
empty quirk slots, as S2 and S3 already do (D47), and `generateField` draws nothing from the
`quirks` stream. This departs from BRIEF §7 "2 peculiaridades sorteadas" for rival Boneyard frames
only (the player's frames keep rolling theirs); it is tagged as a deviation in D37. Alternative
left to the owner: roll only quirks whose `mods` are all zero and whose modifiers are of the
near time-neutral kinds `activation-bonus`, `heat-penalty-immunity`, `random-skill-guaranteed`,
`no-pulse`, `lift-bonus` (old-radio, hot-head, lucky-bolt, stutter, glider-tape; a rule on kinds,
not a list), and re-measure the table. The par table below was already measured without rival quirks, so it stands.

Goal pass rates of a **par player** (stats on the rival curve with her style's rival weights,
signature frame, no actives on either side, rivals without quirks; prototype, 800 seasons-worth of
races per cell). A par
runner in a fair 8-field places ≤ k with probability ≈ k/8, so these numbers measure field
fairness, not season difficulty:

| Falconess (pool rev 1 → rev 2) | T12 | T24 | T36 | T46 |
| --- | --- | --- | --- | --- |
| Peregrina ({etoile, hayate, shiden} → {etoile, shiden}) | sprint ≤ 5: 77 → 34 % | ridge ≤ 3: 72 → 49 % | canyon ≤ 3: 41 → 19 % | ridge ≤ 1: 20 → 9 % |
| Cernícala ({erzherzog, falke, horizon, kite, mule, nimbus} → {nimbus}) | sprint ≤ 5: 72 → 99 % | canyon ≤ 3: 18 → 87 % | ridge ≤ 3: 18 → 82 % | canyon ≤ 1: 0 → 37 % |
| Caracara ({kite, mule, nimbus} → {kite, mule}) | ridge ≤ 5: 36 → 54 % | sprint ≤ 4: 12 → 30 % | canyon ≤ 3: 18 → 52 % | ridge ≤ 2: 1 → 6 % |

The relative band removes the impossible cells (Cernícala T46 0 %, Caracara T46 1 %). What
remains below the fair share is frame and rule balance, not PW class: Peregrina's pool holds
etoile, whose v1 regen dominates (R9), and Caracara's ground weights give her less agility than
the glide kites (R16).

**D12 acceptance (revision 3: BRIEF §12 metric 7 itself).** The metric is "`grade` B en el 60 % de
los casos" under the fixed policy "entrenar la stat más baja". `gradeFor` (`season/grade.ts`) gives
B or better only when `seasonScore ≥ 2900` (`SEASON.gradeThresholds`; score = stat total
+ `scorePerSkill` 20 per learned skill + `scoreWinBonus` 50 per win + `scorePodiumBonus` 20 per
second or third place) **and** no goal failed (a failure caps the grade at C, `gradeCapOnGoalFailure`). Passing
every goal is necessary but not sufficient: a reference season that passes all four goals and ends
near 550 per stat (≈ 2750 total) grades C. Revision 2 gated D12 on "all four goals passed in ≥ 60 %
of seasons", which can pass while metric 7 fails. **The gate is now the metric:** with the real
season, the reference policy and the field generated exactly as above, `sim:season-batch` (S7,
≥ 500 seasons per Falconess) must give `gradeFor ≥ B` in ≥ 60 % of the seasons of **each**
Falconess. Reported with it, as diagnostics: the grade distribution; the mean `seasonScore` split
into stat total, skills and race bonuses; and the goal pass-rate table of the shape above (per
Falconess × goal turn, share of the seasons that reach the goal; a cell under 80 % is flagged, it
is not a gate). A Falconess under 60 % is fixed with the knobs of metric 7 (25.1 row 7): `FIELD`
(`rivalBase`, `rivalPerTurn`, `rivalPwBandPm`), goal `minPlace` content, the training economy,
or the grade thresholds and score weights (`SEASON.gradeThresholds`, `scorePerSkill`,
`scoreWinBonus`, `scorePodiumBonus`), each with the report attached and an ADR line.

### 21.2 Season wiring (`season/goals.ts`, ROADMAP D12; `raceStub`, `race/stub.ts` and `STUB_RACE` deleted)

1. `raceSeed = `${d.seed}/race/${d.turn}`` (one goal per turn). No draw is taken from the
   per-input season `Rng`: only the stub ever read its `race` stream, so the training, events and
   quirks sequences are unchanged. A per-turn seed gives every policy the same field and draws for
   the same turn (common random numbers for `sim:season-batch`) and lets the UI rebuild the log
   from `(seed, turn)` plus the replayed state.
2. Player `EntryInput` from the draft: `runnerId "player"`, `kind "player"`, stats, mood, both
   aptitude maps, equipped frame, installed parts, `frameQuirks[frame]`, learned skills,
   `durability = frameDurability[frame]`. A shared helper `goalRaceSetup(ctx, draft, goal)` returns
   `{ course, raceSeed, entries }`, used by `goals.ts` and by any replay or UI viewer, so both
   produce identical entries.
3. `log = simulateRace(ruleset, entries, course, raceSeed, { detail: "results" })`.
4. Player result → `place`, `timeTicks` (DNF: `maxTicks`), `fieldSize = n`, `engine: "v1"` in
   `RaceResultEntry`; scrap by place; outcome mapping unchanged (`place > minPlace` → goal-failed;
   1 → win; ≤ 3 → podium; else lose).
5. **Durability persists:** `frameDurability[frame] = fl(durabilityEnd, 1000)` (the schema, the
   Steinhaus maintenance event and the workshop `repair` already exist for it). The reference
   policy must repair (risk R8).
6. Proposed season change (ADR-0003, not engine code): the learn cap becomes
   `maxLearnedSkills + build.skillSlots` (altair-firmware), at most 8.

## 22. Performance plan (item 22)

Budget: 8 runners × 3000 m < 5 ms per race in Node; 10 000 mixed races < 60 s.

- **Layout: struct of arrays.** One `RaceState` sized for the maxima (n = 8, S = 24) by
  `createRaceArena()` and reused through `opts.arena` (`reset()` zero-fills). Per-runner scalars in
  `Int32Array(8)` / `Uint16Array(8)`, and `Float64Array(8)` for anything that can exceed 2^31
  (`pos`, `prevPos`, `disp`, `hp`, `acc`, plan positions, `finishMilli`, rank keys). Integers in a
  Float64Array are exact below 2^53; an Int32Array would wrap silently. Tables flat:
  `vC`, `vMin` `Int32Array(8 × 2 × 3 × 24)`, `acc`, `f`, `jr` `Int32Array(8 × 2 × 24)`; skills
  `Int32Array(8 × 8 × k)` columns (trigger fields, effects, `u`, timers); the pre-drawn block
  `Float64Array(8 × 32)`.
- **Hot loop:** monomorphic; small-integer `switch` on style, rule, mode and segment type; traits are
  scalars and bitmasks folded at prep; no closures, no `Array` methods, no modifier scans, no
  object allocation.
- **Zero allocation per tick:** rank keys and counts preallocated; events written to a
  preallocated `Int32Array` ring (grown by doubling, amortised, never in practice); frame columns
  preallocated (`16 + maxTicks/15 + ⌈25 m / min disp⌉ × 8`, grown by doubling); the JSON-shaped
  log is materialised once, after the loop. With `detail: "results"` no frames or events are written.
- **Cost per runner-tick:** ≈ 35 typed reads, 20 writes, 6-8 multiplications (+2 for the style and
  rule terms of 9.8 and 13.1, folded into tables except the thrust and target multipliers), 3-4 divisions (drain
  ratio, drain, optional penalty and detour), ≈ 10 predictable branches and ≈ 8 skill trigger checks
  (skipped once fired): 80-150 ns in V8. Canyon ≈ 2050 ticks × 8 = 16 400 runner-ticks ≈ 1.3-2.5 ms
  worst case, ≈ 1 ms expected; ranks 64 compares per tick ≈ 0.1 ms; plans ≤ 5 per runner ×
  ≤ 70 candidates, negligible; sampling ≈ 290 rows. Prototype evidence (object-based, not SoA):
  1.35 ms (det-perf, no skills, no log), 1.76 ms (judge-1 merged, no skills) and 3.9 ms (the spec
  prototype: 4 skills per runner, per-tick closures and arrays) per 8-runner canyon race. The SoA
  layout and the zero-allocation rule are therefore required, not optional.
- **Batch:** `detail: "results"`, one arena, cached geometry and cached `resolveFrameBuild` by
  `(frameId, parts, quirks)`: the 10 000 races of the `pr` profile (25.2.1: 7 300 eight-runner and
  2 700 two-runner races) ≈ 5-11 s single-threaded; the nightly `full` profile ≈ 3-5 min.
- **Bench:** `packages/sim/bench/race.bench.ts` (vitest bench, already excluded from the purity
  scan): 8 mixed frames, 4 skills each, desert-canyon, `full` and `results`; CI fails if p95 > 5 ms;
  numbers pasted in the PR. ROADMAP rule: if a race exceeds 5 ms at D10, stop and optimise.

## 23. Public API and files (item 23)

```ts
// packages/sim/src/race/index.ts, re-exported by packages/sim/src/index.ts
export function buildCourseGeometry(ruleset: Ruleset, course: Course): CourseGeometry;
export function freezeEntry(ruleset: Ruleset, content: ContentIndex, input: EntryInput,
  course: Course, laneIndex: number): RaceEntry;
export function generateField(ruleset: Ruleset, content: ContentIndex,
  args: { course: Course; turn: number; raceSeed: string; player: EntryInput }): RaceEntry[];
export function simulateRace(ruleset: Ruleset, entries: readonly RaceEntry[], course: Course,
  seed: string, opts?: SimulateOptions): RaceLog;
export function createRaceArena(): RaceArena;
export function freezeSkill(content: ContentIndex, id: Slug): RaceSkill;           // 3.2; freezeEntry and the batch (S4)
export function neutralFixtureEntry(args: { runnerId: string; laneIndex: number; style: Style;
  stats: RaceEntry["stats"]; skills?: readonly RaceSkill[]; build?: FixtureBuild }): RaceEntry;  // 3.4, tests and batch
export function fixtureBuild(content: ContentIndex, parts: readonly Slug[],
  quirks: readonly Slug[]): FixtureBuild;                                           // 3.4, batch (S5, quirk diagnostic)
export function disableSkill(entry: RaceEntry, skillId: Slug): RaceEntry;          // 3.2, 3.4, batch (S4)
export function goalRaceSetup(ctx: SimContext, state: SeasonState,
  goal: SeasonGoal): { course: Course; raceSeed: string; entries: RaceEntry[] };   // season/goals.ts
export type SimulateOptions = { detail?: "full" | "results"; geometry?: CourseGeometry; arena?: RaceArena };
export type { CourseGeometry, RaceArena, FixtureBuild };    // FixtureBuild: internal TS type of 3.4, not a data format
// RaceEntry, RaceLog, RaceEvent, RaceResult, EntryInput, RaceSkill, RaceTraits: z.infer types from @falconess/schema
```

- The brief's 4-argument signature works unchanged (`opts` optional). `opts` changes only what is
  materialised and which memory is reused, never a result (property P7).
- `simulateRace` never reads content, never mutates its inputs, validates preconditions (throws on
  programmer errors) and never zod-parses in the hot path (tests parse its output).
- `index.ts` of `@falconess/sim` stops exporting `raceStub`.

| File | Content |
| --- | --- |
| `packages/schema/src/race.ts` | `RaceRule` (3.4), `EntryInput`, `RaceSkill`, `RaceTraits`, `RaceEntry`, `RunnerDerived`, `RaceFrames`, `RaceEvent`, `RaceResult`, `RaceLog` (section 20) |
| `packages/rng/src/fixed.ts` | `ceilDiv`, `uPm`, `uRange` (+ unit tests) |
| `packages/sim/src/race/units.ts` | `POS_PER_MM`, `VEL_PER_MMS` (from tps), `sub0`, `addCap`, phase and mode enums |
| `packages/sim/src/race/geometry.ts` | `buildCourseGeometry`, `phaseOf` |
| `packages/sim/src/race/entry.ts` | `freezeEntry`, `freezeSkill` (exported) |
| `packages/sim/src/race/modifiers.ts` | `compileTraits` (16 handlers, exhaustive `switch`) |
| `packages/sim/src/race/state.ts` | `RaceState`, `createRaceArena`, per-race tables (3.3), `capFinal`, `groundLevel`, jump reserve |
| `packages/sim/src/race/physics.ts` | `fSeg`, cruise, accel, vMin, drain, lift, approach (pure scalar helpers; unit-test targets) |
| `packages/sim/src/race/controller.ts` | rank snapshot, modes, gates, licence, style hold, accumulator, `decide` |
| `packages/sim/src/race/sprint.ts` | `planSprint` and its segment walks |
| `packages/sim/src/race/skills.ts` | triggers, checks, effects, timers |
| `packages/sim/src/race/engine.ts` | `simulateRace`, the tick loop (section 18); test-only probe hook |
| `packages/sim/src/race/log.ts` | event ring, sampler, ledger, results, margins, materialisation |
| `packages/sim/src/race/field.ts` | `generateField` |
| `packages/sim/src/race/fixtures.ts` | `neutralFixtureEntry`, `fixtureBuild`, `disableSkill` (3.4; tests and batch only, never the season) |
| `packages/sim/src/frame-build.ts` | existing; the mods/modifiers/caps/clamps arithmetic of `resolveFrameBuild` moves into one internal helper shared with `fixtureBuild` (no behaviour change) |
| `packages/sim/src/race/index.ts` | public exports |
| `packages/sim/src/rules/{mass-thrust,regen,pulse,telemetry,repairable,none,index}.ts` | `RuleSpec`s (`none`: no-op, 3.4); `pulse.ts` holds `pulseStep` |
| `packages/sim/bench/race.bench.ts` | benchmark |
| `packages/sim/src/rulesets/v1/constants.ts` | `RACE` extended and `FIELD` added (section 26; the lead applies them); `STUB_RACE` removed with the stub |

Purity reminders: no `**` anywhere in sim sources (also inside strings and JSDoc text), no
identifier `Date`, no `Math.pow/sqrt`, no float division in race math.

## 24. Test plan (item 24)

**Pinned ruleset (before balance pass 1).** The tests below that pin numbers measured on the
section 26 constants (the worked values of 11.4, the tables and anchors of 25.4, the prototype
cross-checks, the property thresholds, the rule-term tables, the physics and controller unit
tests) run on `SPEC_RULESET` (`packages/sim/src/race/testing/spec-ruleset.ts`): a deep-frozen copy
of those constants, test support only and not exported from the package index, so a balance pass
tunes `rulesets/v1` without moving them. The goldens (24.3), the season, the batch and content
validation stay on `RULESET_V1`. `SPEC_RULESET.season` is the live `SEASON` (`Ruleset.season` is
typed as the literal v1 object, so a frozen copy would not typecheck after a season tune). The
test rulesets of 24.2 are built from `SPEC_RULESET` the same way. The content those tests read
(the three desert courses, real frames, parts and skills) is not frozen: a content change still
moves them.

### 24.1 Unit tests (Vitest, exact integers)

| Area | Cases |
| --- | --- |
| rng helpers | `uPm(0) = 0`, `uPm(2^32 − 1) = 999`; `uRange` at both ends; `ceilDiv`; `Number.isSafeInteger` at the maximum of every product of 1.5 |
| geometry | segment boundaries and the five phase/plan/sampling positions of the 3 courses (section 2) in mm and pu; boundary belongs to the later phase |
| tables | `vA = 352 500`, `acc = 400`, `vMin = 255 000`, `B = 45 000`, `Bp = 60 750`; broken copies (×0.75); PW 500 and 1600; stats 1 and 2000; pace −65 / +65; monotone in each input; `landPm` 830 / 860 / 920 at T 300 / 600 / 1200 (Lumière 720, Boneyard 930 at T 600); `detour` 1100 (Boneyard 1050); `airPm` desert 1150 / 1380 / 690 (flat / descent / water); dive `Bon` 63 000; telemetry `acc` 340, `dK` ×0.9; Steinhaus desert `coolTick` 500; Boneyard curves 850 at A 600 |
| pace | `c(I)` = −21 / −11 / −3 / 0 / +1 / +14 / +22 at I 0 / 300 / 510 / 600 / 630 / 1000 / 1200; `pace ∈ [c − 43, c + 43]` at both ends of `uRange`; same width for every I |
| f_seg | 963, 1030, 1020, 800, 900, 1150, curves 900 / 950 (stabilizer) / 1000 (A ≥ 1200); falke override 1000; thin-air 1011 / 978; mud-runner 1000; two overrides take the max; clamps 500 / 1500 |
| speed | start: 3 m/s, dash reaches 255 000 vu in ≈ 9 ticks; PW 0.7 dashes to 0.85 × target; then 400 vu/tick (glide 440 in the start phase only); decel 3000 vu/tick; recovery dash after a crash; airborne hold; landing `vCore × landPm` once per jump, never after a crash; thrust and skill speed instantaneous (`vTot = vCore + thrust + skillSpeed`); dive thrust × 1.4 on descents and in the final only; hover target × 1.02 only in the middle phase and only while `inPack` (never solo, never exhausted) |
| hp | 862 890 / 1 121 757 µhp; fat floor at C ≥ 1500; glide lead variant 980; telemetry ×0.9; hpMax 915 / 1235 / 1635; exhaustion: target `vMin`, thrust off, burst aborted |
| heat | boost wanted on every tick from 0: 34 boosts to 68 000, one cooling tick to 67 000, 69 000 at tick 36, then duty 1/3; the governor keeps `heat ≤ capLim` for every non-licensed runner in a 10 000-tick boost-wanting loop; telemetry never above D; ×0.92 on output only (100 overheated ticks at constant target give exactly `fl(target × 920, 1000)` each tick); one flag per tick |
| licence | Steinhaus overheats only in `PLAN`/`KICK` and only while projected durability after the tail stays > 25 %; never breaks itself; −2000 md per overheated tick, no speed penalty; the plan never counts the licence; hot-head overheats (style modes included) only if the tail ends inside 300 m |
| durability | break → `b = 1` tables and replan; repair caps at max and never un-breaks; start at 0 → broken |
| accumulator | N ticks at level s → exactly `fl(acc0 + N·s, unit)` on-ticks; saturation under a gate block; no accrual on jump-blocked ticks (airborne, or a non-ground runner on a jump segment); reset on mode change |
| controller | each mode of 9.4 selected by a constructed state; precedence; keeps; style hold 12 ticks; surplus and regen-overflow heat limits; preheat arrives at final entry with the heat the 9.4 formula projects: heat at the PREHEAT point + `kH` × its consecutive boost ticks, below `capLim − kH` because boosting outruns the cruise price (ADR-0003 D51; neutral glide on the sprint: 31 ticks, 62 000); `kickAt` = jump entry when a jump contains `reserveAt`, `reserveAt` otherwise and for ground |
| pulses | 12/30 cadence (one pulse per 42 ticks); `readyAt` chain counting (fire on readyAt → chain + 1; one idle tick → chain = 1); `Bpc` on chain 3, 6, … (every 3rd); cooldown by fire-tick segment (flat 20); abort on takeoff and exhaustion; no-pulse fallback; free first pulse; burst cost 14 400 |
| sprint plan | fixtures for every `reason`; highest clean level on exact ties; clean beats unclean; hp window cut; the licence never enters the plan; pulse plan quantities exactly as table 3.3 (`Bon = fl(fl(Bp × pulseBiomePm[biome], 1000) × (dive ? diveStoopPm : 1000), 1000)`, `unit = Bon × pulseTicks`, `sMax = fl(unit, pulseTicks + pulseCooldownTicks)`), pinned in the desert: shiden `Bon` 136 929, `unit` 1 643 148, `sMax` 39 122 vu; hayate `Bon` 83 835, `unit` 1 006 020, `sMax` 23 952 vu; whole-pulse gain; replans on refund, jump exit, break; cap 4; never moves the start before `pos`; worked values of 11.4 pinned by the implementation; **jump fixtures (11.4):** terminal jump `[flat 1000, jump 100]` → window and kick end at 1000 m, no planned on-tick in the jump, energy at the line ≤ one heat-gate rest (≤ 6); jump inside the window (`[flat 1500, jump 100, flat 400]` and the ridge with PW 1.4 or St 350, hp-limited) → `thrustDist` skips the jump, `mapBack` puts the spurt start before the jump by exactly the jump's length, energy at the line ≤ 1; ground on a jump: `route` uses `detour` in every walk |
| jumps | `lift == required` succeeds; high-T jump spends `min(energy, req)`; failure: no lift spent, 25 000 md, `vCore × 0.4`, stall exactly 20 ticks with frozen `pos`, cooling and regen during the stall; guard → 0 damage; armor → 0 damage, speed kept, stall 30; ridge `jr = 35 000 / 15 000`; impossible jump skipped in the reserve; landing at T 600: 352 500 → 303 150 vu, one `landing` event; ground detour takes `ceilDiv(1.10 × len, v)` ticks (Boneyard 1.05) |
| water | hit 10 000 md at drag 0.2; ground 5000; guard or armor 0; no stall |
| skills | probability table (I 600 → 850, I 300 → 700, I 100 → 200); Altair +150; lucky 1000; **disabled:** `p = 0` on an Altair frame, with an activation-bonus trait and as the lucky pick (each override checked), no `skill`/`skillMiss` event, `derived.pSkill[j] = 0`; `freezeSkill` throws on a passive id and accepts a unique without a Falconess; **single check:** a trigger held 10 000 ticks with `u ≥ p` never fires; phase-scoped bonus fires at middle entry; `once: false` re-arm (only by a false tick after the effect has ended, so a trigger flickering during the effect never chains activations: ADR-0003 D50) and cap 3; each trigger field; each effect field; refund → replan in the plan; skillMiss logged once |
| modifiers | one table-driven case per kind (16), freeze aggregation and tick effect |
| rules | one case per rule (5) plus `none` (no effect); one case per rule term of 13.1 (Steinhaus desert cooling, Lumière landing ×2, pulse air per segment and biome, telemetry drain and accel, Boneyard landing/detour halved and curves ×1.5) |
| fixtures | `neutralFixtureEntry` returns the fixed values of 3.4, parses as `RaceEntry`, and no season or `generateField` output ever has `rule: "none"` or a disabled skill; `skills` must be frozen, unique, id-sorted; `fixtureBuild` with no parts and quirks equals the fixed values; with `steinhaus-turbine` PW 1100 and dissipation 50, with `lumiere-stabilizer` `curvesScalePm` 500, with `koryu-firmware` `statDelta.intelligence` 30, with `altair-firmware` nothing in race; `disableSkill` changes only that skill's flag and throws on a skill the entry lacks |
| finish | `finishMilli` on a constructed crossing (both interval ends); `timeTicks`; dead heat; margins on a constructed 2-runner case; DNF with a test ruleset with tiny `dnfTicksBase` |
| log | zod parse of a real log; sampling rule (T ≤ 15, T % 15, finish rows, last 25 m, last tick); `detail: "results"` gives identical `results` and `derived` |
| field | deterministic; lanes a permutation; relative band on the frame's base PW (pools of 21.1 for each PW class; a part on the player's frame does not change the pool); widening to the single nearest frame; rivals carry no parts and no quirks (kite and mule rivals included), so every rival's built PW equals its base PW and lies in the band; no uniques; skill count by turn; own `Rng` (season and race draw counts unchanged) |

### 24.2 Properties (fast-check, 500 cases each)

Test rulesets are built as `{ ...RULESET_V1, race: { ...RULESET_V1.race, ... } }` (the `Ruleset`
type must allow it: see the note in section 26). "Noise off" = `paceHalfWidth = paceCentreSpan =
planErrorMax = 0`.

- **P1 determinism:** two calls give deep-equal logs and equal JSON hashes; inputs not mutated;
  the order of the `entries` array is irrelevant (sorted by lane inside).
- **P2 symmetry:** noise off, identical entries without actives in any lanes → identical
  `finishMilli`, `deadHeat: true`, margin 0, identical frame columns. Statistical variant with noise:
  8 identical builds over 2000 seeds, each lane wins 12.5 % ± 3 %.
- **P3 agility monotonicity** (flat course 200-3000 m, solo, noise off, no actives), three tiers:
  (a) strict for every build with boost neutralised (`kBoost = kH = 0`) when neither run exhausts;
  an exhausted no-boost pair falls under (c) (ADR-0003 D52: 42 inversions in 3579 exhausted pairs,
  worst 0.07 %, from the drain of the tick that crosses `finalStart`);
  (b) any frame, neither run exhausts: `finishMilli(A + d) ≤ finishMilli(A) + 1000 × q` with
  `q = 1` for continuous frames (accumulator and plan quantisation: at most one tick) and, for pulse
  frames, `q = 1 + ceilDiv(R.pulseTicks × BpMax, vC0)` (one burst of the largest pulse thrust,
  `BpMax = fl(fl(Bpc[0] × max(airPm), 1000) × stoopMax, 1000)`, at the slowest flat cruise `vC0`:
  ≈ 4 ticks for shiden; a faster runner can lose its last whole burst to the line);
  (c) either run exhausts: `≤ finishMilli(A) × 1005 / 1000` (a genuine plan/exhaustion
  interaction). Spec-prototype measurement (revision 2 constants): 0 inversions in 1500 pairs for
  (a); (b) 15 inversions in 976 pairs, worst 121 mt for continuous frames and 1106 mt for one
  shiden pair (one burst: the stoop and the desert air make a PW 1.4 dive burst worth 7 m);
  (c) 3 in 524, worst 0.05 % (judge 1 measured up to 1.19 % with thrust allowed after exhaustion,
  which this spec disables). Revision 1 measured worst 140 mt for (b) before the stoop existed. If
  a tier fails, investigate before loosening it (ADR).
- **P4 bounds on every tick** (test-only probe exported from `engine.ts`, not from `index.ts`):
  `0 ≤ hp ≤ hpMax`, `0 ≤ energy ≤ Emax`, `heat ≥ 0`, telemetry `heat ≤ D`, non-licensed
  `heat ≤ capLim`, licensed `dur > 0` from self-inflicted overheat, `0 ≤ dur ≤ durMax`, `vOut ≥ 0`,
  `pos` non-decreasing, no DNF.
- **P5 log consistency:** places a permutation of 1..n; one `finish` event per finisher matching
  place and time; `finishMilli ∈ [1000 (timeTicks − 1), 1000 timeTicks]`; margins ≥ 0; frame ticks
  strictly increasing; Σ frame `boost` column = Σ ledger `boostTicks`; the energy identity of 20.5.
- **P6 RNG accounting and isolation:** `drawCount("race") == 32 n`; `drawCount("quirks")` = number
  of lucky holders; changing runner i's build leaves every other runner's `pace`, `planErrPm` and
  `u` unchanged. **P6b (ablation alignment, revision 3):** `disableSkill` on any skill of any runner
  leaves both draw counts, every runner's `pace`, `planErrPm`, `luckySkill` and every `u` value
  (the disabled skill's and every later skill's in id order included) unchanged, and the disabled
  skill never fires; this is what makes S4's paired runs line up draw for draw.
- **P7 options invariance:** `results` and `derived` identical across `detail` modes and with or
  without an arena or a cached geometry.
- **P8 integers only:** every number in the log is a safe integer.
- **P9 stamina monotonicity** (flat, solo, noise off): same tiers as P3 (b), (c).

### 24.3 Golden and determinism

`tests/golden/v1/g01..g12.json` = 3 courses × 4 fields, byte-identical full logs, regenerated only
with `--update-golden` and an ADR: (a) 8 different generic frames, all stats 600; (b)
`generateField` at turn 24 around each Falconess on her signature frame; (c) the same at turn 46;
(d) an edge field: mule and kite with lucky-bolt, stutter, hot-head, glider-tape, mud-runner; I 100;
St 150 (exhaustion); a Steinhaus frame driven into its licence; a build whose jump need exceeds its
tank (forced `jumpFail`). Optional (ROADMAP D14): hash of the 12 logs under Node and Deno.

### 24.4 Benchmark

Section 22, plus a CI smoke of 1000 mixed races < 6 s (`--runs 1000`) and the 10 000-race batch
< 60 s: the `pr` profile of 25.2.1, whose per-scenario counts add up to `--runs`. The `full`
profile (S3, S5 and S8 at their full sample sizes, ≈ 270 000 races) runs nightly with its own
budget of 20 min and is not part of this gate.

## 25. Balance knobs, batch scenarios and sanity numbers (item 25)

### 25.1 Knobs per §12 metric (↑ = raise the constant)

| # | Metric (target) | Knobs → direction |
| --- | --- | --- |
| 1 | Style win rate per biome, equal stats (15-35 %) | First the style terms of 9.8: `diveStoopPm` (dive: final and descents), `hoverDraftPm` (hover: middle pack), `glideStartAccelPm` (glide: start), `groundDetourMult` ↓ and `landBasePm`/`landTechPm` ↓ (ground vs flyers on jump courses: detour 1250 → 1100 moved ground from 6 % to 38 % on the ridge in the spec prototype, with the landing loss); `glideLeadDrainPm` ↓ helps glide on long courses (950 → 980 moved canyon glide from 44 % to 33 %); then `diveKeep`/`hoverKeep`/`glideKeep`, `hoverAttackAt`, `packLo`/`packHi`, `groundPreShare`, `groundDamagePm`; `paceHalfWidth` ↑ pulls every style towards 25 %. `stylePace[style][phase]` stays at 1000: a flat per-phase speed bonus is the last resort, not the identity (ADR-0003 D44). Measure with S1 (neutral fixture frames) and its phase-split table; real frames are diagnostics. |
| 2 | Manufacturer home 30-45 %, weak ≤ 15 % (one designated entry per manufacturer, fair share 12.5 %, 25.2) | The rule terms of 13.1 (numeric, ADR-0003 D45) carry the cells: `pulseAirPm`, `pulseBiomePm` (Kōryū home desert/descents, weak water); `regenLandLossPm` (Lumière weak jumps); `telemetryDrainPm`, `telemetryAccelPm` (Altair home long, weak sprint); `repairableRuggedPm`, `repairableCurvesPm` (Boneyard home obstacles, weak pure speed); `massThrustCoolPm[biome]` (Steinhaus weak desert). The thrust- and heat-keyed terms (pulse, mass-thrust) need the energy game first: `kE` ↓ (25.3 step 2). `regenPerTick` ↓ before anything else touches Lumière (at 500 it wins 82 % of the equal-PW sprint field, R9). PW compression (`pwCruiseWeight`/`pwBoostWeight` ↓) comes **after** the terms are tuned, so the cells survive it. The global `biomeCool` must not be used for Steinhaus's desert cell: it cools every rule and helps the licence holder relative to governed rivals. Only desert exists: only some cells are measurable in v1. Measure with S2 and its equal-PW, same-style variant. |
| 3 | Generic vs signature (0.85-0.90, i.e. the signature wins 52.6-54.1 % of 1v1 races, ≈ 0.11-0.18 % faster) | content values of the signature passives (talon-lock, still-air, scrap-armor: tickets in R14); `pulse-chain-accel` semantics (every Nth: shiden's generic third-pulse); the `PREHEAT` rule (heat-to-energy); `regen` trait value (still-air's 0.25 per tick); `waterHitPerDrag` (scrap-armor's water override); `activationNumerator`/`activationFloor` (activation passives) |
| 4 | Skill leave-one-out (0.5-8 m) | content `speed × duration` (instant speed: gain ≈ speed × duration × p / 15 per tick); `activationNumerator` ↑ / `activationFloor` ↓ lower p; `kAcc` ↑ shrinks accel skills (they only act below target); `hpPerKm` (speed skills lose part of their value where hp binds); iron-wings and gravity-friend need content edits |
| 5 | Part ablation (≤ 3 points of win rate; in an equal 8-field with σ 1.0-1.2 % that is a time gain of only **0.16-0.19 %**, R18) | **Content, not engine knobs** (R18): the engine knobs reach 0.16-0.19 % only by deleting what they govern (`pwCruiseWeight`/`pwBoostWeight` ≈ 20 ‰ removes PW tiers; `kCurves` with a curve penalty ≈ 10 ‰ at A 600 removes the curve term), and `kE` ↓ (25.3 step 2) raises the value of batteries. Part values: lumiere-stabilizer 2.26 % on the sprint (Boneyard 3.96 %), steinhaus-turbine ≈ 10 % cruise at literal weight and 2.5 % at weight 250, lumiere-turbine half of that, batteries 0.33 % at `kE` 1000 and 0.55-0.6 % at `kE` 250, koryu-firmware ≈ 0.1 % plus ≈ 2.5 points of p. Content tickets in 25.3 (stabilizer scale, turbine PW, batteries after step 2) or an ADR that moves metric 5. Measure with S5 (equal neutral field, paired) |
| 6 | Same-build time σ (0.8-2 %) | `paceHalfWidth` (σ ≈ 0.27 × W0 with hp margin, damped where hp binds; +10 ‰ of W0 ≈ +0.27 points; the same for every I); `paceCentreSpan` changes the mean effect of Intelligence, not σ; `activationNumerator` (Bernoulli variance near p = 0.5); `planErrorMax` (minor unless hp binds) |
| 7 | Season `gradeFor ≥ B` in ≥ 60 % of seasons per Falconess (lowest-stat policy; grade B needs `seasonScore ≥ 2900` and no failed goal) | Score side: `SEASON.gradeThresholds` (B 2900 ↓ easier), `scorePerSkill`, `scoreWinBonus`, `scorePodiumBonus`, `gradeCapOnGoalFailure`, the training economy (`trainBase`: stat total at season end). Goal side: `FIELD.rivalBase`, `rivalPerTurn` (↓ easier), `rivalNoise`, `rivalPwBandPm`, `rivalMaxSkills`; goal `minPlace` (content); `hpBase`/`hpPerKm` (canyon goals for stamina-poor builds); `scrapByPlace` (repairs, durability persistence). Season constants live in `rulesets/` too: batch report and ADR line. Diagnostics: grade distribution, score split and the goal pass-rate table (21.1) |
| 8 | Intelligence and style letter never lower the win rate (added, S8) | `paceCentreSpan` ↑ (mean effect of I); `paceHalfWidth` must stay the same for every I; `planErrorMax` |

### 25.2 Batch scenario definitions and run budget (D14; revision 3)

**Common rules.** Every scenario builds its entries before the race (content side, in the batch
tool) and calls `simulateRace` with `detail: "results"`. **Quirk policy (revision 3):** no runner
of any scenario carries a quirk unless the scenario says so (only the quirk diagnostic does); real
Boneyard frames run with empty quirk slots, exactly like the generated rivals (21.1, D37). Seeds
are `${profile}/${scenario}/${course}/${cell}/${k}`. "Paired" means that the two runs of a pair
use the same seed and the same lanes, so every runner's draws coincide (17.1, P6, P6b). Intervals
are 95 %: Wilson for a win rate over independent races; the normal interval of the mean paired
difference for paired scenarios (S3, S4, S5, the adjacent-I steps of S8); for σ/mean,
`σ × (1 ± 1.96 / √(2(N − 1)))`.

- **S1 style:** 8 runners, 2 per style, built with `neutralFixtureEntry` (3.4: PW 1.0, energy 100,
  dissipation 60, durability 100, `rule: "none"`, no passive, no parts, no quirks; batch fixture,
  not content), stats 600, no actives, lanes shuffled per seed; races per course in 25.2.1; gate on
  the per-biome mean; a real-frame variant is reported as diagnostics. Reason: every dive frame in
  content is PW 1.4, so a real-frame style metric measures frame power, not style.
- **S2 manufacturer (revision 4: one designated entry per manufacturer, exact counting rule;
  ADR-0003 D40):** 8 runners, lanes shuffled per seed.
  - **Five designated entries**, one per manufacturer. Each is a frame drawn uniformly from that
    manufacturer's non-signature frames (two each in v1; frames sorted by id, manufacturers in id
    order, one `nextInt` per manufacturer from `new Rng(seed + "/frames")`, batch side), built with
    `freezeEntry` (`kind: "rival"`, `falconessId: null`, base stats 600, mood 0, every aptitude
    letter B, so the effective stats are 600), no actives, no parts, **no quirks** (kite and mule
    run with empty slots). Signature frames never enter S2: they belong to one Falconess each, and
    S3 measures them.
  - **Three non-attributed fillers:** `neutralFixtureEntry` (3.4: `rule: "none"`, PW 1.0,
    energy 100, dissipation 60, durability 100), style hover, stats 600, no skills. They are the
    same three runners in every S2 race and in both variants, and they count for no manufacturer.
  - **Counting (metric 2):** manufacturer m's win rate on course c is its designated entry's share
    of first places, `wins_m / races`. A dead heat for first (19: equal `finishMilli`) gives each
    runner of the group 1/k of a win; the lane tie-break of 19 is not used for the metric. Filler
    wins go in their own column ("none (3 runners)"). Every manufacturer has exactly one entry in
    every race, so its fair share is 12.5 % (1/8) whatever the draw. Revision 3's field ("one random
    non-signature frame of each manufacturer + 3 random") gave a manufacturer 1, 2 or 3 entries, so
    total wins measured entry count: 12.5 % of wins with one entry, 37.5 % with three, ≈ 20 % on
    average (P(≥ 3 entries) ≈ 0.105). That alone failed "weak ≤ 15 %" for a neutral manufacturer,
    and a lucky draw of extra entries could reach the home band with no rule effect. With the fair
    share at 12.5 %, the weak ceiling sits 2.5 points above it: it stops a weak manufacturer from
    beating its fair share, but it does not require it to fall below that share. The home band asks
    for 2.4-3.6 × the fair share.
  - **Cells:** a course is home or weak for a manufacturer if its biome, a trait or a segment type
    matches; if both match, the cell is neutral (Kōryū on the canyon: desert home, water weak).
    There is one verdict (25.2.1) per (manufacturer, course) home or weak cell; neutral cells are
    only reported. v1 desert cells: Kōryū home sprint and ridge; Steinhaus weak on all three
    courses; Lumière weak ridge; Altair home canyon, weak sprint; Boneyard home ridge, weak sprint.
  - **Equal-PW variant (sanity, reported before D12):** the same field and the same counting, with
    every designated entry on the neutral frame values and style hover. Each one is the fixture of
    3.4 with `rule` and `manufacturer` set to its manufacturer's (`{ ...neutralFixtureEntry(...),
    rule, manufacturer }`, batch side; PW 1.0, energy 100, dissipation 60, durability 100, no
    passive, no quirks, stats 600). It isolates the rule terms of 13.1 from frame power. Table in
    25.4.
- **S3 signature (revision 4: exact build, cells and home biome; ADR-0003 D47):** 1v1 paired seeds
  (both lane orders of one seed form one paired sample). Signature vs the generic of the same style
  and manufacturer: peregrina-signature vs shiden (dive), cernicala-signature vs nimbus (hover),
  caracara-signature vs mule (ground).
  - **Build: both entries are the same Falconess.** Each is built with `freezeEntry` (3.1) from
    `{ runnerId: "signature" | "generic", kind: "player", falconessId: <her id>, baseStats: 600 on
    all five stats, mood: 0, biomeAptitude and styleAptitude: her content maps, frameId, parts: [],
    quirks: [], learnedSkills: her uniqueSkills, durability: null }`. So the only active is her
    unique skill (stoop-strike, wind-hover, scavenger-stride), with no generic active. Effective
    stats on the desert courses, with the style letter of the shared frame style: Peregrina A 630
    (desert A) and I 630 (dive A); Cernícala A 600 (desert B) and I 630 (hover A); Caracara A 600
    (desert B) and I 630 (ground A); St, T and C 600 for all three. **The generic carries no
    quirks** (caracara-signature has 0 quirk slots; mule's two slots stay empty, so a quirk such as
    loose-rivets, +0.1 PW and ≈ 7 % of time, never decides the metric). Reasons for this build:
    600 is the reference build of S1, S2, S4, S5 and S8 and is close to the T46 par
    curve (mean 509 per stat; a hover's I ≈ 640 with letter A). The unique skill is the one active
    every season starts with (`season/start.ts`), so it is the only active that "la misma
    Falconess" always carries. A generic list would be an invented build, and its mix of phases
    would set the value of the activation passives.
  - **What the build implies for the activation passives.** Stoop-strike (final, descent) can
    fire only on the ridge, the one course with a descent in its final phase (1333-1500 m), so
    talon-lock's final +100 ‰ acts only there. Wind-hover (`positionRange` 0.3-0.7) never fires
    in a two-runner race, because `posFrac` is 0 or 1000 (9.1). On an Altair frame at I 630, a
    base-1.0 skill is already at p 1000 (857 + 150). So nimbus's mid-activation is inert in S3 by
    construction. Scavenger-stride fires on the ridge for both sides alike.
  - **Ratio** = generic wins / signature wins (a dead heat counts half a win for each), with the
    95 % interval over the paired samples.
  - **Verdict per (pair, course) cell:** all 9 cells (3 pairs × 3 courses) must lie in 0.85-0.90
    (25.2.1); courses are not pooled. A pooled ratio would pass a passive worth ≈ 2 % on one course
    and nothing on the others (scrap-armor's water override, R14).
  - **Home biome** (BRIEF §9 invariant 2 "en su bioma casa", §12 metric 3 "mismo bioma"): desert
    for all three pairs in v1, because desert is the only biome with courses. For Peregrina it is
    both her best biome letter (A) and Kōryū's home. Cernícala's home (urban A; Altair's home is
    urban) and Caracara's (mountain A; Boneyard's home is obstacle courses, a trait, which the
    ridge has) have no v1 course in that biome. For those two, gating every desert course is
    stricter than the brief, which asks for the band in the home biome only. When an urban or
    mountain course exists, their gate moves to their home-biome cells with an ADR line (D47).
  - Samples per pair and course in 25.2.1: 150 in `pr`; 4000 in `full`, doubled (up to 8000)
    while the interval straddles a band edge (band ±0.025 in ratio). Expected values at v1: R14.
- **S4 skill leave-one-out (revision 3, exact):** one cell per active skill and course where its
  static trigger can occur (`segment` present on the course, `phase` reachable): 31 cells in v1
  (the 8 actives without a `segment` trigger on all three courses, the 7 segment-triggered ones on
  their one course). Field: the S1 field (8 neutral fixtures, 2 per style, stats 600, lanes
  shuffled per seed) in which **every runner carries the skill** (`skills: [freezeSkill(content,
  id)]`; uniques too, since `freezeSkill` does not check `uniqueTo`). Paired runs per seed: "on" as
  built, "off" with `disableSkill(entry, id)` on all 8 runners. The skill keeps its slot `j` and
  its `u` values, and its `p` is 0 before any bonus, telemetry term or lucky pick (3.2, 15.2), so
  every draw of both runs coincides (P6b). Gain per runner = `(timeOff − timeOn) × L / timeOff`
  metres, averaged over the 8 runners and the seeds; target 0.5-8 m per cell (BRIEF §12 metric 4,
  "ganancia media en metros"), judged on the paired interval. Position triggers (`positionRange`)
  fire for whoever is in range in the "on" run: the gain is the skill's value in a field where
  everyone has it (the report says so). Paired seeds per cell: 20 in `pr`, 100 in `full`.
- **S5 part ablation (revision 3, redefined):** the S1 field (no actives, no quirks). For the
  k-th seed of a (part, course) cell the carrier is the runner in lane `k mod 8`, so carriers cycle
  through every lane and style. Paired runs per seed: the carrier built with
  `neutralFixtureEntry({ ..., build: fixtureBuild(content, [part], []) })` against the plain
  fixture; every other runner identical in both runs. Metric: paired Δ win rate of the carrier
  (with − without; the "without" expectation is 12.5 % by symmetry), with its interval; reported
  with it, the paired time gain in % and metres. Target ≤ 3 points on every course (BRIEF §12
  metric 5). With 30 seeds (`pr`) the win-rate interval is several points wide, so the `pr`
  verdict converts the paired time gain (a precise number: draws coincide) into points at the σ
  that S6 measures in the same run, with the equal-field model (one runner δ faster than seven
  others, independent normal times of relative σ; numerical integration in the batch tool, which is
  not `sim`, so floats are allowed there): 3 points ↔ δ ≈ 0.155 % at σ 0.99 % and ≈ 0.185 % at
  σ 1.18 %. The `full` profile measures Δwin directly (1500 seeds: ±1 point). S5 is re-run after
  D14 step 2 (`kE`), which roughly quadruples the value of the energy parts (R18). Revision 2 used
  the mixed real-frame S2 field: a runner on a slow frame wins nothing with or without the part and
  a dominant frame wins either way, so the averaged delta was diluted and could hide every value
  of R18.
- **S6 dispersion:** no extra races: computed from the S1 races. Each of the 8 S1 runners is a
  fixed build over the S1 seeds (shuffling lanes only reassigns draws); σ/mean per runner and
  course, metric = the mean over the 8 runners per course (target 0.8-2 %); field interactions add
  a little variance (the report says so). The hp-tight real-frame reference (shiden, R6) is a
  diagnostic line of the same report.
- **S7 season:** `sim:season-batch` (`apps/cli/src/season-batch.ts`) with the reference policy
  "entrenar la stat más baja" (`tools/policies/`), the real season and the field of 21.1. Metric 7
  literally: share of seasons with `gradeFor ≥ B`, gate ≥ 60 % per Falconess (D12 acceptance,
  21.1). Diagnostics: grade distribution, `seasonScore` split, goal pass-rate table. Budgeted in
  goal races (4 per season, fewer when a goal fails).
- **S8 Intelligence monotonicity (gate, added):** an otherwise equal 8-runner field of neutral
  fixtures (one style per run, all four styles), one runner at I ∈ {300, 510, 600, 630, 1000} (510
  and 630 are style letters E and A at base 600); within a (style, course) cell the five I values
  share the seeds and the measured lane (`k mod 8`), so adjacent-I differences are paired. Full
  gate (`full`, 1500 races per cell and course): the win rate (and the top-3 rate) is
  non-decreasing in I in every cell. `pr` gate (20 races per cell): win rates pooled over styles
  and courses per I; fail only if an adjacent-I paired difference is significantly negative.
  Revision 1 failed it (sprint: 15.1 % at I 300, 6.9 % at I 1000); revision 2 measures
  4.3 / 8.8 / 11.1 / 12.3 / 31.3 % (section 10).
- **Quirk diagnostic (`full` only, informative):** each of the 12 quirks measured like S5 (carrier
  built with `fixtureBuild(content, [], [quirk])`). The player's Boneyard frames roll quirks in the
  season, so their values are content findings (loose-rivets ≈ 7 %, scrap-heart ≈ 2.4 % like
  still-air in R14, mud-runner ≈ 2 % on the canyon).
- **Stat diagnostic (`full` only, informative):** metres per +100 of each stat from 600 (paired
  solo races of a neutral hover).

#### 25.2.1 Run budget and verdicts (ADR-0003 D48)

Two profiles. **`pr`** (default) is the BRIEF §12 batch: `pnpm sim:batch -- --runs 10000`, 10 000
races in < 60 s, run by CI on every PR that touches `sim` or `content`, report `out/balance.json`
with the diff against `main`. Its counts scale with `--runs N` (each × N / 10 000, floored, at least
1 per cell; S1 absorbs the rounding remainder so the total is exactly N, less any S7 races a failed
goal leaves unrun); `--runs 1000` is the CI smoke of 24.4. **`full`** is
`pnpm sim:batch -- --profile full` (`--runs` ignored): nightly on `main` and on demand, budget
< 20 min single-threaded. It is not a per-PR job and not the brief's 60-s batch: it adds sample
size and removes nothing from the `pr` job.

| Scenario | Unit | `pr` cells × count | `pr` races | `full` cells × count | `full` races |
| --- | --- | --- | --- | --- | --- |
| S1 style (S6 from the same races) | 8-runner race | 3 courses × 400 | 1 200 | 3 × 800 | 2 400 |
| S2 real frames | 8-runner race | 3 × 200 | 600 | 3 × 600 | 1 800 |
| S2 equal-PW variant | 8-runner race | 3 × 300 | 900 | 3 × 600 | 1 800 |
| S3 signature | paired sample = 2 two-runner races | 3 pairs × 3 courses × 150 | 2 700 | 9 × 4000 (doubled to 8000 while inconclusive) | 72 000 (≤ 144 000) |
| S4 skills | paired seed = 2 8-runner races | 31 (skill, course) cells × 20 | 1 240 | 31 × 100 | 6 200 |
| S5 parts | paired seed = 2 8-runner races | 8 parts × 3 courses × 30 | 1 440 | 8 × 3 × 1500 | 72 000 |
| S7 season | goal races (4 per season) | 3 Falconess × 60 seasons | ≤ 720 | 3 × 500 seasons | ≤ 6 000 |
| S8 Intelligence | 8-runner race | 60 cells (5 I × 4 styles × 3 courses) × 20 | 1 200 | 60 × 1500 | 90 000 |
| Quirk diagnostic | paired seed = 2 8-runner races | - | - | 12 quirks × 3 courses × 200 | 14 400 |
| Stat diagnostic | paired seed = 2 solo races | - | - | 5 stats × 3 courses × 100 | 3 000 |
| **Total** | | | **10 000** | | ≈ 270 000 (≤ 342 000) |

Time: `pr` holds 7 300 eight-runner and 2 700 two-runner races: ≈ 5-11 s at the SoA target of
section 22 (1-2 ms per 8-runner canyon race, the course mix averages ≈ 0.65 of a canyon race, a
two-runner race costs ≈ 0.3 of an 8-runner one), ≈ 28 s at the object prototype's 5.3 ms: inside
60 s either way (24.4). `full`: ≈ 3-5 min at the SoA target, ≈ 13 min at the prototype's cost.

Verdict of each metric, both profiles:

- **pass:** the 95 % interval lies inside the target (for a one-sided target such as "weak
  ≤ 15 %", its bound is on the right side).
- **fail:** the interval lies entirely outside the target. In `pr` a fail blocks the merge
  (BRIEF §12: "una métrica fuera de rango bloquea el merge salvo que el PR adjunte un ADR que mueva
  el objetivo").
- **inconclusive:** the interval straddles a target edge. It does not block the PR; the report
  flags it with the point estimate, and the next `full` run decides it. The `pr` job reads the last
  `full` report of `main` (CI artifact): while that report holds a fail, every PR that touches
  `sim` or `content` fails the batch job until a PR fixes the metric or attaches an ADR that moves
  the target.
- Metric 5 in `pr` uses S5's converted time gain; metric 8 in `pr` fails only on a significant
  decrease (S8).
- **Cells (revision 4):** metric 2 has one verdict per (manufacturer, course) home or weak cell
  and metric 3 one verdict per (pair, course) cell (25.2). A metric passes only if every cell
  passes, and fails if any cell fails. Otherwise it is inconclusive.

Reading "fuera de rango" as "the interval lies outside the target" and adding the `full` profile is
an interpretation of BRIEF §12, recorded as ADR-0003 D48.

### 25.3 First balance-pass hypothesis (D14; each step with its `sim:batch` report and an ADR line)

Not v1 rules: balance's float prototype tuned these together with invented mechanics, and BRIEF §12
says only the batch approves balance changes. In this order: (1) S1 and S8 at v1 constants (the
style terms of 9.8 and the pace centre are v1 rules; measured S1 desert means 25.6 / 26.3 / 26.2 /
22.0 %), then the style terms if a style leaves 15-35 %; `stylePace` stays 1000 unless the terms
cannot do it (balance's profile glide 1007/1007/977, dive 967/982/1052, hover 975/995/1025,
ground 995/995/995 is the fallback, with an ADR line); (2) energy game: `kE` 1000 → 500 → 250 with
`coolDissWeight` 1000 (balance measured at 250: boost worth 40-80 m, sprints heat-bound, long
courses tank-bound; the pulse and Steinhaus terms of 13.1 only bite here), then S5 again: this step
roughly quadruples the value of the batteries (R18), so the battery ticket below is sized after it;
(3) `regenPerTick`
500 → 60-100 (Lumière wins 82 % of the equal-PW sprint field at 500; R9) and the content tickets of
R14 (still-air, scrap-armor, talon-lock); (4) rule terms of 13.1 with the equal-PW S2 variant until
every measurable cell points the right way; (5) PW: `pwCruiseWeight` 1000 → 500 → 250 with
`pwBoostWeight` 500, or re-budget frames with balance's exchange rates (PW +0.1 = 7.3 / 11.8 /
18.1 m; energy +10 = 0 / 5.9 / 8.3 m; dissipation +10 = 5.0 / 0.1 / −0.8 m on sprint / ridge /
canyon, its constants); then real-frame S2 and S3. PW compression does **not** fix metric 5: at
`pwCruiseWeight` 250 frame tiers 0.7 and 1.4 still differ by ≈ 19 % and a +0.1 PW turbine is still
worth ≈ 2.5 % (R18); (6) pace window to land 1.0-1.3 %; (7) metric 7 with `sim:season-batch`
(S7: share of seasons graded ≥ B per Falconess, 21.1), moving `FIELD`, goals, the training economy
or the season score weights and grade thresholds, each with an ADR line. Content tickets (no engine
change): still-air, scrap-armor and talon-lock (R14); **parts (R18, metric 5):** lumiere-stabilizer
`curves-penalty-scale` 0.5 → about 0.97 (measured on the sprint body at A 600: 0.93 still gives
0.37 %, 0.95 gives 0.25 %, 0.97 gives 0.14 %; Boneyard's ×1.5 penalty makes it ≈ 1.6× larger
there), turbines `powerToWeight` +0.1 / +0.05 → about +0.01-0.02 (or a separate part-PW weight, a
new knob that needs its own ADR line), batteries +20 / +25 energy rescaled after step 2 (≈ +5 keeps
them under 0.16 % at `kE` 250 by balance's exchange rate); if the owner wants parts to stay worth
more than 3 points, an ADR moves metric 5 instead; iron-wings (`phase: any` fires at tick 0 when
nothing can be damaged), gravity-friend (accel on a faster segment ≈ 0), stutter (inert: only
Boneyard frames roll quirks and they never pulse), erzherzog's obstacle-armor on jumps (ground
never jumps), lead-guard for runners that never lead, frame budgets (R1), Boneyard quirks
(loose-rivets ≈ 7 %, scrap-heart ≈ 2.4 %, mud-runner ≈ 2 % on the canyon: quirk diagnostic of
25.2).

### 25.4 Sanity numbers

Measured with an integer prototype written from this spec (the spec editor's check, object-based
JS, not production code), **revision 2 constants** (section 26): single runner, all five stats
600 (I 600 → p 850 and pace centre 0, C 600 → heatCap 1.15 × D), noise off, no skills. "Neutral"
is the fixture entry of 3.4 (`rule: "none"`, PW 1.0, energy 100, dissipation 60, durability 100).
The implementation should land within ±0.5 % of these times; a larger gap means a formula bug (or
a deliberate change to document). Solo runs never have a middle pack, so hover's slipstream never
acts here; the neutral hover rows are therefore the cleanest hand-check anchors.

**Hand check (neutral hover, sprint):** 1200 m at 23.5 m/s = 51.1 s; launch (dash to 17 m/s in
9 ticks, then 0.4 m/s² for ≈ 15 s) costs ≈ +2.4 s, cut short by the first curve at 300 m; curves
350 m at 21.15 m/s ≈ +1.65 s plus ≈ +0.5 s of re-acceleration at 0.4 m/s²; boost 100 ticks ×
0.2 m = 20 m ≈ −0.85 s → ≈ 54.5 s (prototype 54.47 s). Ridge: 85.1 s at cruise + launch 2.4 s −
descents ≈ 0.7 s − boost 13 m ≈ 0.55 s + two landings ≈ 2 × 0.58 s (14.2) ≈ 87.4 s (prototype
87.13 s). Canyon: 127.7 s + launch 2.4 s + climb 0.8 s + headwind 2.8 s − tailwind 2.2 s + water
2.1 s (+ 1 s of re-acceleration) − boost 0.85 s + crawl at 17 m/s after hp runs out at 2.83 km
≈ 1.3 s ≈ 136 s (prototype 136.16 s). Style terms on top (9.8): dive's stoop is worth ≈ 0.35 s on
the sprint (54.12 s); glide's launch ≈ 0.2 s (54.29 s); ground loses nothing on the ridge's jumps
(86.46 s against 86.91-87.13 s for the flyers).

**desert-sprint**

| Build | Time | Phase splits S/M/F (s) | Boost ticks S/M/F | Pulses | Plan (first) | Energy left | hp end | Overheat ticks / durability end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| neutral dive | 54.12 s | 10.44/26.92/16.75 | 1/0/99 | - | 1.80 m/s from 801 m | 0.0 | 216 / 915 hp | 0 / 100 |
| neutral hover | 54.47 s | 10.36/26.93/17.18 | 10/0/90 | - | 1.30 m/s from 841 m | 0.0 | 223 / 915 hp | 0 / 100 |
| neutral glide | 54.29 s | 10.34/26.86/17.09 | 1/0/99 | - | 1.30 m/s from 802 m | 0.0 | 235 / 915 hp | 0 / 100 |
| neutral ground | 54.49 s | 10.28/26.56/17.65 | 18/43/39 | - | 2.50 m/s from 1064 m | 0.0 | 225 / 915 hp | 0 / 100 |
| falke (glide, mass-thrust, PW 1.00) | 54.14 s | 9.93/26.82/17.39 | 46/8/66 | - | 0.80 m/s from 801 m | 0.0 | 235 / 915 hp | 0 / 140 |
| erzherzog (ground, mass-thrust, PW 1.00) | 54.49 s | 10.07/26.77/17.65 | 41/20/39 | - | 1.20 m/s from 988 m | 0.0 | 226 / 915 hp | 0 / 140 |
| sylphe (hover, regen, PW 1.20) | 46.12 s | 9.72/22.21/14.20 | 50/111/93 | - | 1.90 m/s from 841 m | 15.0 | 88 / 915 hp | 0 / 80 |
| etoile (dive, regen, PW 1.40) | 41.66 s | 9.48/20.31/11.87 | 49/101/85 | - | 3.08 m/s from 800 m | 20.0 | empty at 1177 m | 0 / 60 |
| shiden (dive, pulse, PW 1.40) | 42.73 s | 9.34/21.22/12.16 | 36/0/36 | 6 | 2.61 m/s from 801 m | 13.6 | 3 / 915 hp | 0 / 100 |
| hayate (ground, pulse, PW 1.20) | 47.39 s | 9.79/22.74/14.86 | 28/32/12 | 6 | 1.60 m/s from 987 m | 13.6 | 114 / 915 hp | 0 / 60 |
| nimbus (hover, telemetry, PW 0.85) | 62.35 s | 10.65/31.46/20.24 | 15/0/105 | - | 1.15 m/s from 841 m | 0.0 | 375 / 915 hp | 0 / 100 |
| horizon (glide, telemetry, PW 1.00) | 54.09 s | 10.17/26.80/17.11 | 37/35/103 | - | 1.30 m/s from 801 m | 0.0 | 301 / 915 hp | 0 / 100 |
| mule (ground, repairable, PW 0.70) | 77.34 s | 12.58/38.71/26.05 | 31/54/55 | - | 1.00 m/s from 1016 m | 0.0 | 431 / 915 hp | 0 / 180 |
| kite (glide, repairable, PW 0.70) | 77.23 s | 12.69/39.20/25.34 | 12/0/128 | - | 0.80 m/s from 801 m | 0.0 | 440 / 915 hp | 0 / 180 |
| peregrina-signature (dive, pulse, PW 1.40) | 42.81 s | 9.39/21.21/12.21 | 36/0/36 | 6 | 2.61 m/s from 800 m | 13.6 | 4 / 915 hp | 0 / 100 |
| cernicala-signature (hover, telemetry, PW 0.85) | 60.97 s | 10.41/30.41/20.15 | 43/120/115 | - | 1.15 m/s from 841 m | 19.3 | 363 / 915 hp | 0 / 100 |
| caracara-signature (ground, repairable, PW 0.70) | 77.34 s | 12.58/38.71/26.05 | 31/54/55 | - | 1.00 m/s from 1016 m | 0.0 | 431 / 915 hp | 0 / 180 |

**desert-ridge**

| Build | Time | Phase splits S/M/F (s) | Boost ticks S/M/F | Pulses | Plan (first) | Energy left | hp end | Overheat ticks / durability end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| neutral dive | 86.91 s | 16.13/42.57/28.20 | 15/0/50 | - | 2.60 m/s from 1800 m | 0.0 | 35 / 1235 hp | 0 / 100 |
| neutral hover | 87.13 s | 16.31/42.57/28.25 | 0/0/65 | - | 1.50 m/s from 1723 m | 0.0 | 40 / 1235 hp | 0 / 100 |
| neutral glide | 86.93 s | 16.12/42.57/28.25 | 0/0/65 | - | 1.50 m/s from 1722 m | 0.0 | 61 / 1235 hp | 0 / 100 |
| neutral ground | 86.46 s | 16.17/42.06/28.24 | 17/44/39 | - | 2.50 m/s from 1860 m | 0.0 | 10 / 1235 hp | 0 / 100 |
| falke (glide, mass-thrust, PW 1.00) | 86.77 s | 16.12/42.57/28.08 | 0/0/85 | - | 0.80 m/s from 1343 m | 0.0 | 58 / 1235 hp | 0 / 140 |
| erzherzog (ground, mass-thrust, PW 1.00) | 86.46 s | 16.16/42.06/28.24 | 18/43/39 | - | 1.20 m/s from 1780 m | 0.0 | 10 / 1235 hp | 0 / 140 |
| sylphe (hover, regen, PW 1.20) | 78.46 s | 15.14/36.57/26.75 | 77/166/95 | - | 1.90 m/s from 1401 m (hp-limited) | 60.0 | empty at 1834 m | 0 / 80 |
| etoile (dive, regen, PW 1.40) | 71.33 s | 14.55/32.46/24.32 | 82/157/49 | - | 3.38 m/s from 1339 m (hp-limited) | 60.0 | empty at 1643 m | 0 / 60 |
| shiden (dive, pulse, PW 1.40) | 71.11 s | 15.09/32.19/23.82 | 24/0/24 | 4 | 2.61 m/s from 1335 m (hp-limited) | 7.4 | empty at 1644 m | 0 / 100 |
| hayate (ground, pulse, PW 1.20) | 77.25 s | 15.33/35.64/26.28 | 36/24/12 | 6 | 1.60 m/s from 1591 m (hp-limited) | 13.6 | empty at 1768 m | 0 / 60 |
| nimbus (hover, telemetry, PW 0.85) | 100.67 s | 17.43/50.08/33.16 | 0/0/85 | - | 1.25 m/s from 1695 m | 0.0 | 308 / 1235 hp | 0 / 100 |
| horizon (glide, telemetry, PW 1.00) | 86.87 s | 16.46/42.40/28.01 | 0/35/105 | - | 1.30 m/s from 1459 m | 0.0 | 175 / 1235 hp | 0 / 100 |
| mule (ground, repairable, PW 0.70) | 120.59 s | 20.73/59.78/40.09 | 21/62/57 | - | 1.00 m/s from 1801 m | 0.0 | 370 / 1235 hp | 0 / 180 |
| kite (glide, repairable, PW 0.70) | 120.57 s | 20.86/60.13/39.58 | 0/0/105 | - | 0.80 m/s from 1622 m | 0.0 | 394 / 1235 hp | 0 / 180 |
| peregrina-signature (dive, pulse, PW 1.40) | 71.11 s | 15.09/32.19/23.82 | 24/0/24 | 4 | 2.61 m/s from 1335 m (hp-limited) | 7.4 | empty at 1644 m | 0 / 100 |
| cernicala-signature (hover, telemetry, PW 0.85) | 98.29 s | 16.99/48.76/32.54 | 52/159/157 | - | 1.05 m/s from 1401 m | 11.8 | 285 / 1235 hp | 0 / 100 |
| caracara-signature (ground, repairable, PW 0.70) | 120.59 s | 20.73/59.78/40.09 | 21/62/57 | - | 1.00 m/s from 1801 m | 0.0 | 370 / 1235 hp | 0 / 180 |

**desert-canyon**

| Build | Time | Phase splits S/M/F (s) | Boost ticks S/M/F | Pulses | Plan (first) | Energy left | hp end | Overheat ticks / durability end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| neutral dive | 135.94 s | 23.57/67.59/44.78 | 0/0/100 | - | 1.80 m/s from 2365 m (hp-limited) | 0.0 | empty at 2818 m | 0 / 90 |
| neutral hover | 136.16 s | 23.57/67.59/45.00 | 0/0/100 | - | 1.30 m/s from 2414 m (hp-limited) | 0.0 | empty at 2828 m | 0 / 90 |
| neutral glide | 135.20 s | 23.39/67.60/44.21 | 0/0/100 | - | 1.30 m/s from 2423 m (hp-limited) | 0.0 | empty at 2873 m | 0 / 90 |
| neutral ground | 136.22 s | 23.44/67.18/45.59 | 15/46/39 | - | 2.50 m/s from 2713 m (hp-limited) | 0.0 | empty at 2830 m | 0 / 95 |
| falke (glide, mass-thrust, PW 1.00) | 134.66 s | 23.21/66.92/44.53 | 2/0/116 | - | 0.70 m/s from 2000 m (hp-limited) | 2.0 | empty at 2851 m | 0 / 130 |
| erzherzog (ground, mass-thrust, PW 1.00) | 136.22 s | 23.44/67.18/45.59 | 15/46/39 | - | 1.20 m/s from 2633 m (hp-limited) | 0.0 | empty at 2830 m | 0 / 140 |
| sylphe (hover, regen, PW 1.20) | 118.44 s | 21.25/53.94/43.24 | 107/270/65 | - | 2.10 m/s from 2101 m (hp-limited) | 60.0 | empty at 2372 m | 0 / 70 |
| etoile (dive, regen, PW 1.40) | 106.93 s | 20.44/46.51/39.98 | 111/232/40 | - | 4.38 m/s from 2002 m (hp-limited) | 60.0 | empty at 2173 m | 0 / 50 |
| shiden (dive, pulse, PW 1.40) | 108.72 s | 20.57/48.59/39.55 | 60/0/12 | 6 | 2.61 m/s from 2001 m (hp-limited) | 13.6 | empty at 2230 m | 0 / 90 |
| hayate (ground, pulse, PW 1.20) | 120.47 s | 21.70/56.02/42.74 | 36/24/12 | 6 | 1.60 m/s from 2224 m (hp-limited) | 13.6 | empty at 2431 m | 0 / 55 |
| nimbus (hover, telemetry, PW 0.85) | 155.87 s | 25.98/79.54/50.35 | 0/0/120 | - | 1.05 m/s from 2538 m | 0.0 | 281 / 1635 hp | 0 / 90 |
| horizon (glide, telemetry, PW 1.00) | 133.59 s | 23.71/67.36/42.53 | 0/35/140 | - | 1.20 m/s from 2364 m | 0.0 | 81 / 1635 hp | 0 / 90 |
| mule (ground, repairable, PW 0.70) | 188.46 s | 31.14/95.88/61.45 | 20/64/56 | - | 1.00 m/s from 2804 m | 0.0 | 390 / 1635 hp | 0 / 177 |
| kite (glide, repairable, PW 0.70) | 188.35 s | 31.26/96.46/60.64 | 0/0/140 | - | 0.80 m/s from 2518 m | 0.0 | 414 / 1635 hp | 0 / 172 |
| peregrina-signature (dive, pulse, PW 1.40) | 108.74 s | 20.61/48.59/39.55 | 60/0/12 | 6 | 2.61 m/s from 2000 m (hp-limited) | 13.6 | empty at 2231 m | 0 / 90 |
| cernicala-signature (hover, telemetry, PW 0.85) | 152.01 s | 25.32/77.22/49.48 | 77/260/219 | - | 0.95 m/s from 2179 m | 0.0 | 244 / 1635 hp | 0 / 90 |
| caracara-signature (ground, repairable, PW 0.70) | 184.60 s | 31.14/95.88/57.59 | 20/64/56 | - | 1.00 m/s from 2797 m | 0.0 | 364 / 1635 hp | 0 / 180 |

**Other measured anchors (same prototype):**

| Quantity | Value |
| --- | --- |
| Reference speeds (A 600, PW 1.0) | flat 23.50 m/s; climb 0.25 22.63; descent 0.3 / 0.2 24.20 / 23.97; water 0.2 18.80; canyon −0.1 / +0.15 21.15 / 27.02; curves 21.15 (Boneyard 19.98); vMin 17.00; thrust +3.00 (continuous; dive in the final 4.20), +4.05 (pulse; × 1.15 in the desert = 4.66; +5.67 at PW 1.4) |
| Launch (dash end / cruise reached on flat) | PW 1.0: 9 ticks (6.7 m) / T 300 20.3 s, T 600 15.3 s (309 m), T 900 12.2 s; PW 1.4, T 600: 27.7 s (695 m); PW 0.7, T 600: 8.1 s (121 m); distances thrust-free; glide's start-phase ×1.1 and telemetry's ×0.85 change the ramp only |
| Drain (600 St, C 600) | 862 890 / 1 121 757 µhp per tick at cruise (non-final / final); hpMax 915 / 1235 / 1635 hp |
| Heat | boost wanted on every tick from cold: 34 boosts to 68 000 mh, one cooling tick (67 000), 69 000 at tick 36, then the governor holds duty 1/3 |
| Landing (T 600, PW 1.0) | 23.5 → 20.2 m/s, ≈ 13.5 m (0.58 s) per landing; Lumière 23.5 → 16.9 m/s; Boneyard 23.5 → 21.9 m/s |
| Failed jump (flat 800 + jump 100 + flat 1100 vs flat 2000) | +3.35 s and −25 durability; with obstacle-armor +2.00 s and no damage (a crashed runner does not land) |
| 200 m of water (drag 0.2) between flats | +3.11 s and −10 durability |
| Same-build σ/mean, solo, 300 seeds | neutral dive I 600: sprint 1.18 %, ridge 1.31 %, canyon 0.99 %; I 300: 1.21 / 1.33 / 1.00 % (mean time +0.8 %); I 1000: 1.14 / 1.27 / 0.99 % (mean −1.0 %); shiden (hp-tight) I 600: 0.61 / 0.78 / 1.08 %; falke 1.21 / 1.32 / 1.00 % |
| S1 style win rates (neutral fixtures, 2 per style, 800 races per course) | sprint dive 35 / hover 31 / glide 23 / ground 11 %; ridge 20 / 19 / 23 / **38** %; canyon 22 / 29 / 33 / 16 %; desert mean **25.6 / 26.3 / 26.2 / 22.0 %** (revision 1: 25.3 / 27.6 / 33.9 / 13.2 %; with the brief's detour 1.25 and every other revision-2 term, ground falls to 11.1 % and wins 6 % of the ridge) |
| S1 mean phase splits, start / middle / final (s) | sprint: dive 10.44 / 26.95 / **16.76**, hover 10.35 / **26.51** / 17.28, glide **10.04** / 26.83 / 17.49, ground 10.28 / 26.56 / 17.66; ridge: dive 16.15 / 42.62 / **28.25**, hover 16.17 / 42.27 / 28.50, glide **16.04** / 42.61 / 28.36, ground 16.19 / **42.07** / 28.29; canyon: dive 23.59 / 67.64 / **44.80**, hover 23.45 / **66.73** / 45.45, glide **23.01** / 67.64 / 45.27, ground 23.47 / 67.19 / 45.63 (bold = fastest: glide the start, hover the middle except on the obstacle course, dive the final) |
| S8 Intelligence (one runner in 8 equal hovers; win %) | sprint I 300 / 510 / 600 / 630 / 1000: 4.3 / 8.8 / 11.1 / 12.3 / 31.3; ridge 4.5 / 8.9 / 11.0 / 11.6 / 31.3; canyon 4.2 / 8.6 / 10.5 / 11.3 / 32.5 (revision 1: sprint 15.1 / 12.6 / 11.2 / 10.6 / 6.9) |
| Agility monotonicity (flat, solo, noise off, random builds) | no boost: 0 inversions in 1500 pairs; boost, no exhaustion: 15 in 976 pairs, worst 121 mt (continuous) and 1106 mt (one shiden burst, P3 (b) bound for pulse frames); with exhaustion: 3 in 524, worst 0.05 % (mule and kite at energy 140, ADR-0005; 977 and 523 pairs at energy 100) |
| Symmetry | identical builds (noise off) tie exactly on the 3 courses for every style |
| Cost | 4.4 ms (revision 1 code) and 5.3 ms (revision 2 code) per 8-runner mixed canyon race with 4 skills each in the object-based prototype on the same machine (closures and per-tick arrays; the new terms cost one multiply each); the SoA implementation of section 22 targets 1-2 ms |

**S2 equal-PW variant** (13.1; hover, PW 1.0, energy 100, dissipation 60, durability 100, stats
600; solo time vs `none`, then the win rate in a field of the five rules plus three `none`
fixtures, 600 races per course; this is the S2 field and counting of 25.2, one designated entry
per rule, fair share 12.5 %):

| Constants | Course | mass-thrust | regen | pulse | telemetry | repairable | none (3 runners) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | sprint | +0.01 % / 4 % | −2.93 % / 82 % | −0.13 % / 5 % | +0.77 % / 1 % | +2.89 % / 0 % | 8 % |
| v1 | ridge | 0.00 % / 13 % | +0.60 % / 2 % | −0.09 % / 15 % | +0.71 % / 3 % | −0.99 % / 37 % | 31 % |
| v1 | canyon | +0.07 % / 4 % | −2.09 % / 48 % | +0.09 % / 3 % | −1.22 % / 35 % | 0.00 % / 4 % | 7 % |
| `kE` 250, regen 60 | sprint | +1.60 % / 1 % | 0.00 % / 14 % | −0.80 % / 33 % | +0.75 % / 6 % | +2.83 % / 0 % | 45 % |
| `kE` 250, regen 60 | ridge | −0.01 % / 9 % | +2.41 % / 0 % | −0.98 % / 24 % | +0.73 % / 3 % | −1.00 % / 37 % | 28 % |
| `kE` 250, regen 60 | canyon | −0.08 % / 5 % | −0.96 % / 17 % | −0.25 % / 5 % | −2.00 % / 56 % | 0.00 % / 5 % | 13 % |

**S3 expectations at v1** (the revision-4 build of 25.2: base stats 600 with her aptitude
letters, her unique skill as the only active, generic without quirks; 2000 seeds × 2 lane orders):
see R14.

Orders of magnitude to keep in mind: one energy unit ≈ one boosted tick ≈ 0.2 m at PW 1.0 (a 100
tank ≈ 20 m ≈ 0.85 s on 2000 m, about one sigma of the dispersion target); hp ≈ 0.6 hp per metre at
600 St; one landing ≈ 13.5 m at T 600; +100 I ≈ 7 m and +100 A ≈ 50 m on 2000 m; the PW tier gap
0.7 → 1.4 is ≈ 1.7-1.8× in time with literal PW (R1); PW ≥ 1.2 frames exhaust on the ridge and the
canyon at 600 stamina (R5).

## 26. Constants (rulesets/v1)

Every constant the engine needs, ready to paste into `packages/sim/src/rulesets/v1/constants.ts`
(the folder is protected; the lead applies it with ADR-0003, gate G3 of section 0.2). BRIEF values
are unchanged except `groundDetourMult` (1.25 → 1.10, deviation D46); new entries are marked `new`
or grouped under a "new" comment. Comments use `//` only and contain no exponent operator (purity
test).

**Type note for the lead (gate G3, section 0.2; lands before D8):** `Ruleset.race` is currently
`typeof RACE` of an `as const` object, so a test ruleset with `paceHalfWidth: 0` does not
typecheck. Declare a widened type (for example
`export type RaceConstants = { readonly ticksPerSecond: number; ... }` with nested readonly objects)
and type `RACE: RaceConstants` (dropping `as const`) and `Ruleset.race: RaceConstants`, plus
`FIELD: FieldConstants` and `Ruleset.field`. The implementer may not edit
`packages/sim/src/rulesets/`, so this block, the types and `RULESET_V1.field` are the lead's
commit, made before the first D8 commit. `STUB_RACE` and `Ruleset.stubRace` stay until D12 and are
removed together with `race/stub.ts` (the lead's second commit in that folder).

```ts
/** Race constants. BRIEF §6-§7 values kept; units in comments; docs/formulas.md "Carrera". */
export const RACE = {
  // time and units
  ticksPerSecond: 15, // ticks per second; engine units derive from it: 1 pu = 1/225 mm, 1 vu = 1/15 mm/s

  // cruise and acceleration (BRIEF §6)
  vBase: 20_000, // mm/s, course base speed v_base
  kA: 350, // ‰, agility weight: cruise × (1 + kA·A/1200)
  kAcc: 400, // mm/s², k_acc: accel = kAcc × (0.5 + T/1200) × PW × f_seg
  vStart: 3_000, // mm/s, new: speed at the gun
  kStartDash: 24_000, // mm/s², new: start dash, also after a failed jump (recovery dash)
  dashUntilPm: 850, // ‰ of min(vBase, target), new: the dash ends at this speed
  kDecel: 3_000, // mm/s², new: rate limit when the target drops
  pwCruiseWeight: 1_000, // ‰, new knob: weight of (PW − 1) in cruise, accel and vMin; 1000 = brief
  pwBoostWeight: 1_000, // ‰, new knob: weight of (PW − 1) in boost thrust; 1000 = brief
  stylePace: {
    // ‰ per phase [start, middle, final], new knob; 1000 = neutral (balance-pass lever, metric 1)
    dive: [1_000, 1_000, 1_000],
    hover: [1_000, 1_000, 1_000],
    glide: [1_000, 1_000, 1_000],
    ground: [1_000, 1_000, 1_000],
  },

  // hp (BRIEF §6 plus gap decisions)
  kHp: 1_000, // ‰ of 1 hp per tick at v = vBase (k_hp 1.0)
  kS: 1_200, // ‰, stamina weight: drain / (1 + kS·St/1200) (k_s 1.2)
  hpBase: 435, // hp, new: fixed part of hpMax
  hpPerKm: 400, // hp per km of course, new
  fatigueBase: 1_500, // ‰, final-phase drain multiplier at courage 0 (1.5)
  fatigueCourage: 400, // ‰ per 1200 courage subtracted (0.4·C/1200)
  exhaustSpeedPm: 850, // ‰ of vBase × PWc × f_seg, new: body target once hp = 0
  glideLeadDrainPm: 980, // ‰, new: hp drain of a glide holding the lead (revision 2: was 950)

  // segment factors (BRIEF §6 coefficients made explicit)
  kClimb: 150, // ‰ per 1.0 of grade lost on climbs (1 − 0.15·grade)
  kDescent: 100, // ‰ per 1.0 of grade gained on descents (1 + 0.10·grade)
  kWater: 1_000, // ‰ weight of drag (1 − drag)
  kWind: 1_000, // ‰ weight of signed wind (1 + wind)
  kCurves: 200, // ‰, curve penalty at agility 0 (1 − 0.20·(1 − A/1200))
  segFactorMin: 500, // ‰, new: clamp of f_seg (schema bounds of segment-factor)
  segFactorMax: 1_500, // ‰, new

  // boost, energy, heat, durability (BRIEF §6-§7)
  kBoost: 3_000, // mm/s, thrust at PW 1.0 (k_boost)
  kE: 1_000, // me per boosted tick (k_e 1.0)
  kH: 2_000, // mh per boosted tick (k_h 2.0)
  kCool: 1_000, // mh per tick without boost (k_cool 1.0)
  coolDissWeight: 0, // ‰, new knob: cooling ∝ dissipation / dissRef; 0 = brief
  dissRef: 60, // dissipation (content units), new: reference of coolDissWeight
  biomeCool: { desert: 1_000, mountain: 1_000, coast: 1_000, urban: 1_000, tundra: 1_000 }, // ‰, new knob; 1000 = brief
  heatToleranceCourage: 300, // ‰ per 1200 courage, new: heatCap = D × (1 + 0.3·C/1200) (BRIEF tolerance)
  heatPenaltyMult: 920, // ‰ speed while overheated
  overheatDurPerTick: 1_000, // md per overheated tick, new (BRIEF "durability −= 1")
  massThrustDurMult: 2_000, // ‰, new: Steinhaus "durability ×2"
  groundDamagePm: 500, // ‰, new: ground "resiste daño", every durability loss × 0.5
  overheatFloorPm: 250, // ‰ of durabilityMax, new: the overheat licence never projects durability below it
  durabilityZeroPowerMult: 750, // ‰ PW once durability reaches 0
  surplusHeatPm: 800, // ‰ of capLim, new: heat limit of SURPLUS mode
  regenOverflowHeatPm: 900, // ‰ of capLim, new: heat limit of REGEN mode
  freeBoostMaxTicks: 12, // ticks, new: free-first-boost length on continuous frames

  // pulses (BRIEF §6, Kōryū)
  pulseTicks: 12, // ticks per burst
  pulseCooldownTicks: 30, // ticks after a burst
  pulseBoostMult: 1_350, // ‰ of k_boost per burst tick
  pulseCostMult: 1_200, // ‰ of k_e per burst tick

  // jumps and obstacles (BRIEF §6)
  kCrash: 25, // durability lost on a failed jump
  kJumpPenaltyTicks: 20, // lost ticks on a failed jump
  crashSpeedMult: 400, // ‰, new constant for the brief's v = 0.4·v
  groundDetourMult: 1_100, // ‰, ground route length over a jump segment (BRIEF 1.25; deviation D46)
  waterHitPerDrag: 50, // md per ‰ of drag on entering water, new (drag 0.2 → 10 durability)
  landBasePm: 800, // ‰ of vCore kept on landing at technique 0, new (gap D43)
  landTechPm: 120, // ‰ added at technique 1200: landPm = 800 + 120·min(T, 1200)/1200 (T 600 → 860)

  // manufacturer rules (BRIEF §7)
  regenPerTick: 500, // me per tick without boost (Lumière 0.5)
  repairablePerFlatSegment: 2, // durability per flat segment entered (Boneyard)
  telemetryActivationBonus: 150, // ‰ added to every skill check (Altair +15 %)
  telemetryPowerCap: 1_100, // ‰ PW cap (applied by resolveFrameBuild)

  // rule terms (new, revision 2; numeric, BRIEF §7 deviation; section 13.1, ADR-0003 D45)
  massThrustCoolPm: { desert: 500, mountain: 1_250, coast: 1_000, urban: 500, tundra: 1_250 }, // ‰ of coolTick, Steinhaus
  regenLandLossPm: 2_000, // ‰ of the landing loss, Lumière (light airframe)
  pulseAirPm: [1_000, 1_000, 1_200, 1_000, 600, 1_000, 1_000], // ‰ burst thrust per segment type (SEGMENT_TYPES order), Kōryū
  pulseBiomePm: { desert: 1_150, mountain: 1_000, coast: 1_000, urban: 1_000, tundra: 1_000 }, // ‰ burst thrust per biome, Kōryū
  telemetryDrainPm: 900, // ‰ of hp drain, Altair
  telemetryAccelPm: 850, // ‰ of acceleration, Altair
  repairableRuggedPm: 500, // ‰ of the landing loss and of the detour's extra length, Boneyard
  repairableCurvesPm: 1_500, // ‰ of the curve penalty, Boneyard

  // skills (BRIEF §6)
  activationNumerator: 90, // p = max(1 − 90/I, 0.2)
  activationFloor: 200, // ‰
  maxSkills: 8, // actives per entry, new
  maxSkillActivations: 3, // activations of a once:false skill, new

  // Intelligence and variance (new; revision 2: fixed width, centre rising with I)
  paceHalfWidth: 43, // ‰ pace judgement half-width W0, the same for every I
  paceCentreSpan: 43, // ‰ the window centre rises from −span/2 at I 0 to +span/2 at I ≥ 1200
  planErrorMax: 150, // ‰ sprint-plan perception half-width at I 0 (0 at I ≥ 1200)
  rngBlock: 32, // u32 drawn per runner before tick 0 (slots in section 17)

  // sprint plan (BRIEF §6)
  finalSprintReserveMeters: 60, // m before the line where energy should reach 0
  sprintLevelStepMms: 100, // mm/s between plan candidates (0.1 m/s)
  maxReplans: 4, // new: replans after the first plan (refund, jump exit, broken wings)

  // style controllers (new; BRIEF §5 styles made exact)
  style: {
    diveKeep: 500, // ‰ of energyMax kept by dive outside the plan
    hoverKeep: 500, // ‰ kept by hover when catching up
    glideKeep: 600, // ‰ kept by glide when chasing the lead
    groundPreShare: 600, // ‰ of energyMax ground spends evenly before the final
    packLo: 250, // ‰ position fraction, start of the middle pack
    packHi: 750, // ‰ end of the middle pack
    hoverAttackAt: 700, // ‰ of course length where hover's sprint plan starts
    styleHoldTicks: 12, // ticks a hover/glide style boost lasts at least
    // style terms (revision 2; section 9.8, ADR-0003 D44)
    diveStoopPm: 1_400, // ‰ dive thrust on descents and in the final phase
    hoverDraftPm: 1_020, // ‰ hover target speed in the middle phase while in the middle pack
    glideStartAccelPm: 1_100, // ‰ glide acceleration in the start phase
  },

  // log and guards (new)
  log: {
    denseFirstTicks: 15, // every tick in the first second
    sampleEveryTicks: 15, // one row per second otherwise
    denseLastMeters: 25, // every tick in each runner's last 25 m
  },
  dnfTicksPerMeter: 8, // DNF guard: maxTicks = 8 × L_m + 2400
  dnfTicksBase: 2_400,
  maxCourseMeters: 10_000, // validator: keeps every product below 2^53
  maxRunners: 8,
  maxEffectiveStat: 2_000, // validator bound for effective stats
} as const;

/** Rival field for season goal races (new; replaces STUB_RACE). */
export const FIELD = {
  rivalBase: 95, // per-stat mean at turn 0 (stub curve)
  rivalPerTurn: 9, // per-stat mean growth per turn
  rivalNoise: 200, // ‰ ± spread of a rival's total power
  rivalStatJitter: 100, // ‰ ± spread per stat
  rivalTurnsPerSkill: 12, // one generic active per 12 turns
  rivalMaxSkills: 3,
  rivalPwBandPm: 50, // ‰ of the player's base frame PW: |PW − pw0| × 1000 ≤ 50 × pw0 (revision 2); 2000 disables
  rivalMinPool: 1, // widen to the nearest frame if the band holds none (picks are with replacement)
  rivalWeights: {
    // ‰ of total power per stat [agility, stamina, technique, courage, intelligence]
    glide: [240, 210, 170, 180, 200],
    dive: [250, 180, 170, 220, 180],
    hover: [220, 200, 170, 170, 240],
    ground: [200, 230, 220, 190, 160],
  },
} as const;
```

## 27. Deviations / gap decisions (input of ADR-0003)

Every item carries exactly one tag, applied with these definitions (revision 3):

- **[deviation]** the item changes or reinterprets a rule the brief writes down (a formula, a
  pseudocode line, a rule text, a metric definition), even when the reinterpretation is the
  reading that the spec argues is the brief's intent; the brief section it touches is named.
- **[gap]** the brief is silent and the item fills the silence without contradicting any written
  rule.
- **[literal]** the item keeps the brief's behaviour, reachable through the named constants at
  their defaults.

The tag says why an item needs the owner's attention, not whether: gate G1 (0.2) requires
ADR-0003 accepted **whole**, gaps included (CLAUDE.md "preguntar antes de decidir"). Count:
32 deviations, 16 gaps, 1 literal.

- **D1 [deviation: BRIEF §2 rule 2, §6 "unidades internas ×1000"] Internal scales (gate G1)**
  pu = 1/225 mm, vu = 1/15 mm/s: one tick moves exactly `v`, an acceleration in mm/s² is exactly
  the per-tick change. They are mm and mm/s with the per-tick remainder kept in the same integer
  (1.1); public units unchanged at every boundary; the two-field fallback gives byte-identical
  logs. CLAUDE.md's convention line changes with it (gate G2).
- **D2 [deviation: BRIEF §2 rule 3 and §6 "Activación": `rng.next("race")` drawn per tick, per
  runner, per skill] Pre-drawn RNG block:** `n × 32` `nextU32("race")` before tick 0 (lane → slot;
  skills in id order) plus one `nextU32("quirks")` per lucky holder; consumed in the brief's
  tick → lane → id order; no draws in the loop; constant draw count; common random numbers.
- **D3 [deviation: BRIEF §6 pseudocode, boost and skill speed inside the `approach` target] Thrust
  and skill speed are instantaneous output terms** (brief text `v += k_boost·PW` over its
  pseudocode).
- **D4 [deviation: BRIEF §6 "Salto" (after `v = 0,4·v` the runner accelerates at `k_acc`); the
  start itself is a gap] Start:** `vStart` 3 m/s and a start dash of +24 m/s² up to
  0.85 × min(vBase, target) (reconstructed Umamusume); the same dash after a failed jump
  (recovery). `k_acc` stays 0.40 m/s² literally.
- **D5 [deviation: BRIEF §6 pseudocode `approach(v, target, accel)`, "acelera o frena hacia
  target"] Deceleration:** rate-limited at 3 m/s², separate from acceleration.
- **D6 [gap] hpMax** = 435 + 400 × L_km hp, course only; stamina acts once, through the drain
  divisor.
- **D7 [deviation: BRIEF §5 "hp ... se agota → velocidad cae a mínimo"] Exhaustion:** body target
  `0.85 × vBase × PWc × f_seg × (1 + pace)` (relative, no agility); thrust disabled; active skill
  speed still adds.
- **D8 [gap] f_seg details:** jump = 1.0; curve `radius` unused; coefficients explicit (the brief's,
  unchanged); `segment-factor` override = max of overrides (order-free), then multiplies; clamp
  [0.5, 1.5].
- **D9 [deviation: BRIEF §6 pseudocode `e.v = applyHeatPenalty(e, e.v)` every tick] Heat penalty on
  the moved speed**, one overheat flag per tick computed after skills; never stored, so it does not
  compound.
- **D10 [deviation: BRIEF §6 "si `heat > dissipation`"] Overheat threshold = dissipation × (1 +
  0.3·C/1200) for every rule except telemetry** (raw dissipation). Literal threshold plus the
  tolerance as a boost gate makes courage net harmful (8.2).
- **D11 [deviation: BRIEF §6-§7 Steinhaus "calor excedente drena durability ×2" has no governor and
  no floor; §5 courage "antes de cortar el boost" read as a governor] Heat governor and overheat
  licence:** non-licensed runners never boost past the threshold; Steinhaus (in the sprint plan and
  the kick) and heat-immunity holders (also in their style mode, inside their window) may, while
  their projected durability after the cooling tail stays above 25 %; the sprint plan prices heat
  at the threshold for everyone.
- **D12 [gap] Style controllers made exact** (section 9): keeps 50/50/60 %, pack band 250-750 ‰,
  hover plan at 70 % (the brief's number), ground spends 60 % of the tank evenly before the final,
  12-tick style hold. The §5 column "fase donde brilla" comes from the style terms of D44, not from
  these controllers alone (under brief constants they give identical solo times, R2).
- **D13 [deviation: BRIEF §5 glide "sufre si la alcanzan", ground "resiste daño"; §6 "Pelotón: la
  posición solo afecta a positionRange y al bono de regeneración de hover"] "Glide suffers if
  caught"** = lead drain ×0.98 (revision 2; was 0.95), a position effect, lost when caught, plus
  spending to retake the lead; **"ground resists damage"** = every durability loss ×0.5.
- **D14 [deviation: BRIEF §5 dive "gasta todo en descensos y en el sprint final"; the modes spend
  where the style text does not] Generic controller modes:** `SURPLUS` (spend what the final cannot
  absorb, heat-aware and cut at the projected exhaustion point), `REGEN` (do not waste regen),
  `PREHEAT` (heat-to-energy holders arrive at the final hot).
- **D15 [gap] Binary boost with an integer accumulator** realises the plan's sustained level and
  ground's constant level (exact duty); no throttle in the physics.
- **D16 [deviation: BRIEF §5 Intelligence "decisión de boost ... posicionamiento", §6 formulas
  (Intelligence acquires a speed effect)] Intelligence decision channels:** per-phase pace judgement
  in `[c(I) − W0, c(I) + W0]` (fixed width, centre rising with I) and plan perception ±We(I) on
  energy and hp; gates always read true values; win rate in an equal field is non-decreasing in I
  and in the style letter (S8).
- **D17 [deviation: BRIEF §6 cruise formula (a random per-phase factor is added)] Added variance
  source:** per-phase pace judgement, half-width W0 = 43 ‰ for every I, centre −21 → +22 ‰ over
  I 0 → 1200, on cruise and `vMin` (§12 dispersion is otherwise unreachable; the reconstructed
  Umamusume section speed rule: fixed width, bound rising with Wisdom). Revision 1's zero-mean
  window narrowing with I made higher I lose more races.
- **D18 [deviation: BRIEF §6 "Sprint final ... se recalcula solo si una habilidad devuelve
  energía"] Sprint plan details:** top-down levels in 0.1 m/s steps maximising net metres over a
  window ending 60 m before the line (or at the entry of a jump that contains that point: `kickAt`),
  cut at the projected exhaustion point; the window and `capFinal` count only thrust-capable
  distance and ticks (a non-ground runner's jump segments are skipped; the accumulator does not
  accrue there); heat (gate budget at the threshold) and hp priced; clean candidates first; highest
  clean level on ties; kick from `kickAt`; replans on refund (brief) and also on jump exit and broken
  wings, at most 4; hover plans at 70 %.
- **D19 [deviation: BRIEF §7 shiden "la 3.ª ráfaga consecutiva +accel 20 %"] pulse-chain-accel** =
  every chainIndex-th consecutive pulse gets thrust ×(1 + bonus) (thrust, not acceleration; every
  Nth, not only the third); "consecutive" = fired on the first legal tick after the cooldown.
- **D20 [deviation: BRIEF §6 "Salto": resolved "al entrar", "gasta liftRequired"; pseudocode
  order] Jumps:** resolved at the start of the next tick, after skills; airborne speed held at the
  jump segment's cruise, no thrust, no skill speed, no heat penalty; success spends
  `min(energy, liftRequired)`.
- **D21 [gap] "Lose k ticks" = stall:** body frozen, race clock runs, heat cools, regen accrues,
  skill timers count; no drain, no damage, no decisions; pulse cooldown frozen.
- **D22 [deviation: BRIEF §5 dive "gasta todo en descensos" and ground "evita jump" (its niche)]
  Jump reserve** (backward pass over the jumps ahead) kept by every gate; impossible jumps skipped.
  Consequence recorded: flyers never fail an affordable jump, so jump risk is not part of ground's
  obstacle niche; that niche is the landing loss and lift energy the flyers pay (D43) against the
  detour (D46).
- **D23 [deviation: BRIEF §5 durability "daño absorbible por saltos fallidos y obstáculos" (water
  damage is new) and §7 erzherzog "obstáculos cuestan tiempo, no durabilidad"] Water entry damages
  durability** (drag × 50 md); **obstacle-armor**: no water damage and no water time cost, and on a
  failed jump no damage and no crash slowdown, stall 20 + extraTicks.
- **D24 [deviation: BRIEF §6 "la probabilidad por evaluación", evaluated "en los ticks donde su
  trigger se cumple"] Skill evaluation:** one pre-drawn `u` per activation slot; fires on the first
  tick where the trigger holds and `u < p(t)`; `once: false` up to 3 activations.
- **D25 [deviation: BRIEF §7 lucky-bolt "una habilidad aleatoria gana activationBase 1,0"] Unique
  skills follow the brief formula; random-skill-guaranteed sets p = 1000** for one random active per
  race (stream `quirks`; the literal "activationBase 1.0" is a no-op for 14 of 15 actives).
- **D26 [gap] free-first-boost:** continuous frames get the first 12 boost ticks on that segment
  free; pulse frames the whole first pulse ("el primer boost" is undefined for duty-cycled boost).
- **D27 [gap] no-pulse** only affects pulse frames (fallback to continuous boost); `stutter` is
  inert on Boneyard frames (content issue).
- **D28 [gap] heat-to-energy converts all heat** (heat → 0); ratios add, capped at 1.0.
- **D29 [gap] Repairable** counts flat segments entered by crossing a boundary (the starting segment
  is not entered).
- **D30 [deviation: BRIEF §7 Altair "activación de habilidades +15 %"] Telemetry:** gate and clamp
  at raw dissipation; +15 % read as +150 ‰ **additive** on every check; PW cap in
  `resolveFrameBuild`.
- **D31 [gap] Regen** accrues on every non-boost tick (cooldown, hold, airborne, stall), ×pack
  multiplier.
- **D32 [deviation: BRIEF §6 "Pelotón: la posición solo afecta a positionRange ... y al bono de
  regeneración de hover"] Competition ranking** (ties share rank); position also feeds the style
  controllers and the glide lead drain.
- **D33 [gap] Finish time in milli-ticks; margins as positional gaps at the previous finisher's
  crossing; DNF guard 8 × L_m + 2400 ticks.**
- **D34 [gap] RaceLog extensions:** geometry, entries with compiled traits, derived table, ledger,
  events beyond the brief's six (boostMode, sprintPlan, skillMiss, heatToEnergy, freeBoost, detour,
  waterHit, repair, hpEmpty, durabilityBroken, landing, dnf), a `drafting` frame flag, race-wide
  sampling with a per-row boost count, `detail: "results"` (CLAUDE.md: "si falta un dato en el
  log, se amplía el log").
- **D35 [deviation: BRIEF §5 durability "el resto de la carrera" (persistence across races is
  new)] Durability persists** between season races through `frameDurability`.
- **D36 [gap] skillSlots** has no race meaning; proposed season change: learn cap
  `maxLearnedSkills + skillSlots` (≤ 8), a season decision the owner accepts or rejects with the ADR.
- **D37 [deviation: BRIEF §7 kite and mule "2 peculiaridades sorteadas" (rival Boneyard frames run
  with empty slots); the generator itself is a gap] Field generator:** class-matched frames by a
  relative band on the player's base frame PW (±5 %, at least 1 frame, picks with replacement;
  revision 1: ±0.15 absolute, at least 3), per-style stat weights on the stub's power curve,
  floor(turn/12) generic actives (≤ 3), **no parts and no quirks** (revision 3: two rolled quirks
  let `loose-rivets` pull a 0.8 PW rival into Caracara's 0.7 field in 72 % of races, 21.1), own Rng
  `${raceSeed}/field`; race seed `${seed}/race/${turn}`; D12 reports S7 (grade ≥ B per Falconess)
  with the goal pass-rate table per Falconess and goal turn as a diagnostic.
- **D38 [literal] Knobs at brief-neutral defaults:** `pwCruiseWeight`, `pwBoostWeight`,
  `stylePace`, `coolDissWeight`/`dissRef`, `biomeCool`, `kWater`, `kWind`; changing any is a balance
  change with a batch report and an ADR line.
- **D39 [gap] Effective stats are validated ≤ 2000, not clamped at 1200** (only the curves term and
  the Intelligence windows use `min(x, 1200)`); course length ≤ 10 km in the race validator.
- **D40 [deviation: BRIEF §12 metric definitions] Batch metric definitions:** style metric on
  neutral fixture frames (S1, `rule: "none"`) with real frames as diagnostics; paired ablations with
  draws aligned (S4 with the `disabled` switch, D49; S5 on the equal neutral field with one carrier,
  revision 3, instead of the mixed S2 field); paired 1v1 signature runs with a quirk-free generic,
  the build of D47 and a 95 % interval; an equal-PW variant of S2; the S8 Intelligence gate; a
  course both home and weak is neutral; no runner carries quirks unless the scenario says so.
  **Metric 2 counting (revision 4, 25.2):** the S2 field is five designated entries (one per
  manufacturer, a frame drawn uniformly from its non-signature frames; signatures never enter)
  plus three non-attributed `none` fixtures (hover, stats 600). A manufacturer's win rate is its
  designated entry's wins / races (a dead heat for first splits the win), so the fair share is
  12.5 % for every manufacturer, and the verdict is per (manufacturer, course) home or weak cell.
  Revision 3's "one per manufacturer + 3 random" gave a manufacturer 1-3 entries: entry count
  alone made 12.5-37.5 % (≈ 20 % on average), which failed "weak ≤ 15 %" with no rule effect.
  Metric 7 is measured literally (share of seasons with `gradeFor ≥ B`, revision 3; revision 2's
  "all four goals passed" was necessary, not sufficient).
- **D41 [deviation: BRIEF §12 "más agility nunca da peor tiempo en flat"] Monotonicity properties**
  in three tiers (strict without boost; one tick without exhaustion, one burst for pulse frames;
  0.5 % with exhaustion).
- **D42 [gap] `RaceRule = ManufacturerRule | "none"`** (new schema type in `race.ts`, 3.4):
  `RaceEntry.rule` uses it; `Manufacturer.rule` is unchanged; `"none"` is produced only by
  `neutralFixtureEntry` (S1, S4, S5, S8, sanity anchors, tests) and appears in those logs as
  `rule: "none"`.
- **D43 [deviation: BRIEF §6 "Salto": a successful jump "cruza en length / v_cruise ticks" and is
  resolved; the landing loss is new; BRIEF §5 technique "eficiencia en obstáculos" is the motive]
  Landing loss:** an airborne runner leaving a jump keeps `landPm = 800 + 120·min(T, 1200)/1200` ‰
  of its speed (T 600: 86 %), then re-accelerates; event `landing`. A crashed runner does not land.
- **D44 [deviation: BRIEF §5 describes behaviours; §6 "Pelotón ... solo"] Style terms (the phase
  column needs a mechanism under brief constants):** dive stoop (thrust ×1.4 on descents and in the
  final), hover slipstream (target ×1.02 in the middle phase while in the middle pack: a position
  effect beyond §6 "Pelotón"), glide launch (acceleration ×1.1 in the start phase), ground's
  obstacle route (D43, D46). `stylePace` stays neutral.
- **D45 [deviation: BRIEF §7 "implementada como `ManufacturerRule` ..., no como bonificación
  numérica", and the five rule texts] Rule terms (numeric, revision 4 wording):** each rule gains
  one numeric term, compiled with its `RuleSpec` (13.1).
  - **The terms and their stat equivalents** (600 stats, PW 1.0):
    - Steinhaus: cooling ×0.5 in the desert (×1.25 in tundra and mountain). No stat equivalent;
      at the cap the governed duty falls from 1/3 to 1/5.
    - Kōryū: burst thrust by segment type and biome (desert ×1.15, descent ×1.2, water ×0.6).
      Thrust of +0.15 PW in the desert, cruise unchanged.
    - Lumière: landing loss ×2. ≈ +40 m per landing, beyond the whole technique range.
    - Altair: drain ×0.9 and acceleration ×0.85 on every segment of every course, ≈ +178 St and
      −180 T.
    - Boneyard: landing loss and detour extra ×0.5, ≈ T 1300 on landings and −9 m of detour on the
      ridge; curve penalty ×1.5, the penalty of A 300 on curves.
  - **The deviation:** these are numeric bonuses and penalties, which BRIEF §7 excludes. Only
    Steinhaus's and Kōryū's terms act inside their rule's mechanism (heat, pulses). Lumière's
    term acts on landings, not regen, and Boneyard's on landings, detours and curves, not repair.
    Telemetry's term is global, with no segment or biome key and no link to its mechanism (heat
    gate, activation, PW cap): it is a flat stat swap, and its cells come from course length.
  - **Reason:** without these terms no home or weak cell can come from a rule. At equal PW
    revision 1 inverted the cells, and under brief constants regen, telemetry and repairable have
    no terrain key and (repair, the heat gate) almost no time value.
  - **Owner's alternatives:** (a) re-key telemetry's term to its own mechanism or to a segment or
    length property, and re-measure the S2 equal-PW table (D14 step 4); (b) reject numeric terms
    altogether, which keeps BRIEF §7 literal but leaves metric 2 with no rule-made cells in v1, so
    an ADR moves metric 2 or the cells come from frame content.
- **D46 [deviation: BRIEF §6 "ruta 1,25 × length"] `groundDetourMult` 1.10:** with 1.25 ground
  wins 6 % of the ridge even with D43; with 1.10 it wins 38 % and S1 lands inside 15-35 %.
- **D47 [deviation: BRIEF §12 metric 3 and §9 invariant 2 (part of D40)] S3 build, cells and
  home biome (revision 4):**
  - **Build:** both sides are the same Falconess, built by `freezeEntry` with base stats 600 on all
    five, mood 0, her real biome and style aptitude maps, and her unique skill as the only active
    (no generic actives); no parts. The generic carries no quirks.
  - **Verdict:** one verdict per (pair, course) cell, 9 cells, no pooling.
  - **Home biome:** "bioma casa" reads as desert for all three pairs in v1, because no urban or
    mountain course exists. Peregrina: desert A, Kōryū home. Cernícala: urban A, Altair home
    urban. Caracara: mountain A; Boneyard's home is obstacle courses. Their gate moves to the
    home-biome cells, with an ADR line, once such a course exists.
  - **Intervals:** S3 and S8 are judged with a 95 % interval; S3 doubles its samples while
    inconclusive (`full` profile).
- **D48 [deviation: BRIEF §12 "10.000 carreras en menos de 60 s" and "una métrica fuera de rango
  bloquea el merge"] Batch profiles and verdicts (revision 3, 25.2.1):** the `pr` profile is the
  brief's batch (10 000 races in < 60 s, every PR touching `sim` or `content`) with a fixed run
  budget per scenario that adds up to `--runs`; the `full` profile (nightly on `main` and on
  demand, < 20 min) runs S3, S5 and S8 at full sample size; a metric fails only when its 95 %
  interval lies outside the target, an inconclusive metric does not block the PR and is decided by
  the next `full` run, and a `full` fail blocks every later `sim`/`content` PR until fixed or moved
  by ADR.
- **D49 [gap] Ablation support (revision 3, 3.2, 3.4):** `RaceSkill.disabled` (a new field of a new
  schema: `p = 0` before every bonus and lucky override, slot and lucky index kept; never true in
  season logs or goldens), `freezeSkill` exported, `neutralFixtureEntry` with `skills` and `build`,
  `fixtureBuild` (parts and quirks on the neutral frame through `resolveFrameBuild`'s arithmetic)
  and `disableSkill`; batch and tests only.

## 28. Resolution index (judge disagreements and other conflicts)

| Item | Judge 1 (base det-perf) | Judge 2 (base fidelity) | Decision and reason |
| --- | --- | --- | --- |
| Units | pu/vu | posT 1/15 mm, mm/s | **pu/vu**: needed for literal mm/s² acceleration to be exact |
| k_acc | 0.4 m/s² literal + start dash + recovery dash | 400 mm/s per tick (6 m/s²) | **Literal + dashes.** Judge 2's objection (a crash costs ~35 s) is fixed by the recovery dash (measured 3.35 s); a per-tick reading changes the unit of a brief constant ×15, makes terrain transitions instantaneous, technique nearly irrelevant after the launch and accel skills out of band (clean-start 17-23 m) |
| Deceleration | 3 m/s² | same step as accel | **3 m/s²** (follows from the literal accel; water must slow a runner) |
| Overheat threshold | D, tolerance as boost gate | D × tolerance for everyone (not telemetry) | **Judge 2.** Judge 1's version keeps the self-harm judge 2 measured (−1.44 m/s-ticks per heat unit); det-perf's "(c + B)·0.92 > c" ignored the penalised cooling ticks |
| Steinhaus control | same gates as everyone | governor skipped above a floor (50 % early, 25 % final) | **Judge 2, corrected twice:** (1) judge 2's floor test ignores the cooling tail (each boost tick past the cap adds 2 more overheated ticks at −2), which breaks the frame; the licence projects the tail; (2) measured: a licence in the plan and in style modes burned 104 of 140 durability per race for zero time gain (energy, not heat, binds at brief constants), so it is limited to `PLAN`/`KICK` as a runtime fallback, one floor of 25 % |
| Boost realisation | accumulator (binary) | throttle θ for continuous, accumulator for pulses | **Accumulator**: one mechanism for both rules, the brief's binary `boostOn`, exact integer duty without per-tick rounding drift; judge 2's anti-flicker goal kept via the 12-tick style hold |
| Exhaustion thrust | allowed | disabled | **Disabled** ("velocidad cae a mínimo"); it also makes judge 1's own plan rule consistent (it cuts the window at projected exhaustion "because late energy is worth less", which is only true if thrust stops) |
| vMin pace | with pace | without | **With pace** (keeps hp-bound builds' dispersion, judge 1 measured) |
| Pace window | 60 → 25 | 50 → 20 | **60 → 25** (measured on the chosen physics) |
| Plan perception | energy | energy and hp | **Both** (no conflict with gates; gives Intelligence more meaning) |
| Glide lead drain | 900 | 950 | **950** (900 lets a lone glide skip canyon exhaustion, ≈ 1.3-2.6 s); revision 2 moves it to **980** once glide's launch term exists (28.1) |
| hpMax | 435 + 400/km | 400 + 420/km | **435 + 400/km** (calibrated on the chosen start physics: 2 % left on the ridge) |
| Stall | body frozen, clock runs, cools, regen, timers | the runner's whole tick skipped | **Judge 1** (winner); wings cool while stalled; both freeze the body |
| obstacle-armor on a failed jump | no damage, crash ×0.4 kept, stall +extra | no damage, no crash, stall +extra | **Judge 2**: the schema says "cost ticks instead of durability"; keeping the crash adds a second time cost (≈ 1.4 s) and makes the SSR passive a net loss, the same defect judge 1 flagged on water |
| Repairable segment 0 | excluded | included | **Excluded** (two of three designs; "entering" needs a crossing; no tick-0 event) |
| pulse-chain-accel | chain ≥ N | every Nth | **Every Nth**: closest to "la 3.ª ráfaga consecutiva" while repeating in long chains, and it keeps the generic third-pulse from out-valuing the signature talon-lock (balance measured ratio 1.80 with ≥ N) |
| Ground pre-final share | 400 | 600 | **600**: closer to "constante" (an even line from the gun spends ≈ 2/3 before the final) |
| Style hold | none | 12 ticks | **Adopted** (legibility; no conflict) |
| Regen-overflow mode | absent | adopted | **Adopted** (a full Lumière tank must not waste regen; risk R9 records the strength) |
| Neutral knobs (cooling ∝ dissipation, biome cooling, kWater, kWind) | D14 candidates | knobs at neutral defaults | **Knobs at neutral defaults** (no behaviour change; the balance pass needs no code change) |
| Traits location | FrozenModifier in entry, traits at prep | traits in entry | **Traits in entry** (integers only in the log, no parallel decimal union; sources named by passive/parts/quirks) |
| Race seed | `${seed}/race/${turn}` | `${perInputSeed}/race` | **Per turn**: same field and draws for every policy on a turn (common random numbers), UI rebuild from (seed, turn) |
| DNF guard | 8·L + 2400 | L × 15 / 2 m/s | **8·L + 2400** (winner; both unreachable with valid content) |
| Field pool widening | 3 nearest | band += 150 until ≥ 2 | **3 nearest** (winner; one deterministic rule) |
| free-first-boost on continuous frames | first run, ≤ 12 ticks | ≤ 12 boost ticks or run end | **First 12 boost ticks on that segment** (with duty-cycled binary boost a "run" can be one tick long; both judges' intent of "one pulse worth" kept) |
| skillSlots | no race meaning | season learn cap + slots | **Both**: no race meaning; season cap proposed in the ADR |
| Raw RNG block in the log | logged | not logged | **Not logged** (compact log; `derived` carries pace, planErr and every `u`; the seed reproduces the block) |
| Accumulator cap (found by the spec prototype) | `min(unit, acc + level)` | same (pulses) | **`min(unit + level, acc + level)`**: the cap at `unit` drops the overflow and realises duty 1/k instead of the planned level (planned 0.43, realised 1/3, 11 energy stranded on the canyon) |
| `capFinal` and exhaustion (spec prototype) | heat-aware, whole window | heat-aware, whole window | **Window cut at the projected cruise exhaustion**: an hp-tight Kōryū reached the canyon final with a full tank and wasted 86 energy (thrust is off at hp 0) |
| Pulse plan gain (spec prototype) | rational `s × Ep × Bon / eTB` | quantised by the accumulator | **Whole pulses**: the rational gain selected a level that fires zero pulses on a short hp-limited window |

### 28.1 Critic round (revision 2)

Eleven findings; every one was accepted. Where the fix differs from the critic's proposal, the
reason is in the last column. Measurements: spec prototype with the revision-2 rules (25.4).

| # | Finding | Fix | Where | Note |
| --- | --- | --- | --- | --- |
| 1 | pu/vu contradict BRIEF §2 rule 2, CLAUDE.md and formulas.md; ADR-0003 only "propuesto"; protected files needed | Gate before D8 (owner accepts ADR-0003, CLAUDE.md line, lead lands `RACE`/`FIELD` and types); D1 explained as mm/mm/s with the per-tick remainder, with a byte-identical two-field fallback; formulas.md header fixed | 0.2, 1.1, 26, D1; ADR-0003 status and D1; formulas.md | CLAUDE.md and `rulesets/` are outside this document's reach: the exact replacement text is in G2, the block in 26 |
| 2, 5 | The "neutral rule" of S1 and the anchors is not expressible: `RaceEntry.rule` is the `ManufacturerRule` enum | `RaceRule = ManufacturerRule \| "none"` in `race.ts`; `Record<RaceRule, RuleSpec>` with a no-op `none`; `neutralFixtureEntry` with fixed values, no `freezeEntry`, no content; logged as `rule: "none"` | 3.4, 1.4, 13, 20.2, 23, 25.2, D42 | option (b) of finding 2 in the schema form of finding 5; the enum member is recorded in ADR-0003 D42 |
| 3 | Plan, `capFinal`, `finTicks` and KICK count jump ticks where a flyer cannot thrust; terminal jump strands the kick | Thrust coordinates (`thrustDist`, `thrustTicks`, `mapBack`), `capFinal` over thrust-capable ticks, `kickAt`, no accumulator accrual on jump-blocked ticks; unit fixtures | 3.3, 9.3, 9.4, 9.5, 11.3, 11.4, 24.1 | the spurt skips the jump instead of ending at its entry: same energy, no lost post-jump distance |
| 4, 10 | Metric 3 is out of band by the spec's own tables; S3 generic's quirks undefined | R14 with measured ratios per pair and course, cause, ordered D14 content tickets; S3 generic has no quirks; 95 % interval | 25.1, 25.2, 25.3, R14, D47 | the engine cannot fix it (ratios stay out of band under the energy game); content does |
| 6 | Ground has no advantage on its own terrain; the jump reserve removed the flyers' risk | Landing loss scaled by technique for flyers (D43); `groundDetourMult` 1.10 (D46); ADR line that jump risk is not ground's niche (D22) | 3.3, 14.2, 14.4, 14.5, 26 | chose the landing cost over letting dive strand itself: a strand would come from a perception error, which reintroduces the "hidden jump lottery" the judges rejected; ground now wins the ridge (38 %) |
| 7 | Dive, hover and glide identical at v1; no phase mechanism | One term per style (stoop, slipstream, launch, obstacle route); S1 phase-split rows | 5, 9.8, 25.4, D44 | `stylePace` stays neutral, as the critic preferred; the slipstream needs ADR-0003 D44 (position effect) |
| 8 | No rule term keyed to terrain; home/weak cells inverted at equal PW | One terrain term per `RuleSpec`; equal-PW, same-style S2 table | 13.1, 25.2, 25.4, R15, D45 | at v1 the pulse and Steinhaus terms are below 0.2 % (energy-bound, R2); the D14 order puts the energy game before PW compression so the cells exist when PW stops deciding |
| 9 | Intelligence lowers win rate; style letter inverted | Fixed half-width W0, centre rising with I; S8 gate | 10, 17.3, 25.1, 25.2, 26, D16, D17 | the plan-perception error stays zero-mean: every error costs time, so it cannot invert the ranking |
| 11 | Absolute ±150 ‰ band is not class-matched at low PW | Relative ±5 % band on the frame's base PW, minimum pool 1; par pass-rate table; D12 acceptance table | 21.1, 26, D37, R1, R16 | base PW instead of the built PW, so a part never pulls a faster class into the field |

### 28.2 Second critic round (revision 3)

Eight findings; every one was accepted (findings 5 and 8 are the same defect and share one fix).
Where the fix differs from the critic's proposal, the reason is in the last column. No physics rule
and no constant changed; the new measurement (rival quirks) used the revision-2 prototype.

| # | Finding | Fix | Where | Note |
| --- | --- | --- | --- | --- |
| 1 | Pulse plan quantities defined three ways: 12's Plan row, the 9.5 comment and the 24.1 test used `Bon = Bp`, `unit = Bp × 12` (no desert factor, no stoop) against 3.3 and 11.3; a failing-test-first implementer would pin the wrong level | 12's Plan row, the 9.5 comment and the 24.1 row now state the 3.3 definition; pinned desert values shiden `sMax` 39 122 vu (2.61 m/s) and hayate 23 952 vu (1.60 m/s), which match 25.4 | 3.3, 9.5, 12, 24.1 | as proposed |
| 2 | S3 (≥ 72 000 races) and S8 (90 000) cannot fit the brief's 10 000 races in < 60 s; S4 and S5 had no sample size; no split of `--runs` | Two profiles: `pr` (the brief's batch, per-scenario budget summing to `--runs`, ≈ 5-11 s at the SoA target) and `full` (nightly, < 20 min, full sample sizes); verdict pass / fail / inconclusive on the 95 % interval; explicit counts for every scenario; S6 reuses the S1 races | 22, 24.4, 25.2, 25.2.1, D48 | both of the critic's options combined: the PR job keeps every metric at a smaller size, the nightly decides what the PR cannot; the verdict rule reads "fuera de rango" statistically, so it is a deviation (D48) |
| 3 | S4 not buildable: fixtures had no skills, no exported skill freezer, no way to force `p = 0` (bonuses, Altair and the lucky pick override `activationBase = 0`), removing a skill shifts later `u` slots | `RaceSkill.disabled` (p = 0 before every override, slot and lucky index kept), exported `freezeSkill`, `neutralFixtureEntry` with `skills` and `build`, `fixtureBuild`, `disableSkill`; P6b alignment property; S4 defined exactly (every runner carries the skill, off run disables it on all) | 3.2, 3.4, 15.2, 16, 17.1, 23, 24.1, 24.2, 25.2, D49 | a flag on the frozen skill rather than `SimulateOptions.disabledSkills`: options must never change a result (P7), and the flag is visible in the logged entry |
| 4 | Metric 7 gated as "all four goals passed in ≥ 60 %", which is necessary but not sufficient for grade ≥ B (`seasonScore ≥ 2900` and no failure) | Gate D12/S7 on the share of seasons with `gradeFor ≥ B` ≥ 60 % per Falconess; goal table, grade distribution and score split as diagnostics; grade thresholds and score weights listed as metric-7 knobs | 21.1, 25.1, 25.2, 25.3, R16, D37, D40 | the per-goal 80 % rule became a flagged diagnostic: it is not a brief metric and the critic's finding 7 showed it can be out of reach for reasons outside the player's control |
| 5, 8 | G1 allowed partial acceptance of "D1 and every item marked deviation", but only D1, D44, D45, D46 were tagged; many untagged items change brief rules | Every item tagged [deviation] / [gap] / [literal] with the brief section it touches (32 / 16 / 1), in section 27 and in the ADR; G1 requires the whole ADR, no accepted subset | 0.2, 27, ADR-0003 | both of the critic's options: the tags make review possible, the whole-ADR gate makes it mechanical. Beyond the critic's lists, D4 (recovery dash), D5 (deceleration vs `approach`), D11 (governor), D14 (modes vs dive's text), D22 (reserve vs "gasta todo en descensos"), D37 (rivals without quirks), D40, D47 and D48 are also deviations |
| 6 | Metric 5 unreachable with the planned knobs: 3 points = 0.16-0.19 % of time; the stabilizer is 2.26 % on the sprint (3.96 % on Boneyard), a +0.1 turbine 2.5 % even at weight 250, batteries worsen after `kE` 250; S5 diluted by the mixed field | R18 with the per-part table and the tolerance; content tickets (stabilizer ≈ 0.97, turbines ≈ +0.01-0.02 PW or a part-PW weight, batteries ≈ +5 after step 2) or an ADR that moves metric 5; S5 on the equal neutral field with paired seeds and one carrier, re-run after step 2; R1 points to R18 | 25.1, 25.2, 25.3, R1, R18 | the critic's stabilizer scale "≈ 0.93-0.95" was re-measured on the same sprint replica: 0.93 → 0.37 %, 0.95 → 0.25 %, 0.97 → 0.14 %, so the ticket says ≈ 0.97 |
| 7 | Kite/mule rivals rolled two random quirks; `loose-rivets` (+0.1 PW) breaks the base-PW band: 72 % of Caracara fields hold one; T46/T36 lost regardless of training | Rivals carry no quirks (and no parts), like S2 and S3; S2 and S5 state the same policy; `generateField` draws nothing from `quirks`; measured: with rolled quirks Caracara's par T36 / T46 fall from 53 / 6 % to 24 / 4 % (18 / 2 % with a loose-rivets rival) | 21.1, 24.1, 25.2, R16, D37 | the par table of 21.1 was already measured without rival quirks, so it stands; the deviation from "2 peculiaridades sorteadas" for rival frames is tagged in D37, and a near time-neutral quirk subset is left as the owner's alternative |

### 28.3 Third critic round (revision 4)

Three findings; all were accepted. No physics rule and no constant changed. The S3 table (R14)
was re-measured with the revision-2 prototype at the exact build that 25.2 now defines.

| # | Finding | Fix | Where | Note |
| --- | --- | --- | --- | --- |
| 1 | Metric 2 had no counting rule: with "one random non-signature frame of each manufacturer + 3 random" a manufacturer held 1-3 entries, so total wins measured entry count (12.5-37.5 %, mean ≈ 20 %), failing "weak ≤ 15 %" with no rule effect | S2 = five designated entries (one per manufacturer, random non-signature frame; signatures never enter) + three non-attributed `none` fixtures; win rate = designated entry's wins / races, dead heats split; fair share 12.5 %; verdict per (manufacturer, course) home or weak cell; the equal-PW variant uses the same field and counting | 25.1, 25.2, D40; formulas.md; ADR-0003 D40 | the critic's option 1. Option 2 (per-entry rate) was rejected: same-manufacturer entries take wins from each other and the field composition would change per seed. The equal-PW table of 25.4 was already measured on this field shape (five rules + three `none`), so it stands. The weak ceiling sits 2.5 points above the fair share: it stops a weak manufacturer from beating its fair share and does not demand less (stated in 25.2) |
| 2 | S3 build undefined (stats, letters, actives); R14 (d) "real actives" vs 25.4 "no actives"; verdict per cell or pooled unstated; "bioma casa" silently read as desert | S3 build: `freezeEntry` with base stats 600, her real aptitude maps, her unique skill as the only active, no parts, generic without quirks; verdict per (pair, course) cell; "bioma casa" = desert for all three in v1, with the reason, in D47; R14 table re-measured at that build; R14 (c) and (d) rewritten to match | 25.2, 25.4, R14, D47; formulas.md; ADR-0003 D47 | unique only rather than a generic list: it is the one active every season starts with. The critic's "two pairs depend almost entirely on activation passives" overstates the effect. Cernícala's pair is decided by still-air's regen, and mid-activation is inert in S3: wind-hover cannot fire in a two-runner race, and Altair's +150 saturates p at I 630. Talon-lock's activation clause acts only through stoop-strike on the ridge. Re-measured, the defined build moves no cell by more than 0.01 in ratio (peregrina 1.35 / 0.99 / 1.03 against 1.35 / 1.00 / 1.02) |
| 3 | D45 never named BRIEF §7 "no como bonificación numérica"; the ADR claimed the terms act "dentro de su propio mecanismo", and 13.1 claimed each is keyed to a segment type or biome; false for telemetry (global, ≈ +178 St / −180 T), Lumière (landing) and Boneyard (landing, detour, curves) | D45 (spec and ADR) is tagged with the §7 principle it overrides and gives the reason; 13.1 says which terms act inside their rule's mechanism (Steinhaus, Kōryū) and which act outside (Lumière, Boneyard, telemetry, the last one global), with a stat-equivalent column; the false claims are removed from 13, 13.1, formulas.md and the ADR | 13, 13.1, 25.1, 26 (comment), D45; formulas.md; ADR-0003 D45 | the terms are kept: re-keying telemetry needs a new design and a new S2 equal-PW measurement. That is offered to the owner as alternative (a) of D45, with (b) "no numeric terms, move metric 2" |

### 28.4 Implementation review errata (text only)

Measured statements that the implementation review found wrong while the engine and the spec
prototype agree. No rule and no constant changed; each number is pinned by a test.

| Where | Was | Now | Pinned by |
| --- | --- | --- | --- |
| 1.5 | speeds ≤ 1.5e6 vu; drain, finish and margin rows at that bound | speeds ≤ 2e6 vu (v1 maximum 1 949 680 vu); the three rows at 2e6; every product still > 100× under 2^53 | `physics.test.ts` (helpers at the maxima, exact BigInt floors) |
| 8.4, 24.1, 25.4 (Heat) | continuous boost from cold reaches 69 000 mh after 35 ticks | 34 boosts to 68 000; the 9.3 gate refuses the 35th; 69 000 first at tick 36; then duty 1/3 | `controller.test.ts` (governor loop) |
| 5.2, 25.4 (Launch) | PW 1.4 reaches cruise in 27.7 s (707 m) | 27.7 s (695 m), thrust-free like the other launch distances (707 m included early SURPLUS boost and depends on the course length) | `anchors.test.ts` |

## 29. Risks carried into implementation

- **R1 PW tiers (highest).** With literal PW a PW 1.4 frame is ≈ 22-26 % faster than PW 1.0 and
  ≈ 1.7-1.8× faster than PW 0.7 (sanity table: shiden 42.7 s vs neutral hover 54.5 s vs mule 77.7 s on the
  sprint; the long literal-accel ramp of high-PW frames and their earlier exhaustion compress the gap
  a little); it wins mixed fields outright. Goal fields are class-matched by a **relative** band
  (21.1, revision 2): revision 1's absolute ±150 ‰ band gave Caracara nimbus rivals (19-24 % faster)
  and Cernícala PW 1.0 rivals (≈ 13 %), which no stat lead closes; "class-matched fields keep the
  season playable" now holds only for PW class, and the D12 pass-rate table (21.1) is the evidence
  required for the rest. Metrics 2 and 3 need `pwCruiseWeight`/`pwBoostWeight` and/or a frame
  re-budget in the D14 pass (ADR), after the rule terms (R15). Metric 5 is not reachable through
  these knobs at all (turbines, and also the stabilizer and the batteries): R18.
- **R2 Linear energy economy.** Every energy unit buys the same metres whenever spent (≈ 0.2 m at
  PW 1.0; a 100 tank ≈ 20 m ≈ one sigma of the dispersion target), so plan candidates tie (resolved
  by the tie rule) and timing alone gives no style identity: the style terms of 9.8 (stoop on
  dive's spending, slipstream, launch, landing vs detour) supply it at v1, and terms that act
  through thrust or heat (stoop, pulse air, Steinhaus cooling) stay small until `kE` drops (25.3
  step 2). `kE` is the lever.
- **R3 Courage is a weak stat** under brief coefficients (mostly through `heatCap` and final
  fatigue). Intelligence is no longer one (revision 2): the pace centre makes +100 I worth ≈ 7 m on
  2000 m plus 0.2-0.9 m through skills, and S8 keeps it monotone. Knobs:
  `heatToleranceCourage`, `fatigueCourage`, `paceCentreSpan`, activation constants; report "metres per
  +100 stat" in `out/balance.json`.
- **R4 Content out of band or inert:** iron-wings, gravity-friend, stutter, erzherzog's armor on
  jumps, lead-guard for runners that never lead, clean-start (≈ 5-6 m, near the cap).
- **R5 Canyon exhaustion:** a 600-balanced runner empties hp at ≈ 2.8 km; PW ≥ 1.2 frames empty on
  the ridge (1.6-1.75 km) and the canyon (2.2-2.4 km); mid-season canyon goals are stamina races.
  Knobs `hpBase`/`hpPerKm`.
- **R5b Style metric** (S1, measured, revision 2): desert means 25.6 / 26.3 / 26.2 / 22.0 % (dive /
  hover / glide / ground), all inside 15-35 %; per course ground is 11 % on the sprint and 16 % on
  the canyon (no obstacles there) and 38 % on the ridge, dive 35 % on the sprint. The gate is the
  per-biome mean; if a later biome has no jump course, ground needs a non-obstacle term (knob
  `groundPreShare`, or `stylePace` as the last resort, ADR). Revision 1 measured ground 13.2 % (1 %
  on the ridge) and glide 41 % on the canyon.
- **R6 Dispersion of hp-tight builds** (PW 1.4 on the sprint ≈ 0.61 %, below the 0.8 % floor):
  raise `paceHalfWidth` if the batch reference build is hp-tight.
- **R7 Preheat synergy:** Horizon's preheat plus 50 % conversion makes ≈ 40 boost ticks nearly free
  (≈ 8 m); watch generic vs signature (still-air 25 % is Cernícala's).
- **R8 Durability persistence** changes the season (worn frames, broken starts); the reference
  policy must repair; reverting it is one line in `goals.ts`. Steinhaus licence wear is small by
  construction (0-7 overheated ticks per race in the prototype).
- **R9 Lumière strength:** `REGEN` mode turns 0.5 energy/tick into usable boost (≈ +1 m/s average
  while the tank is full); regen sustains exactly the heat-neutral duty 1/3 for the whole race
  (critic estimate: 59-97 m of thrust against ≈ 27 m for a Kōryū tank). Measured at equal PW (25.4): Lumière wins
  82 % of the sprint field and 48 % of the canyon field; its landing term (13.1) makes the ridge its
  weak course (2 %). Real frames: etoile is still faster than shiden on the sprint and the canyon
  (41.66 / 106.93 s against 42.73 / 108.72 s) and now slower on the ridge (71.33 s against
  71.11 s; revision 1: etoile was the fastest frame there), so Peregrina's goal pool is harder than
  par (21.1). `regenPerTick` 500 → 60-100 is D14 step 3 (balance: 60).
- **R10 Field-dependent decisions** (glide, hover, pack regen) make "same build" dispersion depend on
  the field; S6 fixes the field and says so.
- **R11 Technique on the launch and the landing:** the post-dash ramp (≈ 15 s at T 600, ≈ 28 s for
  PW 1.4) makes technique worth ≈ 5 m per +100 on the start alone, more with terrain transitions
  (water exit, curves, landings: −17 % of speed at T 300, −14 % at T 600, −8 % at T 1200). Knobs
  `kAcc`, `dashUntilPm`, `kStartDash`, `landBasePm`, `landTechPm`.
- **R12 The ×0.92 penalty is mostly dormant:** governors keep non-licensed runners under the
  threshold; overheat spans are a Steinhaus signature and a hot-head accident. If the batch wants
  overheat as a common mistake, a bounded perception error on the heat gate is the knob (ADR).
- **R13 Planner is a heuristic:** mean cruise over the window, cooldown modifiers, pack regen, the
  per-segment pulse air factor and the cooling on jump ticks ignored, a single exhaustion
  projection. Deterministic and exact, not optimal; judge 1 measured realised times within ≈ 0.2 %
  of the best fixed level found by brute force.
- **R14 Signature metric (BRIEF §7 and §9 invariant 2, §12 metric 3) is out of band at v1, by
  measurement.** The 0.85-0.90 band means the signature wins 52.6-54.1 % of 1v1 races, i.e. it is
  ≈ 0.11-0.18 % faster than its generic. S3 at v1 constants, with exactly the build of 25.2
  (revision 4: base stats 600 with her aptitude letters, so A 630 / 600 / 600 and I 630; her unique
  skill as the only active; generic without quirks; 2000 seeds × 2 lane orders; 95 % interval
  ±1.5 points of share; one verdict per cell):

  | Pair (signature vs generic) | Sprint | Ridge | Canyon | Cause |
  | --- | --- | --- | --- | --- |
  | peregrina (talon-lock) vs shiden (third-pulse) | ratio 1.35 (gap −0.17 %) | 0.99 (+0.01 %) | 1.03 (−0.02 %) | talon-lock's clauses do almost nothing. Its descent cooldown never binds: energy, not cadence, limits a 100-tank pulse frame at `kE` 1000. Its final activation bonus acts only through stoop-strike, and only on the ridge (fires in 96 % of races against 86 %, ≈ 0.45 m). Third-pulse's chained +20 % pays on the sprint, where `SURPLUS` fires three consecutive pulses |
  | cernícala (still-air) vs nimbus (mid-activation) | 0.14 (+2.38 %) | 0.14 (+2.46 %) | 0.14 (+2.62 %) | still-air's 0.25 regen per tick is ≈ 150 energy per race on a non-Lumière frame. Mid-activation is inert in S3: wind-hover cannot fire in a two-runner race, and Altair's +150 already puts a base-1.0 skill at p 1000 at I 630 |
  | caracara (scrap-armor) vs mule (no quirks) | 1.00 (+0.02 %) | 1.00 (+0.02 %) | 0.22 (+2.11 %) | obstacle-armor does nothing on a ground frame that never jumps; the water override is worth ≈ 2 % on the canyon; scavenger-stride fires on the ridge for both sides alike |

  Revision 3's table (all five stats 600 with no letters, no actives) differed by at most 0.01 in
  ratio (peregrina ridge 1.00, canyon 1.02): the activation clauses are worth almost nothing with
  this build, so the gate does not hinge on them. At the D14 energy-game hypothesis (`kE` 250,
  `regenPerTick` 60) the ratios are 1.49 / 1.16 / 1.17, 0.78 / 0.29 / 0.25 and 1.00 / 1.00 / 0.23
  (revision 3's build: 1.46 / 1.17 / 1.19, 0.78 / 0.29 / 0.26, 1.00 / 1.00 / 0.23). The engine terms
  do not fix this metric; content does. Ordered D14 work (after steps 2-3 of 25.3, because
  still-air's value scales with `kE`):
  (a) content ticket **still-air**: regen 0.25 → about 0.03 (or drop the clause and keep
  heat-to-energy 0.25), target gap +0.11-0.18 % on every course; (b) content ticket
  **scrap-armor**: replace the water override (≈ 2 %) by a small water multiply and add a clause
  that acts on a ground frame on every course (for example `segment-factor` multiply on `jump`,
  which only the ground detour runs at cruise, or a `free-first-boost` on `flat`); (c) content
  ticket **talon-lock**: a clause that pays on courses without descents (for example a
  `pulse-cooldown` on `flat`) so it outweighs third-pulse. An activation clause cannot fix the
  sprint and canyon cells: S3's only active, stoop-strike, cannot trigger there. (d) S3 with the
  build of 25.2 (her unique skill as the only active, base stats 600 with her letters) is the gate,
  one verdict per (pair, course) cell, and the table above is measured with exactly that build. If
  the owner wants learned generic actives in the gate, the list is fixed in 25.2 with an ADR line
  (D47) and the table is re-measured. Knob: `regen` trait values are content, not `regenPerTick`.
- **R15 Manufacturer cells (BRIEF §7 home/weak, §12 metric 2) at v1.** Counted as in 25.2 (one
  designated entry per manufacturer, fair share 12.5 %). The rule terms of 13.1 (numeric, a BRIEF §7
  deviation, D45) point
  every measurable desert cell the right way under the D14 energy game, and at v1 constants the
  time-keyed ones already do (Altair home canyon 35 % and weak sprint 1 %, Boneyard home ridge 37 %
  and weak sprint 0 %, Lumière weak ridge 2 %, Steinhaus ≤ 13 %); Kōryū's home desert is not
  produced at v1 (pulse −0.1 % at equal PW: thrust is worth ≈ 1 sigma, R2) and Lumière dominates
  where it is not weak (R9). With literal PW the real-frame S2 is decided by frame power (R1), and
  once PW is compressed the terms are all that is left, so the order is energy game → regen →
  terms → PW (25.3). If the cells still miss 30-45 % / ≤ 15 % after step 4, an ADR moves metric 2.
- **R16 Goal pass rates and season grade (BRIEF §12 metric 7).** With the relative band a par
  player passes the impossible revision-1 cells (Cernícala T46 0 → 37 %, Caracara T46 1 → 6 %);
  what remains under the fair share is frame and rule balance: Peregrina's pool holds etoile (R9;
  9 % at T46 for ≤ 1 against a fair 12.5 %), Caracara's ground stat weights give her less agility
  than the glide kites (≤ 2 at T46: 6 % against a fair 25 %), and, until revision 3, **rival
  quirks**: kite and mule rivals rolled two quirks, `loose-rivets` (+0.1 PW, +14 % cruise on a 0.7
  frame) reached at least one of Caracara's seven rivals in 72 % of races and dropped her par T36 /
  T46 rates from 53 / 6 % to 24 / 4 % (2 % with a loose-rivets rival), no matter how she trained.
  Rivals now carry no quirks (21.1, D37), which is what the par table already measured. The
  reference policy's stat lead over the rival curve is what makes goals passable; but the metric
  is the grade, not the goals: grade ≥ B also needs `seasonScore ≥ 2900` (a season ending near 550
  per stat grades C even with every goal passed). D12 reports S7 (share ≥ B per Falconess, the
  gate), the score split and the goal table of 21.1 before the season is wired; the grade
  thresholds and score weights are metric-7 knobs (25.1).
- **R17 Style terms are first values.** `diveStoopPm`, `hoverDraftPm`, `glideStartAccelPm`, the
  landing constants and `groundDetourMult` were set in the spec prototype to put S1 inside 15-35 %
  and each style fastest in its brief phase; they are the D14 starting point, not tuned results.
  The hover slipstream is a position effect beyond BRIEF §6 "Pelotón" (ADR-0003 D44).
- **R18 Part ablation (BRIEF §12 metric 5) is out of reach of the engine knobs (revision 3).**
  Three points of win rate for one runner in an equal 8-field whose times have σ 1.0-1.2 % is a time
  gain of only **0.16-0.19 %** (normal model: +3 points at δ = 0.155 % for σ 0.99 % and 0.185 % for
  σ 1.18 %; 1 % of time is worth 21-26 points). The v1 parts are worth far more:

  | Part | Mods | v1 (literal PW, `kE` 1000) | After the planned D14 knobs | Points (σ 1.18 %; σ 0.99 % gives 10-25 % more) |
  | --- | --- | --- | --- | --- |
  | lumiere-stabilizer | curve penalty × 0.5 | sprint −2.26 % at A 600 (curves 900 → 950); on a Boneyard frame −3.96 % (850 → 925), faster than a neutral frame without it: it erases Boneyard's weak-sprint cell | unchanged by `kE` and PW; `kCurves` reaches 0.15 % only with a penalty ≈ 10 ‰ at A 600, i.e. without a curve term | ≈ 56 (Boneyard ≈ 83) |
  | steinhaus-turbine | PW +0.1, dissipation −10 | ≈ +10 % cruise on a PW 1.0 frame | ≈ +2.5 % at `pwCruiseWeight` 250 (bottom of 25.3 step 5); 0.16-0.19 % needs a weight ≈ 20 ‰, which removes PW tiers (at 250, tiers 0.7 and 1.4 still differ by ≈ 19 %, so real-frame metric 2 stays decided by PW) | ≈ 62 at weight 250 |
  | lumiere-turbine | PW +0.05, dissipation +10 | ≈ +5 % | ≈ +1.25 % at weight 250 | ≈ 28 at weight 250 |
  | altair-battery | energy +20 | +4 m ≈ 0.33 % on the sprint | 12-17 m ≈ 0.55-0.6 % on the ridge and the canyon at `kE` 250 (balance's exchange rates): step 2 makes it worse | ≈ 6 → 10-11 |
  | boneyard-battery | energy +25, durability −10 | ≈ +5 m ≈ 0.4 % (scaled from the battery rate) | ≈ 0.7 % at `kE` 250 (scaled) | ≈ 7 → 13 |
  | koryu-firmware | intelligence +30 | ≈ 0.11 % of speed through the pace centre plus ≈ 2.5 points of p | unchanged | ≈ 2 plus the skill term (borderline) |
  | altair-firmware | skillSlots +1 | 0 in race (D36) | season learn cap only | 0 |
  | steinhaus-stabilizer | durability +20 | ≈ 0 in one race | durability persists (D35): a season effect | ≈ 0 |

  So `pwCruiseWeight`/`pwBoostWeight`, `kE` and `kCurves` cannot bring metric 5 into range without
  deleting what they govern (PW weight ≈ 20 ‰, curve penalty ≈ 10 ‰), and the planned order
  (energy game before PW) makes the batteries worse. Remedy, for the owner to choose in D14: the
  content tickets of 25.3 (stabilizer scale ≈ 0.97, turbines ≈ +0.01-0.02 PW or a separate part-PW
  weight, batteries ≈ +5 after step 2), or an ADR that moves metric 5 (for example to "no part above
  3 points in an equal field, measured per course where the part's mechanism acts"). Either way S5
  is measured on the equal neutral field with paired seeds (25.2), where none of these values can
  hide, and re-run after step 2. Sources: `.work/design/scratch-critic/partwin.mjs`
  (win-rate model) and `stabilizer.mjs` (body-only sprint replica of section 5; scales re-measured
  by the spec editor).
