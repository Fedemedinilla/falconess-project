# ADR-0006: Ruleset v2 de la temporada: vigor, curva de fallo, ánimo con peso y eventos al azar

- Estado: **aceptado (dueño, 2026-10-28)**. Las reglas y las constantes salen del estudio
  `.work/design2/fatiga-animo.md` (§9, recomendación D2 + M2 con rivales 60 + 11 y umbrales ×1,1),
  que el dueño aceptó; los eventos al azar son un pedido del dueño del mismo día. La sección
  «Eventos al azar: balance» la completa la etapa C con sus mediciones. Queda una diferencia con el
  estudio para el líder (sección «Pendiente»).
- Fecha: 2026-10-28
- Alcance: sim (`packages/sim/src/season/`, `packages/sim/src/rulesets/v2/`), schema
  (`TurnLogEntry`, `GameEvent`), content (`text/es.json`), cli (`--ruleset`)

## Contexto

El playtest 1 del dueño (Peregrina, semilla 397553, `.work/playtests/run1.json`) dejó cuatro quejas
sobre la temporada:

1. Apretar siempre Agilidad no costaba nada: el descanso forzado con fatiga 80 hacía de red y el
   fallo iba de 5 % a 7 %.
2. Leyó la fatiga al revés: esperaba una barra que se vacía.
3. El ánimo no pesaba: ni el malo castigaba ni el bueno se notaba.
4. Las temporadas eran fáciles.

Sus palabras, después de leer el estudio:

> «Excelentes recomendaciones. Hagamos eso. Fatiga cambia por Vigor que se vacia y se llena con
> Descansar. Animo con mas impacto. Probabilidad de fallar entrenamientos dependiendo del Vigor
> bajo.»

> «Agrega tambien eventos random, que pueden ser buenos o malos, los malos bajan el animo o el
> vigor, y los buenos pueden dar stats, vigor o animo.»

> «Hay que cambiar el lugar en donde sale el QUE SUCEDIO. Actualmente hay que subir hasta arriba
> para leer si fallo o no fallo. Debemos convertirlo en un popup. Rapido de leer, sencillo, e
> imposible que el player no lo vea. Ademas, de que no tiene que estar scrolleando tanto solo para
> ver que paso.»

El tercer pedido es de la interfaz; este ADR fija lo que el motor deja en el log para que la ventana
«Qué sucedió» pueda decir qué pasó y por qué (sección «El log dice por qué»).

El estudio midió unas 410 000 temporadas simuladas (500 por Falconess, variante y política; base
`batch-…` y confirmación con `alt1/batch-…`) con un prototipo del motor
(`.work/design2/fatigue/sim-scratch.diff`) y un arnés de políticas
(`.work/design2/fatigue/harness.ts`).

## Decisión

### D1. Ruleset v2 nuevo; v1 se conserva y las partidas nuevas empiezan en v2

Las reglas nuevas viven en `RULESET_V2` (`packages/sim/src/rulesets/v2/constants.ts`, commit
`0b6cdfc` del líder). `CURRENT_RULESET` (= v2) es el ruleset con el que empiezan las partidas
nuevas (`pnpm sim`, `pnpm play`, `pnpm sim:season-batch` y la web); una partida guardada sigue con
el `rulesetVersion` que trae (el guardado es semilla + entradas + versión, nunca el estado), y
`getRuleset("v1")` la reproduce para siempre (CLAUDE.md: los rulesets viejos no se borran).

El motor de la temporada lee cada campo nuevo, y en v1 esos campos tienen valores que hacen de cada
regla nueva un no-op **sin sorteos nuevos**: una sola opción de descanso no sortea, la deriva con
base y pendiente 0 no sortea, el modelo de fallo "linear" es la fórmula de v1, el puesto 9 nunca
llega con 8 corredoras, la tabla de ánimo de entrenamiento es la de carrera. `advanceSeason` y
`goalRaceState` rechazan un estado jugado con otro ruleset que el del contexto.

Prueba: `packages/sim/src/season/v1-invariance.test.ts` reproduce bajo v1 la partida del dueño
(`__fixtures__/playtest-run1.json`) y 30 temporadas de una política mixta
(`season/testing/mixed-policy.ts`: los cinco entrenamientos, descanso, salida, taller, cambio de
bastidor y todas las opciones de los eventos) y compara, entrada por entrada, el SHA-256 del estado
sin el log con el que dio el motor de `5f0fd65` (`__fixtures__/v1-invariance-5f0fd65.json`). El
log se compara entero después de quitarle lo que este ADR le agrega.

