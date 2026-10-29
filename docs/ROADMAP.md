# Roadmap de desarrollo: Falconess (MVP y primeras pruebas jugables)

Versión 0.2 · 2026-10-27 · Fuente de verdad del diseño: `docs/BRIEF.md`

**Prioridades acordadas (v0.2):** la variedad del dominio va primero: personajes, stats, marcas y
sus reglas, estilos, bastidores, piezas, peculiaridades y habilidades. El gacha y el multiplayer
salen del foco del MVP; su arquitectura se conserva (ver principio 7) para incorporarlos después
sin reescribir.

Este roadmap convierte el brief en un plan de 30 días hábiles con cinco fases, cuatro pruebas jugables
y un hito de decisión. El arte queda fuera de alcance: toda la presentación del MVP usa formas
geométricas y texto. Cuando el documento se desvía del brief lo dice de forma explícita y la
desviación requiere un ADR en `docs/decisions/` antes de aplicarse.

---

## 1. Principios del roadmap

1. **Jugable antes que bonito.** La primera prueba jugable ocurre en la semana 1, en texto, desde
   `apps/cli`. El brief prohíbe escribir _interfaz_ antes de que el motor sea determinista; una
   CLI interactiva no es interfaz, es una herramienta de `apps/cli`, y es la forma más barata de
   validar el loop de 48 turnos antes de invertir en React y Phaser.
2. **Orden de construcción obligatorio (brief §1):** núcleo de simulación con pruebas → motor de
   carrera y simulador por lotes → esquemas y contenido → interfaz. Ninguna fase arranca sin el
   criterio de aceptación de la anterior cumplido con un comando.
3. **Cada hito se verifica con un comando, no con una opinión.** Los criterios de aceptación de
   cada fase son los del brief §14, desglosados por día.
4. **El lote aprueba el balance.** Ningún número de `rulesets/v1/constants.ts` cambia sin reporte
   de `pnpm sim:batch`. Las sesiones de balance se limitan a un día por fase.
5. **Una tarea por sesión de Claude Code.** Cada tarea de este roadmap está pensada para caber en
   una sesión con un subsistema a la vez.
6. **Arte: cero.** Rectángulos, círculos, colores de paleta de fabricante y texto. Nada más hasta
   el hito de decisión del día 30.
7. **Puertas abiertas.** Todo lo recortado deja su base lista: los esquemas de `GachaPool`, `Build`
   y `BlackBox` existen desde la fase 1 aunque no tengan pantalla; el estado se guarda como semilla
   más `RunInput[]`; todo lleva `rulesetVersion`; `packages/sim` no tiene dependencias y compila para
   Deno; las monedas existen como campos del estado aunque solo las gaste el taller. Reincorporar
   gacha o ligas es agregar pantallas y una Edge Function, no tocar el núcleo.
8. **Variedad primero.** Cada entidad que puede variar (Falconess, fabricante, estilo, bastidor,
   pieza, peculiaridad, habilidad, segmento) se modela con su esquema completo y al menos un ejemplo
   de cada tipo antes de pulir cualquier pantalla. El motor se diseña para que agregar una sexta
   Falconess o un sexto fabricante sea un JSON más y, a lo sumo, una regla nueva en `sim/rules/`.

**Definición de hecho por tarea:** test que falla primero → implementación → `pnpm typecheck && pnpm test`
en verde → fórmula documentada en `docs/formulas.md` si aplica → commit pequeño con prefijo
`feat/fix/balance/content/docs` → una línea en "Lecciones aprendidas" de `CLAUDE.md`.

---

## 2. Vista general

