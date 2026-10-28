# Balance batch (`pnpm sim:batch`)

The batch of BRIEF §12 and ROADMAP D14, built exactly on `docs/race-engine.md` §25.2 (scenarios),
§25.2.1 (run budget and verdicts) and ADR-0003 D40, D47, D48, D49. Code: `apps/cli/src/sim-batch.ts`
and `apps/cli/src/batch/`. Report schema: `BalanceReport` in `packages/schema/src/balance.ts`.

```sh
pnpm sim:batch -- --runs 10000                         # pr profile → out/balance.json
pnpm sim:batch -- --runs 10000 --markdown out/balance.md --baseline out/baseline.json
pnpm sim:batch -- --profile full                       # nightly sample sizes (--runs ignored)
pnpm sim:batch -- --scenarios S1,S3 --seed try2 --workers 3
pnpm sim:batch -- --runs 1000 --engine fake            # development stand-in, not the engine
pnpm sim:batch -- --engine fake --fake-cost-ms 5        # time the 60-s budget with a 5 ms engine
```

Exit codes: 0 done; 1 on any DNF (an engine bug, §19), on a wall time at or over `--max-wall-ms`
(the budgets of `docs/race-engine.md` 24.4: 6000 for the `--runs 1000` CI smoke, 60000 for
`--runs 10000`) and, with `--fail-on-verdict`, on a fail verdict or a fail cell of
`--gate-report` that this report neither passes nor re-targets; 64 usage error. A `--baseline` or
`--gate-report` this revision cannot read (another `BalanceReport` schema, a damaged file) is a
warning: the report and the Markdown are still written, without the diff (the Markdown says so)
or without the gate. `--baseline-from TEXT` names the baseline's source (run, commit) in the diff
header.

**Gate report (§25.2.1, `batch/gate.ts`).** Each fail cell of the gate report (the last `full`
of `main`) is matched to this report by metric id and cell id. It is lifted when this report's
cell passes (the PR fixed the metric), when this report's target for it differs and the gate's
interval no longer fails under that target (the PR moved the target, with its ADR), or when this
report ran the scenario and no longer has the cell. An inconclusive cell does not lift it: every
PR that leaves a marginal fail alone reads inconclusive at `pr` size. The Markdown lists every
gate cell with its status.

## Tests during a balance pass

Physics tests pin to `SPEC_RULESET`, a frozen copy of the ADR-0003 constants (`docs/race-engine.md`
24). Changing `packages/sim/src/rulesets/v1/constants.ts` fails only the goldens of
`tests/golden/v1` (the lead regenerates them once, with an ADR), the test "SPEC_RULESET matches v1
until the first balance change" (the first balance commit deletes it) and tests whose subject is
the live ruleset: an aptitude multiplier also fails the S3 build test of
`apps/cli/src/batch/scenarios.test.ts`, a `SEASON` value tests of
`packages/sim/src/season/season.test.ts` (`trainBase`: the `trainingGain` test). Content is not frozen: a part, frame or course change
also fails the tests that pin it (parts in `stats.test.ts`, `fixtures.test.ts`, `entry.test.ts`,
`field.test.ts` and the S5 test of `scenarios.test.ts`; frame stats and course segments, the 25.4
sanity tables and the prototype cross-checks), which the same commit updates. During the pass:
`pnpm vitest run --exclude '**/golden.test.ts'`, `pnpm typecheck`, `pnpm lint`.

## Engine port

The batch never imports the race engine directly. `batch/engine-port.ts` declares the operations of
§23 it calls, with the spec's names and signatures:

| Operation                                            | Used by                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `simulateRace(ruleset, entries, course, seed, opts)` | every race, always `detail: "results"`, the worker's arena and the cached geometry |
| `createRaceArena()`                                  | one per worker                                                                     |
| `buildCourseGeometry(ruleset, course)`               | one per course and worker, passed as `opts.geometry`                               |
| `neutralFixtureEntry(args)`                          | S1, S2 fillers and equal-PW variant, S4, S5, S8, diagnostics                       |
| `fixtureBuild(content, parts, quirks)`               | S5, quirk diagnostic                                                               |
| `freezeEntry(ruleset, content, input, course, lane)` | S2 designated real frames, S3                                                      |
| `freezeSkill(content, id)`                           | S4                                                                                 |
| `disableSkill(entry, skillId)`                       | S4 "off" runs                                                                      |
| `generateField(ruleset, content, args)`              | not called by the batch: S7 reaches it through the season engine (`goalRaceSetup`) |

