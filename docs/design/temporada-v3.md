# Temporada v3: decisiones abiertas y recomendaciones

Registro vivo de las ideas del dueño para rediseñar la temporada después del playtest 1 y de las
reglas v2 (ADR-0006). Cada entrada dice qué se propone, qué existe hoy, qué recomienda el equipo y
qué decidió el dueño. Cuando una entrada se decide, pasa a una ADR en `docs/decisions/` y se
implementa en un ruleset nuevo; v1 y v2 quedan para reproducir las partidas que ya existen.

Estados: **Abierta** (esperando al dueño), **Decidida** (va a una ADR), **Futuro** (fuera del MVP,
pero el diseño de hoy no debe cerrarle la puerta).

Guías: `docs/BRIEF.md` (§5 aptitudes, §7 fabricantes y bastidores, §8 temporada y hangar, §9 gacha
y reglas anti pay-to-win), los datos de `packages/content` (fabricantes, bastidores, Falconess) y
`docs/world.md`, que todavía es un esqueleto. No hay biblias de personajes en el repo
(`docs/characters/` no existe).

## Resumen

| #   | Tema                                     | Estado                       | Recomendación en una línea                                                                   |
| --- | ---------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| T1  | Piezas de bastidor                       | Abierta                      | Sacarlas del juego en v3; quedan como contenido viejo para v1 y v2                           |
| T2  | Cuadrillas como support cards            | Abierta                      | Cuadrillas elegibles con líder y vínculo visible, agrupadas por escuela (ver T5)             |
| T3  | Carreras opcionales                      | Decidida (detalles abiertos) | Pistas nuevas que no le quedan perfectas; puntos y stats por carrera (números a aprobar)     |
| T4  | Taller                                   | Decidida (detalles abiertos) | Botón del menú de la semana que no cuenta como semana; alas, reparar, habilidades            |
| T5  | Fabricantes como escuelas                | Abierta                      | Sí: cada escuela con su doctrina, expresada con las reglas que ya existen                    |
| T6  | Tres cuadrillas por escuela              | Abierta                      | Sí, con un modelo de datos para N cuadrillas; contenido del MVP más chico                    |
| T7  | Falconess como apoyo                     | Futuro                       | Sí, en el mismo mazo que las cuadrillas; nunca como ventaja comprable                        |
| T8  | Bastidor firma como mejor opción         | Abierta                      | Ya existe (genérico al 85-90 %); reforzar el vínculo con su escuela, sin obligar             |
| T9  | Gráfica e ilustración                    | Futuro                       | Retratos provisionales con iniciales y colores de escuela; dirección de arte después         |
| T10 | Elección de cuadrillas (A, B o C)        | Abierta                      | Reemplazada por T2 + T5 + T6                                                                 |
| T11 | Qué se juega y qué entra al gacha        | Abierta                      | De acuerdo; falta decidir qué pasa con los bastidores genéricos y el firma sin suerte        |
| T12 | Monetización sin depender del ilustrador | Abierta                      | Gacha de corredoras + pases + pinturas de alas generadas por código                          |
| T13 | Acabados de alas generados por código    | Idea aprobada                | Realista: un modelo de bastidor, cientos de acabados con reglas visuales de escuela          |
| T14 | Interfaz móvil de la temporada           | Buen comienzo                | Combo 6: claro, con aire; base garage del 2, stats y entrenar del 1, calendario del 4        |
| T15 | Arte de las corredoras                   | Abierta                      | Híbrido 2D con Spine: retrato animado + sprite SD de carrera; alas como piezas del esqueleto |
| T16 | La carrera como espectáculo legible      | Decidida                     | Indicadores dentro del mundo: alas, propulsor, casco y visor muestran el estado              |
| T17 | Rivales y tono                           | Tono decidido                | Cool y con filo, no kawaii; rivales y amistades para después                                 |
| T18 | Ritmo y azar de la temporada             | Problema decidido            | Que el azar nunca tire una temporada: propuesta de redes a aprobar                           |
| T19 | Arquetipos de habilidades                | Abierta (debuffs después)    | Buffer, debuffer y táctica: habilidades que escalan con la mente contra las piernas          |
| T20 | Modo Némesis                             | Futuro                       | Modo aparte con rivales que recuerdan; pensado para el jugador, no para la tienda            |
| T21 | Posición en carrera                      | B aprobada (diseño abierto)  | Elegir Punta/Pelotón/Acecho/Remate antes de largar, separado del estilo de las alas          |
| T22 | La radio                                 | Idea aprobada                | Uno o dos gritos por carrera; la Falconess responde según su personalidad                    |
| T23 | La veterana                              | Idea aprobada                | La Falconess anterior aparece y entrena a la actual; presencia leve, no evento al azar       |

## T1 · Piezas de bastidor

**Propuesta del dueño:** eliminar la sección de piezas: complica sin aportar.

**Hoy:** 8 piezas en 4 ranuras (turbina, batería, estabilizador, firmware), instaladas gratis en el
taller. La métrica 5 las limita a ≤ 3 puntos de victoria cada una, así que la decisión casi no se
nota. En el playtest 1 el dueño nunca fue al taller; la política de referencia instala 0 piezas.

**Recomendación:** sacarlas del juego en v3 sin borrar sus archivos: las carreras golden y las
partidas v1 y v2 usan piezas. El esquema `Part` queda como puerta abierta. La métrica 5 se retira
con su ADR. Si después falta una decisión antes de cada carrera, un «ajuste de pista» (una
elección entre tres, gratis, en la pre-carrera) reemplaza al inventario; no ahora.

## T2 · Cuadrillas como support cards

**Propuesta del dueño:** reformularlas; hoy son abstractas. Deben ser más elegibles (T6).

**Hoy (BRIEF §8):** el hangar de 4 bastidores trae la cuadrilla de cada fabricante. Aparece en los
entrenamientos de sus stats con 35 % + 5 % por nivel de vínculo y suma 15 %. El vínculo no se ve y
cada fabricante tiene un solo evento.

**Recomendación:** separar la cuadrilla del bastidor. Antes de la temporada se arma un **equipo de
apoyo** (4 lugares) con cuadrillas (y, más adelante, Falconess: T7). El hangar queda solo para
correr. Cada apoyo tiene:

- un líder con retrato, nombre y carácter;
- una barra de vínculo visible;
- el **entrenamiento en sintonía** con el vínculo al máximo: un bonus grande, como el arcoíris de
  Umamusume;
- una cadena de 3 eventos que cuenta su historia y regala la pista de una habilidad de su escuela.

Esto cambia la regla del BRIEF «el hangar reemplaza a las support cards»: va con ADR.

## T3 · Carreras opcionales

**Propuesta del dueño:** como en Umamusume, que el jugador decida entre correr y entrenar: correr
da más puntos de habilidad; entrenar da lo normal, pero fijo.

**Decidido por el dueño (2026-10-29):** las carreras opcionales se corren en **pistas nuevas** que
**no son perfectas** para la Falconess que se entrena: otros biomas y segmentos donde su escuela
flojea. Responde la pregunta abierta: el calendario no repite las 3 pistas del desierto.

**Hoy:** 4 carreras objetivo fijas por Falconess, todas en el desierto (las 3 pistas que existen), y
nada en el medio. Los puntos de habilidad salen casi solo del simulador (+5 por sesión).

**Mecánica propuesta (números iniciales, a medir):**

- **Cadencia:** 2 o 3 semanas por mes ofrecen carreras opcionales; nunca la semana de una carrera
  objetivo ni la anterior. Cada una de esas semanas muestra **3 carreras** para elegir, o ninguna
  si el jugador prefiere entrenar. Una temporada ronda 20-24 semanas con oferta.
- **Costo:** la semana entera y **Vigor −15**. No hay fallo de entrenamiento; sí hay desgaste de las
  alas, como en cualquier carrera (se repara en el taller, T4).
- **Premio:** puntos de habilidad según el puesto, como fracción del tope de la carrera: 1.º 100 %,
  2.º 80 %, 3.º 65 %, 4.º 50 %, 5.º 40 %, 6.º 30 %, 7.º 25 %, 8.º 15 %. El tope depende de la
  dificultad: ★ +25, ★★ +30, ★★★ +40. Más la chatarra de hoy por puesto (60 al ganar … 10) y ánimo
  +1 al ganar (6.º o peor ya resta en v2). El jugador solo ve «rivales ★★» y «hasta +30 puntos».
- **Carreras seguidas:** la 2.ª seguida no cambia nada; la **3.ª seguida** (contando las objetivo)
  cuesta Vigor −25 y baja el ánimo un nivel con 50 % de chance; la 4.ª, el ánimo seguro. La
  pantalla avisa antes de confirmar: «Sería la 3.ª carrera seguida».
- **Simulador:** queda en +5 puntos; las carreras pasan a ser la fuente principal. Meta: 2-3
  activas por temporada para quien corre con criterio, 1 para quien nunca corre.
