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

## Race screens (`src/race/`)

- `RaceViewer({ log, labels })` replays a `RaceLog`; without a log it is the `#carrera` screen,
  which finds the run's goal races by replaying it (`goal-races.ts`) and rebuilds the chosen one
  with detail `"full"` (`game/goal-race.ts`, P7). `FreeRace` is `#carrera-libre`: the field of
  `pnpm sim:race` (`buildField` of `@falconess/race-view`), run at rest with sensible defaults.
- What a race shows comes from `@falconess/race-view`, the package `pnpm sim:race` prints from:
  runners in place order, 10 % splits, timeline cells, grouped events and the structured "why"
  (phases, gains, sinks, judgement, plan, modes, terms, terrain, energy, body, skills).
  `words.ts` words them with `ui.race.*` keys; the CLI words the same models, so both agree.
- `playback.ts` interpolates the sampled frames for the animation; `clock.ts` moves race time by
  `requestAnimationFrame` (×1/×2/×4/×8). The lane chart (`LaneChart.tsx`) draws itself from the
  clock's frames without React renders; React hears a coarse snapshot for the controls and the
  live order. "Pelotón" frames the stretch where the runners are, "Pista entera" the course.

## Published page contract

`build:artifact` post-processes the single-file build (`scripts/artifact.ts`) and fails when the
page breaks the contract: one HTML fragment starting with
`<title>Falconess · Pruebas</title>` and the `claude:viewport-fit-sides` meta, then the Google
Fonts stylesheet, the inlined `<style>`, the root div and the inlined module script; no doctype,
html, head or body tags; no other external load; under 16 MB. Hash routes are plain names
(`#inicio`, `#temporada`, `#carrera`, `#carrera-libre`, `#fin`); no alert, confirm, prompt or print;
storage is optional.
