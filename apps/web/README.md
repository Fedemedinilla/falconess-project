# @falconess/web

The tester interface: the season and the races of `packages/sim` in a browser, without art
(ROADMAP Fase 4, early version). React only reflects state: every rule runs in the sim.

```
pnpm dev                                   # Vite dev server
pnpm --filter @falconess/web build         # standard build, dist/
pnpm --filter @falconess/web build:artifact  # dist-artifact/falconess-playtest.html
pnpm web:build                             # both
```

## Layout

- `src/content/` content for the browser: `import.meta.glob` (eager) over packages/content, the
  same file order as the Node loader, `buildContentIndex` once.
- `src/game/` the run: `GameController` (`start`, `act`, `undoLast`, `newSeason`, `save`,
  `continueSaved`, `loadText`, `exportText`), the save format (`run.ts`), guarded storage, goal
  race replays with detail `"full"` (`goal-race.ts`) and the `useGame()` hook.
- `src/text/` `ui(key, vars)` for interface texts (`ui.*` keys of
  packages/content/text/es.json), `gameText(textKey)` for game names, Spanish number formats.
- `src/ui/` shared components: Panel, StatBar, Button, Pill, Livery, Dialog, Table, SeasonStrip.
- `src/app/` shell: hash routes, timing bar, theme, error banner, run and load dialogs.
- `src/screens/` season screens; `src/race/` race screens. The route map is in `src/app/App.tsx`.

## Rules

- No game rule or physics in this package. States come from `startSeason`, `advanceSeason`,
  `replaySeason`; previews from sim functions (`trainingGain`, `rerollCost`, `learnCap`,
  `goalForTurn`); races only from a `RaceLog` (interpolating positions between frames is fine).
- A run is `seed + RunInput[]`, saved as `{ schemaVersion, rulesetVersion, seed, inputs }`.
- Every visible text is an es.json key (`src/text/keys.test.ts` checks the static ones).
- Every color is a token of `src/styles/tokens.css`; manufacturer liveries come from content.

## Published page contract

`build:artifact` post-processes the single-file build (`scripts/artifact.ts`) and fails when the
page breaks the contract: one HTML fragment starting with
`<title>Falconess · Pruebas</title>` and the `claude:viewport-fit-sides` meta, then the Google
Fonts stylesheet, the inlined `<style>`, the root div and the inlined module script; no doctype,
html, head or body tags; no other external load; under 16 MB. Hash routes are plain names
(`#inicio`, `#temporada`, `#carrera`, `#carrera-libre`, `#fin`); no alert, confirm, prompt or print;
storage is optional.