- **Fama** como requisito de las carreras objetivo y táctica en la pre-carrera: después.

**Cómo elige pistas el calendario (que no le queden perfectas):** el calendario se arma al
empezar la temporada, con la semilla (stream propio, por ejemplo `calendar`), mirando las letras de
bioma de la Falconess y la doctrina de su escuela (casa y débil, BRIEF §7):

- como máximo **una opcional por mes en su mejor bioma** (Peregrina: desierto A; Cernícala:
  ciudad A; Caracara: montaña A) o en una pista que premia a su escuela (Kōryū: muchas bajadas);
- en cada semana con oferta, **al menos 2 de las 3** pistas son incómodas: bioma con letra C o
  peor, o con un segmento débil de su escuela (Kōryū: agua; Altair: sprints; Boneyard: velocidad
  pura);
- la dificultad (★) baja cuando la pista le queda peor, para que una pista difícil sea una apuesta
  y no un castigo: «Muy difícil» con rivales ★ y premio más chico, «Pista incómoda» con ★★★ y
  premio grande;
- la ficha de cada carrera dice cómo le queda en palabras («Le cuesta», «Pista incómoda», «Muy
  difícil»), nunca con multiplicadores.

**Pistas nuevas (propuesta: 8, en los 4 biomas que faltan):** distancias como las de hoy: corta
≈ 1200 m, media ≈ 1800-2200 m, larga ≈ 2600-3000 m.

| Pista                     | Bioma   | Largo | Segmentos y carácter                                                   |
| ------------------------- | ------- | ----- | ---------------------------------------------------------------------- |
| Copa Bahía de Sal         | costa   | media | Dos tramos de agua y curvas abiertas: castiga a Kōryū (agua)           |
| Regata de los Acantilados | costa   | larga | Subida, bajada al mar, agua y viento de cañón cruzado                  |
| Gran Premio Ciudad Vieja  | ciudad  | corta | Sprint de curvas cerradas entre rectas cortas: castiga a Altair        |
| Circuito de las Azoteas   | ciudad  | media | Saltos entre techos y curvas: buena para Boneyard, mala para Lumière   |
| Trofeo Paso Helado        | tundra  | larga | Subidas largas y viento en contra: premia la Resistencia, no la picada |
| Clásico del Lago Blanco   | tundra  | media | Rectas largas y hielo fino (agua): velocidad pura, castiga a Boneyard  |
| Copa Cumbre Partida       | montaña | media | Subida, salto y bajada técnica: obstáculos para Rasante                |
| Bajada del Cóndor         | montaña | corta | Casi todo bajadas: casa de Kōryū; para Peregrina sale una vez por mes  |

El esquema actual ya admite estos biomas, segmentos y rasgos (`Biome`, `SegmentType`,
`CourseTrait`): son 8 archivos de contenido con sus textos, sin cambio de esquema. Los biomas
nuevos activan términos de reglas de escuela que ninguna pista midió todavía (por ejemplo
`massThrustCoolPm` de Steinhaus en costa, ciudad y tundra).

**Antes de fijar números (temporadas simuladas):**

- que correr mucho y entrenar mucho sean viables y ninguna estrategia gane siempre: políticas
  «nunca corre», «corre todo lo que puede» y «corre 1 por mes», 500 temporadas por Falconess, en
  dos bases de semillas, con la métrica 7 por Falconess (Wilson);
- cuántas activas aprende cada política (meta 2-3) con estos premios y los costos de T4;
- el castigo de la 3.ª seguida: que encadenar carreras no sea la mejor jugada ni una trampa;
- `pnpm sim:batch` en las 8 pistas nuevas: que ninguna escuela gane casi siempre en su bioma casa
  ni pierda casi siempre en el débil, y que la dificultad ★ ordene de verdad a los rivales;
- que el calendario cumpla sus reglas en todas las semillas (test de propiedad).

### Estudio de simulación (2026-10-30)

**Propuesta pendiente de aprobación del dueño.** Informe completo:
`.work/design3/informe-t3-t4.md` (local, no versionado). Las políticas no miran el calendario futuro.
Se midieron 500 temporadas por Falconess en dos bases de semillas, con la métrica 7 por Falconess
(Wilson 95 %).

- **T3 tal como está escrito no alcanza:** sin stats por carrera, correr una por mes cae a 2,6 % de
  B o mejor. Hacen falta dos reglas nuevas:
  - **cada opcional da +20 a cada stat × la fracción del puesto** (ganar ≈ una semana de
    entrenamiento repartida en las 5 stats);
  - **rendimiento por mes:** la 1.ª opcional del mes da el 100 % de esas stats, la 2.ª el 70 % y la
    3.ª el 30 %. Los puntos de habilidad no bajan.
- **Números propuestos:**
  - topes de T3 tal cual (★ 25, ★★ 30, ★★★ 40) y la misma tabla por puesto;
  - vigor −15 y racha de T3;
  - rivales ★ −70, ★★ −50, ★★★ −30 por stat;
  - **desgaste de alas del 10 % por opcional** y **la mitad de chatarra**;
  - hasta 8 habilidades (7 genéricas + la única); simulador +5.
- **Cambio de motor que pide el arquetipo táctico** (T19): peso de la Agilidad `kA` 350 → 250,
  ritmo por Inteligencia `paceCentreSpan` 43 → 86 y escala táctica 0-2000 ‰. Sin él, la farmeadora
  veloz le gana a la táctica por 5 puntos; con él, la táctica queda 1 a 3,5 puntos arriba.

| B o mejor, `batch-` (`alt1`)        | Caracara            | Cernícala           | Peregrina           | juntas              |
| ----------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Nunca corre                         | **79,0** (76,4)     | 49,4 (51,0)         | 85,8 (84,0)         | 71,4 (70,5)         |
| Una por mes desde la semana 2       | **79,0** (**78,0**) | 46,8 (51,6)         | **94,0** (**92,6**) | **73,3** (**74,1**) |
| Criteriosa                          | 75,2 (74,6)         | 46,4 (50,4)         | 90,0 (90,8)         | 70,5 (71,9)         |
| Farmeadora táctica (2 por mes)      | 70,8 (66,4)         | **53,0** (**56,0**) | 88,4 (**92,6**)     | 70,7 (71,7)         |
| Farmeadora veloz (2 por mes)        | 69,8 (64,8)         | 48,6 (50,0)         | 90,8 (89,8)         | 69,7 (68,2)         |
| Siempre corre, salvo la 3.ª seguida | 53,6 (50,6)         | 21,2 (23,4)         | 76,6 (76,6)         | 50,5 (50,2)         |
| Siempre corre (acepta rachas)       | 30,6 (27,8)         | 8,6 (8,4)           | 43,6 (41,2)         | 27,6 (25,8)         |

En negrita, la mejor de cada columna. Intervalos de ± 3 a 4,5 puntos por Falconess y de ± 2,3 en
«juntas».

**Lectura:**

- Ninguna estrategia razonable domina: quedan a ± 3 puntos entre sí. Correr sin mirar es la peor.
- Cada Falconess tiene su camino:
  - Caracara: no correr, o una por mes;
  - Cernícala: farmear con forma táctica;
  - Peregrina: una por mes (+8).
- Empezar en la semana 13 en vez de la 2 cuesta 6-8 puntos (mensual) y 13-16 (farmeadora).
- Una sola carrera extra es neutra en promedio: −0,5 puntos [−3,1; +2,1], intervalo por bootstrap de
  temporadas.
- Conviene más temprano y con ánimo +1 o menos: +3,5 [+1,1; +5,9] contra ánimo +2.
- Las pistas ★ rinden igual que las ★★★ y se ganan más (62 % contra 50 %).
- No se sostienen como consejo: «3-4 semanas después de una meta», «5 o más semanas hasta la
  próxima» y el vigor.

**Riesgos abiertos:**

- **El equilibrio depende del número de stats por carrera:** con +17 correr se hunde; con +23
  domina. Propuesta: expresarlo como fracción de una semana de entrenamiento y testear su robustez.
- **El cambio de motor le baja la nota a Cernícala** (nunca corre: 62,6 → 49,4). Hay que recalibrarla
  antes del ADR.
- **Las activas superan la meta de «2-3»:** la mensual aprende 5,7, la criteriosa 5,0, la
  farmeadora 6,3 y quien nunca corre 0,4. Propuesta: cambiar la meta a 1 / 4-6 / 6-7.

### Decisiones del dueño sobre el estudio (2026-10-30)

- **Stats por opcional: sí, pero al azar.** La carrera da stats, pero cuál sube se sortea: puede
  servirle o no a la Falconess; igual son stats. Las cuadrillas (T2) pueden sumar **más stats** o
  **más puntos de habilidad** por carrera opcional; el stat que dan también se sortea.