| Fase                              | Días    | Objetivo                                                                                             | Hito de salida                                                               | Prueba jugable                         |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| 0. Bootstrap                      | D1–D2   | Monorepo, tooling, CLAUDE.md, hooks, CI                                                              | `pnpm typecheck && pnpm test` en verde en CI                                 | —                                      |
| 1. Núcleo de temporada            | D3–D7   | PRNG, esquemas, `advanceSeason` con 8 acciones, 3 Falconess, Boneyard                                | `pnpm sim -- --seed 42` idéntico en dos ejecuciones; ≥ 40 tests              | **PT0** (D7): temporada en texto       |
| 2. Motor de carrera y lote        | D8–D14  | `simulateRace`, 5 reglas, 10 bastidores, 15 habilidades, `RaceLog`, golden, `sim:batch`              | 10.000 carreras < 60 s; bench < 5 ms; 7 métricas en rango o ADR              | **PT1** (D14): carreras en texto       |
| 3. Herencia, economía y contenido | D15–D21 | Caja negra, `grade`, monedas, gacha puro, 40 eventos, biblias de voz, política de referencia         | `content:gen` ≥ 80 % válidos; `evals:voice` ≥ 0,85; política logra B en 60 % | —                                      |
| 4. Interfaz web                   | D22–D28 | `apps/web` completa: calendario, hangar, taller, pre-carrera, escena Phaser, uPlot, export, guardado | E2E Playwright pasa; temporada completa < 45 min                             | **PT2** (D28): interna, 3–5 personas   |
| 5. Publicación                    | D29–D30 | Build en itch.io, telemetría mínima, cuestionario                                                    | Página pública con build jugable                                             | **PT3** (D30–D37): 10 testers externos |
| Decisión                          | D37     | ¿6 de 10 testers quieren una segunda temporada?                                                      | Sí: encargar prueba de arte y abrir página de Steam. No: revisar el loop     | —                                      |

Los días son hábiles y relativos al primer commit. Si el proyecto es a tiempo parcial, cada "día"
es una unidad de trabajo de 6–8 horas y el calendario se estira sin cambiar el orden.

---

## 3. Detalle por fase

### Fase 0 · Bootstrap (D1–D2)

**Objetivo:** que el primer test útil se pueda escribir el D3 sin fricción de tooling.

Tareas, en orden:

- [x] D1 · Monorepo pnpm con `packages/{rng,schema,sim,content}` y `apps/cli`. `ui-kit` y `apps/web`
  se crean en la fase 4, no antes.
- [x] D1 · TypeScript `strict` + `noUncheckedIndexedAccess`; `tsconfig.base.json`; `.nvmrc`; `engines`.
  Verificar versiones con `pnpm view <paquete> version` antes de fijarlas.
- [x] D1 · Vitest + fast-check, Biome, tsx. Scripts raíz: `typecheck`, `test`, `test:golden`,
  `content:validate`, `sim`, `sim:batch` (los últimos tres como stubs que fallan con mensaje claro).
- [x] D1 · Guardia de pureza de `packages/sim`: test en Vitest que recorre los fuentes y falla si
  encuentra `Math.random`, `Date`, `Math.pow`, `Math.sin`, `Math.cos`, división flotante marcada
  o imports de `react`, `phaser`, `@supabase`. Es más fiable que depender de una regla de lint
  custom y corre en cada commit.
- [x] D2 · `CLAUDE.md` (copiar del brief §13), `.claude/settings.json` con los tres hooks,
  `guard-protected-paths.mjs`, `related-tests.mjs`. Contrastar sintaxis con la documentación
  vigente de Claude Code antes del commit.
- [x] D2 · Subagente `sim-reviewer.md` (el único necesario en semanas 1–2). `balance-analyst`,
  `content-generator` y `voice-reviewer` llegan en las fases 2 y 3.
- [x] D2 · `docs/BRIEF.md`, `docs/formulas.md` (esqueleto con una sección por fórmula del brief §6),
  `docs/decisions/ADR-0000-template.md`, `docs/world.md` (esqueleto).
- [x] D2 · GitHub Actions: `typecheck`, `test`, `content:validate`. El job `sim:batch` se agrega en D14.

**Criterio de aceptación:** CI en verde con el test de pureza y un test de humo por paquete.

**No se hace:** Phaser, React, Supabase, generadores, skills de Phaser.

---

### Fase 1 · Núcleo de temporada (D3–D7)

**Objetivo:** una temporada completa de 48 turnos, determinista, jugable en texto.

Tareas, en orden:

- [x] D3 · `packages/rng`: xoshiro128** con semilla derivada de string (hash estable), streams
  `training`, `events`, `race`, `gacha`, `quirks`, estado serializable. Punto fijo: `mul`, `div`
  con redondeo definido, `clamp`. Tests: vectores conocidos, independencia de streams, misma
  semilla → misma secuencia tras serializar y restaurar.
