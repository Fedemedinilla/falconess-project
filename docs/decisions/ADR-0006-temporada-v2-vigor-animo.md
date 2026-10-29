# ADR-0006: Ruleset v2 de la temporada: vigor, curva de fallo, ánimo con peso y eventos al azar

- Estado: **aceptado (dueño, 2026-10-28)**. Las reglas y las constantes salen del estudio
  `.work/design2/fatiga-animo.md` (§9, recomendación D2 + M2 con rivales 60 + 11 y umbrales ×1,1),
  que el dueño aceptó; los eventos al azar son un pedido del dueño del mismo día. La sección
  «Eventos al azar: balance» (etapa C) describe los 16 eventos de suerte y su lote; la métrica 7 se
  mide con la política cuidadosa en v2 («Consecuencias»). Queda una diferencia con el estudio para
  el líder (sección «Pendiente»).
- Fecha: 2026-10-28
- Alcance: sim (`packages/sim/src/season/`, `packages/sim/src/rulesets/v2/`), schema
  (`TurnLogEntry`, `GameEvent`), content (`events/luck-*.json`, `text/es.json`), cli (`--ruleset`,
  política de referencia por ruleset, vigor y causas en la temporada de texto)

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
- El contenido son 16 eventos de suerte solo de v2 (sección «Eventos al azar: balance»). Ningún
  campo de esquema nuevo: usan `auto`, `rulesets` y `ChanceBranch.textKey`.

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
- La política de la stat más baja (la referencia de `pnpm sim:season-batch` hasta la etapa C, que
  pasó la de v2 a la cuidadosa: «Consecuencias»; 500 temporadas por Falconess, sin eventos de suerte):

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

Etapa C. Herramientas locales, no versionadas: `.work/impl2/stage-c/harness.mts` (las políticas
del estudio sobre el motor y el contenido reales, con los eventos de suerte encendidos o apagados),
`replay-owner.mts` y `report-tables.py`; informe completo en `.work/impl2/stage-c.md`.

### Contenido

Dieciséis eventos (`packages/content/events/luck-*.json`), todos `auto: true` y `rulesets: ["v2"]`,
con una sola opción y como mucho una vez por temporada (`maxOccurrences` 1): siete buenos, siete
malos y dos que tiran una moneda entre un resultado bueno y uno malo. Diez valen para cualquier
Falconess (fuente `random`): el texto habla de ella sin nombrarla, porque los textos de eventos no
llevan variables y agregarlas tocaría la web. Seis nombran a una, como los eventos de historia (fuente
`falconess`, uno bueno y uno malo para cada una); no son escenas escritas a mano (`handwritten`
falso, se ajustan como el resto del contenido), así que el test de contenido «handwritten story
events» cuenta solo los eventos con elección. Cada evento vive en uno de los tramos entre carreras
objetivo: así se reparten por la temporada y ninguno compite en la semana de carrera con
`podium-interview` o `hard-loss`. Un test de contenido comprueba los rangos del dueño y los tramos.

| Tramo | Evento                       | Para      | Peso | Efecto                                           |
| ----- | ---------------------------- | --------- | ---- | ------------------------------------------------ |
| 2-11  | `luck-tailwind`              | todas     | 20   | agilidad +10, técnica +6                         |
| 2-11  | `luck-stormy-night`          | todas     | 16   | vigor −15                                        |
| 2-11  | `luck-lost-goggles`          | todas     | 3    | ánimo −1                                         |
| 13-23 | `luck-long-sleep`            | todas     | 14   | vigor +20                                        |
| 13-23 | `luck-fan-letter`            | todas     | 3    | ánimo +1                                         |
| 13-23 | `luck-radio-critic`          | todas     | 3    | ánimo −1                                         |
| 13-23 | `luck-peregrina-late-replay` | Peregrina | 7    | vigor −15                                        |
| 13-23 | `luck-cernicala-notebook`    | Cernícala | 4    | ánimo −1                                         |
| 13-23 | `luck-caracara-finger`       | Caracara  | 7    | vigor −15                                        |
| 25-35 | `luck-veteran-visit`         | todas     | 12   | inteligencia +10, técnica +8                     |
| 25-35 | `luck-head-cold`             | todas     | 8    | vigor −15                                        |
| 25-35 | `luck-rival-smile`           | todas     | 8    | 75 %: coraje +10, resistencia +6; 25 %: ánimo −1 |
| 37-45 | `luck-sky-gust`              | todas     | 12   | 60 %: coraje +10, agilidad +6; 40 %: vigor −10   |
| 37-45 | `luck-peregrina-thermal`     | Peregrina | 16   | agilidad +10, coraje +6                          |
| 37-45 | `luck-cernicala-feather`     | Cernícala | 16   | técnica +10, agilidad +6                         |
| 37-45 | `luck-caracara-hammock`      | Caracara  | 16   | vigor +20                                        |