- **Freno al farmeo: opción A, tope por temporada (dueño, 2026-10-30).** Las primeras N opcionales
  del año dan el 100 % de los stats y las siguientes rinden menos, sin importar cuándo se corran;
  una build lenta puede guardar sus carreras para la segunda mitad. N y la caída, a medir.
- **Rendimiento por mes (100/70/30): descartado.** Choca con las builds que tardan en armarse: una
  corredora débil al inicio llegaría a sus mejores carreras cuando ya rinden 30 %. Hay que buscar
  otra forma de frenar el farmeo que no castigue a las builds lentas, y medirla.
- **La táctica no es solo Int y Téc.** La farmeadora de habilidades necesita Resistencia y Agilidad
  para sobrevivir a las carreras; tiene menos que una corredora hecha para sprint, no cero. El
  perfil medido (≈ 70 menos de Agi/Res/Val) ya va en esa línea; los números nuevos deben
  conservarlo.
- **Meta de activas:** depende de cómo queden los dos puntos anteriores.
- **Debuffs:** el rol y su implementación quedan para después (ver T19, pendiente).
- **Pistas ★:** que lo descubra el jugador; no se les sube el premio ni se avisa.

**Estudio de la opción A (2026-10-31), pendiente de aprobación.** Informe local:
`.work/design4/t3a/informe-t3a.md`. 4 bases de semillas × 500 temporadas por Falconess.

- 2 stats al azar por carrera; premio al ganar ≈ 1,5 semanas base de entrenamiento.
- Tope: las primeras 10 opcionales al 100 %, las siguientes al 50 %.
- **Hallazgo:** con el tope solo, guardar las carreras para la segunda mitad queda ≈ 2 puntos debajo
  de no correr nunca (no por el tope, sino por los puntos de habilidad que se ganan antes).
  Propuesta: desde la semana 25 el premio en stats vale ×1,25 (a decidir por el dueño).
- Cuadrillas: hasta +50 % de puntos o +5 % de stats por opcional.
- Meta de activas: 0-1 nunca corre, 5-6 con plan, 6-7 farmea, 2,5-4,5 guarda carreras.
- Riesgo: el premio es un filo (±3 %); hace falta un test de robustez antes del ADR.

## T4 · Taller

**Hoy y estudio (`.work/design2/taller.md`):** nadie va porque la visita cuesta la semana y rinde
menos que entrenar.

**Decidido por el dueño (2026-10-29):** el taller es **un botón en el menú de la semana**. Se entra
y se sale sin que cuente como una semana. La interfaz no lo anuncia: el botón dice «Taller» y nada
más (ni «gratis» ni «no gasta la semana»); al salir se vuelve al mismo menú, en la misma semana.

**Qué hay adentro ahora que no hay piezas (T1):**

| Sección     | Qué hace                                                    | Cuesta                                      |
| ----------- | ----------------------------------------------------------- | ------------------------------------------- |
| Alas        | Cambiar las alas equipadas por otras del hangar             | Nada                                        |
| Reparar     | Devolver la durabilidad de las alas equipadas al máximo     | Chatarra según el daño (≈ 20 por un tercio) |
| Habilidades | Aprender habilidades con los puntos de las carreras (T3)    | Puntos de habilidad (≈ 35-115 por activa)   |
| Rarezas     | Re-sortear las peculiaridades de alas Boneyard (Mule, Kite) | Chatarra: 40 y sube con cada re-sorteo      |

Reglas de la visita:

- Ninguna acción del taller toca el vigor, el ánimo ni el fallo; lo que se gasta es chatarra o
  puntos, y la pantalla siempre muestra el saldo y el precio («Reparar: 20 chatarra»).
- Sin límite de visitas: como no cuesta la semana, no hace falta contar entradas. Se puede deshacer
  dentro de la misma visita (cambiar de alas y volver), no una habilidad ya aprendida.
- Un **aviso** sobre el botón cuando el taller tiene algo para la próxima carrera (alas dañadas,
  una habilidad que ya alcanza, unas alas del hangar que le quedan mejor a esa pista): así deja de
  ser invisible, que fue lo que pasó en el playtest 1.
- La escuela de las alas y de la Falconess se ve en los colores de la pantalla (T5), sin texto de
  doctrina.

**Implementación:** en v3 las operaciones del taller dejan de ser una acción de la semana
(`RunInput.kind: "workshop"`) y pasan a ser entradas que no cierran la semana; `advanceSeason`
sigue siendo pura y cada entrada queda registrada para reproducir la partida. Cambio de estado con
ADR; v1 y v2 conservan el taller que gasta la semana.

**Antes de fijar números (temporadas simuladas):**

- precios de las activas (hoy 60-150; el estudio midió ×0,75) contra los puntos de T3, para que
  2-3 activas por temporada sea lo normal y no lo máximo;
- economía de chatarra: cuánto entra por carreras y cuánto piden reparar y re-sortear, sin que
  sobre siempre ni falte siempre;
- bajar `scrap-heart` antes de abaratar los re-sorteos (el estudio midió que esa rareza sola vale
  +15 a +32 puntos por carrera);
- que «usa el taller» le gane a «lo ignora» por ≈ 10 puntos de victorias (como en el estudio), sin
  que lo ignore quede sin chances.

### Estudio de simulación (2026-10-30)

**Propuesta pendiente de aprobación del dueño** (mismo informe que T3).

- **La visita que no gasta la semana es imprescindible.** Con el taller pago, quien nunca corre no
  cambia (71,2 contra 71,4), pero la mensual cae a 16,7 % y la farmeadora a 6,0 % (200 temporadas
  por Falconess). La magnitud depende de cómo visita la política; la dirección es firme.
- **Precios propuestos:**
  - alas gratis;
  - reparar 60 de chatarra de 0 a lleno (≈ 20 por tercio);
  - habilidades × 0,75 (≈ 35-115 puntos);
  - re-sorteo 40 y sube.
- **Costo de las habilidades:** con × 1,0 la criteriosa baja a 3,8 activas, pero la farmeadora
  táctica pierde 5 puntos de B.
- **Chatarra:** con el desgaste de 10 % por opcional y media chatarra, las reparaciones pasan a
  3,7-8 por temporada sin mover la nota. Igual sobra: la mensual gana 460 y gasta 79; la farmeadora,
  650 y 165. Propuesta: que la chatarra pague los reintentos de las carreras objetivo o el kit de
  emergencia (T18).

| Activas / puntos sin gastar / chatarra ganada y gastada (`batch-`) | Activas | Puntos sin gastar | Chatarra  |
| ------------------------------------------------------------------ | ------- | ----------------- | --------- |
| Nunca corre                                                        | 0,4     | 22                | 182 / 7   |
| Una por mes                                                        | 5,7     | 60                | 460 / 79  |
| Criteriosa                                                         | 5,0     | 29                | 396 / 73  |
| Farmeadora táctica                                                 | 6,3     | 208               | 650 / 165 |

## T5 · Fabricantes como escuelas

**Propuesta del dueño:** cada fabricante es un bando o escuela, como las academias de Umamusume:
sus colores, su metodología, más agresiva o más prudente. Un jugador puede enamorarse de una
escuela (por ejemplo Kōryū) y querer un equipo entero de esa escuela.

**Hoy:** casi todo está escrito. Cada fabricante tiene regla de carrera, paleta, stats de cuadrilla,
bioma casa y débil, y patrocina Falconess (BRIEF §7).

**Recomendación:** sí. La doctrina de cada escuela se expresa con sistemas que ya existen (vigor,
fallo, ánimo, eventos con azar), no con números nuevos:

| Escuela   | Colores (paleta)     | Doctrina en carrera (regla)      | Doctrina al entrenar (propuesta)                                   |
| --------- | -------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Kōryū     | rojo y amarillo      | Ráfagas, ataca en bajadas        | Agresiva: más ganancia, más desgaste (vigor o deriva del ánimo)    |
| Steinhaus | gris acero y plata   | Fuerza bruta, no frena por calor | Resistencia: devuelve vigor, menos lesiones                        |
| Lumière   | marfil y dorado      | Eficiencia, recarga energía      | Precisión: menos fallo con vigor bajo                              |
| Altair    | azul noche y celeste | Telemetría, nunca se recalienta  | Cerebral: pistas de habilidades, más inteligencia, más información |
| Boneyard  | óxido y verde oliva  | Se repara sola, rarezas al azar  | Varianza: eventos con azar, chatarra, picos buenos y malos         |

Una escuela no obliga a nada: mezclar escuelas cubre más stats; un equipo de una sola escuela
concentra su doctrina y sus eventos (la regla de diseño del hangar del BRIEF §8, trasladada al
equipo de apoyo). Las Falconess también pertenecen a una escuela por su patrocinador (Peregrina a
Kōryū, Cernícala a Altair, Caracara a Boneyard; Gerifalte, Esmerejona y Aguilucha ya tienen
escuela asignada).