- [x] D3 · `packages/schema/core.ts`: `Slug`, `Stat`, `Aptitude`, `Style`, `Biome`, `SegmentType`,
  `FalconessStats`, `Falconess`, `Manufacturer` (con `Crew`), `Frame`, `Part`, `Quirk`.
  `Event`, `Course`, `Skill` se completan en D5 y D8.
- [x] D4 · `SeasonState` y `RunInput` (8 acciones del brief §8). `loadContent()` con índice único y
  resolución de referencias por id; id inexistente = error de carga.
- [x] D4 · `sim/season`: stats efectivas (ánimo × aptitud, enteros), fatiga, 5 entrenamientos con
  fallo y lesión, `rest`, `outing`, `workshop` (equipar bastidor y piezas, reparar, re-sortear
  peculiaridades con `scrap`). Propiedades fast-check: ningún recurso negativo, stats en 1–1200,
  `fatigue ≥ 80` fuerza descanso.
- [x] D5 · Hangar: hasta 4 bastidores, presencia de cuadrilla 35 % + 5 %·vínculo, bonificaciones de
  entrenamiento. Eventos: esquema `Event`, selección por peso con stream `events`, eventos de
  historia con turno fijo y `handwritten: true`.
- [x] D5 · Carreras objetivo con **motor provisional**: hasta que exista `simulateRace` (fase 2), la
  carrera objetivo se resuelve con un `raceStub` determinista que ordena por suma ponderada de
  stats efectivas más ruido del stream `race`. Vive en `sim/race/stub.ts`, se borra en D12 y
  ningún test golden lo usa. Fin de temporada al fallar un objetivo.
- [x] D6 · Contenido mínimo: `falconess/{peregrina,cernicala,caracara}.json`, `manufacturers/boneyard.json`,
  `frames/{mule,kite}.json`, `quirks.json` (12), 6 eventos escritos a mano (2 por Falconess),
  `text/es.json`. `pnpm content:validate` con verificación de `textKey`.
- [x] D6 · `apps/cli`: `pnpm sim -- --seed <n> --falconess <id>` imprime la temporada turno a turno
  con una política fija "entrenar la stat más baja". Test de determinismo: dos ejecuciones,
  salida idéntica byte a byte.
- [x] D7 · `apps/cli`: `pnpm play -- --seed <n>` modo interactivo por `readline`: muestra stats,
  fatiga, ánimo, cuadrilla presente, pide la acción, muestra el evento y sus opciones. Es el
  banco de pruebas de **PT0**. No es interfaz: no tiene estado propio, solo llama a `advanceSeason`.

**Criterio de aceptación (brief §14, semana 1):** `pnpm sim -- --seed 42 --falconess peregrina` idéntico
en dos ejecuciones; `pnpm test` en verde con ≥ 40 tests; `content:validate` pasa.

**Estado (2026-10-27): cumplido.** 82 tests en verde, salida de `pnpm sim` idéntica byte a byte,
`content:validate` en verde. Se adelantó `pnpm sim:season-batch` (D17) para calibrar la curva:
la política de referencia termina con stats 575–620 y completa el 83–96 % de las temporadas con el
motor provisional. Pendiente de PT0.

**Entregable extra respecto al brief:** `pnpm play`. Justificación: permite PT0 tres semanas antes
de la primera pantalla.

---

### Fase 2 · Motor de carrera y simulador por lotes (D8–D14)

**Objetivo:** `simulateRace` pura, rápida, determinista, con todas las reglas del brief §6 y §7, y el
lote que mide las 7 métricas.

Tareas, en orden (cada día cierra con un test de propiedad nuevo):

- [x] D8 · `Course` y `Segment`, fases, `RaceEntry` congelada, tick de 1/15 s, `v_cruise` y `accel`
  en enteros con escala 1000, `hp_drain` con cuadrado como producto entero. Solo `flat`.
  Propiedades: más `agility` nunca da peor tiempo en `flat`; dos builds iguales empatan.
- [x] D9 · Boost, `energy`, `heat`, `dissipation`, penalización ×0,92, `durability` y su caída al 25 %.
  Los 4 controladores de estilo (`dive`, `hover`, `glide`, `ground`) con sus decisiones de boost.