Los textos (`ev.luck-*` en `es.json`) son de una o dos líneas: el texto del evento dice qué pasó, el
de la opción cómo terminó, y el de la rama (`.good`, `.bad`) cuál de los dos resultados salió. Ningún
texto de evento existente decía «fatiga», así que no hubo que reescribir ninguno.

### Por qué esos pesos

Lo que vale cada tipo de efecto, medido agregando al contenido solo los eventos de ese tipo, con las
magnitudes de la primera versión (500 temporadas por Falconess, v2 tal como está, puntos de B o
mejor por evento ocurrido):

| Efecto                 | Cuidadosa | Nunca sale |
| ---------------------- | --------- | ---------- |
| Ánimo −1               | −5,7      | −5,7       |
| Vigor −15              | −2,1      | −0,4       |
| Stats (≈ +12 en total) | +1,8      | +1,6       |
| Vigor +15              | +1,7      | +1,0       |
| Ánimo +1               | +1,3      | **+13,8**  |

Un ánimo −1 le cuesta a la cuidadosa casi una semana (una salida que no estaba en el plan, o ×1,10
en lugar de ×1,20 hasta la próxima) y en las últimas semanas antes de una carrera también le baja el
ánimo de carrera. Un ánimo +1 casi no le sirve, porque pasa el 60 % de las semanas en +2; a la que nunca
sale le da el ánimo que ninguna salida le iba a dar, y le dura semanas. Por eso los eventos de ánimo,
buenos y malos, llevan los pesos más bajos (3-4) y salen ≈ 0,4-0,5 veces por temporada cada uno; los
más frecuentes son los de stats y vigor. Una primera versión con todos los eventos en peso 3 y rangos
largos daba 13 eventos por temporada (uno cada 3,3 semanas), le quitaba 8 puntos de B a la cuidadosa
y le sumaba 4 a la que nunca sale.

Frecuencia (cuidadosa, base): 8,6 eventos de suerte por temporada, uno cada 5,0 semanas jugadas
(2,1 / 2,5 / 2,4 / 1,6 en los cuatro tramos). Los eventos con elección bajan de 13,7 a 13,0 por
temporada: los del primer tramo se corren a los siguientes (6,5 → 4,3 en las semanas 1-11, 1,9 → 2,9
en las 24-35). Por evento, sin → con los de suerte: `boneyard-botch-1` 2,95 → 2,89,
`steinhaus-maintenance-1` 2,29 → 2,10, `sandstorm-week` 1,96 → 1,91, `sponsor-photo` 1,94 → 1,87,
`altair-contract-1` 1,24 → 1,19, `koryu-data-session-1` 0,57 → 0,53, `podium-interview` 0,61 →
0,46, `hard-loss` 0,16 → 0,15; los de historia y de cada Falconess, iguales. `podium-interview` es
el que más baja aunque ningún evento de suerte cae en semana de carrera: los eventos con elección que
la suerte corre del primer tramo siguen elegibles en la semana 12 y le disputan el sorteo.

