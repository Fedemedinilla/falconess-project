# ADR-0008: Posición de carrera elegida antes de largar

- Estado: **aprobado por el dueño (2026-11-02, paso 1 de la reconstrucción de las carreras); implementado
  en la rama `position-step1`, pendiente de que el líder lo integre**. La medición y la tarjeta de la web
  llegaron en etapas aparte (abajo).
- Fecha: 2026-11-02
- Alcance: schema (`core`, `falconess`, `season`, `build`, `race`, `blackbox`), content (las tres
  Falconess, `text/es.json`), sim (controlador, tablas de carrera, `freezeEntry`, campo de rivales,
  temporada, caja negra, golden), race-view, cli, web (los nombres; la tarjeta antes de la
  carrera, en una etapa aparte), docs (`race-engine.md` §3, §9, §10, §11, §20, §21, §23, §24;
  BRIEF §5; `formulas.md`; `commands.md`).
- Contexto de diseño: `docs/design/temporada-v3.md`, T21, «Paso 1 aprobado». Opción A del dueño
  para la letra de aptitud: **la letra pasa a la posición**.

## Contexto

Hasta ahora la posición no se elegía: venía con el **estilo de las alas**. Cada estilo tenía a la
vez un comportamiento (cuándo gasta energía: la fila de 9.4) y una física (sus términos de 9.8). El
dueño aprobó separarlos como primer paso de la reconstrucción de las carreras: la posición se elige
antes de cada carrera y decide **cómo administra la energía**; las alas ponen **su física**. Se
reutilizan los cuatro comportamientos que ya existen, sin vuelo nuevo, sin peleas y sin reglas
nuevas, y sin recalibrar ninguna constante.

## Decisión

1. **Cuatro posiciones** (`Position`, en `packages/schema/src/core.ts`), de adelante hacia atrás:

   | Id       | Texto   | Comportamiento (fila de 9.4)                                                 | Era la fila de |
   | -------- | ------- | ---------------------------------------------------------------------------- | -------------- |
   | `lead`   | Punta   | `GLIDE_CHASE`: persigue la punta en salida y media, guarda el 60 %           | Planeo         |
   | `pack`   | Pelotón | `GROUND_CONSTANT`: nivel parejo hasta la final (con la reserva de saltos)    | Rasante        |
   | `stalk`  | Acecho  | `HOVER_CATCHUP`: alcanza al pelotón medio, guarda el 50 %, planifica al 70 % | Suspensión     |
   | `closer` | Remate  | `DIVE_DESCENT`: gasta en descensos guardando el 50 % y en el sprint final    | Picada         |

   Textos en `es.json`: `position.<id>` y `position.<id>.brief`.

2. **Posición por defecto = la de las alas** (`DEFAULT_POSITION`): Planeo → Punta, Rasante →
   Pelotón, Suspensión → Acecho, Picada → Remate. Con ella la carrera es idéntica a la de antes.

3. **Todo parámetro de la fila sigue a la posición**: la condición, el resguardo (`diveKeep`,
   `hoverKeep`, `glideKeep`), la parte del tanque del Pelotón (`groundPreShare`), la retención de 12
   ticks (`styleHoldTicks`, Punta y Acecho), el punto del plan (`hoverAttackAt`, Acecho) y con él
   `capFinal`. Las constantes conservan sus nombres en `R.style` y los modos del log sus nombres de
   estilo (`glide-chase`, `ground-constant`, `hover-catchup`, `dive-descent`): los rulesets no se
   tocaron y los valores del log no cambian.

4. **Las alas conservan solo su física** (la lista completa, con lo que es cada término, está en
   `docs/race-engine.md` 9.9):

   | Término (9.7, 9.8, 14)                                                   | Es       | Queda en         |
   | ------------------------------------------------------------------------ | -------- | ---------------- |
   | Picada: empuje × 1,4 en descensos y en la final (`diveStoopPm`)          | física   | alas             |
   | Suspensión: rebufo × 1,02 en el pelotón medio, fase media                | física   | alas             |
   | Planeo: aceleración × 1,1 en la salida (`glideStartAccelPm`)             | física   | alas             |
   | Planeo: desgaste × 0,98 mientras lidera (`glideLeadDrainPm`)             | física   | alas             |
   | Rasante: ruta × 1,1 sin despegue ni aterrizaje; empuja en el salto       | física   | alas             |
   | Rasante: todo daño de durabilidad × 0,5 (`groundDamagePm`)               | física   | alas             |
   | Reserva de saltos, `kickAt`, distancia con empuje del plan (vuelan o no) | física   | alas             |
   | `stylePace` (multiplicador de crucero, todo 1000)                        | física   | alas             |
   | Planeo «gasta hasta quedarse con el 60 % para retomar la punta»          | conducta | posición Punta   |
   | Rasante «constante»                                                      | conducta | posición Pelotón |
   | Suspensión «se queda en el pelotón medio; ataca al 70 %»                 | conducta | posición Acecho  |
   | Picada «conserva energía y hp; gasta en descensos y en la final»         | conducta | posición Remate  |

   Ningún término de 9.8 decide cuándo se boostea: los cuatro son física y quedan en las alas.
   Lo que se mudó a la posición es la conducta que el texto del estilo describía junto a ellos.