## T6 · Tres cuadrillas por escuela

**Propuesta del dueño:** dentro de cada escuela, 3 cuadrillas con la metodología y los colores de
la escuela, pero con un líder distinto y beneficios distintos.

**Recomendación:** sí. Las tres varían en un eje dentro de la doctrina, por ejemplo en Kōryū:

- una centrada en Agilidad (la más agresiva),
- una centrada en Inteligencia (la «sesión de datos»),
- una de bajadas y riesgo (Coraje, vuelo de riesgo).

Ejes posibles para diferenciarlas: stat principal y secundaria, tipo de bonus (más ganancia, menos
fallo, vigor devuelto, pista de habilidad), umbral de la sintonía y su cadena de eventos.

**Alcance:** 15 cuadrillas son 15 líderes, 15 retratos y unos 45 eventos. El modelo de datos admite
N cuadrillas por escuela desde el inicio; el contenido del MVP podría ser 2 por escuela, o 3 solo
en las escuelas de las 3 Falconess del MVP (Kōryū, Altair, Boneyard).

**Regla anti pay-to-win:** en Umamusume las support cards son el principal motivo para pagar
(rareza y copias repetidas suben su poder). Las cuadrillas se desbloquean jugando (vínculo,
historia de la escuela), no en el gacha; si algún día entran, rigen las invariantes del BRIEF §9:
los repetidos dan aspecto e historia, nunca poder.

## T7 · Falconess como apoyo (futuro)

**Propuesta del dueño:** que las propias Falconess también puedan ser support cards.

**Recomendación:** sí, en el mismo equipo de apoyo que las cuadrillas: una Falconess de apoyo
entrena a tu lado, tiene vínculo, sintonía y eventos compartidos, y puede aparecer como rival en
alguna carrera. Mismas reglas anti pay-to-win que T6. Fuera del MVP; el esquema del equipo de apoyo
debe admitir los dos tipos desde el principio.

## T8 · Bastidor firma como mejor opción

**Propuesta del dueño:** el bastidor firma ata a cada Falconess con una escuela y es su mejor
opción, pero el jugador puede elegir otro, como entrenar a Sakura Bakushin O para distancias
largas solo porque se puede.

**Hoy:** ya funciona así. El firma copia las stats del genérico de su estilo y solo cambia el
pasivo; el genérico rinde entre el 85 % y el 90 % del firma (invariante 2 del BRIEF §9). Las letras
de aptitud de estilo (Peregrina: Picada A, Rasante E) ya permiten el caso Bakushin: Peregrina con
alas de Rasante corre, peor, pero corre.

**Recomendación:** mantener el margen del 85-90 % y reforzar el vínculo con la escuela con algo
de historia, no de poder: por ejemplo, el firma junto a cuadrillas de su escuela habilita sus
eventos de escuela. Revisar que la pantalla de elección no esconda las alas que «no convienen».

## T9 · Gráfica e ilustración (futuro)

**Propuesta del dueño:** pensar en arte para el futuro.

**Recomendación:** hasta que haya dirección de arte, retratos provisionales: iniciales del líder
sobre los colores de su escuela, para que el sistema se pruebe sin arte. Cuando se encare: una
biblia visual por escuela (uniforme, colores, forma de las alas) y fichas de personaje, en
`docs/world.md` y `docs/characters/`.

## T11 · Qué se desbloquea jugando y qué entra al gacha

**Propuesta del dueño:**

- Las cuadrillas se desbloquean jugando.
- El apoyo de cada Falconess se desbloquea jugando con esa Falconess.
- Al gacha entran solo las Falconess nuevas (como corredoras) y sus bastidores firma.

**Hoy (BRIEF §9):** dos pools, Falconess y bastidores. El pool de bastidores trae también los
genéricos SR y SSR de cada fabricante (Falke, Étoile, Hayate…). Las Falconess repetidas suben un
rango que da trajes y episodios, nunca stats; los bastidores repetidos se desguazan por chatarra.

**Recomendación:** de acuerdo; refuerza el pilar sin pay-to-win, porque nada de lo que da poder al
entrenar se compra. Tres puntos a cerrar:

1. **Bastidores genéricos:** con la propuesta salen del gacha. Se desbloquean jugando con la
   escuela (por ejemplo, al subir el vínculo con sus cuadrillas). Cambia el BRIEF §9: va con ADR.
2. **El firma sin suerte:** quien tiene a la Falconess pero no su firma corre al 85-90 % con el
   genérico (invariante 2). Propuesta: además del gacha, el firma se gana jugando muchas temporadas
   con ella (un hito de su rango de vínculo), para que la suerte adelante el firma pero no lo
   bloquee.
3. **Cómo crece un apoyo:** el de una Falconess se desbloquea al terminar una temporada con ella y
   mejora con más temporadas (su historia avanza); una cuadrilla, con el vínculo acumulado en su
   escuela. Crecer jugando está bien; los repetidos del gacha nunca tocan el apoyo (invariante 4).

Consecuencia: al gacha le queda poco para gastar plumas. En v0 no hay dinero real, así que no
urge; más adelante, trajes y cosméticos de escuela pueden ser el resto de la oferta.

## T12 · Monetización sin depender de un ilustrador

**Problema del dueño:** si al gacha solo entran Falconess nuevas, queda poco para vender; vender
solo trajes y cosméticos ilustrados ata el proyecto a un ilustrador, que termina con más poder que
el estudio.

**Datos (con fuentes en la conversación del 2026-10-29):**

- El ingreso F2P está muy concentrado: en 55 lanzamientos móviles de 2025 (Moloco), el 5 % de
  pagadores con más gasto dio entre el 54 % y el 81 % del ingreso a los 10 meses.
- Umamusume separa corredoras y support cards en dos gachas; las guías recomiendan tirar support
  cards porque pesan más que la rareza de la corredora. Su gacha fuerte es justo el que T11 deja
  fuera.
- Regulación: Bélgica trata las cajas pagas como juego de azar; PEGI clasifica desde junio de 2026
  como mínimo 16 a los juegos que venden objetos aleatorios pagos; Brasil habría prohibido su venta
  a menores desde marzo de 2026 (sin confirmar en fuente oficial).

**Lectura económica:** con un gacha solo de corredoras, el ingreso depende del ritmo al que se
ilustran Falconess nuevas: el ilustrador fija el techo de facturación. Hay que separar el ingreso
del arte hecho a mano, vendiendo cosas que el código produce.

**Opciones:**

- **A · Híbrido (recomendada):** gacha de corredoras y firmas (T11) con pity alto y selector;
  pase mensual y pase de liga con tramo gratis y pago; y una línea de **pinturas de alas**
  generadas por código: colores, franjas, números, calcomanías de escuela, estelas en carrera,
  títulos y marcos de perfil. Las alas son máquinas, como los autos de un juego de carreras: su
  pintura no necesita ilustrador. Más adelante, un editor de pinturas compartidas por jugadores.
- **B · Juego pago con expansiones:** sin gacha; se compra el juego y cada expansión (bioma,
  pistas, escuela, Falconess). Sin riesgo regulatorio; menos ingreso y menos alcance.
- **C · Solo cosméticos ilustrados:** lo que el dueño quiere evitar.

**Sobre los ilustradores, en cualquier opción:** biblia visual y plantillas para que varios
ilustradores puedan trabajar con el mismo estilo; contratos de obra por encargo con cesión de
derechos; el arte a mano se reserva para personajes (lo que más valora este público) y todo lo
demás sale de sistemas paramétricos. El arte generado con IA exige declararlo en Steam y genera
rechazo en parte del público; no conviene basar el plan en él.

## T13 · Acabados de alas generados por código

**Propuesta del dueño:** crear por código 100 o más variantes de bastidor, como los Sparkling de
Aniimo: cambian colores, efectos, sonidos y detalles, no las stats. Que no parezcan «payasos» (el
botín de WoW que no combina), que respeten el sistema visual del juego y que por ser tantas cada
jugador sienta la suya como única.

**Cómo hacerlo realista:** separar el **modelo** del bastidor (Falke, Shiden…: forma y stats,
escaso, hecho a mano o modelado) del **acabado** (cosmético, generado). Un acabado es una semilla
que elige capas de bibliotecas curadas, nunca valores al azar sueltos:

| Capa                 | Biblioteca (ejemplo)                                    |
| -------------------- | ------------------------------------------------------- |
| Paleta               | 8 por escuela, armadas a mano, con su color de escuela  |
| Patrón               | franjas, bloques, degradé, número de dorsal, calcomanía |
| Acabado del material | mate, metalizado, perlado, carbono                      |
| Estela en carrera    | color y forma de partículas                             |
| Sonido               | timbre del motor por síntesis (tono, filtro, pulso)     |

