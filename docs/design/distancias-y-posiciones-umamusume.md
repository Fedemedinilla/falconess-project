# Distancias y posiciones: Umamusume por dentro y qué hacer en Falconess

2026-11-03. Motor medido: `8c92b9b`. No se tocó nada del repo salvo este archivo. Revisado y corregido el mismo día (ver «Verificación» al final).

**Fuentes.** Lo de Umamusume sale de dos simuladores comunitarios (ingeniería inversa, no documentos de Cygames):
[UST] https://github.com/alpha123/uma-skill-tools @`8b3f5e2` (`RaceSolver.ts`, `HpPolicy.ts`, `CourseData.ts`; tablas `data/course_data.json` y
`data/skill_data.json`) y [UMASIM] https://github.com/mee1080/umasim @`d60e089` (servidor japonés; `race/.../data/constants.kt`,
`calc2/RaceCalculator.kt`, `calc2/RaceState.kt`). [LEGA] https://x.com/lega235/status/1944226592710177237.
uma.guide, umareference, gametora, game8.jp, goonhammer, lootbar y mysen.muragon no resolvieron (DNS): lo de esos sitios viene de resúmenes de búsqueda.
**INFERENCIA [modelo]** = cuentas propias con las fórmulas de [UST] y [UMASIM] (`.work/design6/uma-distance-style-mechanics.md`, [MEC]).
Falconess: [PM] `.work/pos1/measure/informe-medicion.md`, [FD] `.work/design6/falconess-distance-facts.md`, [META]
`.work/design6/uma-distance-style-meta.md` y dos copias del motor con reglas nuevas (§4 y §5, fuera del repo).

## 0. Resumen en 5 líneas

1. En Umamusume la letra de distancia solo multiplica la Velocidad del último tercio, igual para todos los estilos. No hay una tabla maestra estilo × distancia; sí hay constantes sueltas por estilo y categoría en mecánicas agregadas después (§1.2).
2. El estilo cambia con la distancia por dos fuerzas: lo proporcional (coeficientes, umbral de HP) premia a las de atrás en lo largo; lo fijo en metros o segundos (aceleración, ventaja de la punta, curvas) premia a las de adelante en lo corto. La recta de cada hipódromo decide el resto.
3. En Falconess hoy la distancia no mueve la mejor posición: todo está escrito en fracciones de L y una posición solo cambia cuándo se gasta un tanque (≈ 20 m).
4. Propuesta: sin letras ni categorías. Una capa de aire (ritmo por posición, esfuerzo, estela, sin aire duele) y una de forma (recta final, bajadas, aire sucio). Regla para el jugador: rinde la más adelantada que llega con aire, y la pista inclina. Ninguna regla lee la posición de una rival.
5. Probado en una copia del motor: la mejor posición va hacia atrás con L y hacia adelante con Resistencia, pero pega demasiado (la mejor 30-48 %, la peor hasta 2 %) y en lo corto Punta gana a cualquier nivel de stats. Primero: escenario «distance» en `sim:batch` y ajuste para que ninguna pase de 40 % ni baje de 10 %.

## 1. Umamusume por dentro

### 1.1 Categorías y qué multiplica la letra