### Mediciones

B o mejor y carreras objetivo ganadas, media de Caracara, Cernícala y Peregrina, 500 temporadas por
Falconess y política, escalera real (una meta fallada termina la temporada, como en
`pnpm sim:season-batch`). Base `batch-…` / confirmación `alt1/batch-…`.

**v1 (línea base, sin cambios).** `pnpm sim:season-batch -- --runs 500 --ruleset v1` imprime byte a
byte lo mismo que `5f0fd65` (salvo la línea `ruleset v1` del encabezado): política de la stat más
baja 72,8 / 72,0 / 84,8 % de B o mejor (media 76,5 %), gana el 50,1 % de sus carreras objetivo. Con
las reglas de v1, el estudio midió para las demás políticas: cuidadosa 74 %, descansa con vigor 20
(la obligaba el juego) 79 %, spam de Agilidad 7 %. Los eventos de suerte no existen en v1.

**v2 sin eventos** (el estudio con su simulador, vigor +5: cuidadosa 74-75 %, nunca sale 45 %,
descansa con vigor 20 30 %, con vigor 0 7 %, spam 0-0,1 %) y **v2 con eventos**, con el simulador
tal como está (vigor −5) y con el del estudio:

| Política                                         | v2 tal como está, sin eventos | v2 tal como está, con eventos | v2 con simulador vigor +5, sin eventos | v2 con simulador vigor +5, con eventos |
| ------------------------------------------------ | ----------------------------- | ----------------------------- | -------------------------------------- | -------------------------------------- |
| Cuidadosa (referencia v2, f0 m1)                 | 65,6 / 68,3                   | 63,6 / 64,7                   | 74,2 / 74,7                            | 72,9 / 73,3                            |
| Cuidadosa f70 m1                                 | 65,4 / 68,3                   | 64,5 / 67,0                   | 73,3 / 74,2                            | 70,7 / 74,3                            |
| Cuida el vigor, nunca sale (referencia v1)       | 34,3 / 35,8                   | 37,2 / 39,8                   | 40,6 / 43,3                            | 44,3 / 46,1                            |
| Descansa solo con vigor 20                       | 16,1 / 16,9                   | 20,5 / 20,9                   | 25,5 / 25,3                            | 26,8 / 30,3                            |
| Descansa solo con vigor 0                        | 2,8 / 2,5                     | 3,7 / 3,1                     | 4,7 / 4,7                              | 5,4 / 7,7                              |
| Nunca descansa                                   | 0,0 / 0,0                     | 0,0 / 0,1                     | 0,0 / 0,0                              | 0,0 / 0,1                              |
| Spam de Agilidad (descanse con vigor 20 o nunca) | 0,0 / 0,0                     | 0,0 / 0,0                     | 0,0 / 0,0                              | 0,0 / 0,0                              |
| **Gana** (cuidadosa)                             | 31,8 / 30,1                   | 30,8 / 30,5                   | 38,1 / 37,0                            | 37,5 / 37,7                            |
| **Gana** (nunca sale)                            | 22,5 / 21,8                   | 22,8 / 22,6                   | 25,2 / 26,2                            | 25,7 / 26,0                            |

Con otras dos bases (`alt2`, `alt3`) la cuidadosa con eventos da 63,9 / 67,7 % (65,9 / 67,9 sin
eventos) y, con el simulador del estudio, 72,9 / 76,0 %. `pnpm sim:season-batch -- --runs 500`
(v2, con eventos): 58 / 53 / 80 % de B o mejor (media 63,7 %), gana 27 / 24 / 42 %.

Detalle por temporada, v2 tal como está, con eventos (base):

