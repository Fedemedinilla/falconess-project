# ADR-0011: Carrera v3: vuelo (etapa 1 al juego)

- Estado: aceptado (dueño, 2026-11-10: «llevar la etapa 1 al juego»)
- Fecha: 2026-11-10
- Alcance: sim (ruleset v3, `packages/sim/src/rulesets/v3`), schema (campos v3, calendario),
  content (pistas del catálogo, letras de distancia, pasivas de las Falconess, calendario v3),
  season (temporadas nuevas en v3), cli (`balance:barandas`, `sim:race`), docs.
- Diseño: `docs/design/carrera-v3-vuelo.md`, `docs/design/temporada-v3.md` (T21),
  `docs/design/barandas-balance.md`. Prototipo y medidas: rama `race-v3-proto` (hasta `c3c801a`),
  `.work/design7/measure/*-final.md` (polish, homes, trim, barandas-perf).
- Relacionados: ADR-0008 (posición de carrera), ADR-0009 (efecto de vuelo de las pasivas),
  ADR-0010 (motor congelado y ocho barandas).

## Contexto

El dueño eligió el vuelo como el diferencial de Falconess frente a Umamusume: despegues que se
reconocen, una lucha arriba que cuesta y una picada que se cobra en puestos (T21, 2026-11-03).
El prototipo `race-v3-proto` lo construyó en rondas medidas contra el arnés de design7 y terminó
con la etapa 1 completa y las ocho barandas de ADR-0010 pasando (frágiles B2, B3 y B7). ADR-0010
congela ese motor. Este ADR fija qué es la etapa 1 en el juego.

## Decisión

### 1. Qué contiene la etapa 1

1. **Bandas de altura.** Suelo (0) y tres bandas: baja (vuelo a ras), alta y techo. La banda va en
   el registro (dos bits de `frames.flags`: `altLow`, `altHigh`). Volar descansa las piernas
   (`airDrainPm` 990) pero subir y sostener cuesta energía (`climbE`, `holdE`, `bandHoldPm`).
2. **Despegues por ala, como gesto.** Cada estilo de ala tiene su despegue: Lanza (Picada,
   vertical), Columna (Suspensión, en escalones), Rampa (Planeo, diagonal larga), Turbina
   (Rasante, a ras con el propulsor). Solo cambia el tiempo de subir y de caer una banda
   (Lanza 2/2 ticks, Columna 4/3, Rampa 8/4, Turbina 3/3); el costo, la velocidad y la picada son
   iguales para todas (alas neutras, §3).
3. **Plan de vuelo por posición** (ADR-0008), puro y visible antes de la carrera
   (`RaceEntry.flightPlan`): la Punta vuela a ras al frente y sobre Colinas, agua y Saltos (salta
   con las piernas los Saltos de la largada); el Pelotón a ras en los Pasillos y en los llanos de
   200 m o más; el Acecho alto desde L/4; el Remate sube al techo para la gran picada, que deja
   300 m hasta la meta.
4. **Dos líneas por banda** (adentro y afuera): pasar por el costado, en diagonal, encerrada,
   cerrar la puerta (`lineSwitch`, `passSide`, `boxedIn`, `doorClosed`).
5. **La lucha arriba.** Aire propio con varianza pre-sorteada (sin sorteos dentro del tick), aire
   sucio detrás de otra en la misma banda (11 m; 24 m en la alta) que cuesta sostener, remolque,
   subir por arriba o que te bajen la línea (`lineChange`), caída sin energía, nervio al picar
   sobre el tráfico (Coraje).
6. **El esfuerzo cuesta físico (hp).** Despegar, picar por banda, cambiar de línea, que te bajen o
   te cierren la puerta: golpes de hp (`hpHit`), con la barra presupuestada a su propia
   Resistencia; la Resistencia achica cada golpe.
7. **Remate a físico bajo.** En el Sprint el remate se acorta de a poco según el físico que sobra
   al planearlo (`sprintPlan.kickPm`); en las otras distancias el remate no cambia.
8. **Todas vuelan.** Las cuatro posiciones tienen vuelos en su plan; volar, aunque sea a ras,
   rinde algo más que el suelo.
9. **Picada.** Convertir altura en velocidad: Δv por banda (`diveVMms` alta 5,11 m/s, techo
   6,6 m/s), parte en el aire, frenada por `kDecel`; una línea ganada pica una banda más.

### 2. Motor congelado y limpieza