- [x] D10 · Segmentos `climb`, `descent`, `curves`, `water`, `canyon` con `f_seg`; `jump` con `lift`,
  fallo, ruta `ground` ×1,25. Fatiga final con Coraje.
- [x] D11 · Sprint final (cálculo único al entrar en fase final, recálculo si una habilidad devuelve
  energía). Esquema `Skill` completo; activación `max(1 − 90/I_eff, 0,2)` con orden determinista
  por tick → carril → id. 15 habilidades en JSON.
- [x] D12 · 5 `ManufacturerRule` en `sim/rules/` (`mass-thrust`, `regen`, `pulse`, `telemetry`,
  `repairable`). 10 pasivos de bastidor. `mods` de piezas y efectos de las 12 peculiaridades.
  10 bastidores + 3 firmas + 8 piezas en JSON. Borrar `raceStub` y conectar la carrera real a
  `advanceSeason`.
- [x] D13 · `RaceLog` con muestreo denso (cada tick en el primer segundo y últimos 25 m, cada 15 ticks
  en el resto), eventos (`skill`, `pulse`, `jumpOk`, `jumpFail`, `overheat`, `finish`), márgenes
  en milímetros. 12 golden en `tests/golden/v1/`. Benchmark en `packages/sim/bench/`: 8
  corredoras, 3.000 m, objetivo < 5 ms.
- [x] D13 · Bioma del MVP: `desert` (recomendado, ver §7) con 3 pistas: `desert-sprint` (1.200 m,
  `flat` + `curves`), `desert-ridge` (2.000 m, `descent` + `jump` + `flat`), `desert-canyon`
  (3.000 m, `climb` + `canyon` + `flat`). Cubren los cuatro estilos y los tres fabricantes del MVP.
- [x] D14 · `pnpm sim:batch -- --runs 10000 --report out/balance.json` con las 7 métricas del brief
  §12 y diff contra línea base. Job de CI que pega el reporte en el PR. Opcional: verificación
  Node = Deno con `deno run` sobre el bundle ESM de `sim` (una semilla, un hash).
- [x] D14 · `apps/cli`: `pnpm sim:race -- --seed <n> --course <id> --entries <archivo>` imprime la
  clasificación, los eventos y una línea de tiempo ASCII por corredora (posición cada 10 % de la
  pista). `pnpm play` ya corre carreras reales. Banco de pruebas de **PT1**.
- [x] D14 · Subagente `balance-analyst.md` y comando `/balance-report`. Primera pasada de balance
  (un día como máximo; lo que no entre en rango lleva ADR con el objetivo movido).

**Criterio de aceptación (brief §14, semana 2):** 10.000 carreras en < 60 s; métricas dentro de rango
o con ADR; determinismo Node = Deno verificado; benchmark < 5 ms; 12 golden idénticos.

**Estado (2026-10-28): fase 2 completa.** Diseño en `docs/race-engine.md` con ADR-0003 aceptada
(D1-D56). `simulateRace` reproduce el prototipo del spec; 8 corredoras en 3000 m tardan ≈ 3 ms
(p95 3,1 ms). La temporada corre carreras reales con `generateField`. `sim:race`, `sim:batch` (8
escenarios, 7 métricas, CI que comenta en el PR) y 12 golden (ADR-0004) en verde. Dos pasadas de
balance (ADR-0005) con decisiones del dueño: potencia comprimida con alas rotas al 75 %, temporada
más exigente (≈ 49 % de carreras objetivo ganadas) y estadística de la métrica 3 sin falsos
fallos. Perfil completo: ninguna métrica falla (2, 3 y 5 con una casilla en el borde). Pendientes
para el dueño en ADR-0005: Peregrina gana más que las otras dos, la política de referencia no
llega a aprender habilidades y el desgaste de durabilidad casi no pesa en la temporada. La
verificación Node = Deno sigue opcional.

**Riesgo a vigilar desde D8:** rendimiento. Si al D10 una carrera supera 5 ms, se detiene la fase
y se optimiza (sin asignaciones por tick, arrays tipados, log muestreado y no por tick completo).

---

### Fase 3 · Herencia, economía y contenido (D15–D21)

**Objetivo:** cerrar el loop entre temporadas (caja negra, grade, monedas) y llenar el juego con
contenido suficiente para que 48 turnos no se repitan.

Tareas, en orden:

