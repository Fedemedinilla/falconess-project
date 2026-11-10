# Barandas de balance de la carrera v3

2026-11-10. Documento de game design. Reemplaza a los 64 criterios del prototipo
(`.work/design7/criterios.json`) como puertas de balance. Se basa en el informe de Claude Research
sobre cómo equilibra Cygames (`docs/design/research-balance-umamusume.md`) y en las decisiones del
dueño anotadas en `temporada-v3.md` (T21).

## 1. Por qué existe este documento

Durante el prototipo de la carrera v3 cada desbalance se arregló con una regla nueva del motor:
alturas, dos líneas, aire sucio, puertas, golpes de físico, remate a físico bajo, pasivas de vuelo,
letras de distancia. Cada regla movía a todas las demás y aparecía un desbalance nuevo. Medíamos
contra 64 criterios inventados por nosotros, muchos tan finos que se podían cumplir sin que el
juego mejorara.

Cygames hace otra cosa: **las reglas de carrera casi no cambian y el balance se hace con
contenido**, aceptando que haya un meta y rotándolo. Este documento copia esa forma de trabajar.

## 2. Principios

1. **El motor está congelado.** La etapa 1 de la carrera v3 (vuelo por alturas, despegues por ala,
   dos líneas por altura, la lucha arriba, físico que paga el esfuerzo, remate a físico bajo) es
   nuestro diferencial y ya está. Solo se arreglan errores: comportamientos que contradicen la regla
   escrita (por ejemplo, el vuelo a ras que se pierde si arranca dentro de un Salto). **Nunca se
   agrega una regla de motor para corregir un número.**
2. **El balance se hace con cuatro palancas de contenido** (§5), una por cambio.
3. **Se acepta el desbalance local.** Una posición puede dominar una pista. Lo que tiene que ser
   parejo es el conjunto: la temporada y el calendario. Es la lógica del Champions Meeting.
4. **Pocas barandas, duras.** Ocho barandas deciden si un cambio entra. Todo lo demás es informe:
   se mira, no se persigue.
5. **Subir antes que bajar, pero se puede bajar.** Como Cygames, preferimos subir lo que quedó
   atrás. Como no hay dinero en juego por stats (no hay pay-to-win), también se puede recortar lo
   que sobra, siempre con nota de cambio que diga por qué.
6. **Todo visible.** Lo que decide una carrera tiene que poder explicarse en el panel «Por qué»:
   umbrales, letras, habilidades que saltaron o no, remate acortado. Cygames reconoció en 2026 que su
   carrera era «francamente difícil de entender»; nosotros lo evitamos desde el principio.

## 3. Cómo se mide

Todas las barandas se miden con el mismo procedimiento, para que los números sean comparables entre
cambios.

- **Motor:** ruleset v3, determinista. Cero sorteos dentro del tick; cada carrera depende solo de su
  semilla y su entrada.
- **Dos bases de semillas** independientes (hoy `v3a` y `v3b`). Una baranda pasa solo si pasa en las
  dos.
- **Campo parejo** («equal»): 8 corredoras con las mismas stats, letras en B y alas neutras, 2 por
  posición. Sirve para medir posiciones y pistas sin que pese quién es quién.
- **Campo por defecto:** el que genera el juego para una carrera de temporada. Sirve para medir lo que
  vive el jugador.
- **Niveles de stats:** 300, 450, 600 y 750 (todas las stats iguales), que cubren desde el principio
  hasta el final de una temporada.
- **Pistas:** las 9 del catálogo v3 (Sprint, Escalera, Mirador, Pista de saltos, Escapada, Circuito,
  Cielo abierto, Pista larga, Travesía).
- **Tamaño:** al menos 1600 carreras por celda (posición × pista × nivel × base) y 1000 temporadas por
  Falconess y base. Los porcentajes llevan intervalo de Wilson al 95 %.
- **Herramienta:** `pnpm balance:barandas` (ADR-0011; portado del arnés de design7, mismas semillas
  y estadísticas; umbrales en `apps/cli/src/balance/barandas.json`). Una corrida completa, con
  todas las barandas, es el requisito de cualquier cambio de balance; `-- --quick` corre en CI como
  puerta de B8.

Un resultado es **frágil** si pasa pero el intervalo de Wilson cruza el umbral. Lo frágil no bloquea;
se anota y se vigila en el próximo cambio.

## 4. Las ocho barandas

Cada baranda dice qué protege, cómo se calcula, su umbral, qué hacer si falla y su valor hoy (motor
del prototipo, commit `f08bde5`).

### B1 · Piso y techo por pista

- **Protege:** que ninguna posición sea inútil ni obligatoria en ninguna pista.
- **Cálculo:** porcentaje de victorias de cada posición en el campo parejo, para cada pista y nivel
  de stats (4 posiciones × 9 pistas × 4 niveles = 144 celdas por base).
- **Umbral:** ninguna celda por debajo de **15 %** ni por encima de **40 %**, en las dos bases. Con 2
  corredoras por posición en un campo de 8, lo parejo es 25 %.