### D2. Vigor: solo presentación

`vigor = fatigueMax − fatigue`. El campo del estado (`SeasonState.fatigue`) y el de los eventos
(`EventEffects.fatigue`) **no cambian de nombre**: renombrar campos de esquema pide su propio ADR,
cambiaría el signo de 9 efectos de evento y tocaría ≈ 35 archivos, y no ganaría nada (la mecánica es
idéntica en las dos direcciones, estudio §7). Las partidas v1 guardadas cargan y se reproducen sin
cambios. Todo texto que ve el jugador de una partida v2 dice **Vigor** (una barra que se vacía al
entrenar y se llena al descansar), nunca «fatiga»; los efectos se muestran con el signo del vigor
(«Descanso: vigor +50»). El helper `vigor(ruleset, fatigue)` es la única conversión. La etapa D
puede mostrar vigor también en las partidas v1 (es la misma cuenta); la nota `log.rest.forced`
(«Fatiga alta: descanso forzado.») solo aparece en v1.

### D3. Fallo por curva, sin descanso forzado

Con `failModel` "curve" la probabilidad de fallo sale de la fatiga **antes** de entrenar: 0 ‰ hasta
fatiga 40 (vigor ≥ 60), después `floor(600 × ((fatiga − 40) / 60)²)`, con un solo floor: vigor 50 →
16 ‰, 40 → 66, 30 → 150, 20 → 266, 10 → 416, 0 → 600. El vuelo de riesgo falla con 120 ‰ + la
curva; el simulador, con la mitad de la curva. No hay descanso forzado (`forcedRestAt` 101): entrenar
es decisión del jugador y el riesgo lo paga el fallo. Con vigor ≤ 20 (`injuryFromFatigue` 80) y en
todo vuelo de riesgo, un cuarto de los fallos es lesión (2 semanas), con la misma tirada: lesión si
`tirada < lesión`, fallo si `tirada < fallo`. El fallo cuesta lo mismo que en v1: media ganancia en
cada stat entrenada y ánimo −1. Fórmulas exactas: `docs/formulas.md` «Temporada v2».

### D4. Descanso con resultado variable

Un descanso elegido recupera +30 / +50 / +70 de vigor con 25 / 50 / 25 % (`restRecovery`,
`restRecoveryWeights`), sorteado antes de la tirada de ánimo, que baja a 25 %. Una semana lesionada
recupera `−fatigueCost.rest` sin sorteo: 50 en v2 (la media del descanso elegido; el estudio la
midió con 40, ver «Pendiente»). La salida da vigor +20 y ánimo +1.

### D5. Ánimo con peso

- Al entrenar multiplica ×0,80 / 0,90 / 1 / 1,10 / 1,20 (`trainMoodMult`, tabla propia del
  ruleset); en carrera, ×0,96 / 0,98 / 1 / 1,02 / 1,04 (`moodMult`).
- Deriva: en cada semana de entrenamiento, ánimo −1 con 2 % + 4 % por entrenamiento seguido después
  del segundo (3.º 6 %, 4.º 10 %, 5.º 14 % …). La racha cuenta las semanas de entrenamiento seguidas
  del log, esta incluida; la cortan una semana lesionada, un descanso (elegido o forzado), una
  salida y el taller; elegir un evento no la corta. La deriva se tira también si el entrenamiento
  falló (un fallo puede costar dos de ánimo, como en el prototipo).
- Una carrera objetivo terminada 6.ª o peor (DNF = última) cuesta ánimo −1 después de la carrera.

### D6. Los sorteos nuevos van al stream `training`

La elección del descanso y la deriva usan el stream `training`, como el prototipo. Razón: así el
motor v2 reproduce sorteo por sorteo las temporadas que midió el estudio (verificado contra el
prototipo, sección «Evidencia»), y no hace falta un stream nuevo en `packages/rng`. Consecuencia
conocida y sin efecto en v1: la presencia de cuadrillas de la semana siguiente también sale de
`training` después de la acción, así que en v2 una deriva o un descanso sorteado mueven esa tirada
respecto de v1. Cada entrada tiene su propio Rng (`semilla/entrada`), así que nada se desplaza de una
entrada a otra.

### D7. El log dice por qué

Cada cambio de ánimo que aplica el motor deja una nota con su causa, solo cuando el ánimo cambia de
verdad (en +2 o −2 un cambio que no se aplica no se anota):

