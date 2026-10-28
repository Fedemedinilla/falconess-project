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
- `pnpm sim -- --seed 42 --falconess peregrina`: one season with the reference policy, turn by turn.
- `pnpm play -- --seed 42 --falconess peregrina`: interactive text season (PT0).
- `pnpm sim:race -- --seed 1 --course desert-ridge`: one race, classification, timeline and events.
- `pnpm sim:batch -- --runs 10000`: balance batch of BRIEF §12 (docs/balance-batch.md).
- `pnpm sim:season-batch -- --runs 500`: seasons with the reference policy, stat curve and grades,
  goal races won and by place, goal pass rates.
- `pnpm dev`: the web tester app (apps/web) on the Vite dev server, with hot reload.
- `pnpm web:build`: apps/web to dist/ and the single-file tester page to dist-artifact/.