- **Si falla:** primero el calendario (palanca 4: esa pista es la casa de alguien y no tiene que
  aparecer seguido); si una posición queda bajo el piso en muchas pistas, su kit (palanca 3).
- **Hoy:** pasa. Mínimo 17,7 %, máximo 36,5 %.

### B2 · Cada posición tiene casa

- **Protege:** que elegir posición según la pista sea una decisión real, y que ninguna posición se
  quede sin lugar donde brillar.
- **Cálculo:** una pista es **casa** de una posición si, en el campo parejo, esa posición es la mejor
  o queda a 2 puntos o menos de la mejor.
- **Umbral:** cada posición tiene **al menos una casa en cada nivel** de stats. Objetivo (no puerta):
  una casa en cada grupo de distancia (Sprint, Milla, Media, Larga).
- **Si falla:** una pista nueva del catálogo donde esa posición sea natural (palanca 4), como se hizo
  con la Escapada para la Punta.
- **Hoy:** pasa, frágil. Punta: Pista larga y Escapada. Pelotón: Cielo abierto y Pista larga. Acecho:
  Escalera, Travesía y Pista de saltos. Remate: Sprint, Pista de saltos y Circuito. Faltan casas en
  Milla para Punta y Pelotón, y en Media para el Pelotón.

### B3 · Reparto a lo largo del calendario

- **Protege:** que, aunque cada pista tenga su favorita, a lo largo de una temporada todas las
  posiciones rindan parecido.
- **Cálculo:** el porcentaje de victorias de cada posición, promediado con el peso de cada pista en
  el calendario v3 (carreras objetivo más la «pista del mes» de las opcionales, con 8 opcionales por
  temporada).
- **Umbral:** cada posición entre **22 % y 28 %** en los niveles 450, 600 y 750.
- **Si falla:** cambiar qué pista es la pista del mes y cuántos meses toca (palanca 4). Es la
  herramienta más barata: no toca a ninguna corredora.
- **Hoy:** pasa, frágil. Acecho a 750: 27,7 %.

### B4 · Las Falconess, parejas

- **Protege:** que ninguna Falconess sea la mala del juego y que elegir con quién jugar sea gusto, no
  obligación.
- **Cálculo:** porcentaje de temporadas con nota B o mejor (métrica 7), con la política de referencia,
  1000 temporadas por Falconess y base.
- **Umbral:** cada Falconess en **60 % o más** (cota inferior de Wilson) y **12 puntos o menos** entre
  la mejor y la peor.
- **Si falla:** el kit de esa Falconess: su habilidad única o pasiva, sus letras o cómo crece al
  entrenar (palancas 1 a 3). Nunca la Agilidad ni una regla del motor.
- **Hoy:** pasa. Peregrina 70,7 %, Cernícala 74,9 %, Caracara 70,7 %; 4,2 puntos entre la mejor y la
  peor.

### B5 · La Agilidad es el pilar

- **Protege:** la jerarquía de stats que decidió el dueño, como en Umamusume: la Agilidad (Speed) es
  la principal en toda build; la Resistencia (Stamina), la segunda; la Técnica, el Coraje y la
  Inteligencia, situacionales.
- **Cálculo:** cuántos metros vale +100 de cada stat, en el campo por defecto, en cada pista, a nivel
  450.
- **Umbral:** la Agilidad es la que más vale en **todas** las pistas. Objetivo (no puerta): la
  Resistencia es la segunda en Media y Larga.
- **Si falla:** cómo crecen las Falconess y qué piden las pistas (palancas 2 y 4). Nunca se baja la
  Agilidad.
- **Hoy:** pasa. +100 de Agilidad vale entre 28 y 62 m según la pista.

### B6 · El azar da variedad, no decide

- **Protege:** la regla T18 («el azar nunca arruina una temporada»): que la misma build no gane
  siempre, pero que la que se armó mejor gane más.
- **Cálculo:** desvío estándar (σ) del tiempo de llegada de una misma build en carreras con semillas
  distintas, por pista.
- **Umbral:** σ no mayor que **1,05 veces** la de la carrera v2 en la misma pista.
- **Si falla:** casi siempre es una regla nueva que mete un precipicio (como los golpes de físico
  fuertes que dejaban a un cuarto del campo agotado). Se vuelve atrás ese cambio; no se compensa con
  otro.
- **Hoy:** pasa. Sprint 15,3 m, Pista larga 31,0 m, iguales a v2.

### B7 · El motor rinde en un teléfono

- **Protege:** que una carrera se simule rápido en el dispositivo del jugador.
- **Cálculo:** `pnpm bench`, carrera de 8 corredoras en la pista más larga, percentil 95.
- **Umbral:** p95 por debajo de **5 ms**. La relación contra v2 (hoy 1,47 veces) se informa, pero no
  bloquea.
- **Si falla:** optimizar sin cambiar resultados; el registro tiene que salir idéntico byte a byte
  antes y después.