El motor es el del prototipo `c3c801a`, byte a byte. Las constantes finales viven en
`packages/sim/src/rulesets/v3/constants.ts` (`FLIGHT`, `RACE`, `FIELD`, `WINGS`) con el comentario
de la medida que fijó cada una; `RULESET_V3` está en el registro (`getRuleset("v3")`). Se
quitaron, con su código, las perillas que el prototipo midió y dejó apagadas en todos los pasos
(techo del cañón y agarre del Rasante de la etapa 2, rebufo de Suspensión solo en el suelo,
términos del Planeo en la Punta, el cuarto de picada y el último obstáculo de la final). La
prueba: el digest de 1656 carreras del prototipo (`.work/design7/perf/digest.ts`, todas las pistas,
dos campos, cuatro niveles, results y full, letras sí y no, interruptores, v2, paso B invertido,
arena nueva y compartida) da `498e90ae88baea78600c061a` antes y después, y las referencias
INV-5 a INV-15 del prototipo siguen iguales. Desde acá vale ADR-0010: solo se corrigen errores.

### 3. Alas neutras, sin reglas de fabricante, sin desgaste

- Todas las alas corren con el mismo perfil (`neutralFrame`: PW 1,0, energía 100, disipación 60):
  sin reglas de fabricante (pulso Kōryū, empuje Steinhaus, regeneración Lumière, telemetría
  Altair, reparable Boneyard), sin pasiva de ala, sin efecto de piezas ni de manías.
- **Sin desgaste:** las alas no se gastan ni se rompen. La temporada v3 guarda la durabilidad de
  cada ala sin tocarla (la carrera corre con el perfil neutro) y el taller no repara (`repair`
  se rechaza en v3). El taller queda para habilidades y para cambiar de alas (aspecto y gesto).
  **La chatarra pierde su uso principal**: queda pendiente darle otro (T18 o acabados); este ADR
  no lo inventa. Las piezas y las manías siguen en el estado y en el taller, sin efecto en carrera.
- **Las pasivas firma pasan a ser de la Falconess** (`Falconess.passive`): Peregrina «Garra fija»
  (`talon-lock`, con su efecto de vuelo, ADR-0009), Cernícala `still-air`, Caracara
  `scrap-armor`, en cualquier ala.

### 4. Cuatro distancias y letras

- La distancia sale del largo de la pista: Sprint ≤ 1400 m, Milla ≤ 1800 m, Media ≤ 2400 m,
  Larga más. Tipo `Distance`.
- Cada Falconess tiene una letra por distancia, en escalera (`Falconess.distanceAptitude`):
  Peregrina A-A-B-C, Cernícala C-B-A-B, Caracara C-C-B-A. La letra actúa en el vuelo
  («la distancia se juega en el aire»): B es el cero, A +3 %, C −3 % (`distancePm`), sobre el
  aire, el descanso y la picada de esa distancia. Las rivales son B en todas.
- **Caja negra: +1 letra con tope B.** La caja de una Falconess pasa su mejor letra de nacimiento
  (`BlackBox.factors.distance`); la temporada de la hija sube esa distancia un paso si está bajo
  B (C → B, nunca hasta la A de una especialista; una por temporada, el primer padre que sirve).
  Queda en `SeasonState.distanceAptitude` y `distanceBoost`, sin sorteo.

### 5. Pistas del catálogo

Nueve pistas, en `packages/content/courses/` (las tres de siempre) y `courses-v3/` (seis nuevas,
fuera del índice de contenido para que v1 y v2 no las vean):

| Distancia | Pistas                                                          |
| --------- | --------------------------------------------------------------- |
| Sprint    | Sprint (1200 m)                                                 |
| Milla     | Escalera (1600 m), Mirador (1800 m)                             |
| Media     | Pista de saltos (2000 m), Circuito (2200 m), Escapada (2400 m)  |
| Larga     | Cielo abierto (2800 m), Pista larga (3000 m), Travesía (3600 m) |

La Escapada es la casa de la Punta (palanca 4 de ADR-0010). `pnpm content:validate` las valida
junto con el calendario.

### 6. Calendario con pista del mes

`packages/content/calendars/v3.json` (esquema `Calendar`): las nueve pistas del catálogo, 22
semanas con oferta de 3 pistas, una **pista del mes** por mes que ocupa sus 2 semanas de oferta
(Pista larga, Cielo abierto y Circuito dos meses cada una; la Escapada en marzo) y el resto
repartido parejo, con 8 opcionales por temporada. Las metas siguen siendo las de cada Falconess
(contenido, sin cambios). **La temporada todavía no ofrece carreras opcionales (T3):** hoy el
calendario pesa las pistas de la baranda B3; cuando lleguen las opcionales, las ofrece este
archivo.

### 7. Temporadas, rulesets viejos e interruptores

- `CURRENT_RULESET = v3`: toda temporada nueva empieza en v3 (temporada de v2: vigor, ánimo,
  eventos; carrera con vuelo; letras de distancia; caja con distancia; sin desgaste). Una partida
  v1 o v2 sigue con su ruleset y se reproduce igual (`v1-invariance`, tests de v2, golden v1).