Reglas que evitan el «payaso»: como máximo tres colores con proporción 60/30/10, el color de la
escuela siempre presente, contraste mínimo entre capas, patrones con densidad acotada y
combinaciones prohibidas listadas. Con 8 paletas, 6 patrones, 4 materiales, 5 estelas y 3 sonidos
salen 2880 acabados por modelo; se publican los que pasan las reglas y una revisión visual.

**Unicidad, en números:** con 100 acabados equiprobables, la chance de que una de las 7 rivales de
una carrera lleve el mismo que vos es 6,8 %; con 300, 2,3 %; con 1000, 0,7 %. Los acabados raros
(como Dazzling y Shadow de Aniimo, 0,5 % cada uno al usar un Sigil) bajan más esa chance.

**Reglas del proyecto que respeta:** el acabado es una semilla más (reproducible, como todo el
juego); vive en el estado y en el `Build`, nunca en `packages/sim` (invariante 3: nada comprable
cambia la carrera); no requiere ilustrador más allá de las bibliotecas iniciales.

**Estado:** el dueño aprueba la idea y pide dejarla firme para retomarla después; el prototipo
queda postergado.

### Modelo de datos (propuesta)

- `FinishLibrary` en `packages/content` (JSON validado por `packages/schema`): paletas por escuela,
  patrones, materiales, estelas y perfiles de sonido, cada uno con id, versión y escuela (o
  «cualquiera»).
- `FinishRules`: las reglas visuales que todo acabado cumple (máximo de colores y proporción,
  color de escuela obligatorio, contraste mínimo, densidad de patrón, combinaciones prohibidas).
- `Finish` = `{ frameModel, school, seed, libraryVersion }`. La semilla elige una capa de cada
  biblioteca con el RNG del proyecto (stream propio, por ejemplo `finish`), así que el mismo
  acabado se reconstruye igual en la web, la CLI y una liga. Si una combinación rompe una regla,
  se vuelve a sortear con la semilla derivada siguiente, de forma determinista.
- Catálogo publicado: lista de acabados aprobados (semilla + nombre + rareza), no todas las
  combinaciones posibles. Una biblioteca nueva sube `libraryVersion` y no cambia acabados viejos.
- El acabado vive en el estado de la temporada, en el `Build` y en la `BlackBox`; nunca entra a
  `packages/sim`. Un test lo verifica (invariante 3 del BRIEF §9).

### Rarezas (propuesta)

| Rareza    | Qué suma                                         | Parte del catálogo |
| --------- | ------------------------------------------------ | ------------------ |
| Estándar  | paleta, patrón y material                        | ≈ 80 %             |
| Brillante | estela de color y material metalizado o perlado  | ≈ 17 %             |
| Prisma    | estela animada, sonido propio, detalle exclusivo | ≈ 3 %              |

Ninguna rareza cambia stats, letras ni resultados de carrera.

### Cómo se consiguen (abierto, ligado a T11 y T12)

- Cada bastidor obtenido trae un acabado sorteado de su escuela, como el Sparkling de Aniimo.
- Pase de liga y logros: acabados de temporada o de campeona.
- Tienda: acabados elegidos (sin azar), lo que esquiva la regulación de objetos aleatorios pagos.
- Repintar: cambiar el acabado de un bastidor propio. Como en Aniimo 1.1, conviene poder volver a
  los acabados ya obtenidos.
- Pendiente: si se venden acabados al azar con dinero real, aplican las reglas de T12
  (probabilidades publicadas, clasificación por edad, mercados con restricciones).

### Qué se necesita y qué no

- Una vez: el arte vectorial en capas de cada modelo de bastidor (contorno, paneles, zonas de
  pintura), las paletas por escuela y los perfiles de sonido. Lo puede hacer cualquier diseñador
  con la biblia visual (T9).
- Siempre: nada más. Los acabados nuevos salen de la semilla y las bibliotecas.

### Prototipo pendiente (cuando haya presupuesto)

Una página que genere 100 acabados de un mismo bastidor con alas vectoriales provisionales,
agrupados por escuela, con un botón para generar otros y la lista de reglas que cumple cada uno.
Criterio de éxito: una persona reconoce la escuela de cada acabado sin leer el nombre, y ninguno
desentona.

## T14 · Interfaz móvil de la temporada

**Estado:** el dueño eligió el combo 6 como «un buen comienzo» (2026-10-30). Canvas con las 6
opciones: https://claude.ai/artifact/SDbQJtTmbDcrqiqBQHy63c (fila 6). Fuentes de los artboards:
scratchpad de la sesión (`combos/project/C6-*.dc.html`, generador `c6gen/gen.py`); se copian al
repo cuando se implemente.

**Cómo se llegó:** cinco direcciones (fiel al género, box de carreras, una mano, calendario de
temporada, transmisión deportiva), cada una con menú de la semana, entrenar, carreras opcionales
y taller, revisadas por tamaño de letra, contraste, áreas táctiles y desbordes. El combo 6 combina
las mejores partes; la primera versión era oscura y el dueño la pidió más abierta.

**Lo que fija el combo 6:**

- Tema claro y con aire: fondo de cielo, paneles blancos con sombra suave, sin franjas
  decorativas, grupos separados 16-24 px.
- Una sola cosa roja por pantalla (color de la escuela): la acción principal. El segundo color de
  la escuela solo como relleno con texto oscuro.
- La misma franja superior en todas las pantallas: semana, carrera objetivo, barra de vigor y
  ánimo.
- Menú de la semana: la corredora con escenario libre; Entrenar grande en rojo; Descansar,
  Salida, Carreras y Taller como placas; Equipo en el pie.
- Entrenar: tira de stats con letra de rango y valor; 5 botones redondos siempre visibles; «+N»
  grande sobre la stat que sube; burbuja «Fallo N %»; retrato de la cuadrilla presente con su
  vínculo; en la barra de vigor, el tramo que gastará el entrenamiento resaltado sin números
  (pedido del dueño, como en Umamusume).
- Carreras opcionales: boletos con nombre, cuánto le cuesta la pista a ella, rivales en
  estrellas y «hasta +N»; cinta de semanas que explica el aviso de la 3.ª carrera seguida.
- Taller: el box con las alas puestas, el hangar, las habilidades y reparar; nunca dice «gratis».
- Números ocultos: solo «+N», «Fallo N %», letras de rango, barras, estrellas y «hasta +N».
- Mínimos: cuerpo ≥ 15 px, etiquetas ≥ 12 px, números clave ≥ 20 px, contraste ≥ 4,5:1,
  objetivos táctiles ≥ 44 px, acciones principales en la mitad inferior.

**Pendiente:** verla renderizada en un teléfono real (hay tres textos que entran justos); decidir
si el tramo de vigor parpadea; si Entrenar se confirma tocando dos veces el botón elegido o con un
botón aparte; el arte de la corredora (T9) y la versión de las demás escuelas.

## T15 · Arte de las corredoras

**Fuente:** informe de Claude Deep Research pedido por el dueño (2026-10-30), con el prompt de
esta sesión. Cifras de tarifas publicadas por proveedores y artistas; los totales por corredora y
los presupuestos son estimaciones del informe, no presupuestos cotizados.

**Recomendación del informe:** 2D ilustrado con animación esqueletal (Spine), en dos niveles por
corredora: retrato de cuerpo entero animado (respiración, parpadeo, boca, expresiones) para las
pantallas, y sprite SD para la carrera. Las alas son slots del esqueleto con piezas en escala de
grises que el código tiñe y cambia (encaja con T13); un esqueleto base común para todas.

| Escenario   | Por corredora | MVP (3)       | Año 1 (9 más)   |
| ----------- | ------------- | ------------- | --------------- |
| Mínimo      | 1.300-1.800   | ≈ 5.000-7.000 | ≈ 14.000-18.000 |
| Recomendado | ≈ 4.300       | ≈ 17.000      | ≈ 44.500        |
| Ambicioso   | ≈ 11.000 (3D) | ≈ 45.000      | ≈ 114.000       |

USD, con artistas senior de Latinoamérica o Europa del Este y uso comercial incluido. Un banner
cada 4-6 semanas pide al menos dos personas en paralelo (ilustración y rig/animación).

**Lo que el equipo agrega:**

- La web todavía no usa Phaser: la carrera es React con gráficos propios. Spine tiene runtimes
  web oficiales además del de Phaser (spine-webgl, spine-player, spine-pixi), así que la elección
  del formato no ata la del motor. Decidir el runtime al implementar.
- Antes de contratar: validar en un prototipo que las alas por código encajan en el esqueleto y
  que un segundo ilustrador replica el estilo (el informe lo pide para el MVP).
- Política «arte 100 % humano» en piezas publicadas, y contratos con cesión expresa de
  reproducción y explotación y entrega de archivos fuente (PSD, .spine). Lo legal y lo impositivo
  del informe (Ley 11.723, percepciones, IVA) se valida con abogado y contador.