| Nota                  | Cuándo                                          |
| --------------------- | ----------------------------------------------- |
| `log.mood.failure`    | Un entrenamiento fallido baja el ánimo.         |
| `log.mood.drift`      | La deriva: «está harta de entrenar».            |
| `log.mood.race-loss`  | Una carrera objetivo terminada 6.ª o peor.      |
| `log.mood.rest`       | El descanso sube el ánimo.                      |
| `log.mood.outing`     | La salida sube el ánimo.                        |
| `log.mood.event.up`   | Un evento (opción y rama juntas) sube el ánimo. |
| `log.mood.event.down` | Un evento lo baja.                              |

Y del vigor, donde ayuda a entender la semana:

| Nota                    | Cuándo                                                         |
| ----------------------- | -------------------------------------------------------------- |
| `log.vigor.rest.poor`   | Descanso sorteado: la opción más baja (v2 +30).                |
| `log.vigor.rest.normal` | Descanso sorteado: una opción del medio (v2 +50).              |
| `log.vigor.rest.great`  | Descanso sorteado: la opción más alta (v2 +70).                |
| `log.vigor.event.up`    | Un evento devuelve vigor.                                      |
| `log.vigor.event.down`  | Un evento quita vigor.                                         |
| `log.vigor.exhausted`   | Una lesión que vino del poco vigor (no de un vuelo de riesgo). |

Las notas se agregan después de la nota de la acción (`log.train.fail`, `log.rest`, `log.outing`,
el texto del evento…), en el orden en que pasan. Además, cada entrada del log
(`TurnLogEntry`, campos opcionales, ausentes cuando no aplican) lleva:

- `moodDelta`: el cambio neto de ánimo de la entrada;
- `fatigueDelta`: el cambio neto de fatiga (el vigor se mueve `−fatigueDelta`);
- `event`: el evento resuelto esa semana, `{ id, option, branch?, auto? }` (`branch`, la rama de azar
  sorteada; `auto: true` para un evento automático).

Las notas y los campos nuevos aparecen en todas las versiones del ruleset (es presentación: ninguna
regla ni sorteo cambia); la prueba de invariancia de v1 los quita antes de comparar el log.

### D8. Eventos al azar (pedido del dueño)

El motor y el esquema los soportan; el contenido lo escribe la etapa C.

- `GameEvent.rulesets` (opcional, p. ej. `["v2"]`): limita el evento a esas versiones; sin el campo
  vale para todas. `eligibleEvents` filtra con el `rulesetVersion` de la partida **antes** de sortear,
  así que agregar eventos solo de v2 no cambia el conjunto elegible ni los sorteos de v1. Un test del
  sim comprueba que cada versión nombrada exista.
- `GameEvent.auto` (opcional, `true`): un evento de suerte que se aplica solo. Exige exactamente
  una opción; la opción puede tener ramas de azar. Cuando `rollEvent` lo elige (por peso o como
  evento de historia), se aplica en la misma entrada y la misma semana, sin elección pendiente ni
  entrada extra: efectos de la opción, la rama sorteada en el stream `events` justo después de la
  elección, `eventHistory` +1, notas (el texto del evento, el de la opción, el de la rama si tiene) y
  `event: { id, option: 0, branch?, auto: true }` en la entrada del log, con las stats en `deltas` y
  el ánimo y el vigor en `moodDelta` / `fatigueDelta` y sus notas de causa. Los eventos con elección
  funcionan igual que antes (también registran `event`, sin `auto`).
- `ChanceBranch.textKey` (opcional): el texto de una rama («salió bien», «salió mal»), validado por
  el índice de contenido y anotado en el log cuando la rama sale.
- La prueba usa un evento automático de fixture en los tests (no en el contenido), con una variante
  solo de v2 que v1 ignora.

### D9. Funciones puras para la interfaz y la CLI

Nadie copia fórmulas: `packages/sim` exporta lo que el motor usa (`season/rules.ts`):
`trainingRisk`, `trainingGains`, `trainingMoodMultiplier`, `moodMultiplier`, `vigor`,
`actionBlock`, `trainingStreak`, `moodDriftPm`, `nextTrainingDriftPm`, `restOptions`,
`raceLossCostsMood`, y `seasonContext(content, versión)` para crear el contexto de una partida
nueva (por defecto `CURRENT_RULESET`). Una propiedad de fast-check reconstruye la tirada de cada
entrada (`rngForInput`) y comprueba que el fallo, la lesión y la deriva que aplica `advanceSeason`
son exactamente los que dicen esas funciones.