- **Hoy:** **falla.** 5,21 ms (mediana de 5 corridas en la Travesía, 3600 m). El 4,77 ms anotado
  antes era otra medida (la mediana de las cuatro pistas de PERF-1). La máquina de pruebas da corridas
  sueltas entre 4,9 y 7,5 ms; se toma la mediana.

### B8 · Lo viejo no se mueve

- **Protege:** las partidas guardadas y las repeticiones: lo que ya se jugó tiene que poder
  reproducirse igual.
- **Cálculo:** golden de v1, test de invariancia de v1 y v2, y la prueba de que, con cada cambio
  apagado por su interruptor, la carrera v3 sale idéntica a la versión anterior.
- **Umbral:** **cero bytes de diferencia.**
- **Si falla:** el cambio no entra hasta que vuelva a dar cero.
- **Hoy:** pasa (INV-1 a INV-14).

## 5. Las cuatro palancas

Todo cambio de balance usa una sola de estas palancas, se mide con las ocho barandas y lleva su nota
de cambio.

| Palanca                 | Qué se toca                                                               | Cuándo se usa                                                           | Ejemplo                            |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| 1 · Letras              | Letras de posición y de distancia de cada Falconess (escalera A-B-C)      | Una Falconess rinde de más o de menos en una distancia o posición       | Peregrina A-A-B-C por distancia    |
| 2 · Crecimiento         | Cuánto sube cada stat al entrenar con esa Falconess                       | Una Falconess llega con un perfil que no le sirve a su casa             | Caracara crece más en Resistencia  |
| 3 · Kit                 | Su habilidad única o pasiva y las habilidades de posición                 | Una Falconess o una posición quedó atrás en algo propio de su identidad | «Garra fija» pica más desde arriba |
| 4 · Pistas y calendario | Qué pistas existen, cuál es la pista del mes, cuántas veces toca cada una | Una posición no tiene casa, o el reparto del calendario se corre        | La Escapada, casa de la Punta      |

Reglas de uso:

- **Una palanca por cambio.** Si hace falta tocar dos cosas, son dos cambios, medidos por separado.
- **Primero la palanca más barata:** calendario, después letras, después crecimiento, último el kit.
  El kit genera inflación (lo advierte el informe de Cygames: subir sin bajar sube todo).
- **Nota de cambio obligatoria**, en una línea, para el jugador: qué se cambió y por qué. Ejemplo:
  «Garra fija: bajamos el bono de la picada desde arriba a +10 % en Sprint y +25 % en Milla, porque en
  las pistas cortas la picada ya valía más y la pasiva le ganaba carreras a quien había invertido en
  Resistencia».

## 6. Lo que pasa a ser informe

Estos criterios del prototipo se siguen calculando y publicando, pero **no bloquean** un cambio:

- reparto por posición entre 20 y 30 % en cada pista (reemplazado por B1 a B3);
- reparto por estilo de ala (las alas ya no tienen stats; se vigila que sigan neutras);
- la Técnica como primera stat del Acecho (STAT-2);
- aire sucio en fila, pasadas por el costado y cambios de altura por carrera (SIDE, CONT);
- cuánto paga ganar la línea arriba (CONT-2);
- las metas difíciles de cada Falconess («moneda» de T46, F7-3) y la meta de 70 % de Peregrina (F7-4);
- la relación de rendimiento contra v2 (la parte blanda de PERF-1);
- el valor de cada stat que no sea la Agilidad (se informa por distancia).

Si uno de estos números se mueve mucho entre dos cambios, es una señal para mirar la carrera, no una
puerta.

## 7. Cómo se trabaja un cambio

1. **Motivo:** qué se vio (en el informe o jugando) y qué palanca se usa.
2. **Cambio:** uno solo, en contenido o en constantes de una palanca.
3. **Medida:** corrida completa del arnés con las ocho barandas, en las dos bases.
4. **Decisión:** entra si las ocho pasan. Lo frágil se anota.
5. **Nota de cambio** y entrada en `temporada-v3.md`.

Los errores del motor siguen su propio camino: test que falla, arreglo, prueba de que los resultados
solo cambian donde estaba el error.

## 8. Estado de hoy

Medido con el comando de barandas (2026-11-10): **pasan siete**; B7 (rendimiento) falla por poco. Quedan como frágiles B2
(Punta y Pelotón sin casa en Milla) y B3 (Acecho a 750). Queda un error del motor por arreglar: el vuelo
a ras planeado se pierde si arranca dentro de un Salto que la corredora salta corriendo.

## 9. Siguiente paso

1. Arreglar el error del vuelo dentro de un Salto.
2. Llevar la etapa 1 al juego: ruleset v3 con su ADR, tests, golden, `sim:batch` y
   `sim:season-batch` con estas ocho barandas, y la vista animada en la página de pruebas.
3. Probarlo en el teléfono (el dueño y dos o tres personas más) y recién ahí ajustar, con una palanca
   por vez.