**Pendiente del dueño:** aprobar el formato; elegir escenario de presupuesto; buscar primero al
director de arte o diseñador de personajes, que arma la biblia visual (T9).

### Variante del dueño: ilustradores invitados para los splash

**Propuesta:** contratar ilustradores indie distintos, con la misma biblia, para que cada
corredora tenga un splash de estilo propio pero reconocible dentro del mismo juego.

**Recomendación:** sí, separando dos capas:

- **Capa uniforme (equipo fijo):** retrato de juego, expresiones y sprite SD, sobre el mismo
  esqueleto Spine y las mismas proporciones. Es lo que el jugador ve todos los días; si cambia de
  estilo entre corredoras, la interfaz se siente rota.
- **Capa de autor (invitados):** splash del banner, arte de eventos y trajes de colección. Cada
  pieza lleva el crédito del ilustrador, como en Arknights, Fate/Grand Order o Azur Lane.

Lo que ningún invitado cambia: la cara (forma de ojos, color, rasgos), el peinado, las piezas
clave del uniforme, la silueta del bastidor firma y los colores de la escuela. Va en la biblia
como lista de invariantes, y el director de arte aprueba boceto, color y final.

Ventajas: ningún artista es imprescindible; cada invitado trae su público (marketing); el estilo
variado vuelve coleccionables los splash. Riesgos: popularidad desigual entre corredoras según el
artista, más coordinación y contratos, y un estilo invitado que se aleje del tono (lista negra de
fan-service de la biblia). El costo por pieza es el mismo que el splash de T15 (≈ 250-700 USD) o
más para nombres conocidos.

### Ajuste: sin director de arte ni equipo fijo (2026-10-30)

**Dato del dueño:** no hay presupuesto para un director de arte ni para un equipo fijo; el dueño
hace todo, y los ilustradores indie invitados serían la forma de variar.

**Recomendación ajustada: modelo «carta coleccionable»** (como Magic: The Gathering o
Hearthstone, donde cada carta tiene su artista y el marco unifica):

- Cada corredora tiene una ilustración principal de cuerpo entero, encargada por pieza a un
  ilustrador indie distinto, con la biblia como brief. Esa misma pieza sirve de splash y, recortada,
  de retrato en las pantallas; se anima solo con código (respiración, leve vaivén, brillo), sin
  rig. Es el escenario «mínimo» de T15, por corredora ≈ 1 ilustración.
- Lo que unifica no es un artista sino la interfaz y las reglas: el mismo marco y los colores de
  escuela alrededor de cada ilustración, y reglas de entrega iguales para todos (cuerpo entero,
  pose 3/4, fondo transparente, luz desde arriba a la izquierda, proporciones de la biblia, la
  silueta del bastidor firma, invariantes de cara y peinado, lista negra de fan-service).
- La carrera no necesita arte a mano: marcadores en los colores de escuela y las alas generadas
  por código (T13).
- El dueño hace de director de arte: aprueba boceto, color y final contra la biblia. La biblia la
  escribe el dueño con ayuda de esta sesión (texto, paletas, reglas, ejemplos de referencia).
- Con presupuesto, después: rig Spine del retrato o un SD de carrera; nada de esto bloquea el
  modelo.

### Variante del dueño: chibis basados en el splash (2026-10-30)

**Propuesta:** hacer las corredoras en versión chibi (SD), como Blue Archive o Stella Sora,
basadas en el splash que dibuje cada ilustrador invitado.

**Recomendación:** sí, en 2D y con una base modular, no en 3D:

- El chibi es lo que unifica el juego cuando cada splash tiene otro autor: todos salen de la misma
  mano y la misma plantilla, y son los que se ven en la carrera, el equipo y los menús.
- **Base modular («muñeca de papel»):** un solo artista hace una vez el cuerpo chibi base en capas
  (cabeza, ojos, boca, cuerpo, brazos, piernas, puntos de anclaje de las alas) y las expresiones.
  Cada corredora nueva es pelo, ropa y colores nuevos sobre esa base, tomados de su splash. Las
  alas las pone el código (T13).
- Animación por código al principio (rebote al correr, inclinación, parpadeo por capas); un rig
  Spine del chibi es barato si después hay presupuesto, porque tiene pocas piezas y se reutiliza.
- 3D chibi como Blue Archive: no, para un estudio de una persona (modelado, rig, animación y un
  motor 3D por cada corredora).
- Costo de referencia del informe de T15: arte SD en capas 150-400 USD por corredora; rig y 4
  ciclos 400-1.000. Con base modular, cada chibi nuevo debería costar menos que el primero.

### Prototipo jugable y decisiones de la pantalla (2026-10-30)

Prototipo para el celular: https://claude.ai/artifact/TsmHRSTAQB3vutpqXbbgBq (fuente en
`docs/design/prototipo/`: `template.html` + `inject.py` arman `falconess-prototipo.html` con las
imágenes; el arte es provisional y generado con IA, T15). Decisiones del dueño:

- **Menú de la semana: diseño D.** La corredora de cuerpo entero es la protagonista; los botones
  flotan sobre sus piernas en forma de \o/: Entrenar al centro, Salida y Carreras a sus lados,
  Descansar y Taller más arriba, Equipo y Menú en las esquinas.
- **Botón Entrenar: delta afilada (3B).** Triángulo invertido esmaltado con borde blanco, franja
  del segundo color de la escuela, brillo y el emblema de la escuela de marca de agua. Debajo del
  texto, chips con los entrenamientos potenciados de la semana (p. ej. «AGI · TÉC») con un brillo
  suave; nada extra si no hay potenciados. Dice qué está potenciado para no repetir la decepción
  del borde arcoíris de Umamusume.
- **Pantalla de entrenamiento:** sin «Tocá de nuevo» ni flechas; el botón elegido no se mueve y
  el doble toque rápido entrena. Cuadrilla en la opción 3 (aro dorado con rayito en el botón y el
  retrato grande con su barra de vínculo arriba a la derecha, como Umamusume). «Fallo N %» como
  etiqueta pegada al borde de arriba del botón elegido, sin fila propia.
- **Stats sin letras de rango** mientras se entrena: solo números. Las letras quedan para la nota
  de fin de temporada.
- La barra de vigor no lleva texto de ayuda; el tramo rayado alcanza.
- **Colores del fallo:** celeste con 0 %, verde de 1 a 19 %, amarillo de 20 a 39 %, rojo desde 40 %.
- **Colores de los números de stat**, con relieve de medalla (degradé metálico, contorno y brillo),
  distintos de los del fallo para que ningún tono de stat se lea como peligro: piedra (< 150),
  jade (150-299), zafiro (300-449), bronce (450-649), rubí (650-849), oro (850-1199) y platino
  (1200, con un brillo que late).

## Informe de investigación: lo que le falta a Umamusume (2026-10-30)

Informe de Claude Deep Research pedido por el dueño, con fuentes en inglés, japonés y chino. Lo más
firme (con fuente primaria o eco en dos o más comunidades): el azar tardío y caro, la duración del
bucle (Cygames sacó «Independent Training» y lo justificó por el cambio de hábitos), la brecha de
poder por copias de support cards, la carrera que no explica por qué se gana o se pierde, y el
techo narrativo de las licencias de caballos reales. Lo débil: las comparaciones con FGO, Blue
Archive, Arknights y Pokémon quedaron como hipótesis sin fuente; las causas de los caballos
ausentes son inferencia de la comunidad.

**Lo que ya confirma lo decidido:** T11 (apoyos que se ganan jugando, sin copias en el gacha)
evita la queja n.º 3; el fallo visible antes de elegir (v2, T14) ataca parte de la n.º 1; el
consejo después de cada carrera y el panel «Por qué» de la repetición ya existen y son la base de
la explicación que pide el informe; arte declarado como provisional y hecho con IA.

## T16 · La carrera como espectáculo legible

**Hueco que señala el informe:** el jugador no puede ligar lo que ve con lo que entrenó; Cygames
sumó cámaras (espectáculo) pero no estado (energía, sprint, cansancio).

**Lo que tenemos:** el motor es determinista y su registro ya guarda energía, físico, calor, fase
y sprint de cada corredora; el consejo y el «Por qué» los usan.

**Recomendación (a decidir):**

- Estado en el cuerpo: las alas lo muestran (brillo con energía, despliegue en el sprint, temblor
  con cansancio, chispas con calor). Encaja con las alas por código (T13) y con los chibis (T15).
- Una franja de estado por corredora en el borde de la pantalla vertical: energía, fase y sprint,
  visible con cualquier cámara.
- Cámara que sigue la táctica (plano general para las que van adelante, persecución para las que
  remontan) y un corte anunciado al empezar el sprint.
- «Por qué perdiste» en una línea al terminar, con el dato del registro, y niveles de visionado
  (solo el final, momentos clave, completa).