- [ ] D15 · `grade` G–SS en función de stats, resultados y habilidades. `BlackBox` con factores
  `stat`, `aptitude`, `skill`, `frameAffinity`. Herencia de dos cajas al turno 0 con stream
  `training`, resultado registrado en los `RunInput` iniciales.
- [ ] D16 · Economía mínima: `feathers` por `grade`, `scrap` por carreras y desguace, costo creciente
  de re-sorteo. Esquema `GachaPool` en `schema` y `content/gacha.json` validado, sin función de
  tirada ni pantalla (fuera de foco; base lista). Tests de invariantes anti pay-to-win 1, 3 y 4
  en `economy.test.ts`; el 2 (genérico/firma 0,85–0,90) lo mide el lote. El 5 (clase Chatarra)
  se posterga con el multiplayer.
- [ ] D17 · `tools/policies/lowest-stat.ts` y `pnpm sim:season-batch -- --runs 1000`: la política de
  referencia juega temporadas completas sin interfaz y reporta distribución de `grade`, stats
  finales y `feathers`. Objetivo: B en el 60 % de los casos. Ajustar ganancias de entrenamiento
  del brief §8 contra la curva 550–800. Estado con el ruleset v2 (ADR-0006 «Consecuencias»): la
  referencia es la política cuidadosa; con el simulador del estudio (`b3722b5`, vigor +5) llega a B
  o mejor en el 72 / 63 / 85 % de las temporadas de Caracara, Cernícala y Peregrina (1500 cada una:
  pasan las tres; Cernícala queda inconclusa en cada base de 500), y `sim:batch` mide v2 por
  defecto.
- [ ] D18 · Biblias de voz `docs/characters/{peregrina,cernicala,caracara}.md` (escritas a mano) y
  `docs/world.md`. 10 eventos de historia escritos a mano (`handwritten: true`), 3–4 por Falconess.
- [ ] D19 · `tools/generators/` para `events`, `skills`, `quirks` con salidas estructuradas del SDK de
  Anthropic (esquema zod → JSON Schema), `rules.ts` de cotas, escritura en `_candidates/`,
  `pnpm content:promote`. Prompts versionados en `tools/prompts/`. Contador de gasto en
  `tools/.usage.json`, tope 50 USD.
- [ ] D20 · Generar y promover los 30 eventos restantes (cuadrilla, aleatorios, resultado de carrera)
  hasta llegar a 40. Subagente `content-generator.md` y comando `/new-event`.
- [ ] D21 · `tools/evals/voice/` con 30 situaciones golden por Falconess, juez con rúbrica,
  `pnpm evals:voice <id>`, calibración con 20 situaciones juzgadas a mano. Subagente
  `voice-reviewer.md`. Segunda pasada de balance con `sim:batch` y `sim:season-batch`.

**Criterio de aceptación (brief §14, semana 3):** `content:gen events` ≥ 80 % válidos;
`evals:voice` ≥ 0,85 en las tres; política de referencia logra B en el 60 %.

**Recorte permitido si la fase se atrasa:** la evaluación de voz se corre solo para Peregrina antes
de PT3 y las otras dos pasan a la semana 5. Los 40 eventos y la caja negra no se recortan: sin
ellos PT3 no puede medir si alguien quiere una segunda temporada.

---

### Fase 4 · Interfaz web (D22–D28)

**Objetivo:** una temporada completa jugable en navegador en menos de 45 minutos, con placeholders
geométricos. Ninguna pantalla recalcula nada: React refleja `SeasonState`, Phaser reproduce `RaceLog`.

Decisión previa (D21, ADR): vista de carrera. Recomendación: **lateral**. La pista de v0 es
unidimensional y sin carriles, los saltos son el evento más legible y la vista lateral se dibuja con
rectángulos. La cenital gana sentido cuando lleguen carriles y bloqueos (v1).

Tareas, en orden:

- [ ] D22 · `apps/web` con Vite + React 19 + CSS Modules; `packages/ui-kit` con tabla de stats,
  barra de recursos y calendario. Pantallas: **Nueva crianza** (elegir Falconess, 4 bastidores
  para el hangar, 2 cajas negras) y **Turno** (panel de stats, fatiga, ánimo, cuadrilla presente,
  8 acciones). Las carreras se muestran como tabla de resultados, sin escena todavía.
