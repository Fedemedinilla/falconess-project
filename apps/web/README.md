# @falconess/web

The tester interface: the season and the races of `packages/sim` in a browser, without art
(ROADMAP Fase 4, early version). React only reflects state: every rule runs in the sim.

```
pnpm dev                                   # Vite dev server
pnpm --filter @falconess/web build         # standard build, dist/
pnpm --filter @falconess/web build:artifact  # dist-artifact/falconess-playtest.html
pnpm web:build                             # both
pnpm --filter @falconess/web test:e2e       # both builds, then the browser tests (Chromium)
pnpm --filter @falconess/web test:e2e:dev   # the app tests on the dev server (React warnings fail)
pnpm --filter @falconess/web test:e2e:shots # screenshots for review, .work/ui/shots/
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
  One known, test-guarded exception: the Turn screen's training previews
  (`src/screens/model/actions.ts`) mirror the split of the gains, the statMax cap, the fail and
  injury chances and the forced-rest block of `applyTraining`; `actions.test.ts` checks them
  against `advanceSeason` until the sim exports those rules as pure functions (a sim change that
  waits for the owner's approval).
- One gesture, one decision: action cards and event options ignore the repeated clicks of a
  double click, and `GameController.act(input, expectInputs)` drops an input meant for a run that
  has moved on. Undo lives only in the «Partida» dialog (for a misclick; the save keeps no trace).
- A run is `seed + RunInput[]`, saved as `{ schemaVersion, rulesetVersion, seed, inputs }`.
- Every visible text is an es.json key (`src/text/keys.test.ts` checks the static ones).
- Every color is a token of `src/styles/tokens.css`; manufacturer liveries come from content.

## Race screens (`src/race/`)

- `RaceViewer({ log, labels })` replays a `RaceLog`; without a log it is the `#carrera` screen,
  which finds the run's goal races by replaying it (`goal-races.ts`) and rebuilds the chosen one
  with detail `"full"` (`game/goal-race.ts`, P7). It opens on the race a season screen picked
  ("Ver carrera", `game/race-pick.ts`), else on the last step's, else on the latest. `FreeRace` is `#carrera-libre`: the field of
  `pnpm sim:race` (`buildField` of `@falconess/race-view`), run at rest with sensible defaults.
- What a race shows comes from `@falconess/race-view`, the package `pnpm sim:race` prints from:
  runners in place order, 10 % splits, timeline cells, grouped events and the structured "why"
  (phases, gains, sinks, judgement, plan, modes, terms, terrain, energy, body, skills).
  `words.ts` words them with `ui.race.*` keys; the CLI words the same models, so both agree.
  "Por qué" leads with a few plain lines for testers (`whySummary`: the gap and the phases where
  it went, the mishaps in player terms, energy left over), keeps phases, losses, gains and skills
  in view and folds the engine's numbers into a closed "Detalle técnico". hp is "Físico" on screen.
- A goal race does not give itself away: the place the season recorded shows once the replay
  reaches the finish, and the call of the winner sits above the controls until the replay starts.
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

## Browser tests (`e2e/`)

`@playwright/test` with Chromium. Playwright's own browser is used when installed
(`pnpm --filter @falconess/web exec playwright install chromium`, as CI does); otherwise the one
preinstalled in the cloud containers (`/opt/pw-browsers/chromium`). Behind `HTTPS_PROXY` the
browser goes through the proxy. Any console error or uncaught exception fails a test.

- `season.spec.ts`: a whole season of each Falconess with seed `pt-e2e-1`, played by clicks with a
  simple policy (`play.ts`: first event option, rest from fatigue 60, else train the lowest stat).
  The T12 goal race is replayed at ×8 to the finish and its classification must give the place the
  season recorded; SeasonEnd opens it again. Each season writes its timing to
  `.work/ui/timing/<falconess>.json`: about 4,4 s per season (60–65 decisions, ~70 ms each, the
  slowest ~110 ms, a race week included) with one worker on the production build.
- `run.spec.ts`: "Copiar partida" → "Cargar partida" in a fresh browser gives the same week,
  stats and fatigue, and the loaded run plays on identically; "Continuar" after a reload; undo;
  storage blocked and the copy fallback (the text is selected).
- `free-race.spec.ts`: the default race, another course and seed, the neutral field.
- `artifact.spec.ts`: the built fragment against the page contract, then wrapped the way the host
  does it with every request but Google Fonts blocked, at the top level and inside a sandboxed
  iframe at 400 px (no storage, no clipboard, no horizontal scroll).
- `shots.spec.ts` (only with `test:e2e:shots`): Home, NewSeason, Turn with a crew, the workshop,
  an event, the T12 replay mid-race and at the finish, the free race and SeasonEnd, at 1280×800
  and 400×860, light and dark, full page with real fonts. Each shot also checks that every form
  control has a stable id and, on the phone, that the page does not scroll sideways.

The app tests answer Google Fonts with an empty stylesheet (the fallback stacks show), so they
need no network. Failures leave traces and screenshots in `.work/ui/e2e-results/`
(`pnpm --filter @falconess/web exec playwright show-trace <trace.zip>`).