- Categorías de la tabla de pistas: Sprint 1000-1400 m, Mile 1500-1800, Medium 1900-2400, Long 2500-3600 [UST `data/course_data.json`, campo `distanceType`]. Las guías no coinciden en los bordes (https://deltiasgaming.com/?p=279489, https://www.dtgre.com/2025/07/umamusume-distance-types-best-horses-builds.html).
- Letra: S 1,05 · A 1,00 · B 0,90 · C 0,80 · D 0,60 · E 0,40 · F 0,20 · G 0,10 [UST `RaceSolver.ts`, `Speed.DistanceProficiencyModifier`; LEGA]. Multiplica solo el término √(500·Velocidad)·0,002. Ese término existe desde la fase final (2/3) y entra dos veces en la velocidad de sprint [UST `RaceSolver.ts`, `baseTargetSpeed` y `lastSpurtSpeed`].
- Toca la aceleración solo en E, F y G (×0,6 / 0,5 / 0,4). Nunca toca el HP [UST `RaceSolver.ts`, `Acceleration.DistanceProficiencyModifier`; `HpPolicy.ts`]. La velocidad objetivo de apertura y media es la misma con A que con G; con E-G solo cambia la aceleración. Es un dato de la corredora, no del estilo: pesa igual en Front y en End [UST `RaceSolver.ts`].
- Costo de A a B: ≈ −0,32 m/s en el sprint, ≈ −5 m a 1200, −11 m a 2400 y −14 m a 3200 (INFERENCIA [modelo]).
- No se entrena. Se sube heredando chispas rosas: las estrellas de todos los padres se suman (1-3★ = +1 grado, 4-6★ = +2, 7-9★ = +3, 10-18★ = +4); en la herencia inicial no pasa de A y de A a S solo en las herencias de Classic y Senior (https://umamusu.wiki/Game%3AInheritance vía búsqueda; https://gamewith.net/uma-musume/69674). Las estrellas de cada chispa salen al azar al terminar un entrenamiento (https://gametora.com/umamusume/inheritance-guide).

### 1.2 Cómo cambia cada estilo con la distancia

- Velocidad base = 20 − (D − 2000)/1000 m/s: 20,8 a 1200 y 18,8 a 3200 [UST `RaceSolver.ts`]. Fases: apertura hasta 1/6, media hasta 2/3, final [UST `CourseData.ts`]; 24 secciones [UST, UMASIM].
- HP = D + 0,8 · coef · Resistencia [UST `HpPolicy.ts`]. El sprint gasta ≈ 2,5× el crucero por segundo, así que la Resistencia necesaria crece más rápido que D: Pace ≈ 250 a 1200 y ≈ 1525 a 3200 (INFERENCIA [modelo]).
- El sprint se decide a los 2/3 y solo se recalcula si una habilidad de recuperación se activa antes de que empiece. Si el HP no alcanza, cada sprint más lento se acepta con probabilidad (15 + 0,05·Int) % [UST `HpPolicy.ts`, `RaceSolver.ts`].
- Position keep (secciones 1-10; UST simula solo las 5 primeras y lo dice en un comentario): las de atrás guardan una banda detrás de la que marca el ritmo. La banda crece ×(1 + 0,0008·(D − 1000)) [UST `RaceSolver.ts`; UMASIM `RaceState.kt`]. Más cerca que la banda: ritmo ×0,915 en la apertura y ×0,945 en la media, gasto ×0,6, sin tirada [UST `RaceSolver.ts`, `HpPolicy.ts`]. Más lejos: ×1,04 con tirada de Int [UMASIM `RaceCalculator.kt`; UST no modela esta subida].

| Estilo         | Velocidad apertura / media / final | Acel. apertura | Coef. HP | Lugar en el position keep, 1200 m → 3200 m                                                          |
| -------------- | ---------------------------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Front 逃げ     | 1,000 / 0,980 / 0,962              | 1,000          | 0,95     | busca 4,5 m de ventaja sobre otra Front o 12,5 m sobre el resto, fijo [UMASIM `RaceCalculator.kt`]  |
| Pace 先行      | 0,978 / 0,991 / 0,975              | 0,985          | 0,89     | 3,0-5,8 m → 3,0-13,8 m detrás (el mínimo no escala)                                                 |
| Late 差し      | 0,938 / 0,998 / 0,994              | 0,975          | 1,00     | 7,5-8,1 m → 17,9-19,3 m                                                                             |
| End 追込       | 0,931 / 1,000 / 1,000              | 0,945          | 0,995    | 8,7-9,3 m → 20,7-22,1 m                                                                             |
| Runaway 大逃げ | 1,063 / 0,962 / 0,950              | 1,170          | 0,86     | busca 17,5 m de ventaja [UMASIM `RaceCalculator.kt`]                                                |

Coeficientes y bandas: [UST `RaceSolver.ts`, `HpPolicy.ts`]; las bandas en metros son cuentas con su fórmula.

- Sola, esta tabla favorece a las de atrás, y más en metros cuanto más larga: End le saca a una Front sola +10 m a 1200 y +28 m a 3200 (INFERENCIA [modelo], sin tráfico ni habilidades).
- Constantes que cruzan estilo y distancia en el servidor japonés [UMASIM `constants.kt`]: el ajuste de posición (位置取り調整) cuesta HP ×0,3 (≤ 1800 m) hasta ×1,2 (> 2600 m), y la Front paga ×1,2 encima (Runaway ×1,5). La prueba de resistencia (スタミナ勝負) existe solo sobre 2100 m y no depende del estilo.
- «Guardar piernas» (脚をためる) es una tabla estilo × categoría: Front 1,0 en todas; Pace 0,7 → 0,9; Late 0,75 → 1,0; End 0,7 → 0,9 de Sprint a Long. El sprint a fondo (2026) acelera ∝ 1/D^1,5 [UMASIM `constants.kt`, `RaceState.kt`].

### 1.3 Geometría de los hipódromos

| Pista         | 1.ª curva | Curvas | Recta final | El 2/3 cae                           | Qué estilo rinde                                                                                                                                                                                                                                                                                                    |
| ------------- | --------- | ------ | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokyo 1600    | 550 m     | 2      | 525 m       | 8 m antes de la recta                | dividido: Late/End en la CM japonesa de junio, la Front sola pierde (game8, https://game8.jp/umamusume/556600, vía búsqueda); Front/Pace en la Cancer Cup global (https://www.goonhammer.com/preparing-for-the-cancer-cup-in-umamusume-pretty-derby; hoy la búsqueda solo confirma pista y «se decide en la recta») |
| Tokyo 2400    | 325 m     | 4      | 525 m       | 275 m antes                          | Pace; Front pierde los duelos largos (https://uma.guide/guides/cm13-guide vía búsqueda)                                                                                                                                                                                                                             |
| Nakayama 1200 | 300 m     | 2      | 310 m       | 90 m antes                           | Pace por defecto, End la más difícil (https://www.lootbar.com/blog/en/uma-musume-pretty-derby-leo-cup-cm16-2026-guide.html, https://uma.guide/guides/cm16-guide, vía búsqueda)                                                                                                                                      |
| Nakayama 2500 | 100 m     | 6      | 310 m       | 523 m antes                          | 逃げ 15,5 % por entrada, la más alta, en salas japonesas (https://mysen.muragon.com/entry/3636.html; no reconfirmado hoy)                                                                                                                                                                                           |
| Kyoto 3200    | 458 m     | 6      | 403 m       | 664 m antes, con bajada en el sprint | End la más viable (https://lootbar.gg/blog/en/umamusume-pretty-derby-gemini-cup-guide.html, https://www.goonhammer.com/preparing-for-the-gemini-cup-in-umamusume-pretty-derby, vía búsqueda)                                                                                                                        |
| Hanshin 3200  | 370 m     | 6      | 356 m       | 711 m antes                          | sin datos                                                                                                                                                                                                                                                                                                           |

Columnas 2-5: [UST `data/course_data.json`]. Recta real de Tokyo 525,9 m (https://jra.jp/facilities/race/tokyo/course/index.html).

- La recta final es fija por hipódromo (≈ 262-658 m) y las curvas crecen con D [UST `data/course_data.json`]. En las largas el sprint arranca dentro de curvas. Correr abierto cuesta ≈ (π/2) × metros de carril por curva [UMASIM]: ≈ 2 m por curva a dos carriles (INFERENCIA). La de adelante paga menos.
- Salida: demora al azar de 0-0,1 s y arranque hasta 0,85 de la base, igual en cualquier distancia [UST `RaceSolver.ts`]. Pesa más en una corta, y con la 1.ª curva a 100 m los carriles de afuera no llegan a cerrarse (INFERENCIA). Bajadas: modo con gasto ×0,4 [UST `HpPolicy.ts`; UMASIM].

### 1.4 Habilidades por distancia

- La duración escala con D/1000 [UST `RaceSolver.ts`]: una dorada de velocidad vale ≈ 1,3 m a 1200 y ≈ 3,4 m a 3200 (INFERENCIA [modelo]).
- Las de aceleración las limita la diferencia de velocidad, no la duración: pesan más en sprint (INFERENCIA [modelo]). Las de curva o recta se activan en una curva o recta elegida al azar (https://uma.guide/guides/racecourse-analysis vía búsqueda).
- Hay habilidades atadas a distancia (Sprint 116, Mile 175, Medium 337, Long 201) y a estilo (Front 101, Pace 225, Late 168, End 116). Las de Front piden ir 1.ª; las de End, rectas o sprint [UST `data/skill_data.json`].

### 1.5 Estilo × distancia: qué gana o pierde y por qué

| Estilo  | Corta (≤ 1400)             | Larga (≥ 2500)              | Mecanismo                                                                                                                                                                                                                             |
| ------- | -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front   | fuerte, mucha varianza     | floja, salvo Nakayama       | Gana lo fijo: ventaja buscada en metros, acel. 1,0, pelea de posición que dura segundos [UMASIM]. Pierde lo proporcional: final 0,962 durante D/3, pelea con gasto ×1,4, ajuste ×1,2·1,2 sobre 2600 m [UMASIM].                       |
| Pace    | fuerte, la elección segura | neutra y cara               | Siempre cerca del frente (mínimo de 3 m fijo) [UST]. Coef. HP 0,89, el más bajo de los cuatro estilos comunes (Runaway 0,86): pide ≈ 180 de Resistencia más que Front a 3200 (INFERENCIA [modelo]).                                   |
| Late    | neutra                     | neutra a fuerte             | Media 0,998 y final 0,994 pagan en proporción a D; HP 1,00; «guardar piernas» 0,75 → 1,0 [UST; UMASIM].                                                                                                                               |
| End     | la más floja               | fuerte en las guías         | Corta: acel. de apertura 0,945 y ≈ 10 s para subir al sprint, el 55 % del último tercio a 1200 (INFERENCIA [modelo]); bloqueos. Larga: final 1,0 en proporción a D y ritmo bajo con gasto ×0,6 unos 20 s (INFERENCIA [modelo]) [UST]. |
| Runaway | viable                     | inviable salvo un personaje | HP 0,86 y pelea ×3,5: ≈ 650 de Resistencia extra (INFERENCIA [modelo]) [UMASIM]; https://game8.co/games/Umamusume-Pretty-Derby/archives/566098                                                                                        |

Las columnas «corta» y «larga» resumen el §2 ([META §2], con sus URL).

## 2. Lo que dicen los datos y los jugadores

No hay estadística completa por estilo y distancia: uma.moe no apareció. Hay conteos de 50-200 carreras de salas japonesas y guías por copa [META].

| Banda  | Front                     | Pace   | Late            | End                                | Evidencia                                                                                                                                                                   |
| ------ | ------------------------- | ------ | --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint | fuerte, varianza          | fuerte | neutra          | floja                              | https://lootbar.gg/blog/en/uma-musume-pretty-derby-capricorn-cup-guide.html; Hanshin 1400: 追込 0 victorias, con pocas entradas (https://mysen.muragon.com/entry/3303.html) |
| Mile   | según la pista            | fuerte | neutra a fuerte | neutra                             | https://game8.jp/umamusume/556600; https://www.famitsu.com/article/202503/35783                                                                                             |
| Media  | floja                     | fuerte | fuerte          | según el personaje                 | cero 逃げ ganadoras (https://www.famitsu.com/article/202410/21783); https://game8.jp/umamusume/554858                                                                       |
| Larga  | floja; neutra en Nakayama | neutra | neutra a fuerte | fuerte en guías, floja en salas JP | https://deltiasgaming.com/?p=324601; https://mysen.muragon.com/entry/3636.html                                                                                              |
- Lo que más decide una copa no es la categoría. Decide dónde cae la zona de aceleración, el largo de la recta, cuántas Front trae la sala y el personaje nuevo (https://zenno.sunturtle.xyz/doc/frbm vía búsqueda; https://www.famitsu.com/article/202501/31207). Tokyo (recta larga) favorece a las de atrás (§1.3); Nakayama (≈ 310 m, https://en.netkeiba.com/library/detail.html?no=204) a las de adelante (https://www.appbank.net/2023/11/20/game/2688251.php).
- Una Front sola pierde; dos o más estiran el campo. Elegir Front es apostar a la sala (https://game8.jp/umamusume/556600; https://zenno.sunturtle.xyz/doc/frbm).
- Carreras reales: la ventaja de ir adelante es máxima en 5-6 furlongs (líderes 18,5 % contra 6,7 % de las que esperan) y baja con la distancia y con la recta (https://www.geegeez.co.uk/the-importance-of-pace-in-5f-handicaps/, https://www.geegeez.co.uk/tag/courses-where-hold-up-horses-are-favoured/). En el turf de la JRA 2019, 先行 ganó el 44 % (https://keiba-kizuna.com/2023/11/08/83/). Allá la puntera sola gana (https://www.brisnet.com/racing/news/pace-handicapping-the-2007-kentucky-derby): el juego lo da vuelta.
- Les gusta: leer la sala, que el meta cambie de copa a copa, los duelos en la recta [META §6]. Les molesta: Pace en todos lados y End bloqueada la mitad de las veces (https://forums.coin-return.org/threads/umamusume-pretty-derby-cinema-horses-and-oshi-stuff.1441/page-30, https://forums.coin-return.org/threads/umamusume-pretty-derby-cinema-horses-and-oshi-stuff.1441/page-11). También la aceleración al azar y que un personaje decida un estilo (Admire Vega, 17 victorias: https://www.famitsu.com/article/202501/31207). No apareció ninguna queja sobre la letra de distancia.

## 3. Qué lo hace funcionar y qué lo hace flojo

**Funciona:**
- Dos fuerzas opuestas hacen casi todo el trabajo. Lo proporcional empuja hacia atrás y lo fijo hacia adelante; la mejor posición se mueve con la distancia y la pista (§1.5). Las tablas por categoría (§1.2) son parches encima.
- El umbral de HP es nítido. «Le faltó Resistencia» se entiende (INFERENCIA: no hay cita de jugadores).
- Copia hipódromos reales y su sesgo (Tokyo, Nakayama), y la sala se lee antes de largar (§2).

**Flojo:**
- La letra es un decreto: de −5 a −14 m que no se entrenan y se suben con suerte de herencia (§1.1).
- Escalones: bordes de categoría que ni las fuentes acuerdan, más tablas por tramo (×0,3 → 1,2; guardar piernas por categoría; prueba de resistencia solo sobre 2100 m) [UMASIM].
- Razones invisibles. Los coeficientes dicen que gana End; Front gana por tráfico, umbrales fijos y habilidades. El jugador no ve ni una cosa ni la otra (§1.2, §1.5).
- Lotería: sprint aceptado al azar, aceleración en una curva al azar, bloqueos (§1.2, §1.4, §2). Y la Front sola pierde: apuesta de coordinación, no lectura (https://forums.coin-return.org/threads/umamusume-pretty-derby-cinema-horses-and-oshi-stuff.1441/post-304748).
- En lo largo, todo se reduce a llegar al umbral de Resistencia: un chequeo de stat más que una elección (INFERENCIA, del ranking de [MEC §10]).

## 4. Falconess hoy: por qué la distancia no cambia la mejor posición

- No hay categorías ni letras de distancia. La única letra es por posición y solo escala Inteligencia (`packages/schema/src/core.ts:105`). El motor no lee `CourseTrait` (`core.ts:75`) [FD §1]. La única presión que crece con L es el aire: `hpMax = 435 + 400·L_km`, o sea 0,76 / 0,62 / 0,55 hp por metro en las tres pistas [FD §2].

Paso 1, stats 600, letras B, 2 por posición y por ala, 18 000 carreras por pista y base; % de victorias, 25 es parejo [PM §1]:

| Posición | sprint 1200 | ridge 2000 | canyon 3000 |
| -------- | ----------- | ---------- | ----------- |
| Punta    | 22          | 24-25      | 25          |
| Pelotón  | 21          | 24-25      | 22,5        |
| Acecho   | 28-29       | 25         | 26          |
| Remate   | 28-29       | 25-26      | 26,5-27     |

**Por qué** [FD §5]:
1. Cada posición está escrita en fracciones de L (1/6, 2/3, 0,7·L; reservas como % del tanque). Una pista más larga es la misma carrera estirada.
2. Una posición solo cambia cuándo se gasta un tanque, ≈ 20 m. Cada unidad de energía compra los mismos metros, se gaste cuando se gaste.
3. La final absorbe el tanque entero en las tres pistas (99 / 134 / 188 de energía). Guardar para la picada nunca se pierde: juntando alas, Remate gana o empata en las tres pistas (por ala hay excepciones: con Suspensión en sprint gana Acecho, con Planeo en canyon gana Punta [PM §2]).
4. El aire aprieta a todas igual: a 600, en canyon las cuatro se vacían entre 2,82 y 2,88 km.
5. La excepción es Planeo en canyon (gana Punta): es el único término de aire atado a una conducta (gasto ×0,98 liderando) en la única pista con aire corto. Es la plantilla de un efecto de distancia real.

**Mediciones nuevas** (copias del motor fuera del repo):
- Pistas planas de 1200 a 3600 m, 8 iguales, letras B, stats 400-800: cada posición gana 21-28 % en todas las celdas. El largo solo no hace nada.
- Misma geometría, movida: pasar 350 m de curvas y 200 m de agua del principio al final (la recta baja de 1150 a 150 m) subió a Remate (13,6 → 14,5 % por corredora a 600; 12,6 → 14,2 a 400) y bajó a Pelotón (11,8 → 10,7; 12,9 → 10,6), con ± 0,8 por celda. Es lo contrario de Tokyo contra Nakayama.
- Las posiciones no ocupan su lugar. A mitad del canyon la Punta media va 29 m detrás de la líder y la Acecho media 24 m. Las dos Puntas lideran a mitad de carrera en el 54 / 22 / 40 % de las carreras; el azar daría 25 %. Causa probable: el ruido de ritmo (±43 ‰ por fase) separa ≈ 4 veces más que un tanque (INFERENCIA).
- La Resistencia es un precipicio: vale 0 mientras alcanza el aire y lo mismo que Agilidad cuando no [FD §6]. Con las stats de las carreras objetivo (220-530 de media) ridge y canyon ya aprietan el aire (INFERENCIA): una regla de aire actuaría en carreras reales.

## 5. Propuesta para Falconess

### 5.1 Principio

- Sin letras de distancia ni categorías en las reglas. «Corta < 1500 m, media 1500-2500, larga > 2500» es solo una etiqueta, como `CourseTrait`.
- La distancia actúa por el aire; la pista, por reglas físicas del terreno. Copiamos la idea de Uma (fijo contra proporcional), no sus tablas. Cada posición es una forma de gastar aire y tiene una pista que la favorece.
- **Sin ciclo.** Ninguna regla lee la posición de una rival: la estela y el aire sucio miran solo metros y terreno, y el puesto se mide desde la que va primera, sea cual sea su posición. Es lo que pidió el dueño al rechazar el ciclo de ventajas (`docs/design/temporada-v3.md:853`, `:870`).

### 5.2 Capa 1: el aire (diseño de distancia, probado en una copia; todavía no pasa el criterio)

1. **Ritmo por posición**, ‰ largada / media / final: Punta 1015/1015/1000 · Pelotón 1005/1005/1000 · Acecho 995/995/1000 · Remate 985/985/1000. `stylePace` deja las alas y pasa a la posición.
2. **Esfuerzo**: antes del final, el gasto se multiplica por ritmo² (Punta ×1,030 … Remate ×0,970). Sin constante nueva.
3. **Estela**: con cualquier corredora adelante a ≤ 10 m, gasto ×0,92. La que lidera nunca la tiene. En vuelo en formación real el ahorro es de 11-14 % (https://doi.org/10.1038/35099670); en Uma, el ritmo bajo de las de atrás gasta ×0,6 [UST `HpPolicy.ts`].
4. **Sin aire duele más**: `exhaustSpeedPm` 850 → 750.

Con aire de sobra gana el ritmo: Punta. Cuando falta, el esfuerzo y la falta de estela vacían a la de adelante. **Rinde la más adelantada que llega con aire.** Qué regla hace falta, según las variantes guardadas (`res/`, sin la configuración registrada): sin estela Pelotón nunca es la mejor (`v11`); las variantes sin esfuerzo dan Punta en todas las celdas (`v9`, `v10`); sin estela y con agotamiento 850, Punta gana cuando todas se vacían (`paceEff` contra `v5`). Pero con estela, el agotamiento en 850 (`v6` contra `v7`) no le devuelve la victoria a Punta y da brechas algo menores en las largas: la regla 4 no está probada como necesaria.

Pistas planas, 8 iguales, alas de suelo, letras B, 800 carreras por celda, una base de semillas; posición mejor y su % (`res/v15.txt`):

| Stats | 1200 m     | 1800 m     | 2400 m    | 3000 m    | 3600 m      |
| ----- | ---------- | ---------- | --------- | --------- | ----------- |
| 250   | Punta 44   | Remate 43  | Acecho 33 | Acecho 31 | Remate 30   |
| 400   | Punta 43,5 | Pelotón 40 | Remate 43 | Remate 38 | Remate 37   |
| 550   | Punta 43   | Punta 48   | Acecho 37 | Remate 46 | Remate 43   |
| 700   | Punta 43   | Punta 47   | Punta 41  | Acecho 36 | Remate 47,5 |
- A 400, 550 y 700 la mejor se queda o va hacia atrás con L. A 250 vuelve un escalón (Remate a 1800, Acecho a 2400-3000), porque todas se vacían. Una sola stat la cambia de escalón: a 2400 m, Resistencia 350 / 550 / 750 da Remate 45 / Acecho 37 / Punta 49 %.
- **En 1200 m ninguna stat mueve nada**: Punta 43-44 % y Remate 7-8 % de 250 a 700, porque a nadie le falta aire. Es una posición que gana por diseño en lo corto, lo mismo que el dueño rechazó del ciclo, y contradice la regla del prototipo (+80 a +100 en la stat que le falta). Lo corto necesita su propio costo para Punta antes de seguir.
- En las pistas reales (`res/v16.txt`, `v17.txt`): sprint → Punta 36-43 % con las alas de siempre, 44-45 % con alas de suelo, en todo nivel. Ridge → Acecho (250-400), Pelotón (550), Punta (700). Canyon → Acecho 42-51 % con las alas de siempre; con alas de suelo Remate 42-46 % de 250 a 550 y Pelotón 37 % a 700.
- **Pega demasiado fuerte**: la mejor gana 30-48 % (40 % o más en 13 de 20 celdas) y la peor 2-16 % (8 % o menos en 16 de 20); en las pistas reales, Punta 3 % en canyon a 250. La variante de ritmos más suaves («half», `res/v14.txt`; sus valores exactos no quedaron registrados) mantiene el orden pero casi no achica la brecha: la mejor 31-46 %, la peor 2-16 %. Estela 950 y agotamiento 800 deberían achicarla (INFERENCIA).

### 5.3 Capa 2: la forma de la pista (diseño de forma, a medir)

- **Recta final**: constante calculada de cada pista. El plan de Remate arranca al inicio de la recta si cae en el último tercio. Recta corta = tanque varado.
- **Bajadas**: todas gastan ×0,85. Desde L/2, Acecho se adelanta en bajada y le quita a Remate la regla de gastar en bajadas. Es la regla «bajadas → Acecho» del prototipo (`docs/design/prototipo/falconess-posiciones.html:666`).
- **Estela solo en llano y cañón**: en curvas, agua y saltos no hay estela. Esto es nuevo de la combinación (INFERENCIA, a medir): ata a Pelotón a «fase media llana y larga».
- **Aire sucio** (2.ª etapa): en curvas y agua, −12 ‰ de velocidad por cada corredora a ≤ 4 m adelante (máximo 2), menos con Técnica. La que lidera va limpia. Le da a Punta las pistas con curvas y agua, y a Pelotón su punto débil. Mira metros, no posiciones: dos Puntas se ensucian entre ellas («juntarse castiga hacia adentro», T21 v2).
- **Puesto** (solo si hace falta): bandas en metros detrás de la que va primera (Punta 0-3, Pelotón 3-8, Acecho 8-14, Remate 14-22). Es el position keep de Uma sin tiradas, pero sin su «marcapasos del estilo más adelantado», que sí lee el estilo de la rival. Entra si la capa 1 no logra que cada posición ocupe su lugar (§5.8, paso 2).

### 5.4 La pista natural de cada posición

| Posición | Pista natural                                                          | Por qué                                          | Punto débil (INFERENCIA, a medir)          | Hoy                                        |
| -------- | ---------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Punta    | corta o con aire de sobra; curvas o agua al final; recta ≤ 250 m       | ritmo alto gratis cuando sobra aire; aire limpio | Resistencia                                | sprint                                     |
| Pelotón  | larga con fase media llana, donde el aire de Punta no alcanza por poco | estela casi al ritmo de Punta                    | Técnica (aire sucio)                       | canyon a stats medias (objetivo)           |
| Acecho   | media con bajada en la 2.ª mitad; recta 250-450 m                      | se adelanta barato en la bajada                  | Inteligencia (sostener el lugar con ruido) | ridge                                      |
| Remate   | larga, recta ≥ 450 m, rasgos temprano                                  | guarda aire y sale al inicio de la recta         | Coraje (fatiga del final largo)            | ninguna: pista nueva «Recta larga», 2600 m |
- Sigue la nota del prototipo (agua y curvas, Punta; fase media larga, Pelotón; bajadas, Acecho; recta final larga, Remate). Se eligió para seguirla: no es una confirmación independiente.
- Encima, sus stats la mueven de escalón: más Resistencia la corre hacia Punta, menos hacia Remate. El «+80 a +100 en la stat que le falta» del prototipo pasa a ser una prueba medible; hoy falla en lo corto (§5.2). La casa de Pelotón es la más angosta (una celda plana en §5.2, ridge a 550). Es el riesgo principal del diseño, junto con la Punta fija de lo corto.

### 5.5 Cómo lo lee el jugador

```
Cañón · 3000 m · larga · recta final 400 m
Perfil: llano · subida 400-900 · llano 900-2400 · agua 2400-2600 · recta
Su aire (Resistencia 520, Coraje 480)                      [valores de ejemplo]
 ▲ Punta   sin aire a 2,55 km        ■ Pelotón  sin aire a 2,80 km
 ◆ Acecho  llega justa (±3 %)        ▼ Remate   le sobra 6 %
La pista: llano largo (estela: Pelotón) · agua al final (aire limpio: Punta)
Rinde la más adelantada que llega con aire.  Letra: Acecho A.
En su misma posición: 1 rival (pelean el puesto)
```

- El pronóstico es la misma cuenta del motor (`exhaust0` en `budgetTables`) con el ritmo, el esfuerzo y la estela de cada posición. El ±3 % sale de la ventana de ritmo de Inteligencia (±43 ‰) (INFERENCIA: la cifra no se midió).
- La tarjeta no muestra el reparto de rivales por posición para elegir «contra» ellas: solo cuántas comparten la suya.
- Después de la carrera, el «por qué» dice: «Punta se quedó sin aire a 2,6 km; Remate voló 1,9 km en estela» (ledger `draftTicks`). Palabras, no multiplicadores; y cada derrota apunta a una stat de ella, nunca a una rival (`docs/design/temporada-v3.md:883`).

### 5.6 Qué cambiaría frente a Umamusume (objetivos; nada de esto está medido todavía)

| Umamusume (§1-3)                                          | Falconess propuesto                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Letra fija, se sube con chispas al azar                   | Sin letra de distancia (ya es así hoy). El rango de aire sale de sus stats, se ve en km y se mueve entrenando. La letra de posición sigue y hoy decide la elección [PM]. |
| Escalones por categoría y tablas por tramo                | Todo continuo en L; la etiqueta solo se muestra                                                                                                                          |
| Razones invisibles: coeficientes contra tráfico           | Cuatro ritmos y tres reglas de pista, en la tarjeta                                                                                                                      |
| Sprint aceptado al azar; aceleración en una curva al azar | Sin tiradas en las reglas: el plan se calcula. Queda el ruido de ritmo (±43 ‰ por fase, con semilla), que el pronóstico muestra como margen                              |
| La Front sola pierde: apuesta a la sala                   | La que lidera paga solo si falta aire; sola en curvas va limpia, dos Puntas se ensucian                                                                                  |
| La de atrás paga con bloqueos al azar                     | Costo visible: primer tramo lento, recta corta, rasgos tardíos                                                                                                           |
| Pace en todos lados                                       | Meta: cada posición con casa, ninguna mejor en más de 2 de 6 formas (§5.8, paso 3). Hoy la capa 1 da lo contrario en lo corto: Punta en todos lados.                     |

### 5.7 Costo

- **Etapa 1** (capa 1 + recta final + bajadas):
  - `stylePace` (`constants.ts:194`, leído en `state.ts:686`) pasa a la posición; las alas vuelven a 1000. `exhaustSpeedPm` 850 → 750 (si la medición la confirma, §5.2). Esfuerzo: ritmo² sobre el `dK` previo al final; el plan, `capFinal` y `exhaust0` lo heredan.
  - Estela: `draftGapMm` 10 000 y `draftDrainPm` 920. La distancia a la de adelante se calcula después de `rankSnapshot` (64 comparaciones) y se aplica donde se descuenta el aire (`engine.ts:430`).
  - Recta y bajadas: `straightStartMm` y `attackDescentMm` en `CourseGeometry`, calculados, sin cambio de esquema de pista. `descentDrainPm` 850. La regla de bajada pasa de Remate a Acecho.
  - Ruleset v3 nuevo (v1 y v2 intactos), golden regenerados con ADR. La bandera `drafting` (`schema/src/race.ts:280`) y `draftTicks` (`race.ts:430`) cambian de sentido: ADR. Pronóstico como función pura en race-view y claves en `es.json`.
- **Etapa 2** (solo si la medición lo pide): aire sucio y puesto, con campos nuevos en el ledger. Eso cambia el esquema del RaceLog: ADR y golden otra vez. Más la pista «Recta larga».
- **Riesgos:** `hoverDraftPm` 1020 se suma a la estela (Suspensión + Acecho llegó a 51 % en canyon). El puesto achicaría la varianza (σ de ≈ 14-29 m hoy, INFERENCIA [FD §2]): revisar las métricas de sorpresa. La estela y el aire sucio hacen que el campo importe más que hoy ([PM §3]: casi nada): vigilar que no aparezca un «contra-elegir» (§5.8, paso 5).

### 5.8 Qué medir primero

1. **Escenario «distance» en `sim:batch`**: planas de 1200-3600 m, stats 250-700, 8 iguales, alas de suelo, letras B, 800 semillas × 2 bases, Wilson. Pasa si: hoy no hay efecto; la mejor se queda o va hacia atrás al crecer L; cada posición es la mejor en alguna celda de nivel objetivo; en 1200 m, +100 en alguna stat cambia la mejor; tras ajustar, ninguna mejor > 40 % ni peor < 10 %.
2. **Prueba de lugar** con la capa 1: una de las Puntas lidera a mitad de carrera en ≥ 80 % de las carreras y el grupo a 2/3 se abre ≤ 25 m. Si falla, entra el puesto.
3. **Formas sintéticas** (6 formas × 1200 / 2000 / 3000 m + «Recta larga») con la capa 2: cada posición gana en su forma por ≥ 1,5 puntos por corredora, ninguna gana más de 2 formas y ninguna baja de 9 %.
4. **Carreras objetivo reales pareadas** (como el paso 1, §4 de [PM]), con letras reales y en B: la posición del pronóstico gana en algún lado y nunca pierde con significancia. La posición (10-20 m) tiene que pesar más que la letra (4-9 m, INFERENCIA).
5. **Sin contra-elección**: repetir [PM §3] con las reglas nuevas. La mejor posición para un campo concreto difiere de la mejor sin mirar el campo en ≤ 5 % de los campos (confirmado con semillas separadas) y elegir por campo gana ≤ 1 punto. Y en el código, ninguna regla lee `position` de otra corredora.
6. `sim:batch` y `sim:season-batch` completos antes de fijar constantes (CLAUDE.md).

## 6. Decisiones para vos

1. **¿Sin letras de distancia ni categorías en las reglas?** La etiqueta corta / media / larga sería solo para mostrar. _Recomiendo: sí._ La letra de Uma no se entrena y se sube con suerte (§1.1); Falconess ya sufre una letra que decide la elección [PM]. Ojo: las quejas de los jugadores de Uma apuntan más a Pace en todos lados y al azar que a la letra (§2).
2. **¿Aprobás la etapa 1 como ruleset v3** (capa de aire + recta final + bajadas, con ADR y golden regenerados), empezando por las mediciones 1, 2 y 5 del §5.8? _Recomiendo: sí, pero solo si el escenario «distance» pasa la banda 10-40 % y lo corto deja de ser siempre Punta._ Los ritmos suaves solos no alcanzan (medido, §5.2).
3. **¿El aire sucio, el puesto y la pista «Recta larga» esperan a la medición?** _Recomiendo: sí._ Entran solo si Pelotón no encuentra casa o si las posiciones no ocupan su lugar.
4. **¿Cuánto tiene que pesar la posición?** _Recomiendo:_ en campos parejos, la posición más fuerte entre 30 y 40 % (nunca más) y la más floja en 10 % o más. Y la regla del prototipo como prueba: con +80 a +100 en la stat que le falta, otra posición la alcanza.

**Archivos** (temporales, pueden no sobrevivir a la sesión): capa 1 en `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/simx/probe.ts` (resultados en `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/simx/res/`);
formas de pista en `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/geo/geo.ts`, `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/geo/gaps.ts` y `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/geo/gaps2.ts`;
clones leídos para la verificación en `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/src/uma-skill-tools` y `/tmp/claude-0/-home-user/88e16d77-619b-5ded-a939-83ff4297e3cd/scratchpad/src/umasim`.

## Verificación

Revisión adversarial del 2026-11-03 sobre el código de los dos simuladores (clones en `8b3f5e2` y `d60e089`), búsquedas web, [FD], [PM] y los resultados guardados de las copias del motor.

**Afirmaciones de Umamusume (8 de carga):**
1. Letras de distancia y qué multiplican: **confirmado** en `RaceSolver.ts` (tabla S-G, solo en fase 2 y dos veces en el sprint; aceleración ×0,6/0,5/0,4 solo en E-G). Corregido: «apertura y media iguales» vale para la velocidad objetivo, no para la aceleración.
2. Coeficientes de HP y fórmula del HP: **confirmado** (`HpPolicy.ts`: 0,95 / 0,89 / 1,0 / 0,995 / 0,86). Corregido: Pace no es «el peor», Runaway tiene menos.
3. Coeficientes de velocidad y aceleración por fase: **confirmado** (`RaceSolver.ts`).
4. Position keep: bandas, mínimo fijo de Pace y factor 0,0008·(D − 1000) **confirmados** en ambos; ×0,915 apertura / ×0,945 media y gasto ×0,6 en UST; umbrales de la Front 4,5 / 12,5 / 17,5 m en UMASIM. Corregido: la subida ×1,04 solo está en UMASIM, y UST simula 5 secciones, no 10.
5. Decisión del sprint: **corregido**. No es «una sola vez»: se recalcula si una recuperación se activa antes del sprint (`RaceSolver.ts`). La probabilidad (15 + 0,05·Int) % se confirma.
6. Tablas estilo × distancia: **contradecía al resumen**. UMASIM `constants.kt` tiene tablas por estilo y categoría (ajuste de posición, guardar piernas, prueba de resistencia sobre 2100 m). Se cambió «no hay tabla» por «no hay tabla maestra; hay parches».
7. Geometría de pistas: **confirmada** en `course_data.json` (las seis filas). Tendencias: Kyoto 3200 → End y Nakayama 1200 → Pace / End la más difícil **reconfirmadas** por búsqueda. Tokyo 1600 en la CM japonesa de junio (Late/End, la Front sola pierde) se confirma por búsqueda, sin poder atar el id 556600 a ese texto. «Front/Pace en la Cancer Cup global» y el 15,5 % del Arima **no se pudieron reconfirmar** (DNS y búsqueda sin resultado): marcados.
8. Herencia: **ampliado**. 1-3★ = +1 se confirma, pero las estrellas se suman (hasta +4) y hay tope A al inicio.

**Números de Falconess:** la tabla del paso 1, `hpMax`, hp por metro, `capFinal`, vaciado en 2,82-2,88 km, Planeo ×0,98, el precipicio de Resistencia y las referencias de código (`core.ts:75/105`, `constants.ts:194`, `state.ts:686`, `engine.ts:430`, `race.ts:280/430`, prototipo `:666`) coinciden con [FD], [PM] y el repo. Corregido: «Remate gana o empata siempre» (por ala no); planas 21-28 %, no 21-29; la σ de 14-29 m es INFERENCIA de [FD]; el desplazamiento de curvas y agua se confirmó con `geo/rep.py` (± 0,8, y a 400 en la misma dirección). La tabla del §5.2 coincide con `res/v15.txt`, pero la brecha estaba mal resumida («40-50 % / 3-8 %» → 30-48 % / 2-16 %). Además: Canyon con alas de suelo a 700 da Pelotón, no Remate; 400 no «se mezcla». No se re-verificaron las cifras de lugar a mitad de carrera (54 / 22 / 40 %), cuya salida no quedó guardada, ni los valores exactos de los ritmos suaves.

**Elogios sin evidencia:** «ya probado» (la capa 1 no pasa el criterio que el propio informe fija); «Prueba medida: cada posición con casa» (era una meta, y lo corto da Punta en todos lados); «Determinista y pronosticado» (queda el ruido de ritmo); «Coincide con la nota del prototipo» (se diseñó para coincidir); «la letra es lo más flojo» de Uma (sin quejas de jugadores sobre la letra); el ±3 % del pronóstico y los puntos débiles por stat, sin medir. Todos se corrigieron o se marcaron como INFERENCIA. Se agregó un hallazgo que el informe no decía: en 1200 m Punta gana 43-44 % a cualquier nivel de stats, una posición que gana por diseño.

**Ciclo entre posiciones:** ninguna regla propuesta hace que una posición le gane a otra por su etiqueta. La estela y el aire sucio miran metros y terreno, y el roce entre dos Puntas es «juntarse castiga hacia adentro», permitido en T21 v2. La propuesta del [META §7] de convertir la cantidad de Fronts en contra-elección no se adoptó. Había tres riesgos y se cerraron: el puesto se medía desde «la de referencia» (en Uma, el marcapasos del estilo más adelantado, que lee el estilo de la rival) y ahora se mide desde la primera; la tarjeta mostraba «Rivales: 2 Punta · 3 Pelotón…», que invita a contra-elegir, y ahora muestra solo las que comparten su posición; y faltaba una prueba, así que se agregó el paso 5 del §5.8.