- Que cada indicador salga del registro: un indicador que no coincide con la simulación destruye
  la confianza (el informe cita el caso de F1 Manager 2022).

## T17 · Rivales con peso

**Hueco:** en Umamusume cada rival es el caballo querido de alguien; no puede haber villanas ni
derrotas que pesen. Falconess no tiene esa atadura.

**Recomendación (a decidir):** una rival recurrente por temporada, de otra escuela, que aparece en
las carreras objetivo y en eventos, con su propia historia (puede ganar limpio, hacer trampa o
redimirse). Tono de rivalidad deportiva, coherente con «atractivas y simpáticas»: sin oscuridad
gratuita. Las escuelas (T5) dan el marco: rivalidades entre doctrinas.

## T20 · Modo Némesis (futuro)

**Estado:** idea aprobada por el dueño (2026-10-30), para después. No entra en v3 ni en la
temporada normal.

**Qué es:** un **modo aparte**, con una temporada propia diseñada alrededor de rivales con memoria;
no se enchufa en cualquier temporada. Inspirado en la idea de «enemigos que recuerdan» de Shadow of
Mordor, pero con estructura propia y **pensado para el jugador, no para la tienda**: nada de la
rivalidad se compra ni se acelera con dinero.

**Ideas de partida (sin decidir):**

- Cuatro a seis rivales con nombre por temporada, generadas de la semilla: escuela, estilo y rasgo.
- **Ascenso:** la que te gana sube de rango y fama y aprende una contra-táctica de tu estilo, a
  partir de lo que pasó en el log de carrera (quién te pasó, quién te cerró la línea).
- **Marcas:** la que vencés feo o tirás en un choque vuelve cambiada (alas reparadas, más agresiva
  o con miedo).
- **Lazos:** algunas rivalidades terminan en alianza (corren a favor, dan rebufo).
- Las carreras opcionales (T3) sirven para ir a buscar a una némesis o esquivarla.
- Determinista: misma semilla y entradas, misma historia.

**Cuidados:**

- **Patente:** Warner Bros. tiene patentado en EE. UU. el «Nemesis System». El diseño tiene que ser
  distinto en estructura (no copiar jerarquía, ascensos y recuerdos tal cual) y pasar por una
  revisión legal antes de lanzarse.
- **Texto:** plantillas de frases y variantes de retrato (chibis), no escenas a mano.
- **Azar (T18):** la rival que asciende es un desafío legible y con contra, nunca un muro.
- Se apoya en T17 (rivales y tono) y en los arquetipos tácticos de T19 (debuffs de las rivales).

## T21 · Posición en carrera (como front/pace/late/end de Umamusume)

**Estado:** abierta (2026-10-30).

**Hoy:** la posición no se elige; viene con el **estilo de las alas** (cada bastidor tiene uno) y la
Falconess tiene una letra por estilo:

| Estilo     | Qué hace en carrera (motor, 9.4)                              | Equivale en Umamusume | Alas                                       |
| ---------- | ------------------------------------------------------------- | --------------------- | ------------------------------------------ |
| Planeo     | Toma la punta con crucero eficiente; poco propulsor           | Front                 | Falke, Kite, Horizon                       |
| Suspensión | Se queda en el pelotón medio y ataca al 70 %                  | Pace                  | Nimbus, firma de Cernícala                 |
| Picada     | Guarda energía y la gasta en bajadas y en el sprint final     | Late / End            | Shiden, Etoile, firma de Peregrina         |
| Rasante    | Ritmo constante por el suelo; no salta; desvío y más desgaste | Sin equivalente       | Mule, Hayate, Erzherzog, firma de Caracara |

**Opciones:**

- **A · Dejarlo en las alas:** cambiar de alas en el taller (T4, sin gastar la semana) es elegir la
  posición. Simple, pero las alas firma (T8) atan a cada Falconess a un estilo.
- **B · Posición elegida antes de cada carrera, separada de las alas (recomendada):** cuatro
  posiciones (Punta, Pelotón, Acecho, Remate) con letra por Falconess, como en Umamusume; las alas
  ponen el **cómo** (Picada remata en bajadas, Rasante no salta). Da combinaciones (una Picada en
  punta) y deja libres las alas firma. Costo: cambio de motor (el modo de estilo se divide en
  posición + alas), ADR y recalibración.
- **C · Intermedio:** cada estilo de alas trae su posición por defecto y la Falconess puede
  desviarse una casilla (Picada: Acecho o Remate).

**Dueño (2026-10-30):** opción B aprobada, con dos pedidos:

- **Posiciones más distintas entre sí y más visuales:** que se reconozcan de un vistazo en la
  carrera, no solo por el orden.
- **Que usen más las alas:** hoy corren mucho y vuelan poco (el motor solo vuela en los saltos).
- **Le gusta la picada atada al Coraje:** a más Coraje, menos chance de que la Falconess se
  intimide.

**Propuesta del estudio (2026-10-31), pendiente de aprobación.** Informe local:
`.work/design4/t21/propuesta-t21.md`. Maqueta: https://claude.ai/artifact/LifhfwWfzL2Ajidojd2yHQ
(fuente: `docs/design/prototipo/falconess-posiciones.html`).

- Cuatro posiciones que se leen por **altura y forma**: Punta vuela bajo y adelante; Pelotón por el
  suelo en bloque (rebufo, «muro»); Acecho vuela alto detrás del grupo, su sombra cae sobre la que
  lidera y cae en picada en el final; Remate espera atrás y hace la «gran picada» desde el techo.
- Ciclo: Acecho > Punta > Remate > Pelotón > Acecho; el terreno inclina la balanza.
- Vuelo: el cruce de saltos se generaliza a vuelos propios con despegue, costo por Técnica y
  aterrizaje en picada; meta 30-45 % del tiempo en el aire (hoy < 5 %).
- **Prueba de nervio por Coraje:** a más Coraje propio, menos chance de achicarse; a más Coraje de
  la rival, más asusta. Momentos: la sombra, la picada, la alcanzan, el muro. Como mucho 4 por
  carrera; la chance se ve antes de elegir.
- Letra por posición (multiplica la Inteligencia); las alas ponen el cómo.
- Costo: L tirando a XL (ruleset v3 + ADR, recalibrar 16 combinaciones), en 4 etapas.

## T22 · La radio: los gritos del jugador

**Estado:** idea aprobada en principio (2026-10-30), sin diseño.

- **No debe volverse muy interactiva.** Uno o dos gritos por carrera, como mucho; la carrera se
  sigue mirando, no se pilotea.
- **Le da salida a lo que todos hacemos:** gritarle a la pantalla mientras corre y no poder
  decirle nada.
- **La Falconess responde según su personalidad:** obedece, se pasa de rosca, lo ignora o contesta.
  Su respuesta se ve (casco, visor, alas; T16) y se oye en una línea corta.
- Determinista: el grito queda registrado con su tick como una entrada más.

## T23 · La veterana (herencia con presencia)

**Estado:** idea aprobada por el dueño (2026-10-30), sin diseño.

- La herencia es la **caja negra** de la temporada anterior (BRIEF §8), como hasta ahora.
- **Lo nuevo:** la Falconess anterior no es solo un dato; **aparece durante la temporada como
  veterana que entrena y enseña a la actual.** No son herederas ni «inspiración» una de la otra:
  una le enseña a la otra, literalmente.
- **Presencia leve y constante,** no un evento de inspiración al azar como en Umamusume: algunas
  semanas de entrenamiento con ella, un consejo antes de una carrera objetivo, comentarios sobre
  cómo corre la nueva. Que el jugador se encariñe.
- Lo que enseña sale de su caja negra (sus factores, su estilo, sus pistas), así que cada veterana
  enseña distinto.
- Clima y hora con pronóstico: para después (anotado aparte, sin tema propio).

## T18 · Ritmo de la temporada

**Hueco:** el azar duele cuando llega tarde (un mal resultado en el turno 60 de 70 tira una hora)
y las partidas de 30-60 minutos ya no encajan en la vida diaria.

**Recomendación (a decidir):**

- Meta de 15-25 minutos por temporada, medida en playtests con el prototipo.
- Riesgo al principio, red al final: las decisiones arriesgadas pesan más en las primeras
  semanas; para las últimas carreras objetivo, una segunda oportunidad limitada (como los
  despertadores de Umamusume) o una derrota que no borre todo (la nota parcial y la caja negra ya
  existen).
- Saltar eventos ya vistos sin perder decisiones; avance rápido de animaciones.
- Determinismo sin «resolverse»: la incertidumbre en lo que no se sabe del rival y en el recorrido,
  no en tiradas del final.

## Decisiones del dueño sobre T16-T18 (2026-10-30)