| Política                                | B o mejor | Gana | Stat media final | Fallos | Lesiones | Descansos | Salidas | Ánimo +2 (% semanas) | Ánimo < 0 (% semanas) | Eventos de suerte |
| --------------------------------------- | --------- | ---- | ---------------- | ------ | -------- | --------- | ------- | -------------------- | --------------------- | ----------------- |
| Cuidadosa                               | 63,6      | 30,8 | 617              | 0,55   | 0,14     | 8,3       | 7,6     | 58                   | 0                     | 8,6               |
| Nunca sale                              | 37,2      | 22,8 | 555              | 0,75   | 0,14     | 10,6      | 0       | 6                    | 53                    | 8,2               |
| Descansa con vigor 20                   | 20,5      | 17,5 | 495              | 1,89   | 0,18     | 9,4       | 0       | 4                    | 61                    | 7,7               |
| Descansa con vigor 0                    | 3,7       | 9,4  | 393              | 3,75   | 0,73     | 6,4       | 0       | 1                    | 73                    | 6,7               |
| Spam de Agilidad, descansa con vigor 20 | 0,0       | 45,4 | 519              | 1,76   | 0        | 11,9      | 0       | 3                    | 62                    | 9,5               |

Lectura:

- **Los eventos no cambian la dificultad de quien juega bien**: a la cuidadosa le cuestan ≈ 2
  puntos (entre 0 y 4 según la base de semillas), del orden del ruido de 500 temporadas, y le quitan
  ≈ 7 puntos de semanas con ánimo +2 (65 → 58 %): el ánimo se mueve más, como pidió el dueño.
- **A la descuidada la ayudan un poco** (+3 a +4 puntos a la que nunca sale, +1 a +5 a la que
  descansa con vigor 20): los eventos buenos de vigor y de stats valen para todas y el poco ánimo +1
  que hay vale mucho para quien no sale. La cuidadosa sigue 25-29 puntos por encima de la que nunca
  sale y 43-46 por encima de la que descansa con vigor 20.
- **El spam sigue en 0 %** y la que descansa con el vigor vacío en 3-8 %.
- **Con el simulador tal como está no llega la meta de victorias**: la cuidadosa gana 30-31 % de sus
  carreras objetivo (objetivo del dueño 35-45 %) y su B o mejor queda en el borde, 64-68 % (objetivo
  65-80 %). Un contenido equilibrado no lo arregla: los eventos mueven ≈ ±2 puntos y faltan ≈ 5 de
  victorias; solo los eventos buenos (6,5 por temporada, medido sin los malos) le suben 7 puntos de
  victorias, así que haría falta una suerte casi siempre buena, contra el pedido del dueño. Con el
  simulador del estudio (vigor +5) se cumplen todas las metas en las dos bases: cuidadosa 73 %,
  gana 37-38 %, nunca sale 44-46 %, descansa con vigor 20 27-30 %, con vigor 0 5-8 %, spam 0 %.
  Propuesta para el líder: `.work/impl2/ruleset-proposal-c.md` («Pendiente»).

### La partida del dueño con v2

Sus 61 entradas de `run1.json` (Peregrina, semilla 397553) en orden, con el motor real: una elección
de evento sin evento pendiente se salta y un evento sin elección suya toma la opción 0.

| Reglas                                    | Su semilla                                                               | Sus botones en otras 300 semillas: B o mejor | Completa | Gana   | Fallos | Lesiones | Ánimo al final |
| ----------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- | -------- | ------ | ------ | -------- | -------------- |
| v1 (la partida real)                      | B, 2958, 1.º / 1.º / 2.º / 1.º, 2 fallos                                 | 64,0 %                                       | 91,0 %   | 60,4 % | 1,9    | 0,14     | +1,6           |
| v2 sin eventos                            | E: 8.ª en T36, la temporada termina                                      | 0,0 %                                        | 7,3 %    | 16,8 % | 5,7    | 1,26     | −1,9           |
| v2 con eventos                            | E: 8.ª en T36 (2036 de stats, 3 fallos y 1 lesión, 10 eventos de suerte) | 1,3 %                                        | 7,7 %    | 18,2 % | 5,6    | 1,33     | −1,9           |
| v2 con eventos y el simulador del estudio | igual que la anterior                                                    | 1,7 %                                        | 10,3 %   | 19,3 % | 5,4    | 1,32     | −1,9           |