5. **Pelotón con alas que vuelan.** La fila exige `energy − jr[seg] ≥ 40 %` del tanque, como
   siempre, y toda compuerta guarda `energy − costo ≥ jr`. El nivel se deriva como en 9.3, con la
   reserva de saltos descontada y solo sobre los ticks en que puede empujar:

   ```
   preTicks[b]   = Σ ceilDiv(tramo', vC[b][fase][s])   sobre los tramos con empuje de [0, finalStart)
                   (Rasante: los saltos al × 1,1 del desvío; las que vuelan saltean el salto)
   groundLevel[b] = min(sMax[b], fl(Bon[b] × max(0, fl(Emax × 600, 1000) − jrStart),
                                   max(1, preTicks[b]) × costOn))
   ```

   `jrStart` es la reserva de saltos de la largada (el `R` del primer salto, 14.4; 0 para Rasante).
   Para Rasante la fórmula es la de v1 número por número. Una que vuela llega a la final con el 40 %
   más la reserva de los saltos que faltan (Pista de saltos, T 600: 100 − 25 al nivel − 20 del primer
   salto = 55 = 40 + 15 del segundo, ± un tick) y no falla un salto que no fallaría sin boostear. Sin
   `jrStart` planearía 60 de energía donde solo puede gastar 25 antes de la reserva: se quedaría sin
   presupuesto a mitad de la fase media.

6. **La letra de aptitud pasa a la posición** (opción A). `Falconess.styleAptitude` →
   `positionAptitude`, una letra por posición: cada letra de estilo pasa a la posición por defecto de
   ese estilo (Peregrina: Remate A, Punta B, Acecho C, Pelotón E; Cernícala: Acecho A, Punta B,
   Remate C, Pelotón D; Caracara: Pelotón A, Punta B, Acecho C, Remate D). La letra de la posición
   elegida multiplica `intelligence` exactamente como lo hacía la del estilo de las alas. Las alas no
   tienen letra. Lo mismo en `SeasonState`, `Build`, `EntryInput` y la letra aplicada de `RaceEntry`.

7. **`preferredStyle` → `preferredPosition`** (campo, no derivado). Se eligió conservarlo como dato
   de contenido: derivarlo de la mejor letra pediría una regla de desempate que hoy no existe, y el
   campo solo tiene dos usos que no cambian de resultado: la temporada empieza con las primeras alas
   del hangar cuya posición por defecto es la preferida, y es la clave de reserva de la caja negra.

8. **Rivales:** corren en la posición de sus alas y llevan A en esa posición y B en las demás (la
   misma letra aplicada que antes). Todavía no eligen.

## Cambios de esquema

- `core.ts`: `Position`, `POSITIONS`, `DEFAULT_POSITION`, `PositionAptitudes`; se quita
  `StyleAptitudes`. `Style` queda (las alas).
- `Falconess`: `styleAptitude` → `positionAptitude`, `preferredStyle` → `preferredPosition`.
- `SeasonState.styleAptitude` → `positionAptitude`; `Build.styleAptitude` → `positionAptitude`.
- `BlackBox.factors.aptitude`: `kind: "style"`, `key: Style` → `kind: "position"`, `key: Position`.
  Ningún guardado tiene padres (la web, `pnpm play`, `pnpm sim` y los lotes empiezan con
  `parents: []`), así que no hace falta leer cajas viejas. En los empates la caja elige como antes
  (orden Remate, Acecho, Punta, Pelotón: el de los estilos dive, hover, glide, ground).
- `RunInput`: las entradas de acción (`train:*`, `rest`, `outing`, `workshop`) aceptan
  `position?: Position`. `start` y `event:choose` no (son estrictas). Una posición en una semana sin
  carrera objetivo es `InvalidInputError`.
- `RaceResultEntry.position` (obligatorio): la posición en que corrió.
- `EntryInput`: `styleAptitude` → `positionAptitude`; nuevo `position?: Position` (sin ella, la de las
  alas).
- `RaceEntry`: nuevo `position: Position`; `styleAptitude` → `positionAptitude` (la letra aplicada).
- `RunnerDerived.groundLevelMms` conserva su nombre: es el nivel del Pelotón, 0 en otra posición.

## Cómo se elige