- [ ] D23 · **Evento** (modal con opciones), **Taller** (equipar, reparar, re-sortear con costo
  visible), **Pre-carrera** (elegir bastidor del hangar, ver las 8 entradas y la pista por segmentos).
- [ ] D24–D25 · Escena Phaser 4 que lee `RaceLog`: pista lateral por segmentos coloreados por tipo,
  una figura por corredora con color de fabricante, marcadores de eventos (boost, ráfaga, salto,
  sobrecalentamiento), velocidad ×1 / ×2 / saltar al final. Instalar las skills oficiales de
  Phaser en `.claude/skills/` antes de empezar. Si al cierre de D25 la escena no reproduce el log
  completo, plan B: canvas 2D sin Phaser para el MVP y ADR que lo registre.
- [ ] D26 · **Post-carrera** con uPlot: curvas de `v`, `energy`, `heat`, `hp` por corredora con los
  eventos marcados. **Fin de temporada**: `grade`, caja negra, exportar `Build` como JSON y como
  imagen (canvas). Guardado local en `localStorage` como semilla + `RunInput[]` + `schemaVersion`;
  cargar reproduce.
- [ ] D27 · Playwright E2E: crear crianza, 48 turnos con acciones fijas, ver carrera, exportar `Build`,
  sin errores de consola. Pulido de flujo: atajos de teclado, botón "repetir acción", resumen de
  turno en una línea.
- [ ] D28 · **PT2** interna (ver §4). Corrección de bloqueantes el mismo día.

**Criterio de aceptación (brief §14, semana 4):** E2E pasa; una temporada completa en navegador en
< 45 min medida con cronómetro en PT2.

**No se hace:** animaciones de personaje, retratos, audio, gacha en pantalla (ver §5), ajustes
visuales que no cambien la legibilidad de la simulación.

---

### Fase 5 · Publicación y prueba externa (D29–D30, observación hasta D37)

- [ ] D29 · `vite build` estático; página en itch.io con arte provisional (texto y formas); nota
  "prototipo de mecánicas, sin arte". Botón **Exportar partida** que descarga un JSON con semilla,
  `RunInput[]`, `grade` y tiempos por turno: es la telemetría del MVP sin Supabase.
- [ ] D29 · Cuestionario de PT3 (10 preguntas, §4) en un formulario en línea; enlace dentro del juego
  al cerrar la temporada.
- [ ] D30 · Reclutar 10 testers externos (no amigos del proyecto si es posible), enviar build y
  cuestionario. Abrir hoja de seguimiento: tester, temporadas jugadas, grade, tiempo, respuestas.
- [ ] D31–D37 · Observación. No se tocan reglas ni balance durante la ventana salvo bloqueantes.
  Se registran preguntas de los testers sin responder "cómo funciona" para medir la legibilidad.
- [ ] D37 · **Hito de decisión** (brief §14): ≥ 6 de 10 juegan una segunda temporada sin que se les
  pida → prueba de arte (Peregrina en tres estados y su bastidor firma) y página de Steam. Si no,
  revisión del loop con los datos exportados antes de gastar en arte.

---

## 4. Plan de pruebas jugables

Cada prueba tiene un propósito único, una pregunta que responde y un criterio de salida. Las
pruebas no se mezclan: PT0 no evalúa carreras, PT3 no evalúa balance.