En su semilla gana las dos primeras carreras, pero de la semana 18 a la 31 entrena casi siempre con
30 de vigor o menos (en v1 el descanso forzado en fatiga 80 lo frenaba): falla tres entrenamientos,
se lesiona por agotamiento en la semana 31 (dos semanas fuera) y su ánimo cae de +2 a −2 (los
fallos, la deriva y dos eventos malos). Llega a la meta de T36, que pide 5.º o mejor, con 1945 de
stats y ánimo −1, y termina 8.ª. Con las reglas nuevas hubiera jugado distinto; lo que muestra es
que el estilo de su partida v1 ya no alcanza, con o sin eventos. (La fila del estudio, §6, daba B en
su semilla: su script de la partida del dueño no aplicaba el ánimo de M2, ni la deriva ni la tabla
de entrenamiento.)

## Consecuencias

- La regla «fatiga ≥ 80 fuerza el descanso» de BRIEF §8 vale solo para v1; v2 la reemplaza por la
  curva de fallo (nota en BRIEF §8).
- **Métrica 7.** BRIEF §12 mide la métrica 7 con la política de la stat más baja, que nunca sale: con
  v2 queda en 34-40 % de B o mejor y la métrica (≥ 60 %) fallaría. Decisión (estudio §10, opción
  a): en v2 la métrica 7 se mide con la política cuidadosa. `referencePolicy` (`apps/cli/src/policy.ts`)
  juega la de cada ruleset: v1 la de la stat más baja, sin cambios (`sim:season-batch --ruleset v1` y
  `sim:batch` dan lo mismo que `5f0fd65`); v2 la cuidadosa (`carefulPolicy`: entrena la stat más
  baja, descansa o sale en cuanto el fallo de ese entrenamiento pasa de 0, sale con ánimo bajo +1).
  La usan `pnpm sim`, `pnpm sim:season-batch` y S7 de `pnpm sim:batch`; este último sigue en v1 por
  defecto (la línea base de CI) y mide v2 con `--ruleset v2`: las métricas de carrera dan lo mismo en
  los dos rulesets y S7 da 65 / 53 / 85 % (`pr`, 60 temporadas por Falconess). BRIEF §12 lleva la
  nota.
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
  con `5` la referencia queda 6,3 puntos de B y 2,7 de victorias por debajo («Evidencia»), y con los
  eventos la cuidadosa gana el 30-31 % de sus carreras objetivo, por debajo de la meta de 35-45 %
  («Eventos al azar: balance»); con `−5` se cumplen todas las metas. Corregirla es una línea en
  `rulesets/v2/constants.ts` y la decide el líder (CLAUDE.md: los rulesets no se editan sin
  aprobación); los tests leen la constante y no cambian. Propuesta con números:
  `.work/impl2/ruleset-proposal-c.md`.
- **Semana lesionada.** v2 recupera 50 (la media del descanso elegido); el estudio la midió con 40.
  Medido en la etapa C con los eventos: 40 o 50 dan lo mismo (cuidadosa 63,6 contra 63,6 %, nunca
  sale 37,1 contra 37,2 %, descansa con vigor 0 3,7 contra 3,7 %): las lesiones son ≈ 0,14 por
  temporada en la cuidadosa y la diferencia no se ve en 500 temporadas por Falconess; no hace falta
  cambiarla.

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
- **Subir las victorias de v2 con eventos de suerte mayormente buenos**: haría falta una suerte casi
  siempre buena, con stats fuera del rango del dueño, y escondería la constante del simulador
  («Eventos al azar: balance»).
- **Eventos de suerte genéricos con el nombre de la Falconess en una variable del texto**: los textos
  de eventos no llevan variables y agregarlas tocaba la web; los diez genéricos hablan de ella sin
  nombrarla y seis la nombran (uno bueno y uno malo para cada una).
