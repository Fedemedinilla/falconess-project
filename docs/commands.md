# Commands

Every root `pnpm` script of `package.json`, one line each (`tests/repo/commands.test.ts` keeps
this list and the scripts in sync). Arguments after `--` go to the script.

- `pnpm install --frozen-lockfile`: install the workspace exactly as locked (CI does the same).
- `pnpm typecheck`: `tsc -b` over every package plus the tests and benchmarks (tsconfig.tests.json).
- `pnpm test`: the whole Vitest suite, golden logs and determinism checks included.
- `pnpm test:watch`: Vitest in watch mode.
- `pnpm test:golden`: only the golden logs and determinism checks (`race/golden.test.ts`).
- `pnpm golden:update -- --yes [--only g01-sprint-generic]`: rewrite tests/golden/v1 (lead + ADR).
- `pnpm bench`: race benchmark; fails if the desert-canyon p95 exceeds 5 ms per race.
- `pnpm lint`: Biome format and lint check, read only (CI runs it).
- `pnpm lint:fix`: Biome with `--write`; review `git diff docs/` afterwards (it formats Markdown).
- `pnpm content:validate`: parse every content JSON and check the cross references.
- `pnpm sim -- --seed 42 --falconess peregrina`: one season with the ruleset's reference policy
  (v2: the careful one; v1: the lowest stat), turn by turn: vigor as a draining bar, mood with its
  training multiplier, each week's causes of a mood or vigor change and its luck event (🎲, with
  its texts and the stats, mood and vigor it gives, as in the web's «Lo que pasó»).
  `--ruleset v1` plays the old rules; the default is `CURRENT_RULESET` (v2, ADR-0006).
- `pnpm play -- --seed 42 --falconess peregrina`: interactive text season (PT0) with the same
  week summary and, next to each training, its gains, vigor cost and failure, injury and mood-drift
  chance from the sim; after a goal race finished 3rd or worse it says what to train (race-view's
  `raceAdvice`). `--ruleset` as in `pnpm sim`; on exit it prints the run in the web's save
  format, ruleset version included.
- `pnpm sim:race -- --seed 1 --course desert-ridge`: one race, classification, timeline and events;
  the "why" of each runner ends with what to train ("consejo").
- `pnpm sim:batch -- --runs 10000`: balance batch of BRIEF §12 (docs/balance-batch.md).
  `--ruleset v1|v2`, default v1 (the CI baseline); S7 plays the ruleset's reference policy, so
  `--ruleset v2` measures metric 7 with the careful policy (ADR-0006 «Métrica 7»).
- `pnpm sim:season-batch -- --runs 500`: seasons with the ruleset's reference policy (v2: careful,
  v1: lowest stat, byte for byte the v1 output of `5f0fd65` apart from the `ruleset v1` header
  line), stat curve and grades, goal races won and by place, goal pass rates. `--ruleset` as in
  `pnpm sim` (default v2).
- `pnpm dev`: the web tester app (apps/web) on the Vite dev server, with hot reload.
- `pnpm web:build`: apps/web to dist/ and the single-file tester page to dist-artifact/.
- `pnpm web:e2e`: both builds of apps/web, then its browser tests in Chromium (apps/web/README.md):
  seasons played by clicks, goal-race replays, copy and load, free race, the post-race tips, the
  published page.
