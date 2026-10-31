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
  `ExplainDefault.tsx`), error banner, run and load dialogs. The timing bar is one row from 79rem
  (it needs ≈ 70rem with the page's fonts and ≈ 78rem with the fallback stacks), two rows below
  (name and tools, then the sections and the run) and the phone's sticky row below 37.5rem; the
  run's name gives way with an ellipsis before anything goes over the sections (an e2e test in
  `run.spec.ts` checks 390 to 1440 px).
- `src/screens/` season screens; `src/race/` race screens. The route map is in `src/app/App.tsx`.

## Rules

- No game rule or physics in this package. States come from `startSeason`, `advanceSeason`,
  `replaySeason`; previews from the sim's pure rules, the ones `advanceSeason` itself calls
  (`trainingGains`, `trainingRisk`, `actionBlock`, `restOptions`, `nextTrainingDriftPm`,
  `trainingMoodMultiplier`, `moodMultiplier`, `vigor`, `rerollCost`, `learnCap`, `goalForTurn`);
  races only from a `RaceLog` (interpolating positions between frames is fine). The Turn screen's
  previews (`src/screens/model/actions.ts`) only cap a gain at the stat's room and clamp vigor to
  the bar; `actions.test.ts` compares every preview with what `advanceSeason` applies, in v1 and v2.
- Rulesets: new seasons start on `CURRENT_RULESET` (v2, ADR-0006); a saved or pasted run replays
  and plays on with the ruleset it carries (`GameController.context()`), and a version-less
  `replay:` line of the CLI is v1. The ruleset shows next to the seed (Turn, «Continuar», «Partida»,
  SeasonEnd). `newRunContext()` is the context of a season about to start (Home, NewSeason).
- One gesture, one decision: action cards and event options ignore the repeated clicks of a
  double click, and `GameController.act(input, expectInputs)` drops an input meant for a run that
  has moved on. Undo lives only in the «Partida» dialog (for a misclick; the save keeps no trace).
- A run is `seed + RunInput[]`, saved as `{ schemaVersion, rulesetVersion, seed, inputs }`.
- Every visible text is an es.json key (`src/text/keys.test.ts` checks the static ones).
- Every color is a token of `src/styles/tokens.css`; manufacturer liveries come from content.
- Every emoji is in `src/ui/icons.ts` (`icons.test.ts` checks the sources and es.json).

## Icons

