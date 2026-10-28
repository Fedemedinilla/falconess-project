# ADR-0005: Primera pasada de balance del motor de carrera (D14)

- Estado: **aceptado** para los cambios de constantes y de contenido dentro de rango; las secciones
  «Propuestas para el dueño» quedan **propuestas**.
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
   es potencia de boost (empuje ×0,925-1,10).
4. **Las piezas dentro de 3 puntos valen 2-3 m o menos** (baterías +6 / +8, estabilizador −3 % de
   la penalización de curvas, turbinas ≈ 0,4 m). Si el dueño quiere piezas que se sientan:
   (a) objetivo: subir el tope de la métrica 5 con un ADR (por ejemplo 5 puntos); (b) código: una
   perilla de peso de PW propia de las piezas (§25.3), para dimensionar turbinas sin tocar los
   bastidores; (c) contenido: piezas de compromiso que ganen en un tipo de pista y pierdan en otro
   (la métrica 5 sigue limitando la mejor pista).

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
