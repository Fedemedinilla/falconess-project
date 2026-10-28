# ADR-0005: Primera pasada de balance del motor de carrera (D14)

- Estado: **aceptado** para los cambios de constantes y de contenido dentro de rango; las secciones
  «Propuestas para el dueño» quedan **propuestas**. Excepción: `pwCruiseWeight` 1000 → 5 (métrica
  2) y lo que depende de él (las turbinas de la métrica 5) quedan **propuestos**. El valor sigue en
  `constants.ts` y todas las cifras del lote lo suponen, pero deja casi inertes el PW en crucero y
  las alas rotas (BRIEF §1 pilar 3 y §5): lo decide el dueño (propuesta 5 de «Métricas 2 y 5»).
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
| `pwCruiseWeight`                                 | 1000  | 5       | **Propuesto** (propuesta 5): 0,7-1,4 vale ±0,2 % de crucero (`pwc` 998 / 1002) y romper las alas, ≈ 0,2 %.                                  |
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
en sprint / ridge / cañón; igual con alt1). Este resultado es **propuesto** con `pwCruiseWeight` 5:
las turbinas pasan porque el PW ya casi no mueve el crucero, no porque su contenido mida lo que
pide §25.3 (+0,01-0,02 de PW o una perilla de PW propia de las piezas).

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

Estado: **propuesto**. Las cifras de las alternativas (PW 0, aire de descenso 1200) salen del arnés
del lote en proceso (mismas semillas y conteo que `sim:batch`, perfil `full`, 600 carreras por pista).

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
3. **El PW casi no mueve el crucero** (±0,2 % entre 0,7 y 1,4). BRIEF §5 dice que el PW «escala
   crucero y aceleración». Con `kE` 1000 la energía vale ≈ 0,2 m por unidad, así que ningún
   presupuesto de bastidor paga un PW literal. Si el dueño quiere niveles de PW que se noten:
   (a) el juego de energía (`kE` ↓, §25.3 paso 2) y un re-presupuesto de bastidores donde energía y
   disipación paguen el PW (mueve las métricas 1, 3, 4 y 6, de otros dueños); (b) dejarlo así: el PW
   es potencia de boost (empuje ×0,925-1,10). Es la misma decisión que la propuesta 5, que la
   amplía con la durabilidad a cero.
4. **Las piezas dentro de 3 puntos valen 2-3 m o menos** (baterías +6 / +8, estabilizador −3 % de
   la penalización de curvas, turbinas ≈ 0,4 m). Si el dueño quiere piezas que se sientan:
   (a) objetivo: subir el tope de la métrica 5 con un ADR (por ejemplo 5 puntos); (b) código: una
   perilla de peso de PW propia de las piezas (§25.3), para dimensionar turbinas sin tocar los
   bastidores; (c) contenido: piezas de compromiso que ganen en un tipo de pista y pierdan en otro
   (la métrica 5 sigue limitando la mejor pista).
5. **`pwCruiseWeight` 5 deja casi sin costo las alas rotas (BRIEF §1 pilar 3 y §5).** BRIEF §5:
   «si `durability` llega a 0, `powerToWeight` se reduce un 25 % el resto de la carrera»; el pilar 3
   cuenta la durabilidad entre los presupuestos de la carrera. El motor arma la tabla de alas rotas
   con `PW × durabilityZeroPowerMult` (750) y le aplica después los pesos de PW (`powerVariant` y
   `weightedPower` en `state.ts`), así que con 5 / 250 un bastidor PW 1,0 roto corre con `pwc` 998
   (−0,2 % de crucero) y `pwb` 937 (−6,3 % de empuje); con 1000 / 1000 eran 750 y 750. Medido con
   los scripts locales de la verificación (`.work/balance/verify/broken.ts` y `steinhaus.ts`):

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

1. **Estadística de la métrica 3 (propuesto).** La banda 0,85-0,90 mide 1,5 puntos de cuota. En `pr`
   (150 muestras) el intervalo mide ±5-7 puntos: ninguna celda puede pasar, y una celda correcta
   puede fallar por ruido cuando la varianza muestral sale baja (alt1 Cernícala ridge: 51,3 % con
   intervalo de ±1,3 puntos, mientras 8000 muestras dan 52,9 %). Con `BALANCE_GATE=enforce` ese fail
   bloquearía un PR. En `full` el semiancho es ≈ 0,5 puntos: una celda pasa solo si su cuota real
   está en ≈ 53,1-53,6 %, y con un número de contenido por pasivo la dispersión entre pistas (0,5-0,9
   puntos) deja celdas en el borde. Opciones: (a) cambio de código en `apps/cli/src/batch/metrics.ts`:
   piso de varianza en el intervalo de S3 (por ejemplo la de dos carreras independientes,
   p(1 − p) / 2) para que `pr` no produzca fails falsos; (b) mover la banda a 0,82-0,92 (la firma
   gana 52-55 %) con este ADR; (c) subir el tope de `full` a 16 000 muestras por celda (semiancho
   ≈ 0,35 puntos, ≈ +40 s). Recomendación: (a) y, si se quiere un pass en `full`, (b).
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

Las filas 2 y 5 suponen `pwCruiseWeight` 5, que queda propuesto (propuesta 5 de «Métricas 2 y 5»):
sin él las dos vuelven a fallar.

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

Estado: **aceptado** (dos constantes de `FIELD` dentro de rango); la sección «Propuestas para el
dueño (métrica 7)» queda **propuesta**. Medida sobre `phase-2-race-engine` con las métricas 2 a 5
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

Estado: **propuesto**.

1. **La política de referencia no gasta puntos de habilidad.** Termina la temporada con su única
   habilidad (20 puntos de nota) mientras los rivales llevan una activa genérica por cada 12 turnos
   (3 desde T36). La métrica 7 mide así a una jugadora que ignora las habilidades. Opción (código de
   la herramienta, `apps/cli/src/policy.ts`): aprender una activa cuando alcancen los puntos, y volver
   a medir la razón de `FIELD` con esa política.
2. **Una política descuidada pasa más que antes** (al azar 15-38 %, solo agilidad 17-50 %; antes
   0-9 %). Opciones: (a) objetivo: sumar al lote una política descuidada con un techo (por ejemplo
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
   más desgaste y un castigo real de alas rotas.
4. **Las carreras objetivo son casi automáticas para la referencia** (sección «Puesto en las
   carreras objetivo»): gana el 73-80 % y el 33-40 % de sus temporadas gana las cuatro. BRIEF §12
   solo pone un piso a la métrica 7, y ni el brief ni la especificación dicen cuánto debe ganar la
   referencia: eso lo decide el dueño. Arnés de la sección (1000 temporadas por Falconess, cada
   escalera evaluada sobre las mismas carreras; «actual» es 5/4/3/2 en Caracara y 5/3/3/1 en
   Cernícala y Peregrina; ≥ B en Caracara / Cernícala / Peregrina; «Ganadas», las carreras objetivo
   corridas que gana, de las tres juntas):

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