|                  | PT0 · Loop en texto                                                           | PT1 · Carreras en texto                                                                       | PT2 · Web interna                                                                  | PT3 · Externa itch.io                                                 |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Día**          | D7                                                                            | D14                                                                                           | D28                                                                                | D30–D37                                                               |
| **Banco**        | `pnpm play`                                                                   | `pnpm play` + `pnpm sim:race`                                                                 | `apps/web` local                                                                   | Build pública                                                         |
| **Quién**        | Diseñador                                                                     | Diseñador + 2 personas que conozcan Umamusume                                                 | 3–5 personas, al menos 2 sin conocer el brief                                      | 10 testers externos                                                   |
| **Formato**      | 2 temporadas completas, una con cada política (manual y "stat más baja")      | 20 carreras: 10 con entradas iguales salvo estilo, 10 con builds del lote                     | 1 temporada completa cada uno, cronometrada, con observador en silencio            | Libre, 1 semana, cuestionario al cierre                               |
| **Pregunta**     | ¿Las 8 acciones son decisiones o rutina? ¿48 turnos pesan?                    | ¿Se entiende por qué ganó quien ganó leyendo la línea de tiempo y los eventos?                | ¿Se juega en < 45 min? ¿Dónde se traban?                                           | ¿Quieren una segunda temporada?                                       |
| **Se mide**      | Turnos de descanso forzado, turnos sin decisión real, nº de eventos repetidos | Aciertos al predecir ganador antes de la carrera; aciertos al explicar el resultado después   | Tiempo total, tiempo por turno, errores de consola, preguntas hechas al observador | Temporadas por tester, grade, tiempo, respuestas, partidas exportadas |
| **Sale bien si** | Menos de 6 descansos forzados por temporada; eventos repetidos < 3            | Explicación correcta en ≥ 7 de 10 carreras tras ver la línea de tiempo                        | 4 de 5 terminan en < 45 min sin ayuda                                              | ≥ 6 de 10 juegan segunda temporada                                    |
| **Si sale mal**  | Reducir turnos vía constante (36), subir impacto de eventos, revisar fatiga   | Ampliar `RaceLog` con los datos que faltaron; añadir marcadores; revisar legibilidad en uPlot | Recortar pasos del turno, resumen automático, atajos                               | Revisar loop con datos exportados antes de arte                       |

**Cuestionario PT3 (10 preguntas):** 1) ¿Terminaste la primera temporada? 2) ¿Empezaste otra sin que
te lo pidieran? 3) ¿Entendiste por qué ganaste o perdiste la última carrera? 4) ¿Qué estilo elegiste y
por qué? 5) ¿Qué decisión de entrenamiento te costó más? 6) ¿El taller cambió algún resultado? 7) ¿Qué
evento recordás? 8) ¿Cuánto tardó la temporada? 9) ¿Qué sacarías? 10) ¿Qué te faltó para seguir?

---

## 5. Alcance del MVP: dentro, fuera y recortes propuestos

**Dentro (brief §1):** 3 Falconess, 1 bioma con 3 pistas, 4 bastidores gacha (uno por fabricante) +
2 Boneyard, 3 firmas, 8 piezas, 15 habilidades, 40 eventos, 12 peculiaridades, 1 temporada completa
en navegador, caja negra y herencia, exportación de `Build`, guardado local, itch.io.

**Fuera (brief §1 y §14):** dinero real, multiplayer, Supabase, audio, localización (solo claves),
Claude en runtime, build de escritorio, Falconess 4–6, biomas 2–5, arte.

**Recortes propuestos respecto al brief (cada uno requiere ADR):**

| Recorte                           | Qué dice el brief                                | Propuesta                                                                                                                                       | Por qué                                                                                                                            |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Gacha                             | §9: gacha completo en v0 sobre moneda ganada     | Fuera de foco. Queda el esquema `GachaPool`, el JSON validado y las monedas en el estado. Tirada y pantalla, después del MVP                    | PT3 mide si alguien quiere una segunda temporada, no si quiere tirar. El hangar del MVP se arma con los 6 bastidores desbloqueados |
| Multiplayer y Deno                | §10: preparación desde v0                        | Fuera de foco. Se conservan las cinco decisiones de arquitectura que lo hacen posible; la verificación Node = Deno pasa a tarea opcional de D14 | No cambia el núcleo; solo se evita gastar tiempo en tooling de Deno ahora                                                          |
| Generadores                       | §11: generadores de `skills`, `events`, `quirks` | Generador completo solo para `events`; `skills` y `quirks` del MVP se escriben a mano (15 y 12 ítems)                                           | Son pocos ítems y el generador cuesta más que escribirlos                                                                          |
| Evaluación de voz                 | §14: 3 Falconess a ≥ 0,85                        | Peregrina obligatoria antes de PT3; las otras dos si queda tiempo en D21                                                                        | Protege la fecha de PT3 sin tocar el contenido jugable                                                                             |
| Carreras en texto antes de la web | §1: sin interfaz hasta determinismo              | `pnpm play` y `pnpm sim:race` en `apps/cli`                                                                                                     | No es interfaz; adelanta PT0 y PT1 tres semanas                                                                                    |