`batch/engine-types.ts` re-exports the race types of `@falconess/schema` (§3, §20) and the
internal `RaceArena`, `CourseGeometry`, `FixtureBuild` and `SimulateOptions` of `@falconess/sim`;
the port's `simulateRace` returns `BatchRaceLog`, the fields of a `RaceLog` the batch reads. The
adapter (`batch/engine-adapter.ts`) binds the nine operations to `@falconess/sim` (the batch never
calls `generateField` itself).
`batch/fake-engine.ts` keeps a deterministic integer stand-in for `simulateRace` for the tests
(draws depend on `(seed, lane)` only, like §17.1, so paired ablations line up); its content side
is the real engine's.

## Scenarios, as implemented

Seeds are `${profile}/${scenario}/${course}/${cell}/${k}` (`--seed BASE` prefixes `BASE/`). Lanes
"shuffled per seed" are `new Rng(seed + "/lanes").shuffle("race", 0..7)`. Every win count splits a
dead heat for first (equal `finishMilli`) evenly; the lane tie-break is never used.

| Scenario        | Unit (one job)                              | Field                                                                                                                                                                                                   | Metric and interval                                                                                                                                                                                                |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1              | 8-runner race                               | 8 neutral fixtures, 2 per style, stats 600, no skills                                                                                                                                                   | metric 1: per-biome mean of the course win rates per style, Wilson (n = the biome's races), 15-35 %; per-course rates and phase splits as diagnostics                                                              |
| S2 real         | 8-runner race                               | 5 designated entries (one non-signature frame per manufacturer, one `nextInt("race")` each from `new Rng(seed + "/frames")`, base 600, letters B, no skills, parts or quirks) + 3 neutral hover fillers | metric 2: designated entry's win share per (manufacturer, course) home or weak cell, Wilson, home 30-45 %, weak ≤ 15 %; neutral cells reported                                                                     |
| S2 equal-PW     | 8-runner race                               | designated entries = neutral hover fixture with `rule` and `manufacturer` set                                                                                                                           | sanity table with informative verdicts (not gated)                                                                                                                                                                 |
| S3              | paired sample: both lane orders of one seed | the same Falconess (base 600, her letters, her unique skill only) on signature and generic                                                                                                              | metric 3: generic wins / signature wins per (pair, course); normal interval of the signature's mean share per sample mapped through (1 − p) / p; 0.85-0.90; `full` doubles a cell (4000 → 8000) while inconclusive |
| S4              | paired seed (on / off)                      | S1 field, every runner carries the skill; off = `disableSkill` on all 8                                                                                                                                 | metric 4: mean over runners of (timeOff − timeOn) × L / timeOff, then over seeds; paired normal interval; 0.5-8 m per (skill, course) cell where the trigger can occur (31 cells)                                  |
| S5              | paired seed (with / without)                | S1 field; carrier = lane `k mod 8` with `fixtureBuild(content, [part], [])`                                                                                                                             | metric 5: `pr` converts the paired time gain to points at this run's S6 σ (equal-field model); `full` judges Δ win rate directly; ≤ 3 points                                                                       |
| S6              | (S1 races)                                  | each S1 runner is a fixed build                                                                                                                                                                         | metric 6: mean over the 8 runners of σ/mean per course; σ × (1 ± 1.96 / √(2(N − 1))); 0.8-2 %; real-frame σ (shiden: R6) as a diagnostic                                                                           |
| S7              | season (≤ 4 goal races)                     | season engine, reference policy and hangar of `sim:season-batch`                                                                                                                                        | metric 7: share of seasons with `gradeFor ≥ B` per Falconess, Wilson, ≥ 60 %; grade distribution, score split and goal pass-rate table (passed / reached, flag under 80 %)                                         |
| S8              | I sweep: 5 races on one seed                | 8 neutral fixtures of one style; measured runner in lane `k mod 8` at I 300 / 510 / 600 / 630 / 1000                                                                                                    | metric 8: `pr` pools adjacent-I paired win differences over styles and courses; `full` one cell per (style, course, step, win or top-3); fail only when the interval lies below 0                                  |
| quirks (`full`) | paired seed                                 | like S5 with `fixtureBuild(content, [], [quirk])`                                                                                                                                                       | table only                                                                                                                                                                                                         |
| stats (`full`)  | paired seed (2 solo races)                  | solo neutral hover, 600 vs stat + 100                                                                                                                                                                   | metres per +100, table only                                                                                                                                                                                        |

Budget: the counts of §25.2.1. In `pr` each count is × runs / 10 000, floored, at least 1 per cell;
S1 absorbs the remainder so the budgeted races add up to exactly `--runs` (S7 runs fewer when a
goal fails). The allocation is computed over every line, so `--scenarios` never changes a cell's
seeds or counts. S6 and S5's `pr` verdict pull S1 in.

Reference policy (`apps/cli/src/policy.ts`, shared by S7, `pnpm sim` and `sim:season-batch`): option
0 on an event; a workshop visit that does a `repair` when the equipped frame's durability is below
50 % of the build's maximum (`REPAIR_BELOW_PM`; durability persists between goal races, ADR-0003
D35, risk R8) and learns, cheapest first and up to the learn cap, every useful generic active the
skill points pay for (`skillsToLearn`: an active no Falconess owns whose trigger can fire on a goal
course still ahead; ADR-0005 «Pasada 2»); rest at fatigue 60 or more; otherwise train the lowest
stat. With the v1 economy the lowest-stat training ends a season with 25-50 skill points and the
cheapest generic active costs 60, so the learning rule never fires in the reference seasons.