## Constantes (v1 → v2)

Estudio §9; nombres del código (el prototipo usaba otros: `failModel` "v1" → "linear",
`highFatigueInjuryAt` → `injuryFromFatigue`, `SEASON.trainMoodMult` → `Ruleset.trainMoodMult`, y el
descanso elegido pasó de `fatigueCost.rest` a `restRecovery`).

| Qué                     | v1                                               | v2                                                                       | Constante                                                                    |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Barra en pantalla       | Fatiga 0-100, se llena                           | Vigor = 100 − fatiga, se vacía                                           | presentación; el campo sigue siendo `fatigue`                                |
| Descanso forzado        | Con fatiga ≥ 80                                  | Ninguno                                                                  | `forcedRestAt` 80 → 101                                                      |
| Fallo de un simple      | 5 % + fatiga/4 ‰                                 | 0 % con vigor ≥ 60; 1,6 / 6,6 / 15 / 26,6 / 41,6 / 60 % con vigor 50 … 0 | `failModel` "linear" → "curve", `failCurveStart` 40, `failCurveMax` 600      |
| Vuelo de riesgo         | 12 % fijo, 3 % de lesión                         | 12 % + la curva; un cuarto de los fallos es lesión                       | `riskFlightFail` 120, `injuryShareOfFail` 250                                |
| Simulador               | Nunca falla; fatiga +10                          | Mitad de la curva; vigor +5 en el estudio (ver «Pendiente»)              | `simulatorFailPm` 0 → 500, `fatigueCost["train:simulator"]`                  |
| Lesión por agotamiento  | —                                                | Con vigor ≤ 20, un cuarto de los fallos es lesión (2 semanas)            | `injuryFromFatigue` 101 → 80, `injuryShareOfFail` 250, `injuryTurns` 2       |
| Costo de un fallo       | Media ganancia, ánimo −1                         | Igual                                                                    | `failLossPm` 500, `failMoodLoss` 1                                           |
| Descanso elegido        | Vigor +40; ánimo +1 con 50 %                     | Vigor +30 / +50 / +70 (25 / 50 / 25 %); ánimo +1 con 25 %                | `restRecovery`, `restRecoveryWeights`, `restMoodUpChance` 500 → 250          |
| Semana lesionada        | Vigor +40                                        | Vigor +50                                                                | `fatigueCost.rest` −40 → −50                                                 |
| Salida                  | Vigor +10; ánimo +1                              | Vigor +20; ánimo +1                                                      | `fatigueCost.outing` −10 → −20                                               |
| Entrenamientos y taller | Vigor −20 (vuelo −30), taller −5                 | Igual                                                                    | `fatigueCost`                                                                |
| Ánimo al entrenar       | ×0,95 / 0,98 / 1 / 1,05 / 1,10                   | ×0,80 / 0,90 / 1 / 1,10 / 1,20                                           | `trainMoodMult`                                                              |
| Ánimo en carrera        | ×0,95 / 0,98 / 1 / 1,05 / 1,10                   | ×0,96 / 0,98 / 1 / 1,02 / 1,04                                           | `moodMult`                                                                   |
| Deriva del ánimo        | —                                                | −1 con 2 % + 4 % por entrenamiento seguido después del 2.º               | `moodDriftBase` 0 → 20, `moodDriftPerStreak` 0 → 40, `moodDriftFreeStreak` 2 |
| Carrera mala            | —                                                | 6.º o peor en una carrera objetivo: ánimo −1                             | `raceLossMoodAt` 9 → 6                                                       |
| Rivales                 | 75 + 9 por turno                                 | 60 + 11 por turno                                                        | `FIELD.rivalBase`, `FIELD.rivalPerTurn`                                      |
| Escalera de metas       | 7 / 6 / 5 / 3                                    | Igual                                                                    | contenido sin cambios                                                        |
| Umbrales de nota        | SS 4500, S 4100, A 3700, B 2900, C 2500 … F 1300 | ×1,1: SS 4950, S 4510, A 4070, B 3190, C 2750, D 2310, E 1870, F 1430    | `gradeThresholds`                                                            |

## Evidencia (estudio, `.work/design2/fatiga-animo.md`)

B o mejor y victorias en carreras objetivo, media de Caracara, Cernícala y Peregrina, 500
temporadas por Falconess y política (base `batch-…`; la propuesta confirmada con `alt1/batch-…`):