---

## 6. Riesgos y mitigaciones

| Riesgo                             | Señal temprana                     | Mitigación                                                                                                               | Cuándo se verifica           |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Carrera > 5 ms rompe el lote en CI | Bench de D13                       | Sin asignaciones por tick, `Int32Array` por corredora, log muestreado; si no alcanza, lote de 5.000 en CI y 10.000 local | D10 (bench provisional), D13 |
| Node ≠ Deno                        | Hash distinto en D14               | Sin dependencias en `sim`; evitar `Intl`, `TextEncoder` en caminos calientes; comparar hash en CI                        | D14                          |
| Simulación opaca                   | PT1 < 7/10 explicaciones correctas | Ampliar `RaceLog` con la causa de cada cambio de velocidad; marcadores en uPlot y en la escena                           | D14, D28                     |
| 48 turnos pesan                    | PT0 reporta rutina; PT2 > 45 min   | `turnsPerSeason` como constante del ruleset; "repetir acción"; resumen de turno en una línea                             | D7, D28                      |
| Phaser consume la semana 4         | D25 sin reproducción completa      | Plan B canvas 2D; skills oficiales de Phaser instaladas antes de D24                                                     | D25                          |
| Balance sin fin                    | Más de un día por pasada           | Pasadas con límite de tiempo; lo que no entra en rango lleva ADR, no otra iteración                                      | D14, D21                     |
| Contenido insuficiente             | PT0 ve eventos repetidos           | 40 eventos como mínimo no negociable; 10 de historia escritos a mano                                                     | D20                          |
| Sin telemetría en PT3              | Testers no envían nada             | Botón de exportar partida con JSON pequeño y cuestionario enlazado al cierre                                             | D29                          |

---

## 7. Decisiones que conviene tomar antes de D1

Ninguna bloquea la fase 0. Se recomienda cerrarlas con ADR antes de la fase indicada.

1. **Pruebas en texto desde `apps/cli` (PT0 y PT1).** Decidido: sí.
2. **Gacha fuera del MVP.** Decidido: sí; queda esquema, JSON y monedas como base.
3. **Bioma del MVP.** Recomendación: `desert`. Es casa de Kōryū (Peregrina), débil para Steinhaus, y
   sus tres pistas pueden cubrir `curves`, `descent`, `jump`, `climb` y `canyon` sin forzar el bioma.
   Alternativa: `urban` (casa de Altair y Lumière). Antes de D13.
4. **Vista de carrera.** Recomendación: lateral. Antes de D22.
5. **Avatar del jugador** (entrenador/a con presencia o taller sin rostro). Afecta el tono de los 40
   eventos. Recomendación para el MVP: taller sin rostro, los eventos hablan en segunda persona; es
   reversible y no gasta arte. Antes de D18.
6. **Ritmo real del calendario** (tiempo completo o parcial) para traducir D1–D37 a fechas.

---

## 8. Definición de MVP terminado

El MVP está terminado cuando todo lo siguiente es verdadero el mismo día:

- `pnpm typecheck && pnpm test && pnpm test:golden && pnpm content:validate` en verde en `main`.
- `pnpm sim:batch -- --runs 10000` termina en < 60 s con las 7 métricas en rango o con ADR vigente.
- `pnpm sim -- --seed 42 --falconess peregrina` produce el mismo hash en dos ejecuciones.
- E2E de Playwright pasa en `main`.
- Una persona sin conocer el brief completa una temporada en navegador en < 45 min.
- Build pública en itch.io con el botón de exportar partida y el cuestionario enlazado.
- 10 testers externos recibieron la build.

El hito de decisión (D37) no forma parte de "terminado": es lo que se hace con el MVP terminado.

---

## 9. Después del MVP (orden tentativo, sin fechas)

1. Pantalla de gacha sobre `rollGacha` y moneda ganada.
2. Falconess 4–6 y biomas 2–5, con biblias de voz y evaluación para cada una.
3. Supabase: saves, firma de `Build`, ligas asíncronas, clase Chatarra (brief §10).
4. Carriles y bloqueos (v1) solo si el lote muestra que `hover` y `glide` son indistinguibles.
5. Prueba de arte y página de Steam (condicionadas al hito de decisión).
6. Audio, localización, escritorio.
