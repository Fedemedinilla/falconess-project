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
```

Exit codes: 0 done, 1 verdict fail with `--fail-on-verdict` (or a fail in `--gate-report`) or any
DNF (an engine bug, §19), 2 race engine not wired yet, 64 usage error.

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

`batch/engine-types.ts` holds temporary structural copies of the race types (§3, §20); the
adapter (`batch/engine-adapter.ts`) shows the wiring to `@falconess/sim` and throws until then.
`batch/fake-engine.ts` is a deterministic integer stand-in used by the tests (draws depend on
`(seed, lane)` only, like §17.1, so paired ablations line up).

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
| S7              | season (≤ 4 goal races)                     | season engine, reference policy and hangar of `sim:season-batch`                                                                                                                                        | metric 7: share of seasons with `gradeFor ≥ B` per Falconess, Wilson, ≥ 60 %; grade distribution, score split and goal pass-rate table (flag under 80 %)                                                           |
| S8              | I sweep: 5 races on one seed                | 8 neutral fixtures of one style; measured runner in lane `k mod 8` at I 300 / 510 / 600 / 630 / 1000                                                                                                    | metric 8: `pr` pools adjacent-I paired win differences over styles and courses; `full` one cell per (style, course, step, win or top-3); fail only when the interval lies below 0                                  |
| quirks (`full`) | paired seed                                 | like S5 with `fixtureBuild(content, [], [quirk])`                                                                                                                                                       | table only                                                                                                                                                                                                         |
| stats (`full`)  | paired seed (2 solo races)                  | solo neutral hover, 600 vs stat + 100                                                                                                                                                                   | metres per +100, table only                                                                                                                                                                                        |

Budget: the counts of §25.2.1. In `pr` each count is × runs / 10 000, floored, at least 1 per cell;
S1 absorbs the remainder so the budgeted races add up to exactly `--runs` (S7 runs fewer when a
goal fails). The allocation is computed over every line, so `--scenarios` never changes a cell's
seeds or counts. S6 and S5's `pr` verdict pull S1 in.

Verdicts (§25.2.1): pass when the 95 % interval lies inside the target, fail when entirely outside,
inconclusive otherwise; a metric passes only if every cell passes and fails if any fails, and the
same rule combines metrics into the report verdict.

Workers: jobs carry their own seed and results are merged by job index, so the report is identical
for any `--workers` (only `metadata.timing` differs). Workers start through `batch/worker-boot.mjs`,
which registers tsx (the parent's TypeScript loader does not reach worker threads).

## CI (`.github/workflows/balance.yml`)

- **Pull requests** touching `packages/sim/**`, `packages/content/**`, the batch or the workflow:
  `pnpm sim:batch -- --runs 10000 --report out/balance.json --markdown out/balance.md`, with
  `--baseline` when a baseline exists. The Markdown goes to the job summary and to one sticky PR
  comment (the comment whose body starts with `<!-- falconess-balance-report -->` is edited, else
  `gh pr comment` creates it; skipped for forks). The report is uploaded as `balance-pr`.
- **Baseline:** every push to `main` that touches those paths runs the same job and uploads the
  `balance-pr` artifact (90 days). A PR job walks the latest successful `balance.yml` runs on `main`
  (`gh run list --branch main`) and downloads the first `balance-pr` it finds with
  `gh run download` (needs `actions: read`). No artifact yet: the report has no diff section. To
  refresh it by hand, dispatch the workflow on `main` with `profile: pr`.
- **Nightly `full`:** a schedule (and a manual dispatch with `profile: full`) runs
  `--profile full` and uploads `balance-full`.
- **Gate:** report only for now; metric verdicts never fail the job. The repository variable
  `BALANCE_GATE=enforce` turns on §25.2.1's rule: `--fail-on-verdict`, plus `--gate-report` with
  the last `balance-full` of `main`, so a fail in either fails the PR job.
- Until the engine is wired the batch exits with code 2 and the job writes "skipped" to its
  summary without failing.