`src/ui/icons.ts` maps each concept to one emoji: the eight actions (💤 Descansar, ☕ Salida…),
the five stats (a training shares its stat's emoji), Ánimo (😐 for a gain or an event's effect;
the status panel shows the current level's face), vigor (💪, the bar that drains; fatigue is never
shown, in any ruleset),
skill points, scrap, feathers, injury, risk (🎲 before every «Fallo», 🩹 before «Lesión»), crew
and bond, the four frame stats, passive, quirk, part, rule, skill, the race gauges, terrain,
styles, the runners' flags and events, goal races, medals, the grade, and how a week's
training went (✅, and ❌ shared with the DNF). They are presentation, like colors: `Icon` draws one
`aria-hidden` before the label that names the concept (never instead of it), at a fixed width so
a column of labels stays aligned, with a thin edge on the light theme (`--emoji-edge`) so pale
ones show. A concept keeps its emoji everywhere; two concepts share one only when listed in
`SHARED_ICONS` (a training and its stat, Resistencia and Físico, a goal race and its finish, Ánimo
and the «Normal» face, a failed training and a DNF). Where a colour swatch already marks an item (the terrain and timeline
legends, the season strip's goal marks) there is no emoji. They render with the system's emoji
font and stop at Unicode 12 (Windows 10 has no 13.0 emojis): the label always says it in words.

## Vigor and the weight of mood (ADR-0006)

The screen speaks in vigor, `fatigueMax − fatigue` (presentation only: the state keeps `fatigue`),
for every ruleset: a fatigue cost of +20 is «Vigor −20», an event's fatigue +15 is «Vigor −15».
The status panel's bar drains with training and fills with rest; with ruleset v2 it is colored and
named by its band (`screens/model/vigor.ts`, the edges of the failure curve: ≥ 60 «Descansada»,
40–59 «Algo cansada», 21–39 «Cansada», ≤ 20 «Agotada», marked on the track,
`#turno-vigor-nota`, `data-band`; green, amber, amber and red: red only where a failure can be an
injury, as on the cards). The labels say how tired she is, never that training is safe (the «Lo que
pasó» pill shows the label with no note beside it), and a unit test keeps «riesgo» out of them. The notes speak of the plain trainings: the top band's note and the v2 legend say the risk
flight fails even at full vigor (12 %, `trainingRisk` at fatigue 0), and that a quarter of its
failures are injuries at any vigor. A v1 run has no bands: its bar keeps the
forced rest at vigor 20 or less (mark, pill, the cards' block). Every training card says its
failure chance and, when there is one, its injury chance (`trainingRisk` at the current fatigue),
amber from 10 % and red from 25 % or an injury from exhaustion (`data-risk` on the card); rest says
«+30 a +70» and each recovery's chance (`restOptions`) and «+1 Ánimo (25 %)», the chance on the
effect itself (`restMoodUpChance`), the outing «+20» vigor and +1 mood; at the top mood (+2) both
show their mood effect as «0 Ánimo (ya al máximo)» and the rest drops its mood chance. The mood line gives its
multiplier on training and on races («Entrenamientos ×1,10 · carreras ×1,02», `#turno-animo-nota`);
when a training streak makes the next mood drift likelier than a first training's, a line above
the cards says so with its chance (`#turno-racha`, `nextTrainingDriftPm`), except at the lowest
mood (−2), where the drift has nowhere to take her. The line above the actions («Lo que pasó»,
`#turno-semana-pasada`) says a failure lowered the mood only when the log has `log.mood.failure`.
The actions' legend
explains the curve in v2 and the linear chance in v1, brief and full; in v2 both lengths also say
that the simulator gives a little vigor back, as its card does («Vigor +5»,
`-fatigueCost["train:simulator"]`).

## «Lo que pasó» (`src/screens/WeekDialog.tsx`)

After every input that closes a week or answers an event (a training, rest, outing, workshop, a
race week, an event's answer) a modal opens over the Turn screen, and over SeasonEnd for the input
that ends the season (week 48, a failed goal race, an answer that ends it; «Continuar» leaves the
player on #fin with the focus on the page): the native `<dialog>` in modal mode (the page behind
dimmed and inert, `aria-modal`, labelled by its headline, focus on
«Continuar»), closed by «Continuar», Enter, Esc or a click on the dimmed page, the focus back
where it was (or on the week's action when that element is gone). One headline says what happened
(«✅ ¡Entrenamiento exitoso!», «❌ Falló el entrenamiento», «🩹 Se lesionó», «💤 Descansó», «☕
Salida con …», «📣 Elegiste: …»; on a race week the place and the goal, the action one line
below), then the stats as chips, the other changes with where they ended and their cause (vigor =
`fatigueMax − fatigue`, mood, skill points, scrap, feathers, bond, durability, injury, skills),
the log notes nothing above says (any key, through the text lookup), the race's tip with its own
«Breve | Completo» and «Ver carrera», and, in the footer next to «Continuar», a line when an event
waits (`#semana-evento-espera`): the event dialog opens only after this one closes, with the focus
on its title (`Dialog`'s `focusTitle`), so the Enter that closed this one does not hide the event
unread. Every week fits 390 × 700 without scrolling inside: on a screen 760 px tall or less the
spacing tightens and the race's tip keeps its leads and the stat to train, while its numbers and
its switch wait in «Ver carrera» (the replay's «Por qué» shows the same tip whole).

With ruleset v2 it also says why: every mood change names its cause from the sim's `log.mood.*`
note («Peregrina está harta de entrenar», «la carrera la dejó desanimada», «el fallo la
desanimó»; a drop in red), and changes that cancel out keep their notes as lines; the vigor row
names the band it ended in, and shows at 0 when a luck event's vigor cancelled the action's
(«Vigor 0 → 80 · entrenamiento, evento»); a drawn rest says how she slept (only when it gave vigor back); an
injury from exhaustion says so in red. A luck event the sim applied by itself (`event.auto` on the
log entry) gets its own block (`#semana-evento`): its text, what happened (the option), how its
chance branch came out and what it did (`#semana-evento-efectos`: the option's effects, then the
drawn branch's, worded as the event dialog words an option's: «Agilidad +10», «Vigor −15»; the
stat chips under the headline are the action's own, the week's change minus the event's stats,
while the rows give the week's totals; no note repeats the event's mood), green when its effects
only helped, red when they only hurt, amber when mixed (`effectsTone`, `data-tone`); it is named
as a cause only of what its effects change. An answered event's headline takes the same tone. The dialog carries its
headline's tone as `data-tone`.

Everything comes from the controller's last step (`before`, `input`, `after`) through the pure
view model `screens/model/week.ts` (`weekSummary`, tested on real seasons and on the content's
luck events). It reads the step with `stepLog` and `resolveLoggedEvent` of `@falconess/race-view`,
the same reading the CLI's week summary makes, so the browser's block and the terminal's 🎲 line
name the same event, texts, stats, mood and vigor. Read once, it does not
open again: `GameController.acknowledgeStep()` marks it in the snapshot (`lastStepSeen`) and in
localStorage (`falconess.pruebas.vista`, the run's `runFingerprint`, guarded); a load rebuilds the
last step and opens it unless this browser already read that week of that very run. The one-line
recap above the actions («Lo que pasó · Semana 4: …», `#turno-semana-pasada`) brings it back
(«Ver de nuevo»). Ids: `semana-dialogo`, `semana-titulo`, `semana-cambios`, `semana-continuar`,
`semana-ver-carrera`, `semana-consejo` (+ `-explicacion-breve|completo`), `semana-evento-espera`.

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
- Umamusume's tip after a race (`race/advice.ts`, `AdviceNote.tsx`): race-view's `raceAdvice`
  (up to two causes the log shows, the costliest first, each naming the stat that governs it in
  the engine or the workshop) worded with `ui.advice.*` keys, the cause's and the stat's emoji
  around the words: "¡Peregrina se quedó sin físico a los 1589 m! Quizás deberías entrenar
  Resistencia.", the log's numbers below (brief, or full with what the stat does). It opens the
  "Por qué" of any runner but the winner; after a goal race finished 3rd or worse it is also in
  that week's «Lo que pasó» and, when that race ended the season, on SeasonEnd. A runner 3rd or
  worse with nothing to train is told so.
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
  simple policy (`play.ts`: first event option, rest at vigor 40 or less, else train the lowest
  stat); new seasons play ruleset v2.
  The T12 goal race is replayed at ×8 to the finish and its classification must give the place the
  season recorded; SeasonEnd opens it again. Each season writes its timing to
  `.work/ui/timing/<falconess>.json`: about 8–10 s per season (60–65 decisions, ~130–150 ms
  each, the slowest ~230 ms, a race week included) with one worker on the production build; each
  decision includes reading «Lo que pasó» and closing it with Enter (before it: ~70 ms). The T12
  week is checked in «Lo que pasó» (place, goal) and replayed from its «Ver carrera».
- `run.spec.ts`: "Copiar partida" → "Cargar partida" in a fresh browser gives the same week,
  stats and vigor, and the loaded run plays on identically; "Continuar" after a reload; undo;
  storage blocked and the copy fallback (the text is selected).
- `free-race.spec.ts`: the default race, another course and seed, the neutral field.
- `advice.spec.ts`: a loaded run whose T12 race ends 7th: «Lo que pasó» with the place, the goal
  and the tip (brief and full; Enter on its switch switches, it does not close), the same tip atop
  the replay's "Por qué", none for the winner, and back on the season the week stays read, also
  after a reload; a resting run whose T24 race ends the season: «Lo que pasó» over SeasonEnd,
  then the tip on SeasonEnd; the same week at 390 × 700 fits with the tips' leads only.
- `week.spec.ts`: «Lo que pasó» after a training at 390 × 700 (modal, headline, changes with the
  vigor band, no inner scroll, inert page, no motion with reduced motion, Enter closes it, the focus
  comes back, the recap line opens it again), a failed training (agility every week until the curve
  catches her) closed with its button, the week's result before its event (Esc; the waiting line in
  the footer; the event's title takes the focus, so Enter does not hide it) and the answer's
  own result (a click outside), the reload rule (unread opens again, read does not), and a luck
  event's block (one of the content's `ev.luck-*` texts, its effects, its tone). `play.ts` reads it with Enter after
  every decision (`closeWeek`); `takeWeek` answers a waiting event first. v2 scenes are found by
  playing on, not pinned to one seed's draws, so new v2 content does not break them.
- `vigor.spec.ts`: the safe band's note names the risk flight's 12 %, as its card does; the vigor
  bar's band and every training's failure and injury chance after each of four trainings, against
  v2's curve written out in the test as an oracle; the cards' alarm at vigor 20 or less; the streak
  line above the cards and the mood drift in «Lo que pasó».
- `ruleset.spec.ts`: the owner's playtest 1 (`packages/sim/src/season/__fixtures__/`) loads as a
  v1 run, its last week's «Lo que pasó» over SeasonEnd, with its grade (B); a copy cut before week
  19 plays on under v1 (vigor 15, the forced rest, +40) and keeps v1 after a reload; a new season
  is v2.
- `explain.spec.ts`: one card's «Breve | Completo», then «Explicaciones» for every card; the
  default survives a reload and the card's own choice does not; the card in view stays put when
  the default changes; on a phone the switches open with «Ver detalle», the default sits at the
  screen's head, everything is 44 px and works with storage blocked.
- `artifact.spec.ts`: the built fragment against the page contract, then wrapped the way the host
  does it with every request but Google Fonts blocked, at the top level and inside a sandboxed
  iframe at 400 px (no storage, no clipboard, no horizontal scroll).
- `shots.spec.ts` (only with `test:e2e:shots`): Home, NewSeason, Turn with a crew, the workshop,
  an event, the T12 replay mid-race and at the finish, the free race, SeasonEnd, the Turn screen
  with vigor in the red (v2) and a v1 run at its forced rest, at 1280×800 and 390×844, light and
  dark, full page with real fonts; the screens with explanations twice,
  brief and full (`-brief`, `-full`). Each shot also checks that every form
  control has a stable id and, on the phone, that the page does not scroll sideways.
- `week-shots.spec.ts` (shots project): «Lo que pasó» for a good and a failed training, a drawn
  rest, a mood drift, an outing, a week with an event waiting, the event's answer, the T12 race, a
  7th place with its tip (brief and full) and v1's forced rest, and the Turn screen with the recap
  line, at 1280×800 and 390×844, light and
  dark, the viewport as the player sees it (`E2E_SHOTS_DIR`, else `.work/ui/shots-week/`).

The app tests answer Google Fonts with an empty stylesheet (the fallback stacks show), so they
need no network. Failures leave traces and screenshots in `.work/ui/e2e-results/`
(`pnpm --filter @falconess/web exec playwright show-trace <trace.zip>`).
