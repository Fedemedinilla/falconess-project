# ADR-0005: Primera pasada de balance del motor de carrera (D14)

- Estado: **aceptado** para los cambios de constantes y de contenido dentro de rango; las secciones
  «Propuestas para el dueño» quedan **propuestas** salvo las que marcan la decisión del dueño.
  `pwCruiseWeight` 1000 → 5 (métrica 2) y lo que depende de él (las turbinas de la métrica 5):
  **aceptado (dueño, 2026-10-28)**, con las alas rotas fuera del peso de PW (propuestas 3 y 5 de
  «Métricas 2 y 5»; sección «Pasada 2»). Temporada más exigente (propuestas 1 y 4 de «Métrica 7»,
  opción (a) de la 4): **aceptado (dueño, 2026-10-28)**; `FIELD` 75 / 9 y escalera 7 / 6 / 5 / 3
  reemplazan el 60 / 8 de «Métrica 7» (sección «Pasada 2»). Estadística de la métrica 3 (propuesta
  1 de «Métricas 3 y 4», opción (a)): **aceptado (dueño, 2026-10-28)**; intervalo de puntuación
  pareado, y en `pr` un fail solo cuando también el intervalo a z = 5 cae fuera de la banda
  (revisión F1), banda 0,85-0,90 sin cambio (sección «Pasada 2»).
- Fecha: 2026-10-28
- Alcance: `packages/sim/src/rulesets/v1/constants.ts`, `packages/content/` (bastidores, piezas,
  habilidades)

## Contexto

`docs/race-engine.md` §25 y ROADMAP D14 piden una pasada de balance medida con `pnpm sim:batch`
(`docs/balance-batch.md`) contra los objetivos de BRIEF §12 sobre el motor de carrera v1 (ADR-0003,
D1-D55). El dueño autorizó al equipo del líder a escribir las constantes del ruleset al aceptar
ADR-0003. Reglas de la pasada (CLAUDE.md «Flujo de trabajo» 3, BRIEF §12): solo constantes de
`packages/sim/src/rulesets/v1/constants.ts` y contenido JSON; cada cambio aceptado lleva el diff del
lote contra la línea base v1 (`.work/balance-v1-baseline.json`, semilla por defecto) y su
confirmación con otra base de semillas (`--seed alt1`, línea base `.work/balance/baseline-alt1.json`);
ninguna métrica que pasa puede empeorar. Los tests de física están fijados a `SPEC_RULESET` (las
constantes de ADR-0003), así que el test «SPEC_RULESET matches v1 until the first balance change» se
borra con el primer cambio de balance.

Cada par de métricas tiene su sección, medida sobre v1 sin los cambios de la otra (las dos se
trabajaron en paralelo); la sección «Combinación» mide los dos conjuntos juntos y registra los
ajustes de interacción.

## Métricas 2 y 5

### Diagnóstico (verificado con el lote)

- Con PW literal el poder del bastidor decide los campos reales (R1). En el campo S2 el sprint se
  corre en 41,7 s con etoile (PW 1,4), 42,7 s con shiden (1,4), 54,1 s con el relleno neutro (1,0) y
  77,5 s con mule o kite (0,7): un PW 1,4 es ≈ 23 % más rápido que 1,0 y ≈ 1,86× más rápido que 0,7.
  Kōryū gana el 61,5 % del ridge, Altair y Boneyard nunca ganan y Lumière gana el 38,5 % del ridge,
  su pista débil.
- Comprimir el PW no basta. Con `pwCruiseWeight` y `pwBoostWeight` en 0 Lumière gana el 84 % del
  sprint y el 47 % del cañón (regen 0,5 por tick, R9), y Kōryū solo el 4,5 % del sprint y el 15,5 %
  del ridge: su término de ráfaga casi no vale tiempo con `kE` 1000 (R2). Con 50 / 500 Boneyard cae
  al 3,5 % del ridge y Altair al 14,5 % del cañón. Para que un bastidor PW 0,7 gane su casa, el
  peso del PW en el crucero tiene que quedar por debajo de ≈ 10 ‰.
- Las piezas que mueven el PW valen 74-87 puntos (turbinas). `lumiere-stabilizer` vale 51 puntos
  en el sprint y las baterías 4,3-5,9 puntos en el sprint y el ridge (R18).

### Cambios aceptados (métrica 2)

Todos son constantes de `rulesets/v1` (perillas de D38 y términos de regla de D45) salvo el
presupuesto de energía de los bastidores Boneyard (contenido). Ninguno toca S1, S4, S6 ni S8: esos
escenarios corren bastidores neutros con regla `none` y PW 1,0, donde ningún valor de abajo actúa,
y sus celdas salen idénticas bit a bit.