Verdicts (§25.2.1): pass when the 95 % interval lies inside the target, fail when entirely outside,
inconclusive otherwise; a metric passes only if every cell passes and fails if any fails, and the
same rule combines metrics into the report verdict.

Performance: `--engine fake --fake-cost-ms 5` busy-waits 5 ms per 8-runner race (scaled by runners
/ 8), the engine budget of §22. On the dev container (4 cores) the 10 000-race `pr` batch took
37.0 s wall in process (36.5 s inside the engine) and 13.7 s with the default 3 workers: the batch
itself adds well under 1 s. With the real engine (v1) the same batch takes 14.0 s wall in process
(1.46 ms per race) and 5.8 s with 3 workers (1.58 ms per race); `--runs 2000` takes 2.8 s in
process and 3.7 s with 3 workers, where booting the workers costs more than it saves.

Workers: jobs carry their own seed and results are merged by job index, so the report is identical
for any `--workers` (only `metadata.timing` differs). Workers start through `batch/worker-boot.mjs`,
which registers tsx (the parent's TypeScript loader does not reach worker threads).

## CI (`.github/workflows/balance.yml`)

- **Pull requests** touching an input of the metrics (`packages/sim/**`, `packages/content/**`,
  `packages/rng/**`, `packages/schema/src/**`, the batch, the S7 reference policy
  `apps/cli/src/policy.ts`, `apps/cli/src/goal-rate.ts` or the workflow; the push list is the
  same): `pnpm sim:batch -- --runs 10000 --report out/balance.json --markdown out/balance.md
  --max-wall-ms 60000`, with `--baseline` and `--baseline-from` when a baseline exists. The Markdown goes to the job summary and to one sticky PR
  comment (the comment whose body starts with `<!-- falconess-balance-report -->` is edited, else
  `gh pr comment` creates it; skipped for forks). The report is uploaded as `balance-pr`.
- **Baseline:** every push to `main` that touches those paths runs the same job and uploads the
  `balance-pr` artifact (90 days); a push run never fails on a verdict, since `main` produces the
  baseline. A PR job walks the latest finished `balance.yml` runs on `main`
  (`gh run list --branch main --status completed`, whatever their conclusion: a run can fail on a
  DNF or the time budget after uploading its report) and downloads the first `balance-pr` it
  finds with `gh run download` (needs `actions: read`); the diff header names that run and its
  commit. No artifact yet: the report has no diff section. To refresh it by hand, dispatch the
  workflow on `main` with `profile: pr`.
- **Nightly `full`:** a schedule (and a manual dispatch with `profile: full`) runs
  `--profile full` and uploads `balance-full`.
- **Gate:** report only for now; metric verdicts never fail the job. The repository variable
  `BALANCE_GATE=enforce` turns on §25.2.1's rule for pull requests: `--fail-on-verdict`, plus
  `--gate-report` with the last `balance-full` of `main`, so a fail in the PR's report, or a gate
  fail cell the PR neither fixes nor re-targets, fails the PR job. The label `balance-adr` (a PR
  that attaches an ADR moving a target, BRIEF §12, or a fix the `pr` sample cannot show) runs the
  job without `--fail-on-verdict`; adding or removing the label re-runs it.
- **Time budget:** the PR job passes `--max-wall-ms 60000` (24.4); the 1000-race smoke under 6 s
  is the `batch-smoke` job of `ci.yml`, on every push and pull request.
- Any DNF exits 1 and fails the job: it is an engine bug (§19), not balance. S7 counts the
  player's DNFs in its goal races (recorded with the course's `maxTicks`); the season keeps no
  rival results, so rival DNFs in goal races are not checked.