- Los interruptores `FLIGHT_OFF_*` (`rulesets/v3/switches.ts`) quedan **solo** para la prueba de
  invariancia: con cada uno apagado, v3 es la versión anterior del prototipo byte a byte (INV-5 a
  INV-15). Ninguna temporada, CLI ni página juega un ruleset con un interruptor apagado.
  `pnpm balance:barandas` (B8) compara sus digests con `apps/cli/src/balance/invariance.json`,
  grabado en el prototipo y reproducido en `race-v3`.

### 8. Registro (schema)

Campos nuevos, todos opcionales o de eventos que v1 y v2 nunca emiten (sus registros no cambian):

- `RaceEntry`: `flightPlan` (vuelos planeados), `distanceAptitude` (la letra de esa carrera),
  `traits.diveSkill` (ADR-0009). `EntryInput.distanceAptitude` (letras por distancia).
- `frames.flags`: `altLow`, `altHigh` (banda), `dirtyAir`, `lineOut` (línea de afuera).
- Eventos: `takeoff`, `bandReached`, `diveStart`, `dive` (con `skillMms`/`skillId`),
  `touchdown`, `pass`, `nerve`, `airDirty`, `lineChange`, `lineSwitch`, `boxedIn`, `doorClosed`,
  `passSide`, `noLift`, `hpHit`; `sprintPlan` suma `kickPm`, `pacePm` y la causa `effort`;
  `skill` suma `heldTicks` (una habilidad que salta en el aire se guarda).
- `RaceLedger.flight` (`FlightLedger`: aire, vuelos, picadas, líneas, físico pagado).
- Contenido y estado: `Falconess.passive`, `Falconess.distanceAptitude`, `PassiveSkill.flight`
  (ADR-0009), `SeasonState.distanceAptitude`, `SeasonState.distanceBoost`,
  `BlackBox.factors.distance`, `Calendar`.

Golden: `tests/golden/v3/` (12 carreras: una por pista del catálogo alrededor de una Falconess a
la semana 46, y tres campos parejos), escritos dos veces con `pnpm golden:update -- --set v3 --yes`
y byte a byte iguales. Los golden v1 no cambian.

### 9. Lo que no cambia

v1 y v2: mismos registros, mismas temporadas (B8: golden v1, `v1-invariance`, digests de
registros v1/v2 y temporadas v2 iguales a `playtest-ui`). El motor v1/v2 no lee nada de v3:
`flightOf(ruleset)` es nulo para ellos.

## Consecuencias

- El balance de v3 sigue ADR-0010: ocho barandas, una palanca de contenido por cambio, nota de
  cambio. `pnpm balance:barandas` es la medida completa (requisito de un cambio de balance) y
  `pnpm balance:barandas -- --quick` corre en CI como puerta de B8 y humo del arnés.
- `pnpm sim:batch` y `pnpm sim:season-batch` miden v3 por defecto (`--ruleset v2` mide lo viejo);
  el lote de `balance.yml` compara contra la línea base de `main`, que es v2 hasta que esta rama
  entre: el primer reporte se lee con la etiqueta `balance-adr`.
- `pnpm bench` también corre v3 en la Travesía (3600 m) con la puerta de 5 ms de B7, que hoy pasa
  frágil (p95 ≈ 4,3 ms en la máquina de pruebas).
- Corrección de un error al pasar al juego: la temporada v3 copiaba la durabilidad del perfil
  neutro (100) a las alas después de cada carrera, así que un ala de 180-220 parecía gastada y la
  política de referencia perdía semanas reparando. Ahora la temporada no toca la durabilidad en
  v3; las carreras no cambian y B4 se volvió a medir.
- Pendiente para la web (otra tarea): la vista animada del vuelo, el taller sin reparación, las
  letras de distancia en la pantalla previa, el catálogo en la carrera libre.
- Abierto: el nuevo uso de la chatarra (T18), las carreras opcionales con el calendario (T3),
  `RaceResultEntry.engine` sigue diciendo `"v1"` en las temporadas v3 (es la etiqueta del motor,
  no del ruleset; se deja para no mover estados guardados).

## Alternativas descartadas

- **Dejar el ruleset v3 fuera de `rulesets/` como en el prototipo:** el juego tiene que poder
  reproducir cualquier partida por su `rulesetVersion` desde el registro.
- **Borrar los interruptores:** sin ellos no hay forma de probar que el motor del juego es el
  medido en el prototipo (B8).
- **Inventar un uso para la chatarra o ofrecer opcionales ya:** son decisiones del dueño (T3, T18).