- **Temporada:** la entrada de la semana de carrera lleva `position` opcional; sin ella corre en la
  de las alas con que corre (si el taller de esa semana cambia de alas, las nuevas). El log de la
  temporada la registra: en la entrada (`log[].input.position`, cuando se eligió) y en el resultado
  (`raceResults[].position`, siempre). `goalRaceSetup(ctx, state, goal, position?)` e
  `inputPosition(input)` permiten que un visor reconstruya la misma carrera.
- **CLI:** `pnpm sim:race -- --position lead|pack|stalk|closer` (con el campo de jugador; las
  rivales mantienen la suya); `pnpm play` la pregunta en la semana de carrera, después de la acción
  (Enter, o el número de la de sus alas, = la de sus alas, sin `position` en la entrada, como en la
  web), con su letra y su texto corto; la clasificación de `sim:race` muestra
  posición y letra de cada corredora y la línea de carrera de la semana dice en qué posición corrió.
  El consejo de Inteligencia nombra la letra y la posición.
- **Web:** una tarjeta de un toque antes de la carrera, con las cuatro posiciones de adelante hacia
  atrás (▲ Punta, ■ Pelotón, ◆ Acecho, ▼ Remate), su letra en cada una y una línea de cómo gasta;
  la de sus alas viene elegida y lo dice («La de sus alas»). En la semana de carrera va justo
  arriba de las acciones y la acción de la semana la confirma (el taller de esa semana la lleva
  también y dice en qué posición se corre después); en la carrera libre queda a la vista con
  «Correr la carrera» aunque el formulario esté plegado. Volver a tocar la de sus alas no es
  elegir: la entrada queda sin `position`, como antes. «Lo que pasó» y la repetición dicen en qué
  posición corrió y si era la de sus alas; las filas de aptitud llevan la forma de cada posición.

## Invariancia (prueba)

- **Carreras:** antes de tocar el código se grabaron 513 carreras (las tres pistas × turnos 0, 12,
  24, 36, 46 × las tres Falconess × los 11 bastidores posibles con `generateField`, más 18 campos de
  fixtures neutrales) y 48 temporadas (v1 y v2, tres Falconess, ocho semillas, política mixta).
  Después del cambio, con las posiciones por defecto: las 513 carreras dan el mismo log (resultados,
  frames, eventos, derivados) y las mismas entradas con la letra renombrada; las 48 temporadas, el
  mismo estado con la letra devuelta a su estilo y los mismos `raceResults` sin `position`.
- **Golden:** antes de regenerarlos, los 12 logs nuevos, deshechos los campos de ADR-0008
  (`position` quitado, `positionAptitude` → `styleAptitude`), son **idénticos** en JSON canónico a los
  archivos anteriores, bloque por bloque (`results`, `frames`, `events`, `derived`, `geometry`). El
  test `position.test.ts` deja fijados sus hashes de antes.
- **v1-invariance:** los digests de ADR-0007 (`v1-invariance-adr0007.json`) **no se regrabaron**: el
  test lleva el estado a la forma con que se grabaron (`legacyState`: letras de vuelta a los estilos,
  resultados sin `position`) y siguen dando igual, entrada por entrada (playtest 1 del dueño y las
  30 temporadas mixtas). Lo mismo en el test del controlador de la web.

## Golden y fixtures regenerados

- **Golden v1** (`tests/golden/v1`, 12 archivos): `pnpm golden:update -- --yes` dos veces; la segunda
  no escribió nada (idéntica byte a byte). Cambian solo por la forma de las entradas.
- **Fixtures de la CLI:** los logs se editaron a mano como en ADR-0007 (cada entrada gana `position`,
  la de su estilo, y `styleAptitude` → `positionAptitude`; los `--entries` movieron cada letra a su
  posición); el snapshot de `sim:race` se regeneró por la columna de posición.

## Medición

Medido sobre el motor de `e7e1a6c` (ruleset v2; las tres pistas; dos bases de semillas en cada
medida; Wilson para porcentajes, intervalo pareado para diferencias en la misma carrera). Los
commits posteriores no tocan el motor ni los datos de carrera; en la revisión se repitió una celda
(`fields.ts --base pos-a --runs 18000`, 4 procesos) y salió idéntica byte a byte. Informe
completo, con los scripts y los datos crudos: `.work/pos1/measure/informe-medicion.md` (local).

