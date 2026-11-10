# Commands

Every root `pnpm` script of `package.json`, one line each (`tests/repo/commands.test.ts` keeps
this list and the scripts in sync). Arguments after `--` go to the script.

- `pnpm install --frozen-lockfile`: install the workspace exactly as locked (CI does the same).
- `pnpm typecheck`: `tsc -b` over every package plus the tests and benchmarks (tsconfig.tests.json).
- `pnpm test`: the whole Vitest suite, golden logs and determinism checks included.
- `pnpm test:watch`: Vitest in watch mode.
- `pnpm test:golden`: only the golden logs and determinism checks (`race/golden.test.ts` for
  tests/golden/v1, `race/golden-v3.test.ts` for tests/golden/v3, ADR-0011).
- `pnpm golden:update -- --yes [--set v1|v3] [--only g01-sprint-generic]`: rewrite tests/golden/v1,
  or tests/golden/v3 with `--set v3` (lead + ADR).
- `pnpm bench`: race benchmark; fails if the v1 canyon p95 exceeds 5 ms per race. It also
  reports v3 on the Travesía (3600 m) and the sprint; the v3 gate is B7 of `pnpm balance:barandas`
  (median of five runs), since one run's p95 swings around 5 ms.
- `pnpm lint`: Biome format and lint check, read only (CI runs it).
- `pnpm lint:fix`: Biome with `--write`; review `git diff docs/` afterwards (it formats Markdown).
- `pnpm content:validate`: parse every content JSON and check the cross references.
- `pnpm content:track-demands [-- --races 1600] [--bases v3a,v3b] [--check]`: measure what each v3
  catalogue track asks for (the B5 probe and the rival curve, docs/formulas.md «Lo que pide una
  pista») and write the letters into `calendars/v3.json` (`trackDemands`); `--check` only compares.
- `pnpm sim -- --seed 42 --falconess peregrina`: one season with the ruleset's reference policy
  (v2: the careful one; v1: the lowest stat), turn by turn: vigor as a draining bar, mood with its
  training multiplier, each week's causes of a mood or vigor change and its luck event (🎲, with
  its texts and the stats, mood and vigor it gives, as in the web's «Lo que pasó»).
  `--ruleset v1|v2` plays the old rules; the default is `CURRENT_RULESET` (v3, ADR-0011: v2's season
  with the flight race, distance letters and no wear).
- `pnpm play -- --seed 42 --falconess peregrina`: interactive text season (PT0) with the same
  week summary and, next to each training, its gains, vigor cost and failure, injury and mood-drift
  chance from the sim; after a goal race finished 3rd or worse it says what to train (race-view's
  `raceAdvice`). On a goal race week it asks, after the action, for her race position (Punta,
  Pelotón, Acecho, Remate, with her letter in each; Enter, or the number of her wings' own one,
  keeps the one of the wings she races with and saves no `position`, as the web does, ADR-0008)
  and the week's race line names the position she ran. `--ruleset` as in
  `pnpm sim`; on exit it prints the run in the web's save format, ruleset version included.
- `pnpm sim:race -- --seed 1 --course ridge`: one race, classification (with each runner's
  position and letter), timeline and events; the "why" of each runner ends with what to train
  ("consejo"). `--position lead|pack|stalk|closer` sets the player's race position (default: her
  wings' one; rivals keep theirs, ADR-0008). `--ruleset v1|v2|v3` (default v3, ADR-0011); on v3
  `--course` also takes the catalogue tracks (steps, overlook, breakaway, circuit, open-sky,
  crossing) and a VUELO block lists each runner's gesture, takeoffs, dives, line fights, hp paid
  and the kick shortened on low hp (`pnpm play`'s race summary prints the player's line).
- `pnpm sim:batch -- --runs 10000`: balance batch of BRIEF §12 (docs/balance-batch.md).
  `--ruleset v1|v2|v3`, default `CURRENT_RULESET` (v3 since ADR-0011); S7 plays the ruleset's
  reference policy, so the default measures metric 7 with the careful policy and `--ruleset v1`
  with the lowest-stat one, as `5f0fd65` did (ADR-0006 «Métrica 7 en v2 y CI»).
- `pnpm sim:season-batch -- --runs 500`: seasons with the ruleset's reference policy (v2: careful,
  v1: lowest stat, byte for byte the v1 output of `5f0fd65` apart from the `ruleset v1` header
  line, until ADR-0007 removed biomes and wind), stat curve and grades, goal races won and by place, goal pass rates. `--ruleset` as in
  `pnpm sim` (default v3; on v3 metric 7 per Falconess is guardrail B4's number).
- `pnpm balance:barandas`: the eight balance guardrails B1-B8 of race v3 (ADR-0010,
  docs/design/barandas-balance.md), measured as `apps/cli/src/balance/barandas.json` says (two seed
  bases, 1600 races per cell, 1000 seasons per Falconess and base; ≈ 30-40 min on 4 cores, cached
  per engine in out/barandas/cache). Prints PASA / FALLA / FRÁGIL per guardrail, writes
  out/barandas/barandas-<label>.{json,md} and exits 1 if one fails or has no data. **Required, in
  full, for every balance change** (paste the table in the PR). `-- --quick`: small samples, the CI
  gate on B8 (0 bytes) and on the harness, never a balance verdict. `--workers n`,
  `--bench-runs n`, `--label x`, `--skip-b8`; `--record-invariance` rewrites the B8 references
  (lead + ADR).
- `pnpm dev`: the web tester app (apps/web) on the Vite dev server, with hot reload.
- `pnpm web:build`: apps/web to dist/ and the single-file tester page to dist-artifact/.
- `pnpm web:e2e`: both builds of apps/web, then its browser tests in Chromium (apps/web/README.md):
  seasons played by clicks, goal-race replays, copy and load, free race, the post-race tips, the
  published page.
