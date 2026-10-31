# Evaluación T21 v2 — carreras de Falconess contra Umamusume

Fecha: 2026-10-31. Fuentes internas: `.work/design4/t21/v2/propuesta-t21-v2.md` (V2 §n), `.work/design5/{uma-mechanics,uma-players,falconess-facts,research-lo-que-le-falta}.md` (RLF = informe de Claude Research).
Todo dato sobre Umamusume lleva su URL. Lo que no tiene fuente está marcado **INFERENCIA**. Las URLs salen de las notas de research; en esta sesión no se pudieron abrir gametora.com ni uma.guide, y varias wikis/foros se leyeron solo por resúmenes de búsqueda (ver uma-mechanics.md y uma-players.md).

## 0. Veredicto

- **Táctico 5/10 · Factible 4/10 tal como está (6,5/10 recortado a MVP) · Buen gameplay 6/10.**
- Es una muy buena capa de _explicación_ montada sobre una carrera que sigue siendo un chequeo de stats. Las micro-batallas pesan menos que el ruido de la propia carrera, y el diseño apaga a propósito la única táctica real que tiene Umamusume: leer qué estilos trae el campo.
- Recortado a E1–E3 y medido antes de construir lo demás, puede llegar a 7. Construido entero, es un XL que un dev solo no termina de calibrar.

## 1. Ingeniería inversa de la carrera de Umamusume

Todo es dataminado por la comunidad. Cygames nunca publicó fórmulas.