| Quién                                                                                       | v1 (reglas y rivales de antes)                     | v2                                                                                           |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Cuida el vigor y el ánimo (descansa o sale antes de que el fallo suba; sale con ánimo < +1) | B o mejor 74 %; gana 48 % de las carreras objetivo | **B o mejor 75 %** (74 % con los umbrales ×1,1); gana **38-40 %**; gana las cuatro en el 5 % |
| Cuida el vigor pero nunca sale                                                              | 77 %                                               | **45 %**                                                                                     |
| Descansa solo con vigor 20 (el hábito del descanso forzado)                                 | 79 %                                               | **30 %**                                                                                     |
| Descansa solo con el vigor vacío                                                            | 79 % (el juego la obligaba con 80 de fatiga)       | **7 %**                                                                                      |
| Aprieta siempre el mismo botón (Agilidad), descanse o no con vigor 20                       | 7 %                                                | **0-0,1 %**                                                                                  |

Detalle por temporada con v2 (rivales 60 + 11):

| Política                      | B o mejor | Gana  | Entrenos que suman | Fallos  | Lesiones | Descansos | Salidas | Stat media final | Ánimo +2 (% semanas) | Ánimo < 0 (% semanas) |
| ----------------------------- | --------- | ----- | ------------------ | ------- | -------- | --------- | ------- | ---------------- | -------------------- | --------------------- |
| Cuidadosa                     | 74,6-75,3 | 38-40 | 31,4-31,7          | 0,7-1,0 | 0,2      | 7,3-8,4   | 7,3-7,8 | 709-710          | 58-62                | 0,5-0,6               |
| Referencia (nunca sale)       | 44,5      | 25,2  | 35,6               | 0,9     | 0,2      | 11,2      | 0       | 650              | 4,4                  | 62,7                  |
| Ingenua, descansa en vigor 20 | 29,5      | 19,8  | 34,7               | 2,3     | 0,2      | 10,7      | 0       | 612              | 2,4                  | 72,0                  |
| Ingenua, descansa en vigor 0  | 7,4       | 11,7  | 32,3               | 5,6     | 1,1      | 8,8       | 0       | 535              | 0,7                  | 83,2                  |
| Spam, nunca descansa          | 0,0       | 31,7  | 25,7               | 15,1    | 3,7      | 0         | 0       | 410              | 0,2                  | 89,3                  |

Confirmación con la otra base de semillas: cuidadosa 75,3-75,9 % de B o mejor, 37-40 % de victorias;
referencia 46,8 %; spam 0,0-0,1 %. Los botones del dueño en otras 300 semillas: 64 % de B o mejor
con v1, 4,3 % con v2 (en su propia semilla, B con 5 fallos y una lesión).

Del motor (esta implementación):

- v1 sin cambios: `v1-invariance.test.ts` (partida del dueño entrada por entrada y 30 temporadas
  mixtas contra `5f0fd65`), y `pnpm sim:season-batch -- --runs 500 --ruleset v1` imprime byte a byte
  lo mismo que `5f0fd65`.
- v2 igual al prototipo del estudio: 240 temporadas (política mixta y una de referencia con
  salidas, 11 269 entradas) jugadas con el prototipo (`sim-scratch.diff` sobre `5f0fd65`, palancas
  en los valores de v2) y con este motor dan el mismo estado sin el log después de cada entrada
  (comparación local, `.work/impl2/stage-a.md`).
- La política de referencia (`pnpm sim:season-batch`, 500 temporadas por Falconess):

  | Ruleset                                                      | ≥ B (media; Caracara / Cernícala / Peregrina) | Gana   |
  | ------------------------------------------------------------ | --------------------------------------------- | ------ |
  | v1                                                           | 76,5 % (72,8 / 72,0 / 84,8)                   | 50,1 % |
  | v2 tal como está (`0b6cdfc`)                                 | 34,3 % (29,2 / 25,4 / 48,4)                   | 22,8 % |
  | v2 con el simulador del estudio (fatiga −5)                  | 40,6 % (35,6 / 30,2 / 56,0)                   | 25,5 % |
  | v2 con el simulador del estudio y los umbrales de nota de v1 | **44,5 %** (37,0 / 33,4 / 63,2)               | 25,5 % |

  La última fila es exactamente la referencia del estudio con rivales 60 + 11 (§8: 44,5 % y 25,2 %
  de victorias): el motor reproduce el estudio; lo que falta es la constante del simulador
  («Pendiente»).
