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
pnpm --filter @falconess/web test:e2e:shots # screenshots for review, .work/ui/shots/ (or E2E_SHOTS_DIR)
```

## Layout

- `src/content/` content for the browser: `import.meta.glob` (eager) over packages/content, the
  same file order as the Node loader, `buildContentIndex` once.
- `src/game/` the run: `GameController` (`start`, `act`, `undoLast`, `newSeason`, `save`,
  `continueSaved`, `loadText`, `exportText`), the save format (`run.ts`), guarded storage, goal
  race replays with detail `"full"` (`goal-race.ts`) and the `useGame()` hook.
- `src/text/` `ui(key, vars)` for interface texts (`ui.*` keys of
  packages/content/text/es.json), `gameText(textKey)` for game names, Spanish number formats;
  `brief.ts` for the two lengths of an explanation (below).
- `src/ui/` shared components: Panel, StatBar, Button, Pill, Livery, Dialog, Table, SeasonStrip,
  Icon and ExplainSwitch; `icons.ts` is the game's concepts as emojis (below).
- `src/app/` shell: hash routes, timing bar, theme, explanations default (`explain.ts`,
  `ExplainDefault.tsx`), error banner, run and load dialogs.
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
- Every emoji is in `src/ui/icons.ts` (`icons.test.ts` checks the sources and es.json).

## Icons

`src/ui/icons.ts` maps each concept to one emoji: the eight actions (💤 Descansar, ☕ Salida…),
the five stats (a training shares its stat's emoji), mood faces by level, fatigue, skill points,
scrap, feathers, injury, risk, crew and bond, the four frame stats, passive, quirk, part, rule,
skill, the race gauges, terrain, biomes, styles, the runners' flags and events, goal races,
medals, the grade. They are presentation, like colors: `Icon` draws one `aria-hidden` before
the label that names the concept (never instead of it), at a fixed width so a column of labels
stays aligned. A concept keeps its emoji everywhere; two concepts share one only when listed in
`SHARED_ICONS` (a training and its stat, Resistencia and Físico, a goal race and its finish).
They render with the system's emoji font: the label always says it in words.

## Brief and full explanations

Every explanation a card can shorten has two texts in es.json: the full one under its key and a
one-line brief one under `<key>.brief` (`rule.pulse.brief`, `skill.third-pulse.brief`,
`ui.goals.consequence.brief`…). `uiAt(detail, key)` and `gameBrief(textKey)` pick them;
`brief.test.ts` checks that every one exists, is shorter than its full text and uses no value
the full one lacks, that it keeps every downside of the full text (a cap, a lower value, a weaker
chance, the season ending…) and says «activación» for a skill-chance bonus, and that every skill
and rule has one (parts and quirks when their text is long). Briefs must say what the engine
does (docs/race-engine.md), only shorter. Status messages have no brief: the race-week warning
always says the whole stake.

A card whose explanation changes by more than a line has «Breve | Completo» right above what it
changes (`ExplainSwitch`: two `aria-pressed` buttons, ids `<card>-breve` and `<card>-completo`,
44 px tall on phones): frame cards (in the header; first inside «Ver detalle» when the card folds
on a phone), runner cards (on the «Habilidad única» row, inside the fold on a phone), the hangar's
frame, the workshop's parts, quirks and skills, the free race form, the live order and "Por qué"
(brief: «En pocas palabras»; full: the phases, losses, gains, skills and «Detalle técnico»).
«Explicaciones [Breve | Completo]» (`app/ExplainDefault.tsx`, ids `explicaciones-breve` and
`explicaciones-completo`) sets the default for every card: in the top bar, or on a phone at the
head of each screen with explanations (NewSeason, Turn, the race, the free race), since the bar's
top row scrolls away there. The default is brief unless the viewer chose otherwise, remembered in
localStorage when the page may use it; choosing it drops the cards' own choices (a card's own
switch holds until then, `src/app/explain.ts`) and keeps the first card in view where it was.
Texts outside a card and one-line ones (panel hints, the actions' legend and workshop note, the
goal's consequence, the crews' note, the race legend) follow the default.

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
`<title>Prueba jugable Falconess</title>` and the `claude:viewport-fit-sides` meta, then the Google
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
- `explain.spec.ts`: one card's «Breve | Completo», then «Explicaciones» for every card; the
  default survives a reload and the card's own choice does not; the card in view stays put when
  the default changes; on a phone the switches open with «Ver detalle», the default sits at the
  screen's head, everything is 44 px and works with storage blocked.
- `artifact.spec.ts`: the built fragment against the page contract, then wrapped the way the host
  does it with every request but Google Fonts blocked, at the top level and inside a sandboxed
  iframe at 400 px (no storage, no clipboard, no horizontal scroll).
- `shots.spec.ts` (only with `test:e2e:shots`): Home, NewSeason, Turn with a crew, the workshop,
  an event, the T12 replay mid-race and at the finish, the free race and SeasonEnd, at 1280×800
  and 400×860, light and dark, full page with real fonts; the screens with explanations twice,
  brief and full (`-brief`, `-full`). Each shot also checks that every form
  control has a stable id and, on the phone, that the page does not scroll sideways.

The app tests answer Google Fonts with an empty stylesheet (the fallback stacks show), so they
need no network. Failures leave traces and screenshots in `.work/ui/e2e-results/`
(`pnpm --filter @falconess/web exec playwright show-trace <trace.zip>`).
