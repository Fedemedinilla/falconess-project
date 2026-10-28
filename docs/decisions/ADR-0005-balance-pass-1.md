# ADR-0005: Primera pasada de balance del motor de carrera (D14)

- Estado: **aceptado** para los cambios de constantes y de contenido dentro de rango; las secciones
  «Propuestas para el dueño» quedan **propuestas**.
- Fecha: 2026-10-28
- Alcance: `packages/sim/src/rulesets/v1/constants.ts`, `packages/content/` (bastidores, piezas)

## Contexto

`docs/race-engine.md` §25 y ROADMAP D14 piden una pasada de balance medida con `pnpm sim:batch`
contra los objetivos de BRIEF §12. El dueño autorizó al equipo del líder a escribir las constantes
del ruleset al aceptar ADR-0003. Cada cambio aceptado lleva el diff del lote contra la línea base
v1 (`.work/balance-v1-baseline.json`, semilla por defecto) y su confirmación con otra base de
semillas (`--seed alt1`, línea base `.work/balance/baseline-alt1.json`). Los tests de física están
fijados a `SPEC_RULESET` (las constantes de ADR-0003), así que el test «SPEC_RULESET matches v1 until
the first balance change» se borra con el primer cambio de balance.

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
| `pwCruiseWeight`                                 | 1000  | 5       | Todo el rango 0,7-1,4 vale ±0,2 % de crucero, un tercio de σ (`pwc` 998 / 1002).                                                            |
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
en sprint / ridge / cañón; igual con alt1).

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

| Pieza                | Antes                      | Después    | v1 sprint / ridge / cañón (puntos) | Después`pr`     | Después`pr` alt1 | `full` peor celda (Δ victorias, 95 %) | `full` alt1       |
| -------------------- | -------------------------- | ---------- | ---------------------------------- | --------------- | ---------------- | ------------------------------------- | ----------------- |
| `lumiere-stabilizer` | `curves-penalty-scale` 0,5 | 0,97       | **51,4** / 0 / 0                   | 2,3 / 0 / 0     | 2,3 / 0 / 0      | sprint 1,73 [1,07; 2,39]              | 2,07 [1,35; 2,79] |
| `altair-battery`     | energy +20                 | +6         | **4,9** / 2,7 / 1,5                | 1,3 / 0,8 / 0,4 | 1,2 / 0,8 / 0,4  | sprint 1,13 [0,60; 1,67]              | 1,33 [0,75; 1,91] |
| `boneyard-battery`   | energy +25, durability −10 | +8, −10    | **5,9** / **4,3** / 1,8            | 1,8 / 1,1 / 0,6 | 1,8 / 1,1 / 0,6  | sprint 1,87 [1,16; 2,58]              | 2,07 [1,32; 2,81] |
| `steinhaus-turbine`  | PW +0,1, dissipation −10   | sin cambio | **87,5** / **87,1** / **87,5**     | 0,5 / 0,3 / 0,3 | 0,4 / 0,2 / 0,3  | sprint 0,40 [0,03; 0,77]              | 0,60 [0,21; 0,99] |
| `lumiere-turbine`    | PW +0,05, dissipation +10  | sin cambio | **76,8** / **74,2** / **79,2**     | 0,4 / 0,1 / 0,4 | 0,3 / 0,1 / 0,2  | sprint 0,53 [0,16; 0,90]              | 0,87 [0,40; 1,34] |

Métrica 5: `pr` **fail** (14/10/0) → **pass** (24/0/0) en las dos bases de semillas; `full` (S5 con
1500 semillas por celda, Δ de victorias medido directo) pasa en las dos (cota alta máxima 2,81
puntos). `koryu-firmware` (1,0-1,1), `altair-firmware` y `steinhaus-stabilizer` (0) no cambian. Las
demás métricas quedan idénticas al cambio de la métrica 2 (S3 y S7 no llevan piezas). Tests del
mismo cambio: `stats.test.ts` (falke con `altair-battery`: energía 140 → 126) y `fixtures.test.ts`
(`curvesScalePm` 500 → 970; `boneyard-battery`: energía 125 → 108). Las baterías quedan medidas con
`kE` 1000: si una pasada posterior baja `kE` (juego de energía, §25.3 paso 2) valen 2-4 veces más y
hay que volver a medirlas (R18).

### Propuestas para el dueño

Estado: **propuesto**. Medido con el arnés del lote en proceso (mismas semillas y conteo que
`sim:batch`, perfil `full`, 600 carreras por pista).

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
   es potencia de boost (empuje ×0,925-1,10).
4. **Las piezas dentro de 3 puntos valen 2-3 m o menos** (baterías +6 / +8, estabilizador −3 % de
   la penalización de curvas, turbinas ≈ 0,4 m). Si el dueño quiere piezas que se sientan:
   (a) objetivo: subir el tope de la métrica 5 con un ADR (por ejemplo 5 puntos); (b) código: una
   perilla de peso de PW propia de las piezas (§25.3), para dimensionar turbinas sin tocar los
   bastidores; (c) contenido: piezas de compromiso que ganen en un tipo de pista y pierdan en otro
   (la métrica 5 sigue limitando la mejor pista).