| Constante o contenido                            | Antes | Después | Por qué                                                                                                                                     |
| ------------------------------------------------ | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwCruiseWeight`                                 | 1000  | 5       | **Aceptado (dueño, 2026-10-28)**: 0,7-1,4 vale ±0,2 % de crucero (`pwc` 998 / 1002); las alas rotas, aparte («Pasada 2»).                   |
| `pwBoostWeight`                                  | 1000  | 250     | El PW sigue siendo «potencia de boost»: empuje ×0,925 a PW 0,7 y ×1,10 a 1,4.                                                               |
| `regenPerTick` (Lumière)                         | 500   | 100     | R9, paso 3 de §25.3: con 500, Lumière gana el 84 % del sprint con PW plano.                                                                 |
| `pulseBiomePm.desert` (Kōryū)                    | 1150  | 1450    | Casa desierto: ráfaga ×1,45 en el desierto.                                                                                                 |
| `pulseAirPm[descent]` (Kōryū)                    | 1200  | 2500    | Casa descensos: el plan no lee `airPm` (R13), el factor tiene que ser grande para pesar.                                                    |
| `telemetryDrainPm` (Altair)                      | 900   | 950     | Con 900 Altair gana el 56 % del cañón; umbral: 925 → 57 %, 960 → 39 %, 1000 → 9 %.                                                          |
| `telemetryAccelPm` (Altair)                      | 850   | 800     | Débil en sprints: 13-14 % → 5-6 % (≈ −240 de técnica en la aceleración).                                                                    |
| `repairableRuggedPm` (Boneyard)                  | 500   | 0       | Casa obstáculos: aterriza sin pérdida y su desvío mide lo que el salto (+7 puntos en el ridge).                                             |
| `massThrustCoolPm` desierto y urbano (Steinhaus) | 500   | 50      | Débil en desierto: con `kE` 1000 el calor solo muerde por debajo de ≈ 150 ‰ (250 y 100 no movían el ridge).                                 |
| `energy` de mule, kite y caracara-signature      | 100   | 140     | Bastidores R de PW bajo y tanque grande (rango del brief 40-140); la firma copia al genérico (BRIEF §7). +3 puntos de Boneyard en el ridge. |

Métrica 2 (S2 real, una entrada por fabricante; `pr`, 200 carreras por pista):

| Casilla                            | Objetivo     | v1               | Después              | v1 alt1      | Después alt1         | `full` (600)         | `full` alt1          |
| ---------------------------------- | ------------ | ---------------- | -------------------- | ------------ | -------------------- | -------------------- | -------------------- |
| koryu/desert-sprint                | casa 30-45 % | 32,0 % ?         | 42,5 % ?             | 29,5 % ?     | 37,0 % ✓             | 34,7 % ✓             | 34,2 % ✓             |
| koryu/desert-ridge                 | casa         | **61,5 % ✗**     | 35,5 % ?             | **62,0 % ✗** | 29,5 % ?             | 34,7 % ✓             | 34,5 % ✓             |
| boneyard/desert-ridge              | casa         | **0,0 % ✗**      | 38,0 % ✓             | **0,0 % ✗**  | 39,0 % ?             | 33,7 % ?             | 33,0 % ?             |
| altair/desert-canyon               | casa         | **0,0 % ✗**      | 42,5 % ?             | **0,0 % ✗**  | 42,0 % ?             | 35,7 % ✓             | 35,8 % ✓             |
| lumiere/desert-ridge               | débil ≤ 15 % | **38,5 % ✗**     | 0,0 % ✓              | **38,0 % ✗** | 0,0 % ✓              | 0,0 % ✓              | 0,0 % ✓              |
| altair/desert-sprint               | débil        | 0,0 % ✓          | 8,5 % ✓              | 0,0 % ✓      | 6,5 % ✓              | 5,8 % ✓              | 5,2 % ✓              |
| boneyard/desert-sprint             | débil        | 0,0 % ✓          | 0,0 % ✓              | 0,0 % ✓      | 0,0 % ✓              | 0,0 % ✓              | 0,0 % ✓              |
| steinhaus (sprint / ridge / cañón) | débil        | 0 / 0 / 0 ✓      | 0,5 / 7,0 / 5,5 ✓    | 0 / 0 / 0 ✓  | 1,5 / 8,0 / 4,5 ✓    | 0,7 / 8,3 / 8,8 ✓    | 1,0 / 8,0 / 10,0 ✓   |
| **Veredicto**                      |              | **fail** (5/4/1) | inconclusive (7/0/3) | **fail**     | inconclusive (7/0/3) | inconclusive (9/0/1) | inconclusive (9/0/1) |

(✓ pasa, ✗ falla, ? inconcluso.) Con 200 carreras el intervalo de Wilson de una casilla casa mide
±6,7 puntos, así que en `pr` una casa solo pasa con un valor puntual de 36,8-38,3 %: lo normal es
«inconcluso», que no bloquea; el perfil `full` decide (D48). En `full` todas las casillas pasan
salvo Boneyard en el ridge (33,0-33,7 %, cota baja 29,4-30,0 %).

Variante de PW igual (diagnóstico, `pr`): Boneyard 44 % del ridge, Altair 31-35 % del cañón y
Kōryū 26-30 % del sprint salen de sus términos; la casa de Kōryū en el ridge no (13-14 %): allí la
dan los bastidores reales (hayate es ground en la pista de obstáculos, shiden un dive de PW 1,4 con
picada en los descensos).

Métrica 5 con estas constantes: las turbinas pasan sin tocar su contenido (`steinhaus-turbine`
87,5 / 87,1 / 87,5 → 0,5 / 0,3 / 0,3 puntos; `lumiere-turbine` 76,8 / 74,2 / 79,2 → 0,4 / 0,1 / 0,4
en sprint / ridge / cañón; igual con alt1). Con `pwCruiseWeight` 5 (aceptado por el dueño el
2026-10-28) las turbinas pasan porque el PW ya casi no mueve el crucero, no porque su contenido
mida lo que pide §25.3 (+0,01-0,02 de PW o una perilla de PW propia de las piezas).

Efectos en métricas de otros dueños (informados, no ajustados):

- Métrica 3 (sigue 0/9/0): peregrina 1,362 / 0,987 / 1,027 → 1,190 / 1,041 / 1,013 (alt1 1,290 /
  1,000 / 1,013 → 1,239 / 1,041 / 1,013), por los términos de ráfaga; cernícala 0,141 / 0,115 /
  0,128 → 0,099 / 0,111 / 0,141 (alt1 0,124 / 0,136 / 0,145 → 0,107 / 0,124 / 0,163), por los de
  telemetría; caracara en el cañón 0,215 → 0,210 (alt1 0,163 → 0,176).
- Métrica 7 (sigue 0/3/0): caracara 31,7 → 28,3 % (alt1 40,0 → 36,7 %), cernícala 11,7 → 28,3 %
  (alt1 6,7 → 28,3 %), peregrina 30,0 → 36,7 % (alt1 21,7 → 36,7 %).
- Métricas 1, 4, 6 y 8: sin cambio (idénticas bit a bit).

Tests y documentos del mismo cambio: el test de igualdad de `SPEC_RULESET` con v1 se borra; el
contenido de los tres bastidores Boneyard mueve las filas de mule, kite y caracara-signature de las
tablas de §25.4 (`docs/race-engine.md` y `sanity.test.ts`), regeneradas con el prototipo de la
especificación (`.work/proto/proto2/table.mjs`, que reproduce las otras 42 filas al mili-tick), el
ancla de monotonía (976 y 524 pares en vez de 977 y 523; `mono.mjs`) y la energía de mule con
`cheap-fuel` en `stats.test.ts` (115 → 155). `docs/formulas.md` lleva los valores nuevos. Los golden
v1 cambian y los regenera el líder.

### Cambios aceptados (métrica 5)

En un campo igualado de ocho con σ de 1,07-1,42 %, 3 puntos de tasa de victoria son ≈ 0,15-0,2 % del
tiempo, 2-3 m (R18). Las turbinas ya caben por la compresión del PW y no cambian. El resto de las
piezas se reduce hasta que la mayor ganancia de la portadora quede bajo 3 puntos con su intervalo
también en `full`. Las dos baterías se escalan por el mismo factor (≈ 0,3), así la de Boneyard sigue
dando más energía a cambio de durabilidad. El estabilizador toma el valor de §25.3 (≈ 0,97).

| Pieza                | Antes                      | Después    | v1 sprint / ridge / cañón (puntos) | Después (`pr`)  | Después (`pr`, alt1) | `full` peor celda (Δ victorias, 95 %) | `full` alt1       |
| -------------------- | -------------------------- | ---------- | ---------------------------------- | --------------- | -------------------- | ------------------------------------- | ----------------- |
| `lumiere-stabilizer` | `curves-penalty-scale` 0,5 | 0,97       | **51,4** / 0 / 0                   | 2,3 / 0 / 0     | 2,3 / 0 / 0          | sprint 1,73 [1,07; 2,39]              | 2,07 [1,35; 2,79] |
| `altair-battery`     | energy +20                 | +6         | **4,9** / 2,7 / 1,5                | 1,3 / 0,8 / 0,4 | 1,2 / 0,8 / 0,4      | sprint 1,13 [0,60; 1,67]              | 1,33 [0,75; 1,91] |
| `boneyard-battery`   | energy +25, durability −10 | +8, −10    | **5,9** / **4,3** / 1,8            | 1,8 / 1,1 / 0,6 | 1,8 / 1,1 / 0,6      | sprint 1,87 [1,16; 2,58]              | 2,07 [1,32; 2,81] |
| `steinhaus-turbine`  | PW +0,1, dissipation −10   | sin cambio | **87,5** / **87,1** / **87,5**     | 0,5 / 0,3 / 0,3 | 0,4 / 0,2 / 0,3      | sprint 0,40 [0,03; 0,77]              | 0,60 [0,21; 0,99] |
| `lumiere-turbine`    | PW +0,05, dissipation +10  | sin cambio | **76,8** / **74,2** / **79,2**     | 0,4 / 0,1 / 0,4 | 0,3 / 0,1 / 0,2      | sprint 0,53 [0,16; 0,90]              | 0,87 [0,40; 1,34] |

Métrica 5: `pr` **fail** (14/10/0) → **pass** (24/0/0) en las dos bases de semillas; `full` (S5 con
1500 semillas por celda, Δ de victorias medido directo) pasa en las dos (cota alta máxima 2,81
puntos). `koryu-firmware` (1,0-1,1), `altair-firmware` y `steinhaus-stabilizer` (0) no cambian. Las
demás métricas quedan idénticas al cambio de la métrica 2 (S3 y S7 no llevan piezas). Tests del
mismo cambio: `stats.test.ts` (falke con `altair-battery`: energía 140 → 126) y `fixtures.test.ts`
(`curvesScalePm` 500 → 970; `boneyard-battery`: energía 125 → 108). Las baterías quedan medidas con
`kE` 1000: si una pasada posterior baja `kE` (juego de energía, §25.3 paso 2) valen 2-4 veces más y
hay que volver a medirlas (R18).

### Propuestas para el dueño

Estado: **propuesto**, salvo las propuestas 3 y 5: **aceptado (dueño, 2026-10-28)**. Las cifras de
las alternativas (PW 0, aire de descenso 1200) salen del arnés del lote en proceso (mismas semillas
y conteo que `sim:batch`, perfil `full`, 600 carreras por pista).

1. **Boneyard en el ridge queda inconclusa en `full`** (33,0-33,7 %, cota baja 29,4-30,0 %). El
   término de Boneyard ya está en su tope (`repairableRuggedPm` 0) y su energía en el tope del
   brief (140). El ridge sostiene dos casas (Kōryū por desierto, Boneyard por obstáculos) y los tres
   rellenos neutros se llevan ≈ 21 % y Steinhaus ≈ 8 %, así que cada casa queda en 33-37 %. El PW
   solo traslada puntos entre las dos: con `pwCruiseWeight` 0 Boneyard sube a 36,8 / 39,2 % y pasa,
   pero Kōryū baja a 31,3 % en el ridge y a 32,3-33,7 % en el sprint (inconclusas). Opciones:
   (a) objetivo: medir una casa como «≥ 30 %» (o ≥ 2,4 veces la cuota justa) sin techo propio cuando
   la pista es casa de dos fabricantes; (b) código: un término de Boneyard dentro de su mecanismo
   con efecto de tiempo (que la reparación en `flat` devuelva velocidad perdida, por ejemplo);
   (c) contenido: una pista v1 de obstáculos que no sea desierto, para que la casa de Boneyard no
   comparta pista con la de Kōryū.
2. **La casa de Kōryū en el ridge la hacen sus bastidores, no su regla.** Con PW igual Kōryū gana
   el 13-14 % del ridge; con los bastidores reales, el 34-35 % (hayate es ground en la pista de
   obstáculos; shiden, un dive con picada en los descensos). El aire de descenso tiene que ser
   ×2,5 porque el plan no lee `airPm` (R13): con 1200 Kōryū cae al 26,2 % del ridge y falla. Opción
   de código: que el plan o el controlador pesen las ráfagas por `airPm` (gastar en los descensos),
   con lo que un factor de descenso de ≈ 1,2-1,5 haría la casilla desde la regla.
3. **El PW casi no mueve el crucero** (±0,2 % entre 0,7 y 1,4). **Aceptado (dueño, 2026-10-28),
   opción (b)**: el PW sigue comprimido (5 / 250) para que los bastidores SSR no aplasten el
   campo. BRIEF §5 dice que el PW «escala crucero y aceleración». Con `kE` 1000 la energía vale
   ≈ 0,2 m por unidad, así que ningún presupuesto de bastidor paga un PW literal. Si el dueño quiere
   niveles de PW que se noten: (a) el juego de energía (`kE` ↓, §25.3 paso 2) y un re-presupuesto
   de bastidores donde energía y disipación paguen el PW (mueve las métricas 1, 3, 4 y 6, de otros
   dueños); (b) dejarlo así: el PW es potencia de boost (empuje ×0,925-1,10). Es la misma decisión
   que la propuesta 5, que la amplía con la durabilidad a cero.
4. **Las piezas dentro de 3 puntos valen 2-3 m o menos** (baterías +6 / +8, estabilizador −3 % de
   la penalización de curvas, turbinas ≈ 0,4 m). Si el dueño quiere piezas que se sientan:
   (a) objetivo: subir el tope de la métrica 5 con un ADR (por ejemplo 5 puntos); (b) código: una
   perilla de peso de PW propia de las piezas (§25.3), para dimensionar turbinas sin tocar los
   bastidores; (c) contenido: piezas de compromiso que ganen en un tipo de pista y pierdan en otro
   (la métrica 5 sigue limitando la mejor pista).
5. **`pwCruiseWeight` 5 deja casi sin costo las alas rotas (BRIEF §1 pilar 3 y §5).**
   **Aceptado (dueño, 2026-10-28), opción (a)**: `brokenSpeedPm` 750 con `durabilityZeroPowerMult`
   1000 (ADR-0003 D56; cifras en «Pasada 2»). El resto de esta propuesta describe el estado previo.
   BRIEF §5: «si `durability` llega a 0, `powerToWeight` se reduce un 25 % el resto de la carrera»;
   el pilar 3 cuenta la durabilidad entre los presupuestos de la carrera. El motor arma la tabla de
   alas rotas con `PW × durabilityZeroPowerMult` (750) y le aplica después los pesos de PW
   (`powerVariant` y `weightedPower` en `state.ts`), así que con 5 / 250 un bastidor PW 1,0 roto
   corre con `pwc` 998 (−0,2 % de crucero) y `pwb` 937 (−6,3 % de empuje); con 1000 / 1000 eran 750
   y 750. Medido con los scripts locales de la verificación (`.work/balance/verify/broken.ts` y
   `steinhaus.ts`):

   | Caso (mismas semillas, intacto contra roto desde la salida)                       | v1 (5 / 250)         | `SPEC_RULESET` (1000 / 1000) |
   | --------------------------------------------------------------------------------- | -------------------- | ---------------------------- |
   | Campo S1 (8 neutros, stats 600): coste de tiempo sprint / ridge / cañón           | 0,27 / 0,22 / 0,17 % | 29,7 / 30,7 / 29,6 %         |
   | Campo S1: victorias del roto (intacto 8,5 / 9,0 / 12,0 %; 200 semillas por pista) | 7,0 / 6,5 / 8,5 %    | 0 / 0 / 0 %                  |
   | Campo real de 8 bastidores, erzherzog roto (100 semillas por pista)               | 0,23 / 0,22 / 0,20 % | 28,8 / 30,6 / 29,1 % ¹       |
   | Campo S1 con `durabilityZeroPowerMult` 0 (PW roto 0; victorias 4,0 / 4,5 / 4,5 %) | 0,83 / 0,64 / 0,47 % | —                            |

   ¹ v1 con solo `pwCruiseWeight` 1000: esta constante sola causa la diferencia. Ninguna constante
   devuelve el castigo con el peso 5: `pwc` no baja de 995 con ningún PW ≥ 0, y la última fila es
   el máximo que da `durabilityZeroPowerMult`. La especificación lo advertía: §25.1 (métrica 5) dice
   que pesos de PW de ≈ 20 ‰ «borran lo que gobiernan», y §25.3 pone el juego de energía (paso 2,
   `kE` 1000 → 500 → 250) antes de `pwCruiseWeight` 1000 → 500 → 250 (paso 5). Esta pasada saltó el
   paso 2: `kE` sigue en 1000.

   Alcance medido. Pierde su valor en carrera todo lo que castiga o protege una durabilidad que
   llega a 0 dentro de la carrera: la reparación de la regla `repairable` de Boneyard,
   `obstacle-armor`, la guarda de `iron-wings`, la armadura de `scrap-armor` y el desgaste de la
   licencia Steinhaus. El tope de PW 1,1 de Altair solo pesa ya en el empuje. Hoy no se nota en
   ninguna métrica porque ningún bastidor se rompe en las carreras medidas, con cualquier peso:
   `steinhaus-stabilizer` (durabilidad +20) y la guarda de `iron-wings` ya valían 0 en la línea base
   v1 con `pwCruiseWeight` 1000 (0,0 puntos y 0 m). En 300 temporadas por Falconess con la política
   de referencia, y también sin reparar nunca, ninguna carrera objetivo empieza ni termina con las
   alas rotas (0 de 3311; como mucho el 5,8 % empieza bajo la mitad, Cernícala). La propuesta 3 de
   «Métrica 7» («no reparar da lo mismo») sale de ese desgaste bajo. El peso 5 suma una segunda
   razón, latente: si las alas llegaran a romperse, costarían 0,2 % en vez de ≈ 30 %.

   Volver a 1000 sin otro cambio devuelve el diagnóstico de esta sección (R1: el PW del bastidor
   decide los campos reales; con la energía de hoy un PW 0,7 solo gana su casa con un peso de
   crucero ≤ 10 ‰) y las turbinas a 74-88 puntos (v1): las métricas 2 y 5 vuelven a fallar.
   Opciones:
   (a) código: aplicar el castigo de alas rotas fuera del peso de PW, por ejemplo una constante
   `brokenSpeedPm` (750) sobre `vC`, `acc`, `vMin` y el empuje de la tabla rota. Devuelve BRIEF §5
   sin mover las métricas 2 y 5, porque en S2 y S5 nada se rompe; no arregla el PW en crucero
   (propuesta 3).
   (b) seguir §25.3: primero el juego de energía (`kE` 1000 → 500 → 250 con `coolDissWeight`),
   después `pwCruiseWeight` ≈ 250 con un re-presupuesto de bastidores, y volver a medir las métricas
   2, 3 y 5 (el paso 2 mueve también las 1, 4 y 6; con 250 un PW 1,0 roto pierde ≈ 6 % de crucero).
   (c) el dueño acepta «PW = potencia de boost, durabilidad cosmética en carrera» y enmienda BRIEF
   §1 pilar 3 y §5.
   Recomendación: (a), que no depende de cómo se decida el PW en crucero (propuesta 3: (b) o (c)).

## Métricas 3 y 4

Medidas sobre v1 con las constantes de ADR-0003 (sin los cambios de las métricas 2 y 5).

### Contexto: diagnóstico verificado

Medido con el lote y con un arnés que construye S3 y S4 exactamente como el lote (mismas funciones
`buildRaceJob` y puerto del motor) con otros prefijos de semilla y 600-2000 muestras por celda.

Métrica 3 (S3, genérico contra firma, 0,85-0,90 = la firma gana 52,6-54,1 %). Línea base, razón
por celda (sprint / ridge / canyon): Caracara 1,000 / 1,000 / 0,215; Cernícala 0,141 / 0,115 /
0,128; Peregrina 1,362 / 0,987 / 1,027. Las nueve celdas fallan (R14 de `docs/race-engine.md`).

- `talon-lock` (Peregrina) no hace nada: con el pasivo de shiden reemplazado por uno inerte la
  firma gana exactamente 50,0 % en las tres pistas. Su enfriamiento de 20 ticks en descenso nunca
  limita (manda la energía, no la cadencia) y su +100 ‰ en la fase final solo toca a stoop-strike en
  el ridge. `third-pulse` de shiden vale +0,18 % de tiempo en el sprint (tres pulsos seguidos en
  `SURPLUS`) y casi nada en el resto: de ahí 1,36 en el sprint.
- `still-air` (Cernícala) vale ≈ +2,3-2,5 % de tiempo: el regen 0,25 por tick solo da 86 % de
  victorias; `heat-to-energy` 0,25 solo da 54 / 52 / 51,5 % (inconsistente, depende de `PREHEAT`).
  `mid-activation` de nimbus es inerte en S3 (D47).
- `scrap-armor` (Caracara): la armadura sola da exactamente 50 % (mule nunca salta y el daño del agua
  no cambia el tiempo de una carrera); todo el efecto era el override de agua (≈ +2,0 % en el canyon).

Métrica 4 (S4, 0,5-8 m donde el disparador puede ocurrir; 31 celdas). Fallan cool-head, iron-wings y
scavenger-stride; lead-guard es inconcluso en sprint y canyon y gravity-friend en ridge (alt1):

- `cool-head` se dispara en 81-90 % de las corredoras al entrar en la fase final (el calor sí pasa de
  50), pero enfriar 20 no vale nada: con `kE` 1000 manda la energía (R2, R12) y el plan no se rehace
  por calor. 0,00-0,04 m.
- `iron-wings` se dispara en el tick 0 y una guarda de durabilidad no tiene valor en tiempo dentro de
  una carrera (la durabilidad solo pesa al romperse). 0 m.
- `scavenger-stride`: la velocidad se ignora en el aire, así que solo las 2 corredoras ground del
  campo de S4 la cobran durante 30 ticks. 0,16-0,21 m.
- `lead-guard` solo se dispara para las dos primeras (36-44 % de las corredoras) y 8 de energía
  rinden 0,42-0,81 m. `gravity-friend` (aceleración, que solo actúa bajo el objetivo) 0,58-0,64 m.

### Decisión

Solo contenido de habilidades (`packages/content/skills/`); ni motor, ni esquemas, ni constantes,
ni stats de bastidores (las firmas siguen copiando las stats de su genérico, BRIEF §7). Los
pasivos genéricos (`third-pulse`, `mid-activation`) no cambian: entran en S2 (métrica 2).

| Habilidad          | Antes                                                  | Después                                                                                                      |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `still-air`        | regen 0,25 por tick + heat-to-energy 0,25              | regen 0,014 por tick                                                                                         |
| `scrap-armor`      | obstacle-armor 6 + override de `water` 1,0             | obstacle-armor 6 + regen 0,015 por tick                                                                      |
| `talon-lock`       | pulse-cooldown descent 20 + activation-bonus final 0,1 | lo mismo + pulse-chain-accel cada 2.º pulso encadenado +30 % + segment-factor descent ×1,005 + canyon ×1,004 |
| `cool-head`        | heatAbove 50 → heatCool 20                             | heatAbove 50 → heatCool 20 + speed 0,5 m/s durante 60 ticks                                                  |
| `iron-wings`       | phase any → guarda 90 ticks                            | phase middle → guarda + speed 0,3 m/s durante 90 ticks                                                       |
| `scavenger-stride` | jump → guarda + speed 0,6 m/s durante 30 ticks         | jump → lo mismo durante 90 ticks                                                                             |
| `lead-guard`       | middle, posición 0-0,2 → energyRefund 8                | energyRefund 14                                                                                              |
| `gravity-friend`   | descent → accel 0,4 m/s² durante 30 ticks              | accel 0,8 m/s² durante 30 ticks                                                                              |

Razones:

- Un regen pequeño es el único término que vale lo mismo en porcentaje en las tres pistas para un
  bastidor continuo (se acumula por tick, como el tiempo): Cernícala y Caracara quedan a ≈ 53 % en
  sprint, ridge y canyon con un solo número cada una. Es identidad de la casa: `still-air` ya era
  regen y `scrap-heart` (peculiaridad Boneyard) es regen. `scrap-armor` conserva la armadura, que
  protege la durabilidad persistente de la temporada (D35).
- Para el bastidor de pulsos de Peregrina el regen no sirve: activa el modo `REGEN` (un pulso extra en
  la salida) y vale +0,3 % en el sprint frente a +0,07 % en ridge y canyon con 0,005 por tick. Su
  firma cobra en cada pista por su propio terreno: la cadena de pulsos (cada 2.º encadenado +30 %,
  frente al 3.º +20 % de shiden) supera a `third-pulse` en el sprint; el picado en descenso
  (×1,005) paga en el ridge; el corte del viento del cañón (×1,004) en el canyon. Las cláusulas de
  descenso y final se mantienen (la del final sigue sumando a stoop-strike).
- Las activas se arreglan por el efecto, no por la probabilidad: `cool-head` conserva su disparador
  de calor y gana velocidad; `iron-wings` pasa a la fase media para que sirva a todo bastidor (con
  `heatAbove` 40 un bastidor de pulsos casi nunca se calienta y hayate no la disparaba);
  `scavenger-stride` dura lo bastante para cubrir el aterrizaje de quien vuela; `lead-guard` y
  `gravity-friend` suben su magnitud hasta salir del borde de 0,5 m.

### Evidencia (lote, `pr` 10 000 carreras)

Métrica 3, razón genérico/firma por celda (sprint / ridge / canyon); `full` es
`--profile full --scenarios S3` (4000 muestras, 8000 mientras la celda es inconclusa):

| Par       | v1 por defecto        | Ahora por defecto     | v1 alt1               | Ahora alt1            | Ahora `full` (la firma gana) |
| --------- | --------------------- | --------------------- | --------------------- | --------------------- | ---------------------------- |
| Caracara  | 1,000 / 1,000 / 0,215 | 0,887 / 0,911 / 0,852 | 1,000 / 1,000 / 0,163 | 0,863 / 0,852 / 0,887 | 53,8 / 53,0 / 53,4 %         |
| Cernícala | 0,141 / 0,115 / 0,128 | 0,818 / 0,887 / 0,863 | 0,124 / 0,136 / 0,145 | 0,863 / 0,948 / 0,807 | 53,4 / 52,9 / 53,5 %         |
| Peregrina | 1,362 / 0,987 / 1,027 | 0,852 / 0,840 / 0,840 | 1,290 / 1,000 / 1,013 | 0,875 / 0,852 / 0,911 | 53,8 / 53,1 / 53,1 %         |

Veredictos: por defecto 9 fail → 9 inconclusos (FAIL → inconclusive); alt1 9 fail → 8
inconclusos y 1 fail (Cernícala ridge, 51,3 %, intervalo [0,900, 0,998]: ruido de 150 muestras, ver
la propuesta 1); `full` 6 pass y 3 inconclusos (Caracara sprint y Peregrina sprint [0,849, 0,869],
Cernícala ridge [0,883, 0,901]). Las nueve estimaciones puntuales quedan dentro de la banda en
`full`. Tiempo solo (25.4, sin ruido) firma contra genérico: Peregrina −0,09 / −0,11 / −0,13 %,
Cernícala −0,16 % en las tres, Caracara −0,22 / −0,18 / −0,18 %.

Métrica 4 (fail → pass, 31 / 0 / 0 en las dos semillas), celdas cambiadas, metros por defecto (alt1):

| Celda                          | v1                                      | Ahora                                   |
| ------------------------------ | --------------------------------------- | --------------------------------------- |
| cool-head sprint/ridge/canyon  | 0,02 / 0,00 / 0,04 (0,01 / 0,00 / 0,03) | 1,47 / 1,48 / 1,26 (1,57 / 1,43 / 1,21) |
| iron-wings sprint/ridge/canyon | 0 / 0 / 0 (0 / 0 / 0)                   | 1,42 / 1,38 / 0,98 (1,37 / 1,45 / 1,06) |
| scavenger-stride ridge         | 0,16 (0,21)                             | 1,34 (1,27)                             |
| lead-guard sprint/ridge/canyon | 0,56 / 0,81 / 0,42 (0,51 / 0,73 / 0,44) | 0,89 / 1,38 / 0,74 (0,85 / 1,16 / 0,76) |
| gravity-friend ridge           | 0,64 (0,58)                             | 0,90 (0,86)                             |

Resto de métricas: con la semilla por defecto las métricas 1, 2, 5, 6, 7 y 8 quedan idénticas celda
por celda (S1, S2, S5, S6 y S8 no llevan habilidades ni firmas; S7 usa el hangar genérico). Con alt1
la única otra celda que se mueve es S7 Peregrina 21,7 → 20,0 % (una temporada de 60, métrica ya en
fail); `pnpm sim:season-batch -- --runs 500` antes y después da ≥ B 39 → 40 % (Caracara), 9 → 9 %
(Cernícala), 28 → 28 % (Peregrina). Corridas del lote usadas: 5 (dos `pr` por semilla y una `full`
de S3); la exploración previa se hizo con el arnés.

### Consecuencias

- Cada firma gana ≈ 53 % del 1v1 contra su genérico en las tres pistas, con un pasivo que actúa en
  todas (antes: inerte en dos pistas o enorme en una).
- `still-air`, `scrap-armor`, `lead-guard` y `second-wind` valen energía: si la pasada de las métricas
  2 y 5 cambia `kE`, `regenPerTick` o los pesos de PW, hay que volver a medir S3 y S4 (R14: con `kE`
  250 el valor de la energía se multiplica por ≈ 4). La cadena de `talon-lock` escala con los
  términos de pulso (`pulseBiomePm`). Re-ajustar es un número por firma.
- Cambian los tests que fijan este contenido (traits de los pasivos, factores de segmento a mano,
  `freezeSkill`, el cruce de ocho bastidores reales con activas) y las tres filas de firma de las
  tablas 25.4 de `docs/race-engine.md` junto con `sanity.test.ts`. Los golden v1 que llevan firmas o
  estas activas cambian: los regenera el líder (ADR-0004).
- `cool-head` sigue siendo de calor: en bastidores de pulsos (Kōryū) el calor rara vez pasa de 50,
  así que para Peregrina es una mala elección; S4 no lo ve (usa fixtures continuos).
- No se tocaron costos de habilidad ni el campo `version` del contenido (ruleset v1 sin publicar).
- Celdas que pasan sin margen y no se tocaron: last-gasp canyon 0,65 m [0,55, 0,76] (alt1 0,62) y
  second-wind canyon 0,66 m [0,60, 0,72]. El agotamiento del canyon reduce todo efecto de fase final
  (25.1, `hpPerKm`).

### Propuestas para el dueño

1. **Estadística de la métrica 3: aceptado (dueño, 2026-10-28), opción (a)** en la forma que
   registra «Pasada 2»: intervalo de puntuación pareado (el piso de varianza que exige cada valor
   candidato) y, en `pr`, fail solo cuando también el intervalo a z = 5 cae fuera de la banda
   (revisión F1; antes, pass / inconcluso); la banda no se mueve (b) ni sube el tope de `full` (c).
   Texto de la propuesta: la banda 0,85-0,90 mide 1,5 puntos de cuota. En `pr` (150 muestras)
   el intervalo mide ±5-7 puntos: ninguna celda puede pasar, y una celda correcta puede fallar por
   ruido cuando la varianza muestral sale baja (alt1 Cernícala ridge: 51,3 % con intervalo de
   ±1,3 puntos, mientras 8000 muestras dan 52,9 %). Con `BALANCE_GATE=enforce` ese fail bloquearía
   un PR. En `full` el semiancho es ≈ 0,5 puntos: una celda pasa solo si su cuota real está en
   ≈ 53,1-53,6 %, y con un número de contenido por pasivo la dispersión entre pistas
   (0,5-0,9 puntos) deja celdas en el borde. Opciones: (a) cambio de código en
   `apps/cli/src/batch/metrics.ts`: piso de varianza en el intervalo de S3 (por ejemplo la de dos
   carreras independientes, p(1 − p) / 2) para que `pr` no produzca fails falsos; (b) mover la banda
   a 0,82-0,92 (la firma gana 52-55 %) con este ADR; (c) subir el tope de `full` a 16 000 muestras
   por celda (semiancho ≈ 0,35 puntos, ≈ +40 s). Recomendación: (a) y, si se quiere un pass en
   `full`, (b).
2. **Coordinación con las métricas 2 y 5 (propuesto).** Si esa pasada mueve `kE`, `regenPerTick`,
   `pulseBiomePm` o los pesos de PW, re-medir S3 con `--profile full --scenarios S3` y ajustar los
   tres números de firma (regen de `still-air` y `scrap-armor`, bono de cadena de `talon-lock`)
   antes de fijar los golden.

## Combinación (métricas 2 a 5 juntas)

Estado: **aceptado** (contenido de dos pasivos de firma dentro de rango). Las dos secciones
anteriores se midieron cada una sobre v1 sin la otra; esta junta los dos conjuntos en
`phase-2-race-engine` (primero el de las métricas 2 y 5, después el de las 3 y 4) y mide la
combinación con las dos bases de semillas contra sus líneas base v1.

### Diagnóstico: la combinación sin ajustes

Lote `pr` 10 000, por defecto y alt1: las métricas 1, 2, 4, 5, 6 y 8 salen idénticas celda por
celda a las de su sección (S1, S4, S6 y S8 corren bastidores neutros; S2 y S5 no llevan
habilidades); S7 se mueve dentro de su fail (30,0 / 26,7 / 36,7 %; la sección de las métricas 2 y 5
daba 28,3 / 28,3 / 36,7 %). La métrica 3 vuelve a **fail** (0/1/8 en las dos bases): Peregrina en el
sprint 0,754 (alt1 0,714). Es la interacción que anticipaba la propuesta 2 de «Métricas 3 y 4»:

- La cadena de `talon-lock` (cada 2.º pulso encadenado +30 %) escala con `pulseBiomePm.desert`
  1450: la firma gana el 55,1 % del sprint y el cañón baja a 52,5 %.
- Con energía 140 en mule y en caracara-signature el regen 0,015 de `scrap-armor` vale más en el
  sprint y menos en el cañón: 54,7 % y 52,2 % (antes 53,8 % y 53,4 %).
- Cernícala pasa de 53,4 % a 53,8 % en el sprint por los términos de telemetría: sigue dentro de la
  banda y no se toca.

### Cambios aceptados (combinación)

| Habilidad     | En «Métricas 3 y 4»                                        | Ahora                                                                                   |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `talon-lock`  | cadena cada 2.º pulso +30 %, descent ×1,005, canyon ×1,004 | cadena +24 %, descent ×1,005, canyon ×1,006 (enfriamiento y bono final sin cambio)      |
| `scrap-armor` | obstacle-armor 6 + regen 0,015 por tick                    | obstacle-armor 6 + regen 0,011 por tick + segment-factor descent ×1,003 + canyon ×1,004 |

Razones: es el ajuste más chico que reparte la ventaja en las tres pistas. Un solo número ya no
alcanza para Caracara: bajar el regen arregla el sprint y hunde el ridge y el cañón (0,010: 53,2 /
51,9 / 51,6 %), así que `scrap-armor` toma la forma de `talon-lock`, un término por terreno de pista
(el regen paga en todas, el descenso en el ridge, el viento del cañón en el cañón); la armadura se
queda (durabilidad de temporada, D35). En Peregrina la cadena baja hasta el centro de la banda en el
sprint y el factor de cañón sube lo que la cadena le quitaba al cañón. Exploración con el arnés de
S3 (construcción del lote, prefijo de semillas propio, 6000 muestras por celda, mismas semillas en
cada variante): cadena 0,30 / 0,25 / 0,24 / 0,20 / 0,15 → sprint 54,8 / 53,7 / 53,4 / 52,3 / 51,2 %;
regen de Caracara 0,015 / 0,012 / 0,011 / 0,010 → sprint 54,2 / 53,7 / 53,4 / 53,2 %. Descartado:
`jump` ×1,012 + `water` ×1,02 en `scrap-armor` (el agua lleva el cañón a 56,0 %).

### Evidencia

S3 `full` (`--profile full --scenarios S3`), la firma gana (veredicto de la razón):

| Celda                   | Combinación sin ajuste, por defecto | Ahora, por defecto | Ahora, alt1        |
| ----------------------- | ----------------------------------- | ------------------ | ------------------ |
| caracara/desert-sprint  | 54,7 % **fail**                     | 53,5 % pass        | 53,3 % pass        |
| caracara/desert-ridge   | 52,7 % inconcluso                   | 53,4 % pass        | 53,6 % pass        |
| caracara/desert-canyon  | 52,2 % **fail**                     | 53,5 % pass        | 53,6 % pass        |
| cernicala/desert-sprint | 53,8 % inconcluso                   | 53,8 % inconcluso  | 53,8 % inconcluso  |
| cernicala/desert-ridge  | 52,9 % pass                         | 52,9 % pass        | 53,1 % pass        |
| cernicala/desert-canyon | 53,2 % pass                         | 53,2 % pass        | 53,4 % pass        |
| peregrina/desert-sprint | 55,1 % **fail**                     | 53,4 % pass        | 53,7 % pass        |
| peregrina/desert-ridge  | 53,5 % pass                         | 53,1 % pass        | 53,6 % pass        |
| peregrina/desert-canyon | 52,5 % inconcluso                   | 53,3 % pass        | 53,3 % pass        |
| **Veredicto**           | **fail** (3/3/3)                    | inconcluso (8/0/1) | inconcluso (8/0/1) |

En `pr` la métrica 3 queda 0/0/9 inconclusa en las dos bases (por defecto Peregrina 0,807 / 0,899 /
0,863 y Caracara 0,875 / 0,875 / 0,840; alt1 0,775 / 0,840 / 0,852 y 0,875 / 0,807 / 0,840): con 150
muestras la lectura puntual de `pr` oscila ±3 puntos de cuota (propuesta 1 de «Métricas 3 y 4»).
Ninguna otra celda del lote cambia con este ajuste (por defecto y alt1). S7: `pnpm sim:season-batch
-- --runs 500` da lo mismo antes y después del ajuste (≥ B: Caracara 33 %, Cernícala 22 %, Peregrina
37 %). Corridas del lote de esta sección: 7 (dos `pr` y una `full` de S3 antes del ajuste, dos `pr`
y dos `full` de S3 después).

Estado de las métricas con la combinación (`pr` 10 000; por defecto / alt1 contra la línea base v1
de cada base):

| #   | Métrica                    | v1                              | Combinación                                                        |
| --- | -------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| 1   | estilos 15-35 % por bioma  | pass 4/0/0                      | pass 4/0/0, idéntica (25,1 / 26,9 / 23,6 / 24,3 %)                 |
| 2   | casa 30-45 %, débil ≤ 15 % | **fail** 5/4/1                  | inconclusa 7/0/3 (`full` 9/0/1, sección «Métricas 2 y 5»)          |
| 3   | genérico / firma 0,85-0,90 | **fail** 0/9/0                  | inconclusa 0/0/9 (`full` 8/0/1 en las dos bases)                   |
| 4   | habilidades 0,5-8 m        | **fail** 22/7/2 (alt1 21/7/3)   | pass 31/0/0 (0,65-6,33 m; alt1 0,62-7,11 m)                        |
| 5   | piezas ≤ 3 puntos          | **fail** 14/10/0 (alt1 13/10/1) | pass 24/0/0 (máximo 2,3 puntos, `lumiere-stabilizer` en el sprint) |
| 6   | dispersión 0,8-2 %         | pass 3/0/0                      | pass 3/0/0, idéntica (1,25 / 1,42 / 1,07 %)                        |
| 7   | temporadas ≥ B ≥ 60 %      | **fail** 0/3/0                  | **fail** 0/3/0 (30,0 / 26,7 / 36,7 %; alt1 36,7 / 25,0 / 36,7 %)   |
| 8   | la inteligencia no resta   | inconclusa 3/0/1                | inconclusa 3/0/1, idéntica                                         |

Las filas 2 y 5 suponen `pwCruiseWeight` 5 (aceptado por el dueño el 2026-10-28, propuesta 3 de
«Métricas 2 y 5»): sin él las dos vuelven a fallar.

Tests y documentos del mismo cambio: `modifiers.test.ts` (traits de los dos pasivos; el test de la
tabla `f` suma `scrap-armor`), `entry.test.ts` (factores a mano de caracara-signature y Peregrina),
las filas de peregrina-signature y caracara-signature de las tablas 25.4 (`docs/race-engine.md` y
`sanity.test.ts`, regeneradas con el prototipo de la especificación) y la nota de R14 en
`docs/race-engine.md`. El test «SPEC_RULESET matches v1 until the first balance change» ya lo borró
el cambio de la métrica 2. Los golden v1 cambian y los regenera el líder.

### Consecuencias

- Las tres firmas quedan entre 52,9 % y 53,8 % en las nueve celdas de `full`, en las dos bases.
  Cernícala en el sprint queda inconclusa (cota baja de la razón 0,848-0,850): un regen 0,013 en
  `still-air` la centraría, pero llevaría su ridge (52,9-53,1 %) al borde bajo; no se tocó.
- `talon-lock` y `scrap-armor` dependen de `pulseBiomePm`, de la energía de los bastidores Boneyard
  y de `kE`: cualquier pasada que los mueva vuelve a medir S3 `full` antes de fijar los golden.

### Propuestas para el dueño (combinación)

Estado: **propuesto**.

1. **Métrica 7 sin dueño en esta pasada.** Sigue en fail con la combinación (`pr` 25,0-36,7 %;
   `sim:season-batch` 500: ≥ B 33 / 22 / 37 %, frente a 40 / 9 / 28 % con solo «Métricas 3 y 4»).
   Caracara baja de 40 % a 33 % al sumar los cambios de la métrica 2 (este ajuste no la mueve).
   Opciones: (a) una pasada propia de la métrica 7 (metas de la temporada, política de referencia,
   crecimiento: contenido de `packages/content/falconess`); (b) objetivo: revisar el 60 % con un ADR
   si la política fija no representa a un jugador. Resuelta en la sección «Métrica 7» con la curva
   de rivales (`FIELD`), sin tocar el objetivo.

## Métrica 7

Estado: **aceptado** (dos constantes de `FIELD` dentro de rango), **reemplazado** por la «Pasada
2» (decisión 2 del dueño: `FIELD` 75 / 9 y escalera 7 / 6 / 5 / 3); la sección «Propuestas para el
dueño (métrica 7)» queda **propuesta** salvo las propuestas 1 y 4. Medida sobre `phase-2-race-engine` con las métricas 2 a 5
ya combinadas (`b37f0bf`). Las líneas base del lote son ese mismo `HEAD` en las dos bases de
semillas (`pr` completo y `full` de S7), no la v1: las métricas 2 a 5 ya movieron las carreras de S7.
El cambio deja las carreras objetivo como puntos de control: la referencia gana el 73-80 %. Si deben
ser un desafío lo decide el dueño (propuesta 4).

### Diagnóstico (verificado)

Métrica 7 literal (21.1): ≥ B exige `seasonScore ≥ 2900` y ningún objetivo fallado. Arnés local
(`.work/balance/m7`, no versionado): juega temporadas con la política y el hangar de referencia y
`minPlace` 8 en todos los objetivos, y guarda el puesto de cada carrera objetivo y las partes de la
nota. Una temporada que pasa todos los objetivos con el `minPlace` real sigue la misma trayectoria,
así que cualquier vector de `minPlace` y cualquier umbral o peso de la nota se evalúan después sin
volver a jugar, de forma exacta. 1000 temporadas por Falconess, semillas `batch-0` … `batch-999`
(las de `sim:season-batch`): con sus 500 primeras da lo mismo que `sim:season-batch` (≥ B 32,6 /
22,2 / 36,6 %); con las 1000, 32,3 / 20,7 / 36,3 %.

- La nota no es lo que falla: las temporadas completas puntúan 3379-3453 de media (decil 10:
  3176-3233) y solo 0-2 de cada 1000 completas quedan bajo 2900. Toda la pérdida son objetivos
  fallados.
- El primer objetivo es una moneda al aire. En T12 la Falconess de referencia lleva 207-211 por stat
  y los rivales 203 (`95 + 9 × 12`); su puesto se reparte casi uniforme (Caracara en el ridge,
  acumulado del 1.º al 8.º: 17 / 32 / 47 / 59 / 69 / 81 / 89 / 100 %; lo justo es 12,5 por puesto)
  y `≤ 5` pasa 60-69 %.
- La causa es la curva del stub, que nunca se calibró contra la economía de entrenamiento real:
  `rivalBase` 95 es la media inicial de las tres Falconess (94) y los rivales suben 9 por turno
  frente a ≈ 10,9 de la política de referencia (media por stat 208 / 326 / 459 / 579 en T12 / T24 /
  T36 / T46, ≈ 71 + 10,9 × turno). La razón rival / jugadora cae de 0,97 en T12 a 0,88 en T46: la
  temporada es más difícil al principio que al final, al revés que la escalera de `minPlace` (5 → 1-2).
- La economía de entrenamiento no es la causa: las temporadas completas terminan en 644-660 por stat,
  dentro de la curva 550-800 de BRIEF §8; subir `trainBase` inflaría además la nota y la build
  perfecta.
- La carrera sí premia la ventaja de stats: `≤ 5` en T12 por quintil de stats de la jugadora va de
  34-46 % (el quintil más bajo: lesiones, fallos, ánimo bajo) a 80-86 % (el más alto) en v1, y de
  78-83 % a 99-100 % con el cambio.

### Cambio aceptado

- `FIELD.rivalBase`: 95 → 60.
- `FIELD.rivalPerTurn`: 9 → 8.

Media por stat de los rivales en T12 / T24 / T36 / T46: 203 / 311 / 419 / 509 → 156 / 252 / 348 /
428. Razón frente a la curva de referencia: 0,97 / 0,95 / 0,91 / 0,88 → 0,75 / 0,77 / 0,76 / 0,74.

Razones: un solo principio, la razón constante. Los rivales de una carrera objetivo quedan a ≈ ¾ de
una Falconess entrenada con criterio en cada objetivo y la dificultad la pone `minPlace`, el
contenido. `rivalNoise` (± 20 %), la banda de PW, el pool y las activas de los rivales no cambian:
la variedad del campo se queda. Exploración con el arnés (≥ B, Caracara / Cernícala / Peregrina):

| `rivalBase` / `rivalPerTurn` | ≥ B (%)            | Nota                                                        |
| ---------------------------- | ------------------ | ----------------------------------------------------------- |
| 95 / 9 (v1)                  | 32,3 / 20,7 / 36,3 | razón 0,97 → 0,88                                           |
| 80 / 9                       | 43,8 / 33,5 / 53,3 |                                                             |
| 70 / 9                       | 52,3 / 42,8 / 61,4 |                                                             |
| 60 / 9                       | 60,7 / 52,5 / 70,2 | razón 0,81-0,85; Cernícala no llega                         |
| 50 / 9                       | 67,9 / 60,7 / 77,7 | razón 0,76 → 0,80; Cernícala T46 84,5 %                     |
| 40 / 9                       | 74,9 / 67,5 / 83,8 | razón 0,71 → 0,78                                           |
| 60 / 9, `rivalNoise` 100     | 65,4 / 61,9 / 73,8 | menos variedad de campo; Cernícala al borde                 |
| 50 / 9, `rivalNoise` 100     | 72,6 / 69,5 / 80,8 |                                                             |
| 70 / 8                       | 73,9 / 66,7 / 79,0 | razón 0,80 → 0,76                                           |
| 65 / 8                       | 75,8 / 71,1 / 81,3 | Cernícala pasa `pr` (≥ 44 de 60) menos de la mitad de veces |
| **60 / 8**                   | 78,8 / 74,3 / 84,3 | elegida: razón 0,74-0,77                                    |
| 55 / 8                       | 81,5 / 76,8 / 86,1 |                                                             |

Descartado:

- `minPlace` solo: en T12 haría falta `≤ 6` o `≤ 7` y aflojar casi todas las metas, sin tocar la
  causa (rivales a la par de la jugadora al principio de la temporada).
- La nota (`gradeThresholds`, `scorePerSkill`, `scoreWinBonus`, `scorePodiumBonus`): no muerde.
- `rivalNoise` 100: ayuda a las metas del cañón de Cernícala, pero quita variedad al campo y con
  60 / 8 no hace falta.
- 65 / 8 o 70 / 8: S7 `pr` corre 60 temporadas por Falconess y pasar exige ≥ 44 de 60 (cota de
  Wilson ≥ 60 %); con la tasa de Cernícala en 67-71 % sale menos de la mitad de las veces y el
  portón de §25.2.1 no levanta un fail con un inconcluso. Con 60 / 8 Cernícala queda en 74-78 %.

### Evidencia (lote)

S7 `pr` (`--runs 10000`, 60 temporadas por Falconess) contra el mismo `HEAD` sin el cambio, con su
intervalo de Wilson. Ninguna otra celda del lote cambia: las 85 celdas de las métricas 1-6 y 8 dan
± 0 en las dos bases.

| Base        | Caracara                   | Cernícala                  | Peregrina                  | Veredicto               |
| ----------- | -------------------------- | -------------------------- | -------------------------- | ----------------------- |
| por defecto | 30,0 → 83,3 % [72,0, 90,7] | 26,7 → 78,3 % [66,4, 86,9] | 36,7 → 86,7 % [75,8, 93,1] | fail 0/3/0 → pass 3/0/0 |
| alt1        | 36,7 → 75,0 % [62,8, 84,2] | 25,0 → 80,0 % [68,2, 88,2] | 36,7 → 80,0 % [68,2, 88,2] | fail 0/3/0 → pass 3/0/0 |

S7 `full` (`--profile full --scenarios S7`, 500 temporadas por Falconess):

| Base        | Caracara                   | Cernícala                  | Peregrina                  | Veredicto               |
| ----------- | -------------------------- | -------------------------- | -------------------------- | ----------------------- |
| por defecto | 36,0 → 83,0 % [79,5, 86,0] | 23,6 → 78,0 % [74,2, 81,4] | 34,6 → 83,8 % [80,3, 86,8] | fail 0/3/0 → pass 3/0/0 |
| alt1        | 29,0 → 80,0 % [76,3, 83,3] | 23,0 → 74,4 % [70,4, 78,0] | 40,2 → 83,6 % [80,1, 86,6] | fail 0/3/0 → pass 3/0/0 |

`pnpm sim:season-batch -- --runs 500`: ≥ B 33 / 22 / 37 % → 80 / 75 / 85 %; temporadas completas
33 / 22 / 37 % → 81 / 77 / 86 %.

Tabla de objetivos de 21.1: S7 `full`, porcentaje de las temporadas que llegan a la carrera que la
pasan, por defecto / alt1. Antes 15 de las 24 celdas quedaban bajo 80 %; ahora ninguna (90,3-98,3 %):

| Falconess | Objetivo       | Antes       | Ahora       |
| --------- | -------------- | ----------- | ----------- |
| caracara  | T12 ridge ≤ 5  | 74,2 / 70,6 | 94,8 / 93,2 |
| caracara  | T24 sprint ≤ 4 | 70,4 / 66,9 | 96,6 / 94,0 |
| caracara  | T36 canyon ≤ 3 | 87,0 / 81,8 | 98,3 / 97,5 |
| caracara  | T46 ridge ≤ 2  | 79,7 / 75,1 | 93,8 / 94,8 |
| cernicala | T12 sprint ≤ 5 | 71,2 / 69,6 | 94,6 / 94,8 |
| cernicala | T24 canyon ≤ 3 | 57,9 / 60,9 | 92,2 / 90,3 |
| cernicala | T36 ridge ≤ 3  | 84,5 / 76,4 | 97,0 / 96,7 |
| cernicala | T46 canyon ≤ 1 | 68,4 / 71,0 | 93,9 / 90,8 |
| peregrina | T12 sprint ≤ 5 | 60,0 / 61,6 | 92,6 / 93,6 |
| peregrina | T24 ridge ≤ 3  | 87,3 / 89,3 | 98,3 / 97,0 |
| peregrina | T36 canyon ≤ 3 | 81,3 / 85,1 | 97,6 / 97,6 |
| peregrina | T46 ridge ≤ 1  | 81,7 / 85,9 | 97,5 / 97,3 |

Diagnósticos de S7 `full` por defecto (Caracara / Cernícala / Peregrina), antes → ahora:

- Notas: B 34,2 / 23,4 / 34,2 → 79,0 / 77,4 / 81,8 %; A 1,8 / 0,2 / 0,4 → 4,0 / 0,6 / 2,0 %; ninguna
  S ni SS; G (fallos tempranos) 25,8 / 28,8 / 40,0 → 5,4 / 5,4 / 7,6 %.
- `seasonScore` medio (todas las temporadas): stats 2260 / 2009 / 2117 → 2982 / 2811 / 2918;
  bonos de carrera 60 / 52 / 65 → 150 / 151 / 157; habilidades 20; carreras objetivo por temporada
  2,7 / 2,5 / 2,6 → 3,8 / 3,7 / 3,7.
- Curva de stats: el entrenamiento no cambia; las temporadas completas terminan en 618-639 por stat
  (arnés; antes 644-660 porque solo terminaban las temporadas fuertes), dentro de 550-800.

### Puesto en las carreras objetivo (añadido en la verificación)

El cambio aprueba la métrica 7 haciendo casi automáticas las carreras objetivo para la jugadora de
referencia: los rivales quedan a ≈ ¾ de sus stats y ella gana la mayoría. En un campo de ocho la
cuota justa es 12,5 %. Datos del arnés, semillas `batch-0` … `batch-499`, las mismas de
`pnpm sim:season-batch -- --runs 500`, que con el cambio informa `win rate` 73 / 76 / 80 %.
Porcentajes de las carreras objetivo que la temporada llegó a correr:

| Carreras objetivo corridas (Caracara / Cernícala / Peregrina) | 95 / 9 (v1)          | 60 / 8               |
| ------------------------------------------------------------- | -------------------- | -------------------- |
| Ganadas (1.º)                                                 | 32,9 / 28,6 / 42,2 % | 73,1 / 75,9 / 79,7 % |
| En el podio (≤ 3.º)                                           | 63,9 / 61,3 / 69,1 % | 92,0 / 91,0 / 93,4 % |
| Temporadas que ganan las cuatro                               | 3,8 / 1,8 / 3,0 %    | 33,0 / 36,8 / 40,2 % |
| Carreras objetivo por temporada                               | 2,6 / 2,4 / 2,6      | 3,7 / 3,6 / 3,7      |

Reparto de puestos, del 1.º al 8.º, de las tres juntas: 34,8 / 17,0 / 13,1 / 9,7 / 7,7 / 7,6 / 5,3
/ 4,8 % → 76,2 / 10,7 / 5,2 / 3,2 / 2,2 / 1,4 / 0,6 / 0,4 %. Por meta, en % de las temporadas
(arnés con `minPlace` 8, así que todas corren las cuatro):

| Ganadas por meta (sin cortar la temporada) | T12         | T24         | T36         | T46         |
| ------------------------------------------ | ----------- | ----------- | ----------- | ----------- |
| Caracara, 95 / 9 → 60 / 8                  | 19,2 → 54,2 | 20,4 → 66,8 | 42,4 → 83,8 | 46,2 → 83,4 |
| Cernícala, 95 / 9 → 60 / 8                 | 13,4 → 52,4 | 22,0 → 75,4 | 29,2 → 80,4 | 49,4 → 89,0 |
| Peregrina, 95 / 9 → 60 / 8                 | 8,4 → 50,4  | 51,6 → 87,2 | 46,8 → 84,0 | 75,2 → 97,0 |

`pnpm sim -- --seed 42`: las tres Falconess terminan 1.ª en sus cuatro carreras objetivo (12 de 12),
también en las de T24 y T36 que solo piden podio. No es ruido de las semillas de ajuste: con una
tercera base de semillas (alt2, de la verificación) la métrica 7 da `pr` 75,0 / 78,3 / 86,7 % y
`full` 81,2 / 79,0 / 82,0 %.

Para la jugadora de referencia la temporada deja de ser un desafío en las carreras (propuesta 4 de
«Métrica 7»). La dificultad que queda la sienten las políticas descuidadas (arnés, 500 temporadas
por Falconess, semillas `batch-0` … `batch-499`, ≥ B Caracara / Cernícala / Peregrina):

| Política                                                                | 95 / 9 (v1)        | 60 / 8             |
| ----------------------------------------------------------------------- | ------------------ | ------------------ |
| referencia (`sim:season-batch`)                                         | 32,6 / 22,2 / 36,6 | 79,8 / 75,2 / 84,8 |
| al azar: los 5 entrenamientos, descanso y salida, uniforme; opción 0    | 7,8 / 0,4 / 8,6    | 32,0 / 15,0 / 37,6 |
| solo agilidad: la de referencia, pero todo entrenamiento es de agilidad | 0,2 / 0,4 / 1,8    | 17,8 / 17,2 / 50,2 |

Con la política al azar el 7-15 % de las temporadas pasa los cuatro objetivos y aun así queda en C
(nota < 2900): el umbral de B muerde al entrenamiento descuidado y casi nunca a la referencia.

Corridas del lote de esta sección: 8 (`pr` completo y `full` de S7 del `HEAD` y del cambio, en las
dos bases) y 2 de `sim:season-batch`; arnés: 13 variantes de `FIELD` y 5 corridas de políticas.
Tests: ninguno fija `FIELD` de v1 (los de `field.test.ts` leen `SPEC_RULESET`); la suite sin golden,
`pnpm typecheck` y `pnpm lint` pasan. Documentos: `docs/formulas.md` («Rivales de las carreras
objetivo») y una nota en 21.1 de `docs/race-engine.md`. Los golden v1 que generan campo (g04-g09,
T24 y T46) cambian además de los que ya cambiaban; los regenera el líder.

### Consecuencias

- La métrica 7 pasa en `pr` y en `full`, en las dos bases; todas las celdas de objetivo quedan en
  90-98 %. Las métricas 1-6 y 8 no se mueven (S7 es el único escenario que usa `generateField`).
- Cernícala sigue siendo la más floja (74-78 % frente a 80-85 %): su curva de stats queda ≈ 3-4 %
  por debajo (crecimiento en técnica e inteligencia) y sus dos metas del cañón son sus celdas más
  bajas (90-94 %). No se tocó su contenido: con 60 / 8 pasa con margen en `full`.
- Las carreras objetivo de `pnpm sim`, `pnpm play` y de cualquier jugadora corren contra rivales más
  flojos: la referencia gana el 73-80 % (antes 29-42 %) y el 33-40 % de sus temporadas gana las
  cuatro. Con su bastidor de firma (el hangar de referencia lleva genéricos) la temporada es aún
  más fácil.
- La razón ¾ depende de la curva de referencia: un cambio de la economía de entrenamiento
  (`trainBase`, `secondaryGain`, fatiga), del crecimiento de las Falconess o de la política de
  referencia vuelve a medir la razón con el arnés antes de tocar `FIELD`.

### Propuestas para el dueño (métrica 7)

Estado: **propuesto**, salvo las propuestas 1 y 4: **aceptado (dueño, 2026-10-28)** (sección
«Pasada 2», «Temporada más exigente»).

1. **La política de referencia no gasta puntos de habilidad.** **Aceptado (dueño, 2026-10-28)**:
   aprende en el taller las activas genéricas útiles que pagan sus puntos (`skillsToLearn`). Medido
   en la «Pasada 2»: con la economía v1 nunca junta los 60 puntos de la activa más barata, así que
   la regla no se dispara (propuesta 1 de «Temporada más exigente»). El resto describe el estado
   previo. Termina la temporada con su única
   habilidad (20 puntos de nota) mientras los rivales llevan una activa genérica por cada 12 turnos
   (3 desde T36). La métrica 7 mide así a una jugadora que ignora las habilidades. Opción (código de
   la herramienta, `apps/cli/src/policy.ts`): aprender una activa cuando alcancen los puntos, y volver
   a medir la razón de `FIELD` con esa política.
2. **Una política descuidada pasa más que antes** (al azar 15-38 %, solo agilidad 17-50 %; antes
   0-9 %). Con la «Pasada 2» vuelve a 12-32 % y 4-8 % (arnés): la temporada más exigente ya deja a
   las dos bajo el techo de 40 % de la opción (a), que sigue sin estar en el lote. Opciones: (a) objetivo: sumar al lote una política descuidada con un techo (por ejemplo
   ≤ 40 % de ≥ B) para que la métrica 7 no se cumpla solo aflojando el campo; (b) si se quiere una
   temporada más dura con la misma política, 65-70 / 8 da 74-76 / 67-71 / 79-81 % (arnés) a costa
   del margen en `pr`.
3. **La durabilidad y la fatiga no presionan a la referencia.** No reparar nunca o descansar solo en
   el descanso forzado (fatiga 80) da lo mismo (79,8 / 75,4 / 85,4 % y 78,6 / 75,4 / 85,2 %, arnés):
   la referencia repara en 0 / 14 / 12 % de las temporadas (una vez; 300 semillas), así que R8 no
   muerde. Si reparar debe ser una decisión, hace falta más desgaste de temporada (constantes de
   durabilidad o contenido de pistas), fuera de esta métrica. Medido en la verificación: sin reparar
   nunca, 0 de 3311 carreras objetivo empiezan o terminan con las alas rotas (300 temporadas por
   Falconess). Si se rompieran, con `pwCruiseWeight` 5 costarían ≈ 0,2 % de tiempo en vez de ≈ 30 %
   (propuesta 5 de «Métricas 2 y 5»). Para que reparar sea una decisión hacen falta las dos cosas:
   más desgaste y un castigo real de alas rotas. El castigo volvió con la «Pasada 2» (≈ 30 %); el
   desgaste sigue sin cambio y la propuesta sigue abierta.
4. **Las carreras objetivo son casi automáticas para la referencia** (sección «Puesto en las
   carreras objetivo»). **Aceptado (dueño, 2026-10-28), opción (a)**: `FIELD` 75 / 9 (razón
   0,83-0,86 en cada carrera) y escalera 7 / 6 / 5 / 3 para las tres, sin metas de ganar; la
   referencia gana el 43-59 % (sección «Pasada 2»). De la opción (b) solo se tomó el informe: el
   lote muestra las victorias y los puestos (tabla `s7-places`) sin juzgarlos. La (c) queda
   descartada. El resto describe el estado previo: gana el 73-80 % y el 33-40 % de sus temporadas
   gana las cuatro. BRIEF §12 solo pone un piso a la métrica 7, y ni el brief ni la
   especificación dicen cuánto debe ganar la referencia: eso lo decide el dueño. Arnés de la sección
   (1000 temporadas por Falconess, cada escalera evaluada sobre las mismas carreras; «actual» es
   5/4/3/2 en Caracara y 5/3/3/1 en Cernícala y Peregrina; ≥ B en Caracara / Cernícala / Peregrina;
   «Ganadas», las carreras objetivo corridas que gana, de las tres juntas):

   | `rivalBase` / `rivalPerTurn` (razón T12-T46) | `minPlace` (T12/T24/T36/T46) | ≥ B (%)            | Ganadas |
   | -------------------------------------------- | ---------------------------- | ------------------ | ------- |
   | 60 / 8 (0,74-0,77; hoy)                      | actual                       | 78,8 / 74,3 / 84,3 | 75,0 %  |
   | 60 / 9 (0,81-0,85)                           | actual                       | 60,7 / 52,5 / 70,2 | 59,7 %  |
   | 60 / 9                                       | T12 ≤ 7                      | 65,3 / 55,4 / 77,1 | 59,3 %  |
   | 70 / 9 (0,84-0,88)                           | actual                       | 52,3 / 42,8 / 61,4 | 52,4 %  |
   | 70 / 9                                       | T12 ≤ 8 (sin meta en T12)    | 59,6 / 47,6 / 73,6 | 52,1 %  |
   | 70 / 9                                       | 6/5/4/3 las tres             | 68,0 / 67,5 / 79,1 | 52,5 %  |
   | 80 / 9 (0,85-0,91)                           | 6/5/4/3 las tres             | 61,8 / 60,5 / 72,7 | 45,2 %  |
   | 80 / 9                                       | 7/6/5/3 las tres             | 71,6 / 70,2 / 80,9 | 45,0 %  |
   | 95 / 9 (0,88-0,98; v1)                       | 7/6/5/3 las tres             | 60,9 / 60,9 / 74,0 | 35,4 %  |

   La tasa de victorias la fija la razón de los rivales, no la escalera: 75 / 60 / 52 / 45 / 35 %
   con 60 / 8, 60 / 9, 70 / 9, 80 / 9 y 95 / 9. Aflojar solo T12 no alcanza con una razón ≈ 0,85: con 70 / 9
   y sin meta en T12, Cernícala queda en 47,6 %. La moneda al aire de T12 era el diagnóstico de la
   curva 95 / 9; con razón 0,85 también muerden las metas «≤ 1» de T46 (Cernícala y Peregrina) y
   las del cañón de Cernícala. Además, una meta «≤ 1» obliga a ganar esa carrera en ≥ 60 % de las
   temporadas para cumplir la métrica 7, así que un techo bajo de victorias no convive con metas de
   ganar. Opciones:
   (a) contenido y constantes: razón ≈ 0,85-0,9 (`FIELD` 70 / 9 u 80 / 9) con una escalera más
   floja en las cuatro metas y sin metas de ganar (6/5/4/3 o 7/6/5/3): ganadas 45-52 %, ≥ B
   60-81 %. Coste: T46 deja de pedir la victoria y, tal como se midió, las tres comparten
   escalera. Con 80 / 9 y 6/5/4/3 Cernícala queda al borde (60,5 %). Una escalera propia por
   Falconess se evalúa con el arnés en minutos y se confirma con `sim:batch` (S7 `pr` y `full`, dos
   bases).
   (b) objetivo, código de la herramienta (`apps/cli/src/batch`): un diagnóstico de techo en S7, por
   ejemplo ganadas ≤ 50 % o temporadas que ganan las cuatro ≤ 10 %, para que la métrica 7 no se
   cumpla solo aflojando el campo. Va con (a): con la escalera de hoy un techo de 40 % es
   incompatible con ≥ B 60 %, y aun con 7/6/5/3 pide la curva v1 y deja ≥ B en el borde (60,9 %).
   (c) aceptar «metas como puntos de control»: es el estado de hoy. La referencia gana casi
   siempre; la dificultad queda para las políticas descuidadas (propuesta 2) y para las notas
   altas (A o mejor en 0,6-4 % de las temporadas). Este ADR y `docs/formulas.md` ya lo describen
   así: aceptarla cierra la propuesta.

## Golden

Los doce logs de `tests/golden/v1` (ADR-0004) se regeneraron el 2026-10-28 tras esta pasada, con
dos corridas idénticas byte a byte. Cambian porque cambiaron las constantes y el contenido de
arriba; el motor no cambió. Si el dueño decide distinto en las propuestas pendientes (peso de PW,
dificultad de temporada), los golden se vuelven a generar con una línea en este ADR.

Pasada 2 (2026-10-28): los doce se regeneraron sobre `55049f9` (las tres decisiones del dueño y la
higiene m1-m5 integradas) con dos corridas de `pnpm golden:update -- --yes` idénticas byte a byte
(la segunda: «0 of 12 written»; una tercera con `--dir` aparte da los mismos SHA-256). g01-g03 solo
suman `derived[].brokenSpeedPm` 750 (ADR-0003 D56). g04-g09 cambian por `FIELD` 75 / 9: los rivales
suben de 247-463 a 285-530 de media por stat y la Falconess de referencia pasa de 5 victorias en 6
a 2 (g05 y g08 1.ª; g04, g06 y g09 3.ª; g07 2.ª), con su propio tiempo igual o a < 0,2 %.
g10-g12 cambian de física por las alas rotas (D56): el carril 7, roto desde la salida, tarda
+28,2 / +29,8 / +32,2 % y termina 8.º (antes 1.º / 7.º / 1.º); en g12 el carril 2 rompe a 2401,5 m
de 2940 (evento `durabilityBroken` con el PW intacto) y tarda +5,8 % (6.º → 7.º). Ni la estadística
de la métrica 3 (solo la herramienta del lote) ni `massThrustCoolPm.urban` (ninguna pista urbana)
mueven un golden.

## Pasada 2 (decisiones del dueño, 2026-10-28)

### Alas rotas fuera del peso de PW (decisión 1)

Estado: **aceptado (dueño, 2026-10-28)**: propuesta 5 de «Métricas 2 y 5», opción (a), con la
propuesta 3, opción (b). El dueño mantiene el PW comprimido (`pwCruiseWeight` 5, `pwBoostWeight`
250, para que los bastidores SSR no aplasten el campo) y pide que las alas rotas vuelvan a costar
lo que dice BRIEF §5 (durabilidad 0 → ≈ −25 % de potencia el resto de la carrera) con un cambio de
código independiente de los pesos de PW. Regla del motor: ADR-0003 D56 (`docs/race-engine.md` §3.3
y §8.4).

| Constante, código o log           | Antes              | Después   | Por qué                                                                                                      |
| --------------------------------- | ------------------ | --------- | ------------------------------------------------------------------------------------------------------------ |
| `brokenSpeedPm` (nueva)           | — (1000 implícito) | 750       | Multiplica el PW pesado de la variante rota: crucero, aceleración, `vMin` y empuje ×0,75 con cualquier peso. |
| `durabilityZeroPowerMult`         | 750                | 1000      | Con los pesos 5 / 250 el corte de PW daba `pwc` 998 y `pwb` 937; sumado al factor, el empuje caería ×0,70.   |
| `SPEC_RULESET.brokenSpeedPm`      | —                  | 1000      | Neutro: los tests de física siguen fijados al prototipo (que rompe con `durabilityZeroPowerMult` 750).       |
| `RaceLog.derived[].brokenSpeedPm` | —                  | 750 en v1 | El log explica la pérdida sin eventos (roto desde la salida, detalle `results`).                             |
| PW 1,0 roto: `pwc` / `pwb`        | 998 / 937          | 750 / 750 | Lo mismo que con los pesos del brief (1000 / 1000).                                                          |

Coste de unas alas rotas en carrera (mismas semillas y scripts que la propuesta 5,
`.work/balance/verify/broken.ts` y `steinhaus.ts`; v1 antes y después, intacto contra roto desde la
salida):

| Caso                                                                    | Antes (v1)           | Después (v1)         | `SPEC_RULESET`       |
| ----------------------------------------------------------------------- | -------------------- | -------------------- | -------------------- |
| Campo S1 (8 neutros, stats 600): coste de tiempo sprint / ridge / cañón | 0,27 / 0,22 / 0,17 % | 29,7 / 30,7 / 29,6 % | 29,7 / 30,7 / 29,6 % |
| Campo S1: victorias del roto (intacto 8,5 / 9,0 / 12,0 %; 200 semillas) | 7,0 / 6,5 / 8,5 %    | 0 / 0 / 0 %          | 0 / 0 / 0 %          |
| Campo real de 8 bastidores, erzherzog roto (100 semillas por pista)     | 0,23 / 0,22 / 0,20 % | 29,0 / 30,7 / 29,3 % | —                    |
| En solitario, velocidad media rota / intacta (PW 0,7, 1,0 y 1,4)        | 0,997-0,999          | 0,761-0,771          | 0,761-0,771 (PW 1,0) |

En el campo S1 v1 da ahora lo mismo que `SPEC_RULESET` carrera por carrera (a PW 1,0 las dos vías
construyen las mismas tablas). La velocidad media cae algo menos que el 25 % porque la salida
(`vStart`, `kStartDash`) y el presupuesto de energía no se escalan; el crucero y el empuje caen
exactamente ×0,75 (test de v1 en `mechanics.test.ts`).

Lote: `pnpm sim:batch -- --runs 10000` y `--profile full`, semilla por defecto y alt1, contra el
`HEAD` previo (`a152900`; informes en `.work/balance/p2-broken/`). Las 88 celdas de `pr` y las 180
de `full` quedan idénticas en las dos bases, y también los diagnósticos: ningún escenario del lote
llega a romper un bastidor (S1-S6 y S8 corren con la durabilidad completa; las piezas de S5 mueven
el máximo, no lo agotan; S7, ver abajo).

| #   | Métrica                    | Antes = después, `pr` por defecto / alt1              | Antes = después, `full` por defecto / alt1            |
| --- | -------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| 2   | casa 30-45 %, débil ≤ 15 % | inconclusa 7/0/3 / 7/0/3                              | inconclusa 9/0/1 / 9/0/1                              |
| 5   | piezas ≤ 3 puntos          | pass 24/0/0 (máx. 2,3 puntos) / pass (máx. 2,3)       | pass 24/0/0 (máx. 1,9 puntos) / pass (máx. 2,1)       |
| 7   | temporadas ≥ B ≥ 60 %      | pass 83,3 / 78,3 / 86,7 % / pass 75,0 / 80,0 / 80,0 % | pass 83,0 / 78,0 / 83,8 % / pass 80,0 / 74,4 / 83,6 % |

Temporada: `pnpm sim:season-batch -- --runs 500` sale idéntico antes y después (≥ B 80 / 75 / 85 %,
victorias 73 / 76 / 80 %). Arnés local (`broken-season.mts`, scratch; semillas `batch-0` …
`batch-499`, la política de referencia y una variante que nunca repara; cada carrera objetivo se
vuelve a correr desde el estado de la carrera y reproduce el puesto y la durabilidad del estado en
las 11 072 carreras), Caracara / Cernícala / Peregrina:

| Medida                                                                 | Referencia           | Sin reparar nunca    |
| ---------------------------------------------------------------------- | -------------------- | -------------------- |
| Carreras objetivo que empiezan o terminan con las alas rotas           | 0 de 5524            | 0 de 5548            |
| Rivales con las alas rotas al terminar                                 | 0 de 38 668          | 0 de 38 836          |
| Temporadas en que la regla de reparación se dispara (una vez cada una) | 0 / 11,6 / 11,0 %    | —                    |
| Durabilidad mínima al empezar una carrera objetivo (‰ del máximo)      | 625 / 500 / 500      | 625 / 300 / 300      |
| Durabilidad media al terminar una carrera objetivo (‰ del máximo)      | 958 / 871 / 899      | 958 / 843 / 876      |
| ≥ B                                                                    | 79,8 / 75,2 / 84,8 % | 79,8 / 75,4 / 85,4 % |

Todo es idéntico antes y después del cambio: la regla de reparación se dispara en las mismas
temporadas (Cernícala y Peregrina, cuando una carrera deja el bastidor bajo la mitad), y reparar
sigue sin pagar el turno porque ninguna carrera llega a romper las alas. El castigo ya es real
(≈ 30 % de tiempo, el roto no gana), pero en la temporada queda latente: una carrera objetivo
termina de media con el 87-96 % del máximo (84-96 % sin reparar) y ninguna Falconess empieza una
por debajo del 30 %. Para que
reparar sea una decisión falta la otra mitad de la propuesta 3 de «Métrica 7» (más desgaste de
temporada: constantes de durabilidad o contenido de pistas), que sigue abierta.

Tests: `physics.test.ts` (`variantPower`), `state.test.ts` (con `SPEC_RULESET` cambiado a
`brokenSpeedPm` 750 y `durabilityZeroPowerMult` 1000, las tablas rotas son idénticas a las del
spec en las tres pistas; ×0,75 con los pesos 5 / 250), `mechanics.test.ts` (la misma carrera
del cañón con las dos vías: solo cambia el PW del evento; el crucero de un PW 1,4 roto es 0,75 del
intacto; con `RULESET_V1`, el evento conserva el PW, el crucero cae a 264 375 vu y la velocidad
media rota queda en 0,74-0,79 de la intacta en las tres pistas para PW 0,7, 1,0 y 1,4),
`units.test.ts` (producto del factor), `race.test.ts` de schema (campo nuevo, rechaza > 1000) y
los de la CLI (`render-race.test.ts`: «alas rotas en X m (velocidad ×0.75)»). Los fixtures de la
CLI (`apps/cli/src/race/__fixtures__/logs`) son anteriores a esta pasada y no se regeneran: llevan
`brokenSpeedPm` 1000 a mano, el neutro del motor que los escribió. Documentos: `docs/race-engine.md`
(§1.5, §3.3, §8.4, §20.3, §20.4, §20.6, §26), `docs/formulas.md` («Durabilidad a cero», estado de
`pwCruiseWeight`) y ADR-0003 D56.

Golden: los doce de `tests/golden/v1` quedan desactualizados. g01-g09 solo cambian por el campo
nuevo de `derived`; g10-g12 cambian además de física (bastidores rotos: el carril 7 en los tres y
el 2 en g12). Los regenera el líder (ADR-0004); hasta entonces la suite corre sin `golden.test.ts`.
Corridas de esta sección: 8 de `sim:batch` (`pr` y `full` antes y después, en las dos bases), 2 de
`sim:season-batch` y 4 del arnés de temporada.

### Temporada más exigente (decisión 2)

Estado: **aceptado (dueño, 2026-10-28)**: propuestas 1 y 4 de «Métrica 7», opción (a) de la 4. El
dueño pide rivales más cerca de la jugadora y una escalera de metas más floja sin metas de ganar,
para que la referencia gane ≈ la mitad de sus carreras objetivo con la métrica 7 (≥ 60 % de las
temporadas en B o mejor) pasando. Antes de este cambio la referencia ganaba el 73-80 % y la métrica
7 daba 75-86 %.

#### La política de referencia aprende activas genéricas (propuesta 1)

Regla (`apps/cli/src/policy.ts`, `skillsToLearn`): con un evento pendiente elige la opción 0; si el
bastidor está bajo el 50 % de su durabilidad o los puntos pagan alguna activa útil, va al taller
(una visita repara y aprende); si no, descansa con fatiga ≥ 60 o entrena la stat más baja. Útil:
una activa sin `uniqueTo`, sin aprender, cuyo disparador puede ocurrir en una pista objetivo que
queda por correr (un disparador de `segment` pide ese tipo de segmento en una de esas pistas; los de
fase, posición, calor y energía sirven en cualquiera). Aprende en orden de costo (empate por id)
mientras alcancen los puntos, hasta el tope de aprendizaje (`learnCap`, con la única incluida).

Medido: la regla nunca se dispara. Los puntos salen del simulador (+5 por sesión, BRIEF §8) y la
política de la stat más baja lo entrena 6-8 veces por temporada: termina con 25-50 puntos (media
46 / 35 / 45 en Caracara / Cernícala / Peregrina; arnés, 500 temporadas por Falconess) y la activa
genérica más barata (`clean-start`) cuesta 60; las demás, 70-150. Con la regla, `sim:batch` `pr`
(88 celdas y 12 diagnósticos, en las dos bases), S7 `full` (las dos bases),
`sim:season-batch -- --runs 500` y el arnés (1500 temporadas) salen idénticos a `637198f`. Los
rivales llevan 1 / 2 / 3 / 3 activas genéricas en T12 / T24 / T36 / T46.

Lo que costaría juntar los puntos (arnés, 500 temporadas por Falconess, la regla de aprender más
una regla de ahorro mientras quede una activa útil sin aprender; campo 60 / 8 y escalera de
entonces; Caracara / Cernícala / Peregrina):

| Regla de ahorro                               | Activas genéricas por temporada | Ganadas | ≥ B                  |
| --------------------------------------------- | ------------------------------- | ------- | -------------------- |
| ninguna (la política aceptada)                | 0 / 0 / 0                       | 76,2 %  | 79,8 / 75,2 / 84,8 % |
| simulador si inteligencia ≤ 1,2 × la más baja | 0,05 / 0 / 0,01                 | 76,0 %  | 78,8 / 77,8 / 85,0 % |
| simulador si inteligencia ≤ 1,3 × la más baja | 0,30 / 0 / 0,17                 | 73,0 %  | 76,4 / 77,2 / 82,4 % |
| simulador con fatiga ≥ 40 en vez de entrenar  | 1 / 1 / 1                       | 43,1 %  | 31,2 / 9,8 / 46,8 %  |
| simulador con fatiga ≥ 20 en vez de entrenar  | 2 / 2 / 2                       | 14,5 %  | 0 / 0 / 0 %          |

Una activa cuesta ≈ 10 sesiones de simulador más: la inteligencia sube, las demás stats se quedan
atrás y la carrera pierde mucho más de lo que la activa da (S4: 0,5-8 m por activa). Ninguna regla
de ahorro entra en la política: BRIEF §12 define la métrica con «entrenar la stat más baja» y
cambiar el entrenamiento cambia la política medida (propuesta 1 de abajo).

#### Victorias y puestos en el informe

`pnpm sim:season-batch` imprime por Falconess una línea de carreras objetivo (corridas por
temporada, ganadas, podio, reparto del 1.º al 8.º y temporadas que las ganan todas) y `won/reached`
por meta; `pnpm sim:batch` suma la tabla `s7-places` (lo mismo en S7) y la columna «won / reached %»
de `s7-goals`. `placeCounts` (`apps/cli/src/goal-rate.ts`) es común a los dos. Ninguna celda cambia.

#### Cambio aceptado

| Constante o contenido                          | Antes         | Después       | Por qué                                                                                      |
| ---------------------------------------------- | ------------- | ------------- | -------------------------------------------------------------------------------------------- |
| `FIELD.rivalBase`                              | 60            | 75            | Rivales a 0,83-0,86 de la referencia en cada carrera objetivo (antes 0,71-0,74).             |
| `FIELD.rivalPerTurn`                           | 8             | 9             | Con 10 la T12 pasa a ser la carrera más difícil y la T46 ≤ 3 baja a 80-81 % (Caracara).      |
| `FIELD.rivalNoise`                             | 200           | 200           | 100 sube las victorias a 55 % y las descuidadas; 300 las baja a 33-40 % y la T46 ≤ 3 a 84 %. |
| `minPlace` de Caracara (T12 / T24 / T36 / T46) | 5 / 4 / 3 / 2 | 7 / 6 / 5 / 3 | Sin metas de ganar; la escalera sigue cerrándose hacia T46 (podio).                          |
| `minPlace` de Cernícala y Peregrina            | 5 / 3 / 3 / 1 | 7 / 6 / 5 / 3 | La misma escalera para las tres.                                                             |

Media por stat de los rivales en T12 / T24 / T36 / T46: 156 / 252 / 348 / 428 → 183 / 291 / 399 /
489. La referencia llega a esas carreras con 220 / 339 / 470 / 591 (arnés, stats tras la acción del
turno, media de las tres), así que la razón pasa de 0,71 / 0,74 / 0,74 / 0,72 a 0,83 / 0,86 / 0,85
/ 0,83 (la sección «Métrica 7» medía las stats antes de la acción: 0,74-0,77).

Exploración (arnés de «Métrica 7» con la política nueva, 1000 temporadas por Falconess, semillas
`batch-0` … `batch-999`; cada escalera se evalúa sobre las mismas carreras; «Peor meta», la menor
tasa de las doce entre las temporadas que corren la carrera; «Ganadas», de las carreras objetivo
corridas, las tres juntas y por Falconess; ≥ B en Caracara / Cernícala / Peregrina):

| `FIELD` (base / por turno / ruido) | Escalera          | ≥ B (%)            | Peor meta | Ganadas                     |
| ---------------------------------- | ----------------- | ------------------ | --------- | --------------------------- |
| 60 / 8 / 200 (antes)               | 5/4/3/2 y 5/3/3/1 | 78,8 / 74,3 / 84,3 | 91,9 %    | 75,0 % (71,9 / 74,3 / 78,9) |
| 60 / 8 / 200                       | 7/6/5/3           | 89,9 / 85,4 / 91,8 | 96,7 %    | 74,7 %                      |
| 70 / 9 / 200                       | 7/6/5/3           | 76,2 / 74,7 / 85,4 | 87,8 %    | 52,0 % (47,7 / 46,5 / 61,7) |
| **75 / 9 / 200**                   | **7/6/5/3**       | 73,4 / 72,4 / 83,0 | 86,6 %    | 48,3 % (44,0 / 42,8 / 58,0) |
| 75 / 9 / 200                       | 7/6/5/4           | 77,3 / 74,1 / 83,3 | 92,4 %    | 48,3 %                      |
| 75 / 9 / 200                       | 6/6/5/3           | 69,1 / 69,5 / 77,8 | 87,1 %    | 48,5 %                      |
| 75 / 9 / 200                       | 6/5/4/3           | 64,3 / 63,4 / 76,4 | 87,5 %    | 48,6 %                      |
| 80 / 9 / 200 (ejemplo del dueño)   | 7/6/5/3           | 71,6 / 70,2 / 80,9 | 86,2 %    | 45,0 % (40,7 / 39,5 / 54,7) |
| 85 / 9 / 200                       | 7/6/5/3           | 67,6 / 68,0 / 78,8 | 85,1 %    | 41,7 %                      |
| 90 / 9 / 200                       | 7/6/5/3           | 64,3 / 65,6 / 76,4 | 84,6 %    | 38,7 %                      |
| 80 / 9 / 100                       | 7/6/5/3           | 70,3 / 69,2 / 81,1 | 88,5 %    | 55,0 %                      |
| 80 / 9 / 300                       | 7/6/5/3           | 70,4 / 65,9 / 81,4 | 83,8 %    | 33,2 %                      |
| 70 / 9 / 300                       | 7/6/5/3           | 74,6 / 70,1 / 85,5 | 86,1 %    | 39,5 %                      |
| 50 / 10 / 200                      | 7/6/5/3           | 70,0 / 69,5 / 83,8 | 81,4 %    | 47,2 %                      |
| 60 / 10 / 200                      | 7/6/5/3           | 64,0 / 62,7 / 79,9 | 79,7 %    | 40,7 %                      |

Con otra base de semillas del arnés (`alt1/batch-0` … `alt1/batch-999`): 75 / 9 con 7/6/5/3 da
≥ B 73,9 / 74,5 / 85,1 %, peor meta 88,6 % y ganadas 50,0 % (45,0 / 45,9 / 58,8); 80 / 9, 71,9 /
72,1 / 83,2 %, 88,6 % y 46,6 % (41,4 / 41,8 / 56,3).

Razones:

- 75 / 9 es la curva de la familia «por turno 9» que deja la tasa de victorias en la mitad: 48-50 %
  en el arnés y 48-49 % en S7 `full`, en las dos bases. El ejemplo del dueño (80 / 9) da 45-47 % con
  Caracara y Cernícala en 40-42 % y 1-3 puntos menos de margen de ≥ B; 70 / 9 da 52 % con Peregrina
  en 62 %.
- 7/6/5/3 es la escalera más exigente que deja cada meta ≥ 85 % y ≥ B en 72-83 %: 6/6/5/3 y 6/5/4/3
  bajan a Cernícala a 63-70 %, y 7/6/5/4 aflojaría la última meta. La misma escalera para las tres:
  lo que las separa es el bastidor y el pool de su clase, no las metas (propuesta 2).
- `rivalPerTurn` 9: la razón baja de 0,86 a 0,83 a lo largo de la temporada mientras la escalera se
  cierra (de ≤ 7 a ≤ 3); con 10 (base 50-60) las victorias se aplanan (T12 33-41 %) pero la T46 ≤ 3
  de Caracara queda en 80-81 %.
- `rivalNoise` 200 sin cambio: la variedad del campo se queda y ninguna alternativa mejora a la vez
  las victorias, la peor meta y las políticas descuidadas.

#### Evidencia (lote)

`pnpm sim:batch -- --runs 10000`, por defecto y `--seed alt1`, contra el mismo `HEAD` sin el cambio
(`1651f94`, idéntico a `637198f`): las 85 celdas de las métricas 1-6 y 8 y sus diagnósticos quedan
idénticos en las dos bases; cambian las tres celdas de la métrica 7 y las tablas de S7.

| Base        | Caracara                   | Cernícala                  | Peregrina                  | Veredicto               |
| ----------- | -------------------------- | -------------------------- | -------------------------- | ----------------------- |
| por defecto | 83,3 → 80,0 % [68,2, 88,2] | 78,3 → 73,3 % [61,0, 82,9] | 86,7 → 85,0 % [73,9, 91,9] | pass 3/0/0 → pass 3/0/0 |
| alt1        | 75,0 → 75,0 % [62,8, 84,2] | 80,0 → 75,0 % [62,8, 84,2] | 80,0 → 83,3 % [72,0, 90,7] | pass 3/0/0 → pass 3/0/0 |

Con 60 temporadas por Falconess una celda de `pr` pasa desde 44 de 60 (73,3 %): con la tasa real de
Caracara y Cernícala en 71-77 %, una corrida `pr` puede salir pass o inconclusa, y un fail pide ≤ 28
de 60 (probabilidad < 0,01 %). Decide `full`.

S7 `full` (`--profile full --scenarios S7`, 500 temporadas por Falconess):

| Base        | Caracara                   | Cernícala                  | Peregrina                  | Veredicto               |
| ----------- | -------------------------- | -------------------------- | -------------------------- | ----------------------- |
| por defecto | 83,0 → 76,6 % [72,7, 80,1] | 78,0 → 74,0 % [70,0, 77,7] | 83,8 → 84,4 % [81,0, 87,3] | pass 3/0/0 → pass 3/0/0 |
| alt1        | 80,0 → 75,8 % [71,9, 79,3] | 74,4 → 70,8 % [66,7, 74,6] | 83,6 → 82,6 % [79,0, 85,7] | pass 3/0/0 → pass 3/0/0 |

La cota baja más baja es 66,7 % (Cernícala, alt1): 6,7 puntos sobre el objetivo.

Perfil `full` completo después del cambio, contra el `full` de `637198f` (`.work/balance/p2-broken/`):
177 de las 180 celdas y 10 de los 14 diagnósticos quedan idénticos en las dos bases; cambian las
tres celdas de la métrica 7 (las de la tabla de arriba) y las tablas de S7. Veredictos de las
métricas 1-6 y 8 sin cambio (pass 4/0/0, inconclusa 9/0/1, inconclusa 8/0/1, pass 31/0/0, pass
24/0/0, pass 3/0/0 y pass 96/0/0).

Metas de S7 `full`, por defecto / alt1: «Pasa», las temporadas que corren la carrera y la pasan;
«Gana», las mismas que la ganan:

| Falconess | Carrera    | Meta antes → ahora | Pasa antes  | Pasa ahora  | Gana ahora  |
| --------- | ---------- | ------------------ | ----------- | ----------- | ----------- |
| caracara  | T12 ridge  | ≤ 5 → ≤ 7          | 94,8 / 93,2 | 95,8 / 96,2 | 31,2 / 32,4 |
| caracara  | T24 sprint | ≤ 4 → ≤ 6          | 96,6 / 94,0 | 94,4 / 93,3 | 28,8 / 34,9 |
| caracara  | T36 canyon | ≤ 3 → ≤ 5          | 98,3 / 97,5 | 97,1 / 96,0 | 61,7 / 54,6 |
| caracara  | T46 ridge  | ≤ 2 → ≤ 3          | 93,8 / 94,8 | 88,6 / 89,6 | 59,0 / 59,2 |
| cernicala | T12 sprint | ≤ 5 → ≤ 7          | 94,6 / 94,8 | 95,4 / 97,0 | 26,6 / 27,4 |
| cernicala | T24 canyon | ≤ 3 → ≤ 6          | 92,2 / 90,3 | 93,1 / 91,8 | 37,3 / 36,7 |
| cernicala | T36 ridge  | ≤ 3 → ≤ 5          | 97,0 / 96,7 | 93,9 / 93,5 | 48,2 / 44,0 |
| cernicala | T46 canyon | ≤ 1 → ≤ 3          | 93,9 / 90,8 | 92,8 / 90,4 | 74,3 / 69,5 |
| peregrina | T12 sprint | ≤ 5 → ≤ 7          | 92,6 / 93,6 | 94,8 / 95,8 | 19,2 / 21,6 |
| peregrina | T24 ridge  | ≤ 3 → ≤ 6          | 98,3 / 97,0 | 99,8 / 99,6 | 61,2 / 61,6 |
| peregrina | T36 canyon | ≤ 3 → ≤ 5          | 97,6 / 97,6 | 94,1 / 95,0 | 62,4 / 61,0 |
| peregrina | T46 ridge  | ≤ 1 → ≤ 3          | 97,5 / 97,3 | 98,2 / 98,5 | 87,2 / 85,4 |

Puestos de S7 `full` (`s7-places`), por defecto / alt1: la referencia gana el 44,5 / 44,6 %
(Caracara), 45,4 / 43,3 % (Cernícala) y 56,5 / 56,6 % (Peregrina) de sus carreras objetivo, 48,8 /
48,3 % de las tres juntas; podio 76,8 / 76,5 / 80,9 % (por defecto). Reparto del 1.º al 8.º de las
tres juntas (por defecto): 48,8 / 17,9 / 11,3 / 7,9 / 5,5 / 4,2 / 2,5 / 1,9 %; antes (arnés, 60 / 8)
75,0 / 10,9 / 5,6 / 3,5 / 2,4 / 1,4 / 0,7 / 0,5 %. Temporadas que ganan las cuatro: 7,2 / 6,6 /
11,0 % (antes 31-38 % en el arnés).

`pnpm sim:season-batch -- --runs 500`, antes → después (Caracara / Cernícala / Peregrina): ≥ B 80 /
75 / 85 → 73 / 72 / 85 %; temporadas completas 81 / 77 / 86 → 75 / 76 / 88 %; carreras objetivo
ganadas 73 / 76 / 80 → 46 / 45 / 59 %; podio 92 / 91 / 93 → 76 / 74 / 83 %; temporadas que las ganan
todas 33 / 37 / 40 → 10 / 7 / 13 %; `seasonScore` medio 3102 / 2931 / 3107 → 3070 / 2916 / 3114
(bonos de carrera 149 / 149 / 159 → 107 / 104 / 130). Metas (pasa / gana entre las que la corren):
Caracara 96 / 94 / 96 / 87 % y 32 / 36 / 57 / 61 %; Cernícala 95 / 93 / 95 / 92 % y 29 / 42 / 43 /
71 %; Peregrina 94 / 100 / 95 / 98 % y 22 / 68 / 63 / 87 %.

Políticas descuidadas (arnés, 1000 temporadas por Falconess; ≥ B en Caracara / Cernícala /
Peregrina y, entre paréntesis, las carreras objetivo ganadas de las tres juntas):

| Política                                                             | 60 / 8, escalera de antes   | 75 / 9, 7/6/5/3             |
| -------------------------------------------------------------------- | --------------------------- | --------------------------- |
| referencia                                                           | 78,8 / 74,3 / 84,3 % (75,0) | 73,4 / 72,4 / 83,0 % (48,3) |
| al azar: los 5 entrenamientos, descanso y salida, uniforme; opción 0 | 30,8 / 15,2 / 36,7 % (55,3) | 22,8 / 12,2 / 32,0 % (28,0) |
| solo agilidad: la de referencia, pero todo entrenamiento es agilidad | 18,5 / 19,0 / 50,0 % (78,8) | 4,3 / 6,5 / 7,5 % (60,0)    |

Las dos quedan bajo el techo de 40 % de la propuesta 2 (a) de «Métrica 7» y a 40-77 puntos de la
referencia. Solo agilidad gana más carreras objetivo que la referencia (60 % contra 48 %) y aun así
casi nunca llega a B: completa el 15-65 % de las temporadas (pasa la T46 ≤ 3 en el 15-66 %) y termina
con 2660-2690 de stats, bajo los 2900 del umbral.

`pnpm sim -- --seed 42`: Caracara y Peregrina ganan sus cuatro carreras objetivo y Cernícala queda
1.ª / 3.ª / 3.ª / 3.ª (antes, 12 victorias de 12); las tres terminan en B.

Tests: `policy.test.ts` (la regla de aprender), `season-batch.test.ts` y `metrics.test.ts` (la línea
y la tabla de puestos; las metas de Cernícala y Peregrina pasan a ≤ 3 en T46 y a 7 / 6 / 5 en las
filas de S7). Ningún test fija `FIELD` de v1. La suite sin golden, `pnpm typecheck`, `pnpm lint` y
`pnpm content:validate` pasan. Documentos: `docs/formulas.md` («Rivales de las carreras
objetivo»), `docs/race-engine.md` (21.1 y fila 7 de 25.1), `docs/balance-batch.md` y
`docs/commands.md`. Golden: los que generan campo (g04-g09, T24 y T46) cambian además de lo que ya
cambió con la decisión 1; los regenera el líder (ADR-0004). Corridas de esta sección: 11 de `sim:batch` (`pr` antes y después en las
dos bases, una `pr` de S7 para el informe nuevo, S7 `full` antes y después en las dos bases y el
`full` completo después en las dos bases) y 3 de `sim:season-batch`; arnés: 8 variantes de la
política, 15 de `FIELD` (más 2 con la otra base) y 14 corridas de políticas descuidadas.

#### Consecuencias

- La referencia gana ≈ la mitad de sus carreras objetivo (48-49 % en S7 `full`; 43-59 % según la
  Falconess) y el 5-11 % de sus temporadas las gana todas. La métrica 7 pasa en `full` con la cota
  baja ≥ 66,7 % en las dos bases; en `pr` puede salir inconclusa.
- Ninguna meta pide ganar; la última pide podio. Cernícala sigue siendo la más floja en ≥ B (71-74 %
  en `full`) y Peregrina gana 11-15 puntos más que las otras dos con la misma escalera.
- El entrenamiento y la política no cambian, así que las stats de la temporada son las mismas: la
  nota baja por los bonos de carrera (−31 a −44 puntos de media en S7 `full`) y las temporadas en C
  (completas bajo 2900) pasan de 5,0-8,4 % a 4,8-12,4 %.
- La razón 0,83-0,86 depende de la curva de referencia: un cambio de la economía de entrenamiento,
  del crecimiento de las Falconess o de la política (por ejemplo, la propuesta 1) vuelve a medir con
  el arnés antes de tocar `FIELD` o la escalera.

#### Propuestas para el dueño (decisión 2)

Estado: **propuesto**.

1. **Economía de habilidades.** Con 5 puntos por sesión de simulador y activas genéricas de 60-150,
   la referencia nunca aprende una (25-50 puntos por temporada), y juntar los de una cuesta ≈ 10
   sesiones de simulador que hunden las carreras (tabla de la regla de ahorro: 43 % de victorias y
   ≥ B 10-47 % por una activa). Los rivales llevan 1-3. Opciones: (a) contenido: activas genéricas
   a 20-50 puntos, para que una temporada de la stat más baja pague 1-2; (b) BRIEF §8: más puntos por
   sesión de simulador o por carrera objetivo; (c) `FIELD.rivalMaxSkills` 1 (o
   `rivalTurnsPerSkill` 24), para que los rivales lleven lo que la jugadora puede pagar; (d) aceptar
   que las habilidades son una inversión que la referencia no hace. Cualquiera de (a)-(c) vuelve a
   medir la razón de `FIELD` con el arnés.
2. **Peregrina gana más que las otras dos** (56-59 % de sus carreras objetivo contra 43-46 %; ≥ B
   83-85 % contra 71-77 %). Viene de los bastidores y del pool de su clase (etoile y shiden, R9), no
   de la temporada. Opciones: (a) contenido: una escalera más estricta para Peregrina, que iguala la
   nota pero no las victorias; (b) balance de bastidores (otra pasada de la métrica 2); (c) dejarlo
   así.

### Estadística de la métrica 3 (decisión 3)

Estado: **aceptado (dueño, 2026-10-28)**: propuesta 1 de «Métricas 3 y 4», opción (a). La banda
0,85-0,90 se queda y una corrida `pr` no puede dar un fail falso de la métrica 3; en `pr` un
inconcluso vale, un fail falso no. Solo cambia la herramienta del lote
(`apps/cli/src/batch/stats.ts` y `metrics.ts`): ni constantes, ni contenido, ni el presupuesto de
corridas, ni las semillas.

#### Diagnóstico (verificado)

Arnés local (`.work/s3stat`, no versionado) que corre los trabajos de S3 del lote (mismo
`buildRaceJob`, puerto del motor y pool de workers) y guarda el resultado de cada muestra:
20 000 muestras por celda con el prefijo de semillas `calib` (180 000 en total), y las 150 muestras
`pr` de siete bases de semillas.

- Una muestra (los dos órdenes de carril de una semilla) es un barrido de la firma (gana las dos
  carreras), un reparto (una cada una) o un barrido del genérico. El genérico no barrió nunca (0 de
  180 000): los sorteos de carril se cancelan entre las dos carreras y la firma solo gana las dos
  cuando su ventaja supera la del carril. La firma barre el 6,2-7,5 % de las muestras (cuota
  53,1-53,8 %, como `full`); empates de `finishMilli`: 0-4 por celda. La cuota de la firma es
  0,5 + (p₊ − p₋) / 2, con p₊ y p₋ las dos tasas de barrido, y la banda 52,63-54,05 % es p₊
  5,26-8,11 %: una celda `pr` espera 7,9-12,2 barridos de 150.
- El intervalo de v1 (normal de la media de la cuota por muestra, con la varianza de la propia
  muestra) es el de Wald de un conteo de ≈ 10: su ancho sigue al conteo observado. Con 4 barridos
  (el caso alt1 Cernícala ridge de la propuesta 1) mide 50,04-52,63 % y falla, con la cuota real en
  52,9-53,1 %.
- Fail de una celda `pr` (150 muestras, sin barridos del genérico): con el intervalo de v1,
  4 barridos o menos, o 21 o más; con un intervalo de puntuación del 95 % por celda, 2 o menos, o 19
  o más.

Fails falsos de la métrica 3 por corrida `pr` con las nueve celdas de hoy, todas dentro de la banda
(binomial exacta con las p₊ medidas / empírica, 133 bloques disjuntos de 150 muestras de las
20 000), con las nueve celdas en su borde peor, y fails de una celda `pr` mal hecha:

| Regla de la celda en `pr`                          | Celdas de hoy | Las 9 en el borde peor | Firma inerte (50 %)   | Firma a 57 / 58 / 60 % |
| -------------------------------------------------- | ------------- | ---------------------- | --------------------- | ---------------------- |
| normal de la media, 95 % (v1)                      | 18,4 / 17,3 % | 61,1 %                 | 100 %                 | 53,6 / 77,9 / 97,8 %   |
| puntuación, 95 % por celda                         | 10,3 / 10,5 % | 27,7 %                 | 100 %                 | 71,5 / 89,3 / 99,3 %   |
| puntuación, simultáneo 95 % (Bonferroni, 9 celdas) | 0,94 / 1,5 %  | 4,4 %                  | 100 %                 | 44,2 / 70,5 / 96,3 %   |
| puntuación, sin fail en `pr` (elegida hasta F1)    | 0             | 0                      | nota; falla en `full` | nota; falla en `full`  |
| **puntuación a z = 5 (elegida en la revisión F1)** | **< 1e-11**   | **1,1e-10** ²          | nota; falla en `full` | 0,003 / 0,06 / 2,9 %   |

² Con el genérico sin barrer, como se midió; con cualquier reparto de barridos, 2,4e-6 (revisión F1).

En las siete bases `pr` medidas (por defecto y alt1-alt6; barridos mínimo-máximo por celda 6-19,
5-19, 7,5-20, 5-17, 4-14, 4-16 y 6-16) la regla de v1 falla alt4 (Cernícala ridge y cañón,
4 barridos) y alt5 (Caracara ridge, 4); la del 95 % por celda fallaría la base por defecto, alt1 y
alt2 (un sprint con 19-20 barridos); la elegida, ninguna. Las semillas `pr` son fijas: un fail falso
se repite en cada PR mientras no cambie el contenido de S3, y con `BALANCE_GATE=enforce` bloquea
todo PR que toque `sim` o `content`.

#### Cambio

1. **Intervalo, en los dos perfiles.** El de S3 es el intervalo de puntuación de Tango (1998) para
   la diferencia de proporciones pareadas p₊ − p₋, llevado a la cuota (0,5 + Δ / 2) y a la razón
   ((1 − p) / p) como antes (`pairedScoreInterval` en `stats.ts`; un empate cuenta medio barrido).
   Es el piso de varianza de la opción (a) hecho por principio: la varianza se toma bajo cada valor
   candidato, con la p₋ de máxima verosimilitud restringida, así que nunca baja de
   n · |Δ| · (1 − |Δ|), la que exige una cuota tan lejos del 50 %. Sin barridos, Δ queda en
   ±z² / (n + z²) (±1,25 puntos de cuota con 150 muestras; antes, ancho cero), y con p₋ = 0 su cota
   alta es la de Wilson (métricas 1, 2 y 7). El piso p(1 − p) / 2 del ejemplo de la propuesta se
   descartó: tira la reducción de varianza real del diseño pareado (el genérico nunca barre), mide
   ±5,7 puntos en `pr` y no podría fallar nunca a una firma inerte (cota alta 55,7 %).
2. **Veredicto `pr` de la métrica 3: fail solo a z = 5** (desde la revisión F1, más abajo; antes,
   pass o inconcluso sin fail). El fail dudoso queda para `full` (D48: el nocturno decide lo que el
   PR no puede). La banda mide 1,42 puntos de cuota y un intervalo de 150 muestras, 2,5-5,5:
   ninguna celda puede pasar en `pr` y, sea cual sea su cuota real, toda celda queda a menos de un
   intervalo de un borde. Una celda `pr` cuyo intervalo del 95 % cae fuera de la banda falla solo
   si el intervalo de puntuación a z = 5 (`S3_PR_FAIL_Z`) también cae fuera, y su nota lo dice con
   ese intervalo («z = 5 interval outside the band too: a pr fail [lo, hi]»); si no, se lee
   inconclusa y su nota lo dice («95 % interval outside the band, z = 5 interval not: no pr fail,
   the full profile decides»). La celda conserva su intervalo del 95 %; una nota de la métrica
   explica la regla. `full` conserva el 95 % por celda y la duplicación a 8000 muestras; sus fails
   llegan a todo PR por el informe de puerta.
3. **Presupuesto sin cambio** (S3: 150 muestras por celda, 2700 carreras; S1 absorbe el resto y el
   total suma `--runs`). Subirlo se descartó: S3 ya lleva 2700 de las 10 000 carreras, 300 por celda
   pediría 2700 más con S1 en 1200 (métrica 1, S6 y la σ de S5), y ningún tamaño `pr` dentro de
   10 000 carreras resuelve la banda: una celda centrada necesita ≈ 1200 muestras para que su
   intervalo del 95 % quepa en 1,42 puntos (21 600 carreras las nueve). Con 300 y Bonferroni el
   fail falso seguiría en 0,5 %.

Alternativas para el dueño: «Propuestas para el dueño (decisión 3)», al final de esta sección.

#### Evidencia (lote)

`pnpm sim:batch -- --runs 10000`, antes y después del cambio, en tres bases. Las 79 celdas de las
métricas 1, 2 y 4-8 y todos los diagnósticos salen idénticos en las tres (S3 no alimenta otra
métrica); la estadística no suma tiempo medible (después, 6,6-7,0 s de pared con 3 workers; las
corridas de antes, 11,5-12,2 s, coincidieron con carga en la máquina: 2,8-2,9 ms por carrera en el
motor contra 1,6-1,7). Métrica 3: inconclusa 0/0/9 antes y después en las tres bases.
Celdas: barridos de la firma (de 150), intervalo de la razón v1 → nuevo y veredicto (? inconcluso);
¹ intervalo fuera de la banda (fallaría con el 95 % por celda; la nota lo dice):

| Celda                   | Por defecto                               | alt1                                      | alt2                                      |
| ----------------------- | ----------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| caracara/desert-sprint  | 10: [0,807; 0,948] ? → [0,788; 0,929] ?   | 10: [0,807; 0,948] ? → [0,788; 0,929] ?   | 20: [0,684; 0,854] ? → [0,671; 0,838] ? ¹ |
| caracara/desert-ridge   | 10: [0,807; 0,948] ? → [0,788; 0,929] ?   | 16: [0,730; 0,892] ? → [0,715; 0,875] ?   | 12: [0,780; 0,930] ? → [0,763; 0,911] ?   |
| caracara/desert-canyon  | 13: [0,767; 0,920] ? → [0,750; 0,902] ?   | 13: [0,767; 0,920] ? → [0,750; 0,902] ?   | 13: [0,767; 0,920] ? → [0,750; 0,902] ?   |
| cernicala/desert-sprint | 19: [0,695; 0,863] ? → [0,682; 0,847] ? ¹ | 14: [0,754; 0,911] ? → [0,738; 0,893] ?   | 10: [0,807; 0,948] ? → [0,788; 0,929] ?   |
| cernicala/desert-ridge  | 6: [0,867; 0,983] ? → [0,844; 0,972] ?    | 5: [0,883; 0,991] ? → [0,859; 0,985] ?    | 10: [0,807; 0,948] ? → [0,788; 0,929] ?   |
| cernicala/desert-canyon | 14: [0,754; 0,911] ? → [0,738; 0,893] ?   | 16: [0,730; 0,892] ? → [0,715; 0,875] ?   | 14: [0,754; 0,911] ? → [0,738; 0,893] ?   |
| peregrina/desert-sprint | 16: [0,730; 0,892] ? → [0,715; 0,875] ?   | 19: [0,695; 0,863] ? → [0,682; 0,847] ? ¹ | 7,5: [0,844; 0,969] ? → [0,822; 0,954] ?  |
| peregrina/desert-ridge  | 8: [0,836; 0,966] ? → [0,815; 0,947] ?    | 13: [0,767; 0,920] ? → [0,750; 0,902] ?   | 9: [0,821; 0,957] ? → [0,802; 0,938] ?    |
| peregrina/desert-canyon | 11: [0,793; 0,939] ? → [0,775; 0,920] ?   | 12: [0,780; 0,930] ? → [0,763; 0,911] ?   | 10: [0,807; 0,948] ? → [0,788; 0,929] ?   |

En las tres bases los fails de la regla de v1 no aparecen (ninguna celda con 4 barridos o menos);
alt4 y alt5, las bases donde sí (sección «Diagnóstico»), leen 0/0/9 con el cambio (`--scenarios S3`:
Cernícala ridge y cañón de alt4 y Caracara ridge de alt5, 4 barridos, razón [0,875; 0,998] antes
[0,900; 0,998] y fail).

`pnpm sim:batch -- --profile full --scenarios S3` por defecto y alt1: 8/0/1 → 8/0/1 en las dos
(Cernícala sprint inconclusa, cota baja de la razón 0,847-0,849); las mismas celdas se duplican a
8000 (por defecto Cernícala sprint y ridge, alt1 Cernícala sprint y Peregrina sprint; 88 000
carreras en las dos) y las cotas se mueven ≈ 0,02 puntos de cuota como mucho (con 250-600 barridos
por celda el intervalo de puntuación y el normal coinciden).

Tests: `stats.test.ts` (la p₋ restringida en forma cerrada contra la verosimilitud por fuerza bruta;
el estadístico decrece en Δ y vale ±z en las cotas; sin barridos ±z² / (n + z²); con p₋ = 0, la
cota alta de Wilson; antisimetría; coincide con el intervalo normal con miles de muestras) y
`metrics.test.ts` (el caso alt1 de 4 barridos en 150: v1 falla, ahora inconcluso en `pr` y en
`full`; firma inerte: fail en `full`, inconclusa con nota en `pr`; firma a 60 %: lo mismo;
2 barridos de 2 ya no fallan; un `pr` grande sí puede pasar). Documentos: `docs/balance-batch.md`
(tabla de escenarios y «Metric 3 statistic»), `docs/race-engine.md` (§25.2, reglas comunes y S3;
§25.2.1, veredictos) y el comentario de `share-ratio` en `packages/schema/src/balance.ts` (el
nombre del método no cambia, así que los informes de `main` siguen siendo legibles como línea base
y puerta). Corridas del lote: 6 `pr` completas, 2 `pr` de S3 (alt4, alt5) y 4 `full` de S3.

#### Consecuencias

- Con `--runs 10000` una celda correcta de la métrica 3 en `pr` es inconclusa: ninguna pasa con
  150 muestras. Desde la revisión F1 una firma muy rota falla en su mismo PR (cuota ≥ 63,3 % o
  ≤ 44,7 %; una celda sola falla siempre con la cuota real en 70 % o más o en 40 % o menos, el
  84 % de las veces a 65 %). Una firma inerte (50 %) o pasada pero cercana (55-63 %) solo se ve
  como nota en su PR: la falla el siguiente `full`, y desde ahí la puerta bloquea todo PR que toque
  `sim` o `content` hasta que el arreglo entre en `main` y corra el `full` siguiente. El PR del
  arreglo no levanta la puerta por sí mismo: ninguna celda `pr` pasa con 150 muestras y un
  inconcluso no levanta un fail (§25.2.1, `batch/gate.ts`), así que lleva la etiqueta
  `balance-adr` con su línea de ADR y una corrida `--profile full --scenarios S3` como evidencia.
  La demora es de al menos una noche más lo que tarde el arreglo, no «una noche».
- La nota «outside the band, z = 5 interval not» aparece en ≈ 10 % de los estados de contenido
  correctos (3 de las 7 bases medidas): informa, no bloquea.
- `full` sigue con el 95 % por celda (D48, sin cambio): con las celdas de hoy un fail falso en
  `full` sale ≈ 0,06 % de las veces; una celda que quede justo en un borde da hasta 2,5 % por noche.

#### Revisión F1: fail en `pr` a z = 5

Estado: **aceptado**. Hallazgo de la revisión (mayor): con «pass o inconcluso» la métrica 3 ya no
podía fallar en una corrida `pr` hiciera lo que hiciera la firma, y el dueño pidió que `pr` no diera
fails falsos, no que dejara de fallar los casos que sí puede resolver. Una celda `pr` tampoco puede
pasar con 150 muestras, así que el PR que arregla un fail del `full` nocturno no levanta la puerta
(`judgeGate` pide que la celda actual pase) y la consecuencia «una noche de demora» no lo decía.

**Diagnóstico (verificado).** Con el script de la revisión (`.work/balance2/review/s3-bad.ts`:
muestras S3 sintéticas, 150 por celda en las nueve, contra `computeMetrics` y `s3CellsOf` reales),
cinco firmas rotas salían inconclusas en `pr` y fail en `full`: la firma gana todas las carreras
(razón 0,000 [0,000; 0,026]), firma al 80 %, el genérico gana todas, genérico dominante al 30 %
(2,33 [1,96; 2,85]) y firma inerte (1,000 [0,951; 1,051]). La segunda parte también es cierta: la
única vía para levantar en un PR un fail de la métrica 3 del `full` es la etiqueta `balance-adr`
(`balance.yml`: «a fix the `pr` sample cannot show»), y este ADR no lo decía. No hace falta cambiar
la puerta: es la vía prevista para todo arreglo que la muestra `pr` no puede mostrar; se corrigen
las consecuencias.

**Cambio (solo la herramienta del lote, `apps/cli/src/batch/metrics.ts`).** En `pr` una celda
cuyo intervalo del 95 % cae fuera de la banda falla si el intervalo de puntuación de Tango a z = 5
(`S3_PR_FAIL_Z`, el mismo `pairedScoreInterval` con otro z, llevado a la razón igual) también cae
fuera; si no, sigue inconclusa con su nota. La celda informa su intervalo del 95 %, así que un fail
`pr` también falla bajo la regla común de §25.2.1 (la puerta vuelve a juzgar intervalos con ella).
`full` no cambia. Se eligió z = 5 por el fail falso exacto de una celda correcta en un borde de la
banda (trinomial exacta sobre todo par p₊, p₋ con p₊ − p₋ en el borde, 150 muestras;
`.work/balance2/f1/false-fail.ts`, no versionado):

| Regla `pr` | Falla desde (de 150)        | Fail falso por celda, genérico sin barrer (medido) | Peor caso, cualquier p₋ | Nueve celdas en el peor caso |
| ---------- | --------------------------- | -------------------------------------------------- | ----------------------- | ---------------------------- |
| z 1,96     | 19 barridos; 0 del genérico | 3,5e-2                                             | 3,7e-2                  | 29 %                         |
| z 2,77     | 22; 0                       | 5,0e-3                                             | 5,3e-3                  | 4,6 %                        |
| z 4        | 30; 8                       | 3,5e-6                                             | 3,9e-5                  | 3,6e-4                       |
| **z 5**    | **40; 16**                  | **1,2e-11**                                        | **2,7e-7**              | **2,4e-6**                   |

Con las celdas de hoy (p₊ 6,2-7,5 %, el genérico nunca barre) el fail falso a z = 5 es
2e-15 a 1e-12 por celda. A 75 y 300 muestras por celda el peor caso queda en 2,2e-7 y 4,3e-7; a 15
(`--runs 1000`) la regla no puede fallar (z² = 25 > n). Lo que atrapa una sola celda `pr` de 150
muestras, por cuota real de la firma (binomial exacta; los barridos de un solo lado):

| Cuota real | 30 %  | 40 %   | 45 %   | 50 % (inerte) | 57 %    | 60 %   | 63,3 % | 65 %   | 70 %, 80 %, 100 % |
| ---------- | ----- | ------ | ------ | ------------- | ------- | ------ | ------ | ------ | ----------------- |
| z = 5      | 100 % | 99,9 % | 43,2 % | 0             | 0,003 % | 2,9 %  | 52,4 % | 83,6 % | 100 %             |
| z = 1,96   | 100 % | 100 %  | 100 %  | 100 %         | 71,5 %  | 99,3 % | 100 %  | 100 %  | 100 %             |

Una firma rota casi nunca toca una sola celda (lo habitual es la pareja en sus tres pistas), así que
la probabilidad de que la métrica falle es mayor que la de la tabla. La firma inerte no se atrapa en
`pr` (sin barridos la cuota queda en 42,9-57,1 % a z = 5): la falla el `full`.

**Evidencia (lote).** `pnpm sim:batch -- --runs 10000` antes y después, por defecto y alt1, y
`--scenarios S3` en alt2, alt4 y alt5 (las bases con celdas cuyo intervalo del 95 % cae fuera,
o con 4 barridos): las 88 celdas por defecto y en alt1 y las 9 de cada base S3 salen con el mismo
valor, intervalo y veredicto, y los diagnósticos son idénticos. Métrica 3: inconclusa 0/0/9 antes y
después en las cinco bases; barridos de la firma 4-20 de 150 por celda (por defecto 6-19, alt1
5-19, alt2 7,5-20, alt4 4-14, alt5 4-16), del genérico 0: ninguna celda se acerca a 40 o a 16.
Cambian solo textos: la nota de la métrica y la de las celdas con 19-20 barridos (por defecto
Cernícala sprint, alt1 Peregrina sprint, alt2 Caracara sprint: «95 % interval outside the band, z =
5 interval not: no pr fail, the full profile decides»). Pared 6,5-6,7 s con 3 workers, antes y
después. Corridas en `.work/balance2/f1/runs` (no versionado).

Tests (`metrics.test.ts`): 150 barridos de la firma de 150 y 60 del genérico fallan en `pr` (nota
con el intervalo a z = 5: [0,000; 0,167] y [1,500; 4,000]), y el genérico que gana todas también
(cota alta ∞); los umbrales 40 / 39 barridos y 16 / 15 del genérico; 4 y 19-20 barridos quedan
inconclusos en `pr` (4 también en `full`; 19-20 fallan en `full`); la firma inerte y la de 60 %
siguen inconclusas en `pr` y fallan en `full`; con 15 muestras no hay fail en `pr`. Documentos:
`docs/balance-batch.md` («Metric 3 statistic», tabla de escenarios y «Gate report») y
`docs/race-engine.md` §25.2.1.

#### Propuestas para el dueño (decisión 3)

1. **El z de la regla `pr` (aplicado z = 5).** Opciones: (a) dejar z = 5 (recomendado: el fail
   falso queda en 2,4e-6 por corrida aun con las nueve celdas en un borde y cualquier reparto de
   barridos); (b) z = 4 (`S3_PR_FAIL_Z`, con los umbrales de la nota de la métrica y de los
   documentos): falla desde 30 barridos de 150 (cuota
   ≥ 60 %, atrapada en el 53 % de las corridas por celda) o 8 del genérico, a cambio de un fail
   falso de 3,6e-4 por corrida en el peor caso; (c) el intervalo simultáneo de las nueve celdas
   (Bonferroni, z 2,77): falla en el mismo PR a una firma inerte (0 barridos: cota alta 52,44 % <
   52,63 %) y a una de 60 % en el 96 % de las corridas, a cambio de un fail falso fijo en ≈ 1 % de
   los estados de contenido correctos (4,4 % con las nueve celdas en un borde), que las semillas
   `pr` fijas repetirían en cada PR.
2. **Cómo levanta un PR un fail de la métrica 3 del `full`.** Hoy, con la etiqueta `balance-adr` y
   la corrida `full` de S3 en su línea de ADR: ninguna celda `pr` pasa con 150 muestras. Opciones:
   (a) dejarlo así (recomendado: con las celdas de hoy un fail del `full` sale ≈ 0,06 % de las
   noches, y un arreglo de la firma ya pide su línea de ADR); (b) un job a pedido en el PR
   (otra etiqueta) que corra `--profile full --scenarios S3` (72 000-144 000 carreras de dos
   corredoras; las corridas `full` de S3 de esta pasada, 88 000-104 000, tardaron 12,7-15,9 s de
   pared con 3 workers) y pase su informe a la puerta, que levantaría las celdas que pasen ahí; pide
   cambiar `balance.yml` y `judgeGate` (§25.2.1).

### Higiene de la verificación de la pasada 1

Estado: **aceptado**. Notas del verificador sobre la pasada 1 (m1-m5); ninguna mueve una celda del
lote.

**m1: `massThrustCoolPm.urban` vuelve a 500.** La pasada 1 bajó el término urbano de Steinhaus
junto con el del desierto (500 → 50, `102fd9b`) sin medirlo: v1 no tiene pistas urbanas, así que
ninguna corrida del lote ni del arnés lo vio. Vuelve al último valor medido, el de la
especificación (500, `SPEC_RULESET`; el prototipo y las tablas de §25.4 se midieron con él). El
desierto se queda en 50, que sí se midió («Métricas 2 y 5»). En lo urbano Steinhaus sigue débil
con el término de la especificación (enfriamiento ×0,5); cuánto debe pesar lo mide la primera pista
urbana con su lote.

| Constante                | Antes | Después | Lote contra el `HEAD` previo (`637198f`)                                                   |
| ------------------------ | ----- | ------- | ------------------------------------------------------------------------------------------ |
| `massThrustCoolPm.urban` | 50    | 500     | `pr` 10 000 y `full`, por defecto y alt1: 88 y 180 celdas idénticas en las dos bases (± 0) |

Veredictos sin cambio (`pr` por defecto y alt1: 1 pass, 2 inconclusa 7/0/3, 3 inconclusa 0/0/9,
4-7 pass, 8 inconclusa 3/0/1; `full`: 2 inconclusa 9/0/1, 3 inconclusa 8/0/1, 8 pass 96/0/0) y
`pnpm sim:season-batch -- --runs 500` idéntico (≥ B 80 / 75 / 85 %). Corridas: 4 de `sim:batch`
`pr` (antes y después en las dos bases), 2 `full` (después; la línea base es la de «Pasada 2»,
`.work/balance/p2-broken/post-full-*.json`) y 1 de `sim:season-batch`. Documentos:
`docs/formulas.md` («Términos de regla»).

**m2: las invariantes del motor también corren sobre `RULESET_V1`.** Desde `26b649d` las
propiedades de §24.2 (P1-P9) corrían solo sobre `SPEC_RULESET`: un cambio de balance que rompiera
una invariante del motor en v1 pasaba todos los tests. La suite pasa a
`packages/sim/tests/support/race-properties.ts`, parametrizada por ruleset y sin números fijados
(P1 determinismo; P2 simetría exacta y estadística; P3 y P9 monotonía en los tres niveles; P4
cotas; P5 y P5b consistencia del log; P6 y P6b sorteos; P7 opciones; la cobertura del
controlador). `properties.test.ts` la corre sobre `SPEC_RULESET`, con los dos contraejemplos de D52
fijados, y `properties-live.test.ts` sobre `RULESET_V1`, más la tabla de desbordes de §1.5 con las
constantes vivas (las entradas en los máximos del validador; los términos de estilo y de regla con
sus valores de v1). Sobre v1 pasan todas (500 casos cada propiedad).

| Máximo de §1.5                   | `SPEC_RULESET`                                  | v1 (constantes vivas)                     |
| -------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| velocidad movida más rápida (vu) | 1 949 680                                       | 1 830 186                                 |
| crucero en los máximos (vu)      | 1 214 100 (`pwc` 1600)                          | 761 088 (`pwc` 1003)                      |
| ráfaga encadenada con picada     | 375 580 (aire 1380)                             | 709 098 (aire 3625)                       |
| producto mayor                   | 2,03e15, ganancia del plan continuo (4,4× bajo) | 1,8e15, `kHp × 1000 × 1,2e6 × fat` (5,0×) |

`pulseAirPm` de descenso en 2500 (pasada 1) supera la premisa de §1.5 (multiplicadores de estilo y
de regla ≤ 2000 ‰ cada uno) y el aire de un descenso del desierto llega a 3625 ‰. Todos los
productos siguen seguros porque `pwBoostWeight` 250 baja el empuje base (`Bp` 69 862 frente a
97 200) y la velocidad máxima queda bajo los 2e6 vu con que §1.5 evalúa sus filas. Verificado que
muerde: con el descenso en 6000 falla la cota de velocidad. Documentos: `docs/race-engine.md` §24
(párrafo del ruleset fijado) y `docs/balance-batch.md`. La suite sin golden pasa de ≈ 32 s a
≈ 37-40 s. Cada propiedad lleva ahora un tiempo límite explícito de 120 s: con el de Vitest (5 s)
la P2 estadística y la P7 de `properties.test.ts` vencieron dos veces con la máquina cargada, la
primera antes de este cambio.

**m3: los números de §25.4 y §26 son los de la especificación.** `docs/race-engine.md` presentaba
las tablas de §25.4 y el bloque de §26 como «v1». Cada sección lleva ahora una nota corta (sin
reformatear el archivo): son `SPEC_RULESET`, y los valores vivos de v1 están en
`packages/sim/src/rulesets/v1/constants.ts` y en este ADR. Medido para la nota de §25.4 (las 17
filas de cada pista, solo, ruido apagado, `RULESET_V1` contra `SPEC_RULESET`): las cuatro filas
neutras salen idénticas (PW 1,0 y regla `none`: ninguna constante de la pasada actúa), y las 13 de
bastidores reales cambian, todas a menos de 3,5 % de los tiempos neutros (en la especificación, de
−23 % a +43 %).

**m4: invariantes anti pay-to-win de BRIEF §9.** `packages/sim/tests/economy.test.ts`, la ruta que
nombra el brief (el proyecto `sim` de Vitest la toma; `tsconfig.tests.json` la suma a
`pnpm typecheck`), las comprueba sobre el contenido y el código. «Comprable» es lo que una tirada
puede dar: las Falconess y los bastidores de los pools y las peculiaridades que se sortean sobre un
bastidor Boneyard; las piezas cuestan chatarra, que `premium` nunca compra (§9).

- **1, ninguna pieza ni peculiaridad en gacha.** Todo id de los pools (`items` y `featured`) es una
  Falconess o un bastidor de la clase del pool; `GachaPool.kind` solo admite `falconess` y
  `frames`; el validador rechaza una pieza o una peculiaridad agregada a cualquier pool.
- **3, nada comprable toca stats, `growth` ni aptitudes.** `Frame` no tiene campos de stats de
  Falconess, `growth` ni aptitudes, y `growth` no está en `SeasonState`. El único `falconess-stat`
  del contenido está en una pieza (`koryu-firmware`), nunca en el pasivo de un bastidor de los
  pools ni en una peculiaridad. En carrera, todo bastidor con cualquier peculiaridad solo elige la
  letra de estilo: `freezeEntry` da las stats efectivas de la Falconess. En la temporada, dos
  hangares que solo difieren en un bastidor del mismo fabricante (SR contra SSR, firma contra
  genérico) entrenan idéntico hasta la primera carrera objetivo.
- **4, el rango de repetidos en ninguna fórmula.** Ningún esquema que lee el simulador
  (`SeasonState`, `RunInput`, `Falconess`, `Frame`, `Part`, `QuirkList`, `EntryInput`,
  `RaceEntry`, `Build`, `BlackBox`, `Economy`; todos estrictos) ni constante de `RULESET_V1` tiene
  un campo de rango o de copias; el hangar rechaza un bastidor repetido; ningún identificador de
  `packages/sim/src` nombra repetidos o copias.

La 2 es la métrica 3 del lote (S3, 0,85-0,90; su estadística en `pr`, en este ADR) y la 5 (liga
`scrap-class`) queda diferida con el multijugador (ADR-0001): el archivo la deja como `it.todo`.
Verificado que las comprobaciones muerden: un `falconess-stat` en una peculiaridad hace fallar dos
tests; un bono de entrenamiento por rareza del bastidor equipado, el de la temporada; un
identificador `dupeRank` en `packages/sim/src`, el de los fuentes. Observación para el dueño, sin
efecto hoy (no hay tiradas, ADR-0001): §9 desguaza los bastidores repetidos por chatarra y la
chatarra compra piezas, y una pieza (`koryu-firmware`, +30 de inteligencia en carrera) sí mueve
stats efectivas; el día que haya tiradas, ese camino (repetidos → chatarra → piezas) queda acotado
por la métrica 5 (≤ 3 puntos por pieza), no por la invariante 3.

**m5: el cruce del motor con el prototipo usa solo valores del oráculo.** El comentario de
`engine.test.ts` («an eight-runner field of real frames with actives matches the prototype») decía
que los carriles de sylphe, hayate y horizon llevaban la salida del propio motor desde la pasada 1.
Vuelto a correr el prototipo (`.work/proto/proto2/engine.mjs`, semilla `s1`, constantes de la
especificación) con el contenido de las habilidades de la pasada (`cool-head`, `iron-wings`,
`gravity-friend`): da los 24 tiempos y las 24 listas de habilidades del test exactamente, así que
ningún valor estaba fijado al motor. Solo cambia el comentario, que ahora lo dice; D50 coincide con
el prototipo y D51-D55 no actúan en ese campo (ninguna habilidad `once: false`, ninguna pista corta,
D54 y D55 son solo del log).

### Integración y verificación de la pasada 2

Estado: **aceptado**. La decisión 3 se trabajó sobre `a152900` y la higiene sobre `637198f`, en
paralelo con la decisión 2; se integraron en `phase-2-race-engine` sobre `8dc51b3` (decisiones 1 y
2) en este orden: `92930ee` (decisión 3), `7a6bd16` (m1), `ae3c511` (m3-m5) y `55049f9` (m2). Solo
este ADR tuvo conflictos (las dos secciones van después de la decisión 2); el código se mezcló sin
conflictos. La política que aprende activas (decisión 2) no entra en S3, así que el diagnóstico de
la decisión 3 sigue valiendo: el genérico no barre ninguna muestra en las 27 celdas de S3 medidas
abajo.

Lote del `HEAD` integrado (`55049f9`; informes en `.work/balance2/`):
`pnpm sim:batch -- --profile full` con la semilla por defecto, contra el `full` de la decisión 2
(`b86765c`, `.work/balance/p2-season/batch/field-full-default.json`); `pnpm sim:batch -- --runs
10000 --seed alt3`, una base de semillas con la que nadie ajustó; para confirmarla, también
`--profile full --seed alt3`; y `pnpm sim:season-batch -- --runs 500`.

- `full` por defecto contra `b86765c`: 171 de las 180 celdas y los 15 diagnósticos idénticos.
  Cambian solo los intervalos de las nueve celdas de la métrica 3 (la estadística nueva): las dos
  cotas de la razón bajan 0,0003-0,0008 (≈ 0,02 puntos de cuota), con los mismos veredictos y las
  mismas celdas duplicadas a 8000 (Cernícala sprint y ridge). m1 y los tests de m2-m5 no mueven
  ninguna celda.
- `sim:season-batch -- --runs 500`: idéntico al de la decisión 2 (≥ B 73 / 72 / 85 %; temporadas
  completas 75 / 76 / 88 %; carreras objetivo ganadas 46 / 45 / 59 %, podio 76 / 74 / 83 %).

| #   | Métrica                    | `full` por defecto                                       | `pr` alt3 (10 000)                                                  | `full` alt3                                            |
| --- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | estilos 15-35 % por bioma  | pass 4/0/0 (22,8-26,9 %)                                 | pass 4/0/0 (22,9-26,3 %)                                            | pass 4/0/0 (22,5-26,3 %)                               |
| 2   | casa 30-45 %, débil ≤ 15 % | inconclusa 9/0/1 (Boneyard ridge 33,7 % [30,0; 37,5])    | inconclusa 6/0/4 (las cuatro casas, 30,0-34,5 %; débiles 0-8,5 %)   | pass 10/0/0 (casas 34,7-35,7 %, débiles 0-9,0 %)       |
| 3   | genérico / firma 0,85-0,90 | inconclusa 8/0/1 (Cernícala sprint 0,858 [0,847; 0,867]) | inconclusa 0/0/9 (0,796-0,935; 5-17 barridos de 150; ninguna fuera) | pass 9/0/0 (0,861-0,889; firma 52,9-53,7 %)            |
| 4   | habilidades 0,5-8 m        | pass 31/0/0 (0,62-6,84 m)                                | pass 31/0/0 (0,63-6,55 m)                                           | pass 31/0/0 (0,62-6,70 m)                              |
| 5   | piezas ≤ 3 puntos          | pass 24/0/0 (cota alta máxima 2,58)                      | pass 24/0/0 (máximo 2,4, `lumiere-stabilizer` sprint)               | inconclusa 23/0/1 (`lumiere-stabilizer` sprint, abajo) |
| 6   | dispersión 0,8-2 %         | pass 3/0/0 (1,26 / 1,42 / 1,08 %)                        | pass 3/0/0 (1,27 / 1,42 / 1,08 %)                                   | pass 3/0/0 (1,24 / 1,41 / 1,08 %)                      |
| 7   | temporadas ≥ B ≥ 60 %      | pass 3/0/0 (76,6 / 74,0 / 84,4 %; cota baja ≥ 70,0 %)    | pass 3/0/0 (83,3 / 76,7 / 78,3 %; cota baja ≥ 64,6 %)               | pass 3/0/0 (72,8 / 70,8 / 83,8 %; cota baja ≥ 66,7 %)  |
| 8   | la inteligencia no resta   | pass 96/0/0                                              | inconclusa 3/0/1 (600-630: +1,3 puntos [−0,2; +2,7])                | pass 96/0/0                                            |
|     | **Informe**                | inconcluso, ningún fail                                  | inconcluso, ningún fail                                             | inconcluso, ningún fail                                |

Carreras objetivo ganadas por la referencia (de las corridas; S7, «won %» de `s7-places`):

| Corrida                          | Caracara | Cernícala | Peregrina | Las tres | Ganan las cuatro     |
| -------------------------------- | -------- | --------- | --------- | -------- | -------------------- |
| S7 `full` por defecto (500 × 3)  | 44,5 %   | 45,4 %    | 56,5 %    | 48,8 %   | 7,2 / 6,6 / 11,0 %   |
| S7 `full` alt3 (500 × 3)         | 44,9 %   | 42,7 %    | 58,5 %    | 48,8 %   | 8,4 / 5,8 / 12,2 %   |
| S7 `pr` alt3 (60 × 3)            | 52,4 %   | 55,6 %    | 56,4 %    | 54,8 %   | 16,7 / 16,7 / 15,0 % |
| `sim:season-batch -- --runs 500` | 46 %     | 45 %      | 59 %      | ≈ 50 %   | 10 / 7 / 13 %        |

El objetivo del dueño (≈ la mitad de las carreras objetivo ganadas, métrica 7 en pass) se cumple en
las dos bases `full` (48,8 %). El `pr` de alt3 sale 6 puntos arriba: son 60 temporadas por
Falconess y las carreras de una temporada no son independientes (una temporada fuerte gana
varias). S7 `pr` en diez bases (`--scenarios S7`, por defecto y alt1-alt9; informes en
`.work/balance2/s7pr/`): las tres juntas ganan el 46,9-55,3 % (media 50,2 %) y cada Falconess el
36-62 %; la métrica 7 sale pass en siete bases e inconclusa en tres (alt7-alt9: Caracara o
Cernícala en 63,3-71,7 %, cota baja 50,7-59,2 %), nunca fail. Ninguna meta queda bajo el 80 % de
«pasa / llega» en las tres corridas S7 de la tabla (mínimo 87,1 %, Caracara T46 en `full` alt3).

Lo que sigue fuera de rango (ningún fail en ninguna corrida):

- Métrica 2, Boneyard en el ridge, `full` por defecto: 33,7 % [30,0; 37,5], inconclusa como en
  toda la pasada (propuesta 1 de «Métricas 2 y 5»); en `full` alt3 pasa (34,7 % [31,0; 38,6]).
- Métrica 3, Cernícala en el sprint, `full` por defecto: 0,858 [0,847; 0,867], inconclusa como en
  la «Combinación» (cota baja 0,847-0,850); en `full` alt3 pasa (0,861 [0,851; 0,871]) y las nueve
  celdas pasan. En `pr` alt3 la métrica es 0/0/9 por construcción; la regla de v1 tampoco habría
  fallado allí (falla con ≤ 4 o ≥ 21 barridos).
- Métrica 5, `lumiere-stabilizer` en el sprint, `full` alt3: Δ de victorias 2,47 puntos [1,68;
  3,25], inconclusa. Es la misma celda que en la pasada 1 (1,73 [1,07; 2,39] por defecto, 2,07
  [1,35; 2,79] alt1; ninguna decisión de la pasada 2 toca S5): con tres bases el estabilizador mide
  1,7-2,5 puntos, dentro del tope pero sin margen para una cuarta base. Si el dueño quiere que pase
  con cualquier base, `curves-penalty-scale` 0,97 → 0,98 es el paso siguiente (sin medir: hace falta
  el lote `full` en tres bases).
- Métrica 8, `pr` alt3: el escalón 600-630 agrupado queda +1,3 puntos [−0,2; +2,7], inconcluso
  como en la línea base v1 (`pr` 3/0/1); en `full` las 96 celdas pasan en las dos bases.
- Métrica 2 en `pr` alt3: las cuatro casas inconclusas (200 carreras por pista; una casa solo pasa
  en `pr` con 36,8-38,3 %, sección «Métricas 2 y 5»).

Tests y comprobaciones del `HEAD` con los golden nuevos: `pnpm typecheck`, `pnpm test` (con
`golden.test.ts`) y `pnpm lint` pasan. Corridas de esta sección: 13 de `sim:batch` (`full` por
defecto, `pr` alt3, `full` alt3 y S7 `pr` en diez bases), 1 de `sim:season-batch` y 3 de
`golden:update`.