**Estructura.** 24 secciones. Apertura 1/6, medio 3/6, final 1/6 y último sprint 1/6 (https://www.umareference.com/guide/races/phases). Velocidad base = 20 − (dist − 2000)/1000 m/s (https://umamusu.wiki/Game:Mechanics, https://www.prydwen.gg/umamusume/guides/stats-guide).

| Stat            | Qué hace en carrera                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Velocidad       | +sqrt(500·Spd)·AptDist·0,002 a la velocidad de sprint (https://uma.guide/guides/race-phases, https://www.umareference.com/guide/stats). En JP, >2000 habilita 全開スパート (https://umamusumelabo.com/news/balance-20260224)                                                                                                                                                                                                                                                                                                             |
| Resistencia     | HP inicial = dist + 0,8·Sta·coefEstilo (https://www.umareference.com/guide/stats/hp, https://www.prydwen.gg/umamusume/guides/stats-guide). Gasto/s = 20·(v − base + 12)²/144 (https://umamusu.wiki/Game:Mechanics)                                                                                                                                                                                                                                                                                                                       |
| Potencia        | Aceleración (base 0,0006) (https://umamusu.wiki/Game:Mechanics). >1200 habilita 脚をためる (https://game8.jp/umamusume/514489)                                                                                                                                                                                                                                                                                                                                                                                                           |
| Agallas (Guts)  | +(450·Guts)^0,597·0,0001 al sprint (https://uma.guide/guides/race-phases). Escala la pelea por la punta y el duelo (https://game8.jp/umamusume/462417)                                                                                                                                                                                                                                                                                                                                                                                   |
| Sabiduría (Wit) | Ruido de velocidad por sección, prob. de disparo de habilidad max(100 − 9000/Wit, 20)%, con piso de 20 % y ≈ 92 % en 1200 (https://x.com/umamusu_reveng/status/1378000398934401032, https://daftuyda.moe/guides/team-trials, https://gamewith.net/uma-musume/69572), prob. de kakari (6,5/log10(0,1·Wit + 1))²%: 19 % con 300 de Wit (https://x.com/umamusu_reveng/status/1380522212411645956, https://www.prydwen.gg/umamusume/guides/stats-guide), y entrada a los modos de position keep (https://umamusumeschool.com/position_keep/) |

**Estilos y position keep.** Hay cuatro estilos (escapista, delantera, media, cierre), cada uno con coeficientes de velocidad por fase. La escapista va a 1,0 / 0,98 / 0,962 y la delantera a 0,978 / 0,991 / 0,975 (https://uma.guide/guides/target-speed). En las secciones 1–10 manda el position keep (https://onj-umamusume.game-info.wiki/d/%A5%EC%A1%BC%A5%B9%BB%C5%CD%CD). El pacemaker es la que va primera entre las del estilo más adelantado (https://uma.guide/guides/race-position-keep):
- Las que van detrás aceleran (×1,04, con chequeo de Wit) si quedan lejos.
- Si van demasiado cerca, entran en Pace-Down (×0,915, ahorra HP) sin chequeo de Wit. Las escapistas no usan Pace-Up/Down sino un modo de speed-up propio (https://uma.guide/guides/race-position-keep, por resumen de búsqueda).
- Cualquier habilidad de velocidad cancela el Pace-Down (https://note.com/200000is/n/n29b4c3df5cae).

**Pelea de escapistas (位置取り争い / Spot Struggle).** Desde 2022-02 en JP (https://www.inside-games.jp/article/2022/02/16/136843.html) y desde el 2025-11-11 en Global (https://www.gosugamers.net/entertainment/news/77552-new-umamusume-pretty-derby-update-adds-guts-buff-increased-resource-drops-and-more):
- Si dos o más escapistas van juntas al principio, ganan velocidad según Guts y gastan bastante más HP (https://umamusumeschool.com/positional_dispute_chasing/, https://game8.co/games/Umamusume-Pretty-Derby/archives/563888). Los multiplicadores ×1,4 y ×3,5 (大逃げ) **no se pudieron verificar**: la doc de zenno dice que los números exactos "no se entienden bien" (https://zenno.sunturtle.xyz/doc/race, por resumen de búsqueda). Tomarlos como **INFERENCIA**.
- Efecto en el campo: con varias escapistas el pelotón se estira (6–10 m de ventaja contra 2–4 m de una escapista sola) y a las de cierre les cuesta más alcanzarlas (https://zenno.sunturtle.xyz/doc/frbm; fuente única, no re-verificada: los metros son orientativos).
- Fielding dos escapistas es viable porque se aceleran entre sí (https://deltiasgaming.com/?p=312914).
- Contracara: se desgastan, y si hay pocas escapistas, los estilos de atrás pueden perder (https://wiki.biligame.com/umamusume/%E8%8B%B1%E9%87%8C%E6%9D%AF%E6%AF%94%E8%B5%9B%E6%94%BB%E7%95%A5).

**Bloqueo.** Te bloquean si alguien va a menos de 2 m delante, a 0,3–0,75 carriles de lado. Tu velocidad queda topada entre 0,988× (a 0 m) y 1,0× (a 2 m) de la de quien te bloquea (https://umamusu.wiki/Game:Mechanics, https://uma.guide/guides/race-mechanics, por resumen de búsqueda), y si el costado está ocupado no cambiás de carril (https://umamusu.wiki/Game:Mechanics).

**Habilidades condicionadas a la posición.** Las condiciones combinan fase, sección, curva o recta, puesto o % de puesto, distancia a rivales, estilo, estar bloqueada o rodeada. Cada una tira su prob. de disparo; las únicas y las verdes siempre disparan (https://kamigame.jp/umamusume/page/233107458644552772.html). Una habilidad de velocidad que salta mientras todavía estás acelerando se desperdicia en parte (https://note.com/200000is/n/n52535480be12).

**Último sprint.** Al entrar al tramo final el juego chequea si el HP alcanza para el sprint máximo; si alcanza, arranca ya (https://gametora.com/umamusume/race-mechanics). Si no alcanza, prueba velocidades más bajas de a 0,1 m/s y arranca más tarde (https://umamusu.wiki/Game:Mechanics). Duelo (追い比べ): dos corredoras a ≤ 3 m durante 2 s en la recta final reciben velocidad y aceleración según Guts (https://game8.jp/umamusume/462417, https://kamigame.jp/umamusume/page/250480682759902040.html). Que el duelo se active por umbrales y no por una tirada es **INFERENCIA**: en esta verificación no encontré fuente abierta que confirme ni los 3 m / 2 s ni la ausencia de tirada; uma.guide solo dice que Guts escala la velocidad en Spot Struggle, Dueling y Last Spurt (https://uma.guide/guides/stats).

| Azar                                                                                                                                                                                                                 | Lo decide el jugador (todo antes de la largada) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Salida tarde 0–0,1 s, independiente de Wit; "salida tarde" visible desde 0,08 s (https://x.com/umamusu_reveng/status/1380565535574749186, https://uma.guide/guides/race-phases, https://umamusu.wiki/Game:Mechanics) | Personaje y aptitudes                           |
| Kakari: si ocurre, cuándo, cuánto dura (https://game8.jp/umamusume/449806)                                                                                                                                           | Estilo                                          |
| Disparo y punto de disparo de cada habilidad                                                                                                                                                                         | Stats (vía el entrenamiento)                    |
| Ruido de velocidad por sección; chequeos de position keep                                                                                                                                                            | Habilidades                                     |
| Opción de sprint (**INFERENCIA**: ponderada por Wit); tráfico emergente                                                                                                                                              | Equipo de 3                                     |

Durante la carrera no hay input del jugador (**INFERENCIA**: es de conocimiento común, pero no encontré fuente explícita).

## 2. Qué tan táctica es Umamusume de verdad

- **Lo que dicen los jugadores.** Lo principal es llegar a los umbrales de stats de cada pista, y la estrategia (estilo, habilidades, equipo) va segunda (https://deltiasgaming.com/?p=305775).
- **La única táctica real es la mezcla de estilos.** Los jugadores apuestan qué traerá el lobby y se equivocan: terminan siendo la única escapista o no hay ninguna (https://forums.coin-return.org/threads/umamusume-pretty-derby-cinema-horses-and-oshi-stuff.1441/post-304748). Los metas por copa cambian según la pista (https://www.goonhammer.com/preparing-for-the-cancer-cup-in-umamusume-pretty-derby). El "debuffer" es la única interacción directa entre jugadores, y depende del azar (https://games.gg/umamusume-pretty-derby/guides/uma-musume-guide-build-pvp-debuffer-evil-nature/).
- **Lo que frustra.** Kakari, salidas tarde y habilidades que no saltan. La final es una sola carrera con un solo intento (https://umamusu.wiki/Game:Champions_Meeting). Siliconera la llama "fantastic, infuriating PvP" (https://www.siliconera.com/umamusume-champions-meeting-is-fantastic-infuriating-pvp/).
- **No hay pedido documentado de comandos en carrera** (lo más cercano: https://deltiasgaming.com/?p=305775).
- **Informe de Claude Research (RLF §1, §3, §4.1, §6; nombra fuentes pero sin URL).**
  - La carrera "no está diseñada para explicar". Cygames agregó cámara y espectáculo, pero no el estado de las corredoras.
  - Lo que más duele es el azar tardío y caro: "my perfectly trained racer loses to a bad start" (Game8, citado en RLF §3).
  - La recomendación del informe: que la incertidumbre venga de lo que no sabés del rival, no de dados.
  - Y una advertencia: una carrera determinista se "resuelve".
- **Conclusión.** Umamusume es poco táctica en carrera (0 decisiones) y moderadamente táctica antes de la carrera (estilo contra un campo incierto). Gran parte de lo que parece táctica es en realidad gestión de varianza vía Wit. Su profundidad emergente (pace, pelea, duelo) se _ve_ pero no se _controla_.

## 3. Falconess T21 v2 contra Umamusume, punto por punto

| Aspecto                             | Umamusume                                                                                                                      | T21 v2                                                                                                                               | Veredicto                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Estilo/posición antes de la carrera | Se elige a ciegas contra el lobby (fuente en §2)                                                                               | Punta/Pelotón/Acecho/Remate, con el campo y las stats rivales a la vista y una probabilidad medida (V2 §6)                           | **Empeora la decisión:** queda casi resuelta. Mejora la información                                                        |
| Composición del campo               | Varias escapistas estiran el campo, 6–10 m contra 2–4 m (https://zenno.sunturtle.xyz/doc/frbm)                                 | Presencia < 3 pts, estar sola vale 2–4 pts (V2 §8.3, §8.6)                                                                           | **Empeora:** se apaga la táctica que los jugadores reconocen                                                               |
| Pelea por la punta                  | Boost por Guts y más gasto de HP, sin elección (https://umamusumeschool.com/positional_dispute_chasing/)                       | Pique: con más Int cedés antes y guardás energía, pero perdés las habilidades de puesto                                              | **Mejora la simulación, no la decisión:** el trade-off existe, pero lo toma el controlador                                 |
| Bloqueo                             | 2 m, 0,3–0,75 carriles, tope 0,988–1,0× la de adelante, sin salida visible (https://umamusu.wiki/Game:Mechanics)               | Bandas con ancho, tapón ≤ 30 ticks, reacción por Int, hueco por Coraje, sin tirada                                                   | **Mejora en acotado** (salida garantizada). Que sea más legible es promesa: el gate 15 de lectura a 360 px no se midió     |
| Kakari                              | 19 % con 300 de Wit, odiado (https://x.com/umamusu_reveng/status/1380522212411645956)                                          | Arrebato cortado (V2 §9)                                                                                                             | **Mejora**                                                                                                                 |
| Salida                              | Azar puro 0–0,1 s, Wit no influye (https://uma.guide/guides/race-phases)                                                       | Reacción de la Punta: slot 31, ventana que achica la Int (Int 600: 0–4 ticks = 0–0,27 s, casi 3 veces la de Umamusume), y encadena ✗ | **Copia lo peor, en parte:** al menos la stat la acota, pero la ventana es más grande y el efecto cascada lo agrava        |
| Duelo final                         | Empuje simétrico por Guts; sin tirada según las notas de research (**INFERENCIA**, ver §1) (https://game8.jp/umamusume/462417) | "La alcanzan": tirada de Coraje que solo resta (24 ticks sin propulsor, 3–5 m)                                                       | **Empeora:** aunque el duelo de Umamusume tuviera tirada, uno que solo resta en el momento más emocional es peor diseño    |
| Habilidades por posición            | Condicionadas y con tirada de disparo (https://kamigame.jp/umamusume/page/233107458644552772.html)                             | Checkpoints de puesto todo-o-nada, sin tirada                                                                                        | Mejor sin tirada, pero el efecto cascada es malo                                                                           |
| Dimensión vertical                  | No existe (carriles 2D)                                                                                                        | Bandas suelo/baja/alta/techo, picada, Abanico                                                                                        | **Novedad real**                                                                                                           |
| Explicación                         | La cámara oculta el porqué (uma-players §4)                                                                                    | Panel de micro-batallas en metros y «Por qué perdiste» contrafactual                                                                 | **Mejora grande en potencia:** el mejor punto de venta si pasa el test de lectura y la batalla supera el ruido (sin medir) |
| Azar                                | Muchas tiradas dentro del loop                                                                                                 | Todo pre-sorteado (32 slots); nervio con ≤ 3 tests                                                                                   | **Mejora**, aunque E4 reintroduce dados                                                                                    |
| Input en carrera                    | Ninguno (**INFERENCIA**)                                                                                                       | Ninguno (T22 sin diseño)                                                                                                             | **Empate**                                                                                                                 |

## 4. Táctico: 5/10

**Por qué no más.**
1. **La única decisión, elegir posición, sale casi resuelta.**
   - Matriz 45–55 %, presencia < 3 pts, la pista y las stats "pesan más que el hueco en el campo" (V2 §2.2, §8.2–8.6).
   - Encima la ficha de entrenamiento dice "la perdés 6 de 10" para cada pelea, y la pantalla previa a la carrera preselecciona la tarjeta de menor faltante y muestra tus stats contra la rival concreta (V2 §6).
   - La posición óptima queda como función fija de (stats, pista), y la calcula el juego. Elegir la preseleccionada es estrategia dominante (**INFERENCIA** que se sigue de los propios gates de V2).
2. **En carrera hay 0 decisiones.** «Respirar en el grupo» contra pelear la proa, y ceder el pique: esos trade-offs los toma el controlador, no el jugador.
3. **Las micro-batallas son ruido narrado.**
   - Habilidades de puesto 2–6 m, relevos 2–4 m, nervio 3–5 m, tapón 1–3 m.
   - La misma build varía σ ≈ 15 m en el sprint y ≈ 30 m en el cañón (falconess-facts §1; **INFERENCIA** a partir del σ en %).
   - El jugador va a perseguir causas más chicas que la varianza.

**Por qué no menos.** El entrenamiento sí es una decisión real y mejor informada que en Umamusume: cada batalla nombra su stat y la pantalla de entrenamiento apunta a ella. Las interacciones simétricas (tráfico, rebufo, pique) generan pace emergente como Umamusume, sin reintroducir un ciclo piedra-papel-tijera.

**Casos degenerados.**

| Caso                                          | Riesgo                                                                                                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agilidad reina                                | **Alto.** +100 Agi ≈ 2,5 % de velocidad contra 0,36 % de Int (falconess-facts §1, §9), y V2 le da además salida, pique, proa, relevos y "a tiro". El gate de "≤ 35 % de cartas" cuenta etiquetas, no share de victorias, así que no lo detecta |
| Siempre la preseleccionada                    | **Alto** (punto 1)                                                                                                                                                                                                                             |
| Posición vacía siempre                        | Bajo: está acotada a 2–4 pts. Pero ese mismo cap es el que mata la lectura del campo                                                                                                                                                           |
| Pelotón que nunca pelea la proa               | Medio: si regenerar vale más que las habilidades de la proa, desaparece la guerra de relevos. Hay que medirlo                                                                                                                                  |
| Ceder el pique a propósito con mucha Int      | Puede ser EV+. Sería una buena decisión… si la tomara el jugador                                                                                                                                                                               |
| Cascada de la Punta                           | Salida perdida → pierde la punta → no salta Escapada → Viento propio ✗. Una tirada temprana apaga todo el kit                                                                                                                                  |
| Farmear la banda baja en pistas con agua (T3) | Medio: hay que gatear el % de curva y agua por pista                                                                                                                                                                                           |

## 5. Factible: 4/10 completo, 6,5/10 recortado

**Lo que no es problema.**
- **CPU.** El cañón son ~2.100 ticks (**INFERENCIA**: ~135 s × 15) y un barrido de pares de 64 es ~134 k comparaciones. p95 hoy 3,39 ms contra 5 ms de presupuesto; si se cumple el gate de +25 %, queda en ≈ 4,2 ms. Ese +25 % es una meta de V2 §8.14, no una medida.
- **Determinismo.** El nervio usa slots 28–30 y la salida el 31. `rngBlock` sigue en 32. Los reclamos se resuelven con el estado del tick anterior, en orden fijo.

**Lo que sí es problema.** El tamaño de la superficie de calibración.

| Concepto                                         | Número                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Reglas nuevas                                    | ~30                                                                             |
| Modos de controlador                             | +11 (la precedencia pasa de 11 entradas, contando las 4 filas de estilo, a ~22) |
| Campos de estado por corredora                   | ~20                                                                             |
| Eventos de log / campos de ledger                | 12 / 8                                                                          |
| Constantes numéricas nuevas                      | ~80 (sobre ~45 existentes)                                                      |
| Habilidades de puesto                            | 10                                                                              |
| Grupos de gates / bandas numéricas               | 15 / ~35                                                                        |
| Composiciones posibles de 8 con ≤ 3 por posición | 31                                                                              |
| Celdas alas × posición                           | 16, **sin especificar en V2**                                                   |
| Pistas                                           | 3, todas desierto; 11 recién después de T3                                      |
| Tabla precomputada de la carta                   | ~1.400 celdas (**INFERENCIA**)                                                  |
| Código                                           | +2–3 k líneas no-test sobre ~4.970, +~3 k de test (**INFERENCIA**)              |

**Señales de alarma.**
- **Sensibilidad.** Pasar el desvío de suelo de 1,25 a 1,10 movió el suelo en la cresta del 6 % al 38 %. Con 80 constantes acopladas esperá 10–20 pasadas por etapa (**INFERENCIA**), o sea meses de calibración en solitario.
- **Métrica 5 imposible hoy.** Exige que cada posición sea la más cómoda en al menos un tipo de pista (V2 §8.5), y con 4 posiciones y 3 pistas no se puede (palomar). Además el nicho de la Punta (curvas y agua) no existe hasta T3.
- **Balance actual.** El `out/balance.md` en disco está viejo y falla las métricas 2, 3, 4, 5 y 7. ROADMAP dice que el perfil completo pasa, pero con celdas en el borde.
- **Diseño incompleto.** Falta la tabla 4×4 alas × posición y la interacción con KICK/PLAN para las posiciones que pican. Son las dos piezas más grandes del controlador. Sin eso, E2 no se puede estimar.
- **Vista de 360 px sin artista.** 7 sub-carriles, ⚡, ⊏⊐, iconos llenos o vacíos, cola punteada, flash cian, zoom de 0,5 s y plano cenital del Abanico.
- **Todo-o-nada + timers duros.** El resultado queda como función escalonada de las stats, y van a aparecer celdas no monótonas en el test S8 y en la métrica 7.

**MVP realista para un dev solo.** Posiciones + bandas sin sub-carriles + tráfico/tapón + pique + 1 habilidad por posición + panel leído del log. Sin nervio, sin tabla precomputada, sin contrafactual, sin relevos. Es un L, no un XL.

## 6. Gameplay: 6/10

- **Novedad: 8.** Las bandas verticales, la picada, la gran picada y el Abanico en orden real de ranking son identidad propia, imposible en los carriles 2D de Umamusume. Cada posición tiene su momento firma.
- **Legibilidad: 7 la promesa, 4 la ejecución.**
  - El panel con metros ataca de frente la queja #1, "no sé por qué perdí" (uma-players §4; RLF §3).
  - Matiz: el «Por qué» usa un contrafactual con la misma semilla y solo en derrotas por < 10 m (V2 §6, §8.12), así que el metro que nombra es real para esa carrera. El riesgo no es que mienta, sino que el jugador lea un ✗ de 3 m como la causa cuando, entre carreras, el sorteo de pace mueve 15–30 m (**INFERENCIA**). Si la lección que saca no se sostiene en la siguiente carrera, repite el fallo de confianza de F1 Manager que cita RLF §3: un indicador que no coincide con lo que la simulación hace en promedio.
  - Lo mismo pasa con dibujar el relevo una banda más arriba cuando vale 1–2 px: la vista exagera lo que hace el motor.
- **Frustración: media-alta en dos puntos concretos.**
  - La salida aleatoria de la Punta que encadena ✗ es literalmente la queja "a bad start ruined it" (RLF §3).
  - "La alcanzan" es una moneda tardía que solo resta, en el momento más emocional. En Umamusume el duelo escala con Guts (https://uma.guide/guides/stats); que no tire dados es **INFERENCIA** (ver §1).
- **Carga cognitiva.** En 360 px hay demasiadas señales. Un casual no va a saber cuál de las cinco decidió la carrera.
- **Rejugabilidad de la decisión: baja** (**INFERENCIA**). Si la carta te da la respuesta, el jugador aprende "entrená Agilidad y elegí la preseleccionada" en pocas temporadas.

## 7. El abogado del diablo: dónde tiene razón y dónde no

| Ataque                                                      | Mi veredicto                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No es táctico, es un chequeo de stats que se explica solo" | **Tiene razón.** Es una elección deliberada (anti-ciclo), pero el resultado es menos táctico que Umamusume, no más                                                                                                                                              |
| Batallas por debajo del ruido                               | **Probable.** El σ es inferido; hay que medirlo en E1 antes de cualquier otra cosa                                                                                                                                                                              |
| Inbalanceable para uno solo                                 | **Tiene razón.** Lo muestran los datos de sensibilidad del propio proyecto                                                                                                                                                                                      |
| Métrica 5 imposible con 3 pistas                            | **Tiene razón** (palomar)                                                                                                                                                                                                                                       |
| Agilidad súper-stat                                         | **Muy probable**, no medido                                                                                                                                                                                                                                     |
| La vista exagera                                            | **En parte.** Es chico en escala, pero corroe justo la honestidad del panel                                                                                                                                                                                     |
| El nervio son dados                                         | **Tiene razón en el principio.** El impacto es acotado (< 15 % de victorias)                                                                                                                                                                                    |
| Costo de performance                                        | **No tiene razón.** Es manejable; el contrafactual va post-carrera                                                                                                                                                                                              |
| "No mejora a Umamusume porque también es todo pre-carrera"  | **En parte no.** La carta con el campo visible y el porqué en metros _apuntan_ a la queja principal de legibilidad; que la resuelvan depende del test de lectura (gate 15) y de señal contra ruido, ninguno medido. Sería una mejora de legibilidad, no táctica |
| "Algo más simple sería mejor"                               | **En parte.** E1 _ya es_ lo simple. El error es comprometerse al XL antes de que E1 demuestre que las batallas importan                                                                                                                                         |

## 8. Recomendación

**Mantener**
- Bandas como carriles con ancho, tapón ≤ 30 ticks con salida garantizada, reacción por Int, hueco por Coraje sin tirada.
- Referencia del campo = 3.ª. Ninguna fórmula recibe la posición del rival. Test de presencia.
- Pique con cesión por Int. Picada y gran picada. Abanico en orden real.
- Stat dueña por posición. Panel de micro-batallas leído del log. Carta de requisitos con la composición del campo.
- Cero tiradas dentro del loop.

**Cortar (primer ship)**
- E4 entero: nervio, "la alcanzan" con tirada, nervio en el hueco.
- Relevos como mecánica de motor.
- Intrusa / modo SEGUNDA, cola del techo y escalera del Remate.
- 6 de las 10 habilidades de puesto: queda 1 por posición.
- La línea "la perdés X de 10" de la ficha de entrenamiento (y su tabla), y la preselección de la tarjeta antes de la carrera.
- Sub-carriles en la vista y todos los zooms salvo la gran picada.
- Tabla precomputada.

**Simplificar o cambiar**
1. **Salida de la Punta determinista** por Agi + Int, y checkpoints independientes, para que perder P1 no baje P(ganar P2) más de 20 pts. Si no, rebote a medio valor por defecto (§10.3).
2. **"La alcanzan" → empuje simétrico** escalado por Coraje con gasto extra, al estilo del duelo de Umamusume (que escala con Guts). Sin tirada.
3. **Sacarle a Agilidad al menos dos batallas:** proa → Int, "a tiro" → Tec o energía. Sumar un gate de _share marginal de victorias_ por +100 de cada stat (la stat dueña tiene que ser la top de su posición) y un gate sobre qué stat nombra el «Por qué» (≤ 35 % cada una).
4. **Relajar presencia de < 3 a 4–8 pts**, con la matriz promediada sobre campos probables en 45–55 %. Contrapickear dentro de esa cota es una decisión, no un ciclo.
5. **Información parcial antes de la carrera:** composición rival como rangos ("1–2 Punta") o solo el rival T17 visible, y el resto se revela en la largada. La incertidumbre sale de lo que no sabés, no de dados (RLF §6.4).
6. **Escalar las batallas por encima del ruido:** o bajar a la mitad la amplitud del sorteo de pace, o pocas batallas grandes (≤ 2 por carrera, 8–15 m cada una). Mostrar el «Por qué» solo si |Δ contrafactual| ≥ 3 m con el signo correcto; si no, "perdiste por ritmo base / pace del día −18 m".
7. **Fijar las alas como término constante** mientras se calibran las posiciones, y escribir el ADR 4×4 alas × posición + KICK/PLAN **antes** de escribir código.
8. **Gates mínimos que sí bloquean:** matriz 45–55, presencia, share 18–32, no-regresión, performance. El resto es reporte. Métrica 5 queda detrás de T3.

**Orden de construcción** (si una etapa no pasa sus gates núcleo en ~10 pasadas, se shipea la anterior)
1. Posiciones + vuelo por bandas, sin interacciones. Gate: matriz y share. Así se prueba primero lo riesgoso: que las posiciones se diferencien.
2. Tráfico/tapón, rebufo y pique. Gate: presencia relajada + test de legibilidad a 360 px con 3 personas que no diseñaron nada.
3. 4 habilidades de puesto + panel desde el log. Recién después: contrafactual, carta con probabilidades, Abanico completo.
4. T22 radio como capa de decisión en carrera, construida sobre las micro-batallas:
   - "¡Cedé! / ¡Aguantá!" en el pique.
   - "¡Por arriba!" cuando te tapan.
   - "¡Ahora!" para mover la picada ±N ticks.
   - Obedecer, pasarse o ignorar depende de personalidad + Int, es determinista y queda logueado.

   Es el único lugar donde Falconess le gana a Umamusume en táctica, que no tiene input en carrera (**INFERENCIA**).

**Experimento barato antes del XL (1–2 días, sin tocar el motor de producción)**
Con un prototipo de E1 en la rama de trabajo (posiciones + bandas + pique, constantes a ojo) y el batch de balance existente:
- **(a) Señal contra ruido.** Con la misma build y seeds distintas, medir σ de llegada por pista y el Δ en metros de cada batalla forzada (ganada contra perdida). Criterio: cada batalla ≥ 0,5σ; si no llega, se fusiona o se corta.
- **(b) Relevancia de la decisión.** Medir el % de carreras donde la mejor posición dado _el campo real_ difiere de la mejor posición dadas _solo tus stats y la pista_. Si da < 15–20 %, T21 es un chequeo de stats y E2–E5 son presentación, no táctica. Si da más, lo primero a relajar es el gate de presencia.
- **(c) Share marginal por stat.** Win share por +100 de cada stat y posición, para confirmar o descartar que Agilidad reina.

Con esos tres números se sabe, antes de gastar meses, si vale la pena el XL o si conviene presentar T21 como "carrera legible" y poner la táctica en T22.

## Verificación (2026-10-31)

Revisión adversarial del documento. Desde esta sesión no se pudieron abrir umamusu.wiki, zenno.sunturtle.xyz ni game8.jp (DNS bloqueado por la red de la sesión; hay que habilitarlos para leerlos completos), así que lo de Umamusume se contrastó con resúmenes de búsqueda web.

**Mecánicas de Umamusume**

| Afirmación                                                                                            | Resultado                                                                                                       | Fuente                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Velocidad base 20 − (dist − 2000)/1000; gasto de HP 20·(v − base + 12)²/144; HP = dist + 0,8·Sta·coef | Confirmado (dos fuentes)                                                                                        | https://www.prydwen.gg/umamusume/guides/stats-guide, https://uma.guide/guides/target-speed                                                                                                         |
| Coeficientes de fase: escapista 1,0 / 0,98 / 0,962; delantera 0,978 / 0,991 / 0,975                   | Confirmado                                                                                                      | https://uma.guide/guides/race-phases, https://uma.guide/guides/target-speed                                                                                                                        |
| Disparo de habilidad max(100 − 9000/Wit, 20) %                                                        | Confirmado. Lo de 20 es un piso; ≈ 90 % con 1200 en pruebas                                                     | https://daftuyda.moe/guides/team-trials, https://gamewith.net/uma-musume/69572                                                                                                                     |
| Kakari (6,5/log10(0,1·Wit + 1))² %, 19 % con 300                                                      | Confirmado (cuenta: 18,99 %)                                                                                    | https://www.prydwen.gg/umamusume/guides/stats-guide                                                                                                                                                |
| Salida tarde 0–0,1 s, Wit no influye                                                                  | Confirmado                                                                                                      | https://uma.guide/guides/race-phases, https://umamusu.wiki/Game:Mechanics                                                                                                                          |
| Position keep: ×1,04 con chequeo de Wit, Pace-Down ×0,915, secciones 1–10                             | Confirmado. Se agregó: Pace-Down sin chequeo de Wit, y las escapistas usan otro modo                            | https://uma.guide/guides/race-position-keep                                                                                                                                                        |
| Bloqueo< 2 m, 0,3–0,75 carriles                                                                       | Confirmado. Se corrigió: el tope es 0,988–1,0× la velocidad de la de adelante                                   | https://umamusu.wiki/Game:Mechanics, https://uma.guide/guides/race-mechanics                                                                                                                       |
| Spot Struggle desde 2022 en JP y 2025-11 en Global                                                    | Confirmado (2022-02-16; 2025-11-11)                                                                             | https://www.inside-games.jp/article/2022/02/16/136843.html, https://www.gosugamers.net/entertainment/news/77552-new-umamusume-pretty-derby-update-adds-guts-buff-increased-resource-drops-and-more |
| Spot Struggle gasta HP ×1,4 (×3,5 大逃げ)                                                             | **No verificado**: zenno dice que los números no se conocen bien. Pasado a INFERENCIA                           | https://zenno.sunturtle.xyz/doc/race                                                                                                                                                               |
| Duelo con 3 m / 2 s y sin tirada                                                                      | **No verificado** (no hay fuente abierta). Pasado a INFERENCIA; la recomendación 2 se sostiene igual por diseño | https://uma.guide/guides/stats (solo confirma que Guts lo escala)                                                                                                                                  |
| 6–10 m contra 2–4 m de ventaja según cantidad de escapistas                                           | No re-verificado (fuente única)                                                                                 | https://zenno.sunturtle.xyz/doc/frbm                                                                                                                                                               |

No se re-verificaron las fórmulas de sprint por Velocidad/Guts, los umbrales 全開スパート y 脚をためる, ni las fuentes de jugadores de §2 (Siliconera, coin-return, goonhammer, deltiasgaming).

**Números de Falconess** contra `propuesta-t21-v2.md` y `falconess-facts.md`: coinciden presencia < 3 pts (V2 §8.3), solo 2–4 pts y ≤ 6 con 3 (§8.6), matriz 45–55 %, habilidades de puesto 2–6 m y ≤ 4 pts (§8.9), nervio < 15 % (§8.11), slots 28–31 y `rngBlock` 32, tapón ≤ 30 ticks, "la alcanzan" 24 ticks, Agi +100 ≈ 2,5 % contra Int 0,36 %, p95 3,39 ms, desvío de suelo 1,25→1,10 movió 6→38 %, 31 composiciones (verificado por conteo), 15 grupos de gates y ~35 metas. Corregido:
- "La perdés 6 de 10" está en la ficha de entrenamiento, no en la pantalla previa a la carrera (V2 §6).
- La reacción de largada no es azar puro: Int achica la ventana (Int 600: 0–4 ticks ≈ 0–0,27 s).
- La precedencia del controlador hoy tiene 11 entradas (contando las 4 filas de estilo), no 10.
- +25 % de CPU es una meta de V2, no una medida.

**Afirmaciones halagadoras sin evidencia, ahora rebajadas.**
- El pique pasó de "Mejora" a "mejora la simulación, no la decisión".
- Que el bloqueo sea más legible y que la carta resuelva la queja de legibilidad son promesas: dependen del gate 15, que no se midió.
- Que el panel culpe a la causa equivocada se matizó: el contrafactual usa la misma semilla, así que el riesgo es la lectura que hace el jugador, no el número.
- Siguen siendo juicio sin medida: los puntajes (5 / 4–6,5 / 6), "Novedad 8" y "el mejor punto de venta".