| Pregunta del dueño                                                                     | Resultado                                                                                                                                                                                                                                                                                             | Veredicto  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Ninguna posición gana siempre (18-32 % con stats iguales, ninguna > 38 % en una pista) | Campos de 8 con 2 por posición y las alas rotadas (18 000 carreras por pista y base): 21,0-28,7 % en todas; media de las 3 pistas Punta 24, Pelotón 23, Acecho 26, Remate 27                                                                                                                          | Pasa       |
| La mejor cambia según la pista                                                         | Remate es la mejor o empata en las tres (con Acecho en sprint, 28-29 %); ridge sale pareja (24-26 %); Pelotón es la peor en las tres. Por ala, solo Planeo cambia (sprint Remate, canyon Punta)                                                                                                       | No pasa    |
| Cuánto pesan las rivales                                                               | La mejor posición para un campo concreto difiere de la mejor sin mirar el campo en 0-1 % de los campos confirmados fuera de muestra (4 % con 7 rivales de las mismas alas; 0-0,1 % en carreras objetivo reales); elegir por campo gana 0 puntos                                                       | Casi nada  |
| Si elegir otra posición a veces paga                                                   | En las carreras objetivo de las tres Falconess (letras y stats reales), la posición de sus alas, donde tienen su A, es la mejor o empata en las 9 combinaciones Falconess × pista. Otra posición da mejor puesto en el 2-3 % de las carreras y peor en todas en el 9 %; salva un objetivo en el 0,1 % | Casi nunca |

Además:

- **La letra decide la elección.** Con todas las letras en B, Caracara y Cernícala corren casi igual
  en las cuatro posiciones (±2-3 puntos de victoria); Peregrina sigue necesitando Remate (−6 a −12
  puntos en sprint con otra): el empuje en picada de la final rinde si guarda energía para ella.
- **Matriz ala × posición** (stats y letras iguales): juntando las pistas, las 16 celdas quedan
  entre 10,4 y 14,9 % (media 12,5 %). Por pista pasan de 1,5 × la media las cuatro de Rasante en
  ridge (≈ 20 %, el ala) y Picada-Remate en sprint (20,5 %); bajan de 8 % Rasante-Punta y
  Rasante-Pelotón en sprint. Las alas pesan más que la posición: Rasante gana el 39 % en ridge y el
  16 % en sprint.
- **Temporada.** Con las posiciones por defecto, `pnpm sim:season-batch -- --runs 500` da la misma
  salida byte a byte que `3cd5e13`, en v2 y en v1. Ninguna tabla de posiciones por pista mejora la
  temporada de referencia: la de más victorias por pista es la de defecto salvo Cernícala en sprint
  (Punta), que pierde 1-2 puntos de la parte ≥ B; una mala elección cuesta hasta 12 puntos
  (Peregrina en la peor posición de cada pista: 80 → 68 % con B o más).
- Ninguna constante cambió. Lo que sugiere para el paso 2 (a decidir por el dueño): hoy la
  posición tiene poco peso propio y la de las alas siempre es la mejor, así que elegir solo puede
  costar.

## Revisión (dos revisiones: código y diseño; las dos aprobaron)

- **Textos que nombraban las alas o chocaban con las posiciones** (corregidos, la redacción es del
  dueño): los modos de la carrera («Por qué») decían «caza en planeo», «rasante constante»,
  «alcance en suspensión», «picada en bajada» aunque la corredora corriera en otra posición; ahora
  dicen lo que hace la posición: «caza de la punta», «ritmo parejo», «alcance al grupo medio»,
  «gasto en bajada». La marca de los últimos 60 m, su leyenda y el modo final decían «Remate»; ahora
  «A fondo». El botón de vista «Pelotón» es «Grupo». Los textos cortos de las posiciones ya no
  prometen de más (Punta deja de perseguir al 60 %, Pelotón sprinta en la final, Acecho ataca al
  70 % del recorrido); la tarjeta marca la elegida con «Corre en esta». Los ids del log no cambian.
- **CLI:** escribir el número de la posición de sus alas es no elegir, como en la web (la entrada
  queda sin `position`); una respuesta inválida dice «1-4 o Enter». En una semana con lesión el
  taller no cambia de alas, y la posición por defecto que muestran la CLI y la web lo respeta.
- **`goalRaceState`** rechaza una posición en una semana sin carrera, igual que `advanceSeason`.
- **`DEFAULT_POSITION`** está congelado (`Object.freeze`) como los rulesets.
- **Propiedades:** P4, P5 y P6 sortean posiciones distintas de la de las alas (la mitad de las
  corredoras), además de los tests dirigidos.
- **Pendiente del dueño:** rechazar una posición en una semana sin carrera es una regla nueva de
  validación (no cambia ninguna carrera); y la redacción de los textos de arriba.

## Consecuencias

- Una corredora puede correr en cualquier posición con cualquier alas (una Picada en Punta, un
  Planeo en Remate); su letra en esa posición pesa en sus decisiones.
- Las constantes `R.style.*` gobiernan ahora posiciones con nombres de estilo, y los modos del log
  también: renombrarlos sería otro ADR y moverían los golden.
- Guardados web (semilla + entradas): cargan y dan el mismo resultado; ninguna entrada vieja tiene
  `position`.
