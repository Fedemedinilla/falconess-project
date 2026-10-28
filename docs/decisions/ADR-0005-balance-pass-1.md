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
- Métrica 7 (sigue 0/0/3): caracara 31,7 → 28,3 % (alt1 40,0 → 36,7 %), cernícala 11,7 → 28,3 %
  (alt1 6,7 → 28,3 %), peregrina 30,0 → 36,7 % (alt1 21,7 → 36,7 %).
- Métricas 1, 4, 6 y 8: sin cambio (idénticas bit a bit).

Tests y documentos del mismo cambio: el test de igualdad de `SPEC_RULESET` con v1 se borra; el
contenido de los tres bastidores Boneyard mueve las filas de mule, kite y caracara-signature de las
tablas de §25.4 (`docs/race-engine.md` y `sanity.test.ts`), regeneradas con el prototipo de la
especificación (`.work/proto/proto2/table.mjs`, que reproduce las otras 42 filas al mili-tick), el
ancla de monotonía (976 y 524 pares en vez de 977 y 523; `mono.mjs`) y la energía de mule con
`cheap-fuel` en `stats.test.ts` (115 → 155). `docs/formulas.md` lleva los valores nuevos. Los golden
v1 cambian y los regenera el líder.