**T16 · Decidida.** «Algo excelente y muy in-lore»: en Umamusume no hay nada mecánico ni digital
que indique estados; en Falconess sí. Los indicadores de carrera viven en el mundo: las alas, el
propulsor y el casco. Si algo anda mal, ella también lo ve en rojo en su visor, y el jugador con
ella. La franja de estado, la cámara por táctica y el «por qué perdiste» siguen como propuesta.

**T17 · Tono decidido; rivales para después.** Las temporadas de Umamusume copian la vida real de
cada caballo; Falconess puede inventar esa historia, y cada temporada debe tener el sello de la
corredora con la que se juega. Rivales y amistades (animaciones, segmentos de historia) se verán
más adelante. Sobre el tono, en palabras del dueño: no confundir «atractivas y simpáticas» con el
mundo luminoso y kawaii de idol de las Uma. Ni oscuro, ni depresivo, ni violento, pero con riesgo y
menos alegre siempre: el efecto **cool y badass** que Umamusume sacrifica es lo que Falconess debe
tomar y explotar. Afecta textos, eventos, arte (T15) y la carrera (T16).

**T18 · Problema decidido.** El dueño lo vivió: el azar puede tirar 45 minutos (las support cards
no dan la habilidad, los eventos clave no salen, la herencia no da nada útil) y muchas veces la
temporada se abandona a los 5 minutos por un fallo crucial. Regla: **el azar da variedad, nunca
arruina una temporada.** Propuesta de redes, a aprobar:

1. Nada de azar oculto: el riesgo siempre se ve antes de elegir (el fallo ya lo hace).
2. Protección de mala racha: después de un fallo, el próximo entrenamiento no falla; los eventos
   malos no se encadenan.
3. Lo importante no depende de una tirada: la pista de habilidad de una cuadrilla llega por
   vínculo (al llegar al nivel N, seguro), y los eventos clave de cada corredora salen en semanas
   fijas.
4. Herencia visible y cierta: lo que dan las cajas negras se ve y se fija al elegirlas, antes de
   empezar, sin «sparks» al azar durante la temporada.
5. Inicio que no se pierde: las primeras semanas no pueden hundir la temporada (un fallo temprano
   cuesta poco).
6. Segunda oportunidad limitada en las carreras objetivo (un reintento por temporada) y una
   derrota que deja nota parcial y caja negra.

### T18 · Redes elegidas por el dueño (2026-10-30)

**Red contra el fallo (estilo Star Savior, no estilo Trackblazer).** El dueño comparó dos
referencias: en Star Savior (modo Journey) un objeto de la tienda permite, después de fallar un
entrenamiento, elegir consumirlo y recuperar el vigor perdido; en Umamusume (escenario
Trackblazer) un objeto fuerza 0 % de fallo en una tirada, aunque el vigor esté en 10. Elegido el
primero: el riesgo sigue siendo real (se entrena sabiendo el porcentaje), el objeto solo se gasta
cuando hace falta y no permite ignorar el vigor. Propuesta para Falconess:

- Objeto «kit de emergencia» (nombre provisional): al fallar, el juego pregunta si usarlo. Si se
  usa, la semana queda neutra: se devuelve el vigor, no se pierden stats ni ánimo, no hay lesión;
  tampoco hay ganancia.
- Pocos por temporada (uno o dos), conseguidos jugando (taller, carreras opcionales, eventos).
- Reemplaza a la «protección de mala racha» automática (red 2), que daba fallos gratis sin
  decisión; se mantiene que los eventos malos no se encadenan.
- Para el motor: es una decisión pendiente después del resultado, como una elección de evento.

**Segunda oportunidad en carreras objetivo.** Una gratis por temporada; hasta 4 más (máximo 5
contando la gratis) pagando una moneda. Pendiente: qué moneda. Recomendación: una que se gane solo
jugando (chatarra o fichas de las carreras opcionales, T3), con precio creciente, para que comprar
reintentos no sea pagar por ganar (BRIEF §9) y para que las carreras opcionales valgan más.

### T16 · Pantallas de carrera elegidas (2026-10-30)

Prototipo con cinco vistas sobre dos carreras reales del motor:
https://claude.ai/artifact/1qgVNutxfw5hKTn7592QqW (fuente: `docs/design/prototipo/falconess-carrera.html`).
El dueño eligió tres para pulir:

- **B · Lateral («ver el todo»):** la pista de perfil con el terreno real y las 8 a su distancia.
- **C · Dividida (rendimiento de ella):** primer plano cinematográfico de la corredora y su
  equipo. Su panel de arriba, «Recorrido» (perfil del recorrido, tramos, 8 puntos y «a tu
  alrededor»), es el mejor de los paneles extra: simple y claro.
- **D · Visor (la más cinematográfica y única):** primera persona en el casco. Imagen del dueño:
  lluvia, carrera nocturna, el visor que se mueve a los costados y ella que mira a los lados
  cuando la pasan o la están por pasar.

**Recomendación:** una sola pantalla de carrera con tres cámaras (Táctica = B, Piloto = C, Visor =
D) que se cambian con un botón, el panel «Recorrido» compartido por las tres, y un modo «Director»
que corta solo entre ellas según el momento (Táctica en los tramos tranquilos, Piloto en sus
eventos, Visor en el sprint y la llegada). Regla de T16: todo lo que se ve sale del registro. El
clima y la noche pueden empezar como ambientación, pero si algún día cambian la carrera, van al
motor y al registro primero.

**Decisión del dueño (2026-10-30):** quedan las tres cámaras elegidas (Táctica, Piloto y Visor),
intercambiables en cualquier momento de la carrera. Por ahora quedan así: ya transmiten la
información que necesitan el equipo y el jugador. El pulido (modo Director, Recorrido fijo en las
tres, giro de cabeza, balanceo, lluvia y noche en el Visor) queda para después.

## T19 · Arquetipos de habilidades (buffer, debuffer, táctica)

**Estado:** propuesta del estudio de T3/T4 (2026-10-30), pendiente de aprobación del dueño.

**Pedido del dueño:** una corredora no muy veloz, con mucha Inteligencia y Técnica y muchas
habilidades gracias a tantas carreras, que gane de otra manera: como debuffer, buffer o con otras
estrategias.

**Propuesta:** nueve habilidades tácticas (estudio de la etapa B) cuya fuerza escala con la
Inteligencia o la Técnica **contra la propia Agilidad**: de 0 en una corredora mucho más veloz que
lista a 2000 ‰ con la mente muy por encima de las piernas. Todo entero, determinista, con efecto
diferido un tick y registrado en el log (evento `tactic`; el ledger guarda la energía perdida y los
ticks bajo una táctica rival). Las rivales no las usan hasta T17.

| Arquetipo | Habilidades                                               | Qué hace                                                                                                                                | Cómo se ve (T16)                                                                                                      |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Buffer    | Lectura de carrera, Rebufo, Respirar en el grupo          | Corrige su ritmo hacia lo mejor que puede dar; gasta menos detrás de una rival; recupera energía en el pelotón                          | Visor con la línea de ritmo; alas plegadas en el rebufo; llama del propulsor estable                                  |
| Debuffer  | Presión, Finta, Turbulencia, Cerrar la puerta, Aire sucio | Hace gastar más a la de adelante; les saca energía a las de al lado; aire revuelto atrás; cierra la línea en el final; ensucia el salto | Corchetes en su visor sobre hasta 3 rivales; en la afectada, alas que tiemblan, propulsor que tose y su visor en rojo |
| Táctica   | Concentración                                             | Sus otros efectos duran hasta +60 %                                                                                                     | Contador que se alarga en el visor                                                                                    |

**Lo medido en temporada:**

- La farmeadora táctica (≈ 70 menos de Agilidad, Resistencia y Coraje, la misma Int/Téc, 6,3
  activas, 2 opcionales por mes) empata con la veloz en pistas largas y pierde 5 puntos en sprints
  y obstáculos.
- Es la mejor estrategia de Cernícala.
- Requiere el cambio de motor propuesto en T3; sin él, la veloz con el mismo kit gana.

**Límite honesto:** hoy la «debuffer» gana sobre todo yendo más rápida.

- Con una sola portadora, Lectura de carrera (8,8 m de media) y Respirar en el grupo (8,5 m) pasan el
  tope de 8 m a escala de táctica.
- Presión, Cerrar la puerta y Aire sucio casi no miden (0-0,3 m de media).
- Pendiente: rediseñar esos debuffs, bajar Lectura (≈ 60) y Respirar (≈ 140), y sumar a
  `sim:batch` una métrica de debuff con una portadora.

**Pendiente (dueño, 2026-10-30):** el rol de debuffer y el rediseño de sus habilidades quedan para
después; es ajuste fino. Por ahora se trabaja con buffer y táctica.

**Implementación:** va con un ADR de motor (esquema del efecto `tactic`, evento y ledger nuevos, `kA`
y `paceCentreSpan` por ruleset) en el ruleset v3. v1 y v2 no cambian.