- Tests de v2 (`packages/sim/src/season/v2.test.ts`): la tabla de la curva, sin descanso forzado,
  simulador a mitad de curva, lesión con vigor ≤ 20 y en el vuelo de riesgo, reparto del descanso
  (solo v2 sortea), salida, deriva por racha, ánimo por carrera mala en el 6.º, multiplicador de
  entrenamiento ×0,80 … ×1,20, umbrales de nota y rivales de v2.

## Eventos al azar: balance

_Para la etapa C: los eventos al azar escritos (buenos y malos, solo v2 o para todas las versiones),
sus pesos y efectos, y lo que mide `pnpm sim:season-batch -- --ruleset v2` con ellos contra la tabla
de «Evidencia» (B o mejor, victorias y ánimo de las políticas cuidadosa, referencia y spam). Si los
eventos mueven la dificultad, aquí van los ajustes y su lote._

## Consecuencias

- La regla «fatiga ≥ 80 fuerza el descanso» de BRIEF §8 vale solo para v1; v2 la reemplaza por la
  curva de fallo (nota en BRIEF §8).
- **Métrica 7.** BRIEF §12 mide la métrica 7 con la política de la stat más baja, que nunca sale: con
  v2 queda en 44-47 % de B o mejor y la métrica (≥ 60 %) fallaría. El estudio (§10) recomienda que
  la política de referencia sea la cuidadosa (74-76 %); cambia lo que mide la métrica y lo decide el
  dueño. `pnpm sim:batch` (S7) sigue en v1 hasta esa decisión; `pnpm sim:season-batch` toma
  `--ruleset` y por defecto `CURRENT_RULESET`.
- Los golden del motor de carrera (`tests/golden/v1`) no cambian: corren con `RULESET_V1` y v2 usa el
  mismo motor de carrera.
- `pnpm play` imprime la partida al salir en el formato de guardado de la web
  (`{"schemaVersion":1,"rulesetVersion":…,"seed":…,"inputs":[…]}`) para que la versión viaje con
  ella. Las líneas viejas sin versión (`{"seed","inputs"}`) son partidas v1.
- La web empieza las partidas nuevas en v2 cuando la etapa D cambie su controlador
  (`CURRENT_RULESET`); hasta entonces sigue creando partidas v1, que ahora también traen las notas
  de causa del ánimo.
- Puertas abiertas: condiciones malas (insomnio, «Practice Poor») como contenido; eventos que suban
  el tope de vigor; renombrar `fatigue` a `vigor` en el código con su propio ADR si algún día conviene.

## Pendiente

- **Simulador.** El estudio (§9) pide `fatigueCost["train:simulator"]` −5 (vigor +5: el simulador
  como entrenamiento «seguro» de los turnos cansados, +5 puntos de B para la cuidadosa y +12 para la
  referencia). El commit `0b6cdfc` escribió `5` (vigor −5). El motor lee la constante tal como está:
  con `5` la referencia queda 6,3 puntos de B y 2,7 de victorias por debajo («Evidencia»).
  Corregirla es una línea en `rulesets/v2/constants.ts` y la decide el líder (CLAUDE.md: los
  rulesets no se editan sin aprobación); los tests de v2 leen la constante y no cambian.
- **Semana lesionada.** v2 recupera 50 (la media del descanso elegido); el estudio la midió con 40.
  Las lesiones son ≈ 0,2 por temporada en la cuidadosa: efecto chico, a confirmar en el lote de la
  etapa C.

## Alternativas descartadas

- **Renombrar `fatigue` a `vigor` en el esquema**: ver D2.
- **Cambiar las reglas dentro de v1**: `run1.json` y cualquier partida guardada dejarían de
  reproducirse igual (estudio §10).
- **Un stream nuevo para la deriva y el descanso**: ver D6.
- **M1 (ánimo más duro)**: con rivales 60 + 11 deja a la cuidadosa en 70-71 % pero a la referencia en
  20 %; el ánimo pasaría a ser casi lo único que importa (estudio §11).
- **D2 más avara sin tocar las notas** (descanso +20 / +40 / +60, salida +15, simulador 0, rivales
  65 + 10): un poco más fácil y lejos de los números de Umamusume (estudio §8).
- **Eventos automáticos sin `rulesets`**: sumar un evento al pozo cambiaría los sorteos de las
  partidas v1 guardadas.
