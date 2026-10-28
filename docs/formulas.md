# Fórmulas y constantes

Cada fórmula se documenta aquí **antes** de implementarse: intención, expresión, unidades, rango
esperado y constante(s) implicadas. Las constantes viven en `packages/sim/src/rulesets/v1/constants.ts`
y solo cambian con un reporte de `pnpm sim:batch` adjunto al PR.

Convención de unidades: enteros; unidades públicas ×1000 (`1 m = 1000`, `1 m/s = 1000`) en
constantes, log y documentos; multiplicadores en per-mille (`1000 = ×1.0`). Dentro del motor de
carrera la posición va en pu = 1/225 mm y la velocidad en vu = 1/15 mm/s (mm y mm/s con el resto
por tick en el mismo entero; ADR-0003 D1, pendiente de aceptación: ver "Unidades del motor").
Redondeo: floor, salvo que se diga otra cosa.

## Temporada

### Stats efectivas

Intención: una sola conversión de stats base a stats "del día" antes de entrenar o correr.
`S_eff = floor(S_base × m_mood × a_aptitud / 1000 / 1000)` con `m_mood ∈ {1100,1050,1000,980,950}`
para ánimo +2…−2 y `a_aptitud` por letra S…G = 1100, 1050, 1000, 950, 900, 850, 800, 700.
La aptitud de bioma multiplica `agility`; la de estilo multiplica `intelligence`. Rango: 1–1320.

### Ganancia de entrenamiento

Intención: el nivel de pista (1–5) fija la base, el ánimo y las cuadrillas presentes la escalan.
`gain = floor(base[level] × (1000 + Σ crewBonus) × m_mood × (1000 + growth) / 10^9)`, un solo
redondeo al final, con `base = [44, 52, 60, 68, 76]` (el brief proponía 8–14; con 48 turnos esa
base deja la temporada en ~135 por stat, lejos del objetivo 550–800, así que se recalibró en la
primera pasada y queda pendiente de `sim:season-batch` con el motor real) y `growth` el multiplicador
de la Falconess para esa stat (0–300 per-mille); nivel de pista = `1 + floor(usos / 4)`, máximo 5.
Cada entrenamiento simple sube además una stat secundaria al 50 % (`agility→technique`,
`stamina→courage`, `technique→agility`, `simulator→technique`); `risk-flight` da `courage ×1.5` y
`agility ×0.5`; `simulator` da `intelligence` y +5 puntos de habilidad. Rango por sesión: 5–30.

### Fallo de entrenamiento

`p_fail = 50 + floor(fatigue / 4)` per-mille para entrenamientos simples; `risk-flight` 120 con 30
de fallo grave (lesión: 2 turnos). Fallo = −(gain/2) en la stat y ánimo −1.

### Fatiga

Costos: entrenamientos simples +20, `risk-flight` +30, `simulator` +10, `workshop` +5, `rest` −40,
`outing` −10. `fatigue ≥ 80` fuerza `rest`. Rango 0–100.

### Cuadrillas en el hangar

Cada turno, cada fabricante del hangar aparece en los entrenamientos de sus stats con probabilidad
`350 + 50 × bondLevel` per-mille, `bondLevel = floor(bond / 20)`, bond 0–100.

## Carrera

Especificación completa, pseudocódigo y pruebas: `docs/race-engine.md`; desviaciones del brief:
ADR-0003. Aquí, cada fórmula con su intención, expresión, unidades, rango y constantes (`RACE.*`).
Revisión 2 (ronda de críticos, `docs/race-engine.md` §28.1): términos de estilo y de regla, ritmo
con centro que sube con la Inteligencia, plan que no gasta dentro de los saltos, aterrizaje, desvío
de ground 1,10 y banda relativa de rivales; los rangos se midieron con el prototipo de la revisión 2.
Revisión 3 (segunda ronda, `docs/race-engine.md` §28.2): ninguna fórmula física ni constante cambia;
se unifican las cantidades del plan de pulsos, los rivales van sin peculiaridades, el lote tiene
presupuesto por escenario y la métrica 7 se mide por la nota (ver "Métricas del lote").
Revisión 4 (tercera ronda, `docs/race-engine.md` §28.3): ninguna fórmula física ni constante
cambia. La métrica 2 se cuenta con una entrada designada por fabricante, y S3 tiene una
construcción exacta con veredicto por casilla (ver "Métricas del lote"). Los términos de regla se
declaran bonificaciones numéricas, con su equivalente en stats (ver "Términos de regla").
`fl(a, b)` = división entera con piso (`floorDiv`); `ceilDiv(a, b) = fl(a + b − 1, b)`. `A, St, T,
C, I` son las stats efectivas congeladas (1–2000).

### Unidades del motor

Estado: propuesto en ADR-0003 D1 (desviación de BRIEF §2 regla 2); bloquea D8 hasta que el dueño
acepte el ADR entero (puerta G1). Intención: que un tick de 1/15 s mueva exactamente `v` sin restos. Posición en pu = 1/225 mm
(`1 m = 225 000`), velocidad en vu = 1/15 mm/s (`1 m/s = 15 000`, `1 vu = 1 pu/tick`); una
aceleración de `a` mm/s² cambia la velocidad exactamente `a` vu por tick. hp en µhp (`1 hp = 10^6`),
energía, calor y durabilidad en milésimas. Las constantes y el log usan las unidades públicas
(mm, mm/s, milésimas); `VBASE = vBase × 15`, `KBOOST = kBoost × 15`. Constantes: `ticksPerSecond`.

### Velocidad de crucero

Intención: la agilidad y la relación peso-potencia fijan el ritmo; el terreno lo modula.
`vC = fl(fl(vA × pwc × f_seg × stylePace[fase], 10^9) × (1000 + pace[fase]), 1000)` vu, con
`vA = fl(VBASE × (1 200 000 + kA × A), 1 200 000)` y `pwc = 1000 + fl(pwCruiseWeight × (PW − 1000), 1000)`
(PW en ‰; `pwCruiseWeight` 1000 = brief literal; v1 5, ADR-0005, aceptado por el dueño el
2026-10-28: el PW mueve el crucero ±0,2 %, `pwc` 998 a PW 0,7 y 1002 a PW 1,4). Rango: A 600, PW 1,0, llano = 23,5 m/s; el terreno lo mueve
entre ×0,8 (agua 0,2) y ×1,15. Rebufo de hover (término de estilo): en la fase media, mientras está en el
pelotón medio, su objetivo de velocidad ×`hoverDraftPm` (1020; nunca agotada, nunca en solitario).
Constantes: `vBase` 20 000 mm/s, `kA` 350 ‰, `pwCruiseWeight`, `stylePace` (1000 neutro),
`style.hoverDraftPm` 1020.

### Aceleración, salida y desaceleración

Intención: la técnica gobierna cuánto tarda en alcanzar el crucero; la salida reconstruye Umamusume.
`acc = fl(kAcc × (600 + T) × pwc × f_seg, 1 200 000 000)` vu por tick (= `k_acc·(0,5 + T/1200)·PW·f`
en mm/s²). Salida: `v0 = vStart`; mientras `vCore < fl(min(VBASE, objetivo) × dashUntilPm, 1000)` se
suma `kStartDash`; el mismo sprint se reactiva tras un salto fallido. Si el objetivo baja,
`vCore` baja a `kDecel` por tick. Glide en la fase de salida acelera ×`glideStartAccelPm` (1100;
"toma la punta"); Altair acelera ×`telemetryAccelPm` (800; término de regla). Rango: 0,40 m/s² a
T 600 (0,3–0,5 entre T 300 y 900); 17 m/s en 9 ticks, crucero en ~15 s a T 600. Constantes: `kAcc`
400 mm/s², `vStart` 3000 mm/s, `kStartDash` 24 000 mm/s², `dashUntilPm` 850, `kDecel` 3000 mm/s²,
`style.glideStartAccelPm` 1100, `telemetryAccelPm` 800.

### Velocidad movida

Intención: el boost y las habilidades son instantáneos (`v += k_boost·PW`).
`vOut = penalizado ? fl(vTot × heatPenaltyMult, 1000) : vTot`, `vTot = max(0, vCore + empuje + skillSpeed)`;
empuje `B = fl(KBOOST × pwb, 1000)` (pulso: `Bp = fl(KBOOST × pwb × pulseBoostMult, 10^6)`), con
`pwb = 1000 + fl(pwBoostWeight × (PW − 1000), 1000)` (v1 `pwBoostWeight` 250, ADR-0005: `pwb` 925 a
PW 0,7 y 1100 a PW 1,4). El empuje de un tick de pulso pasa además por
el aire de Kōryū (`airPm`, ver "Términos de regla"), y el de dive por la picada: ×`diveStoopPm`
(1400) en descensos y en la fase final ("gasta todo en descensos y en el sprint final"). Rango:
+3 m/s (PW 1,0; dive en la final 4,2), pulso +4,05 m/s (5,87 en el desierto; 14,7 en un descenso
del desierto). Constantes: `kBoost` 3000 mm/s, `pwBoostWeight` 250, `heatPenaltyMult` 920, `style.diveStoopPm` 1400.

### hp máximo

Intención: la pista fija la reserva y la stamina la hace durar; las pistas largas exigen stamina.
`hpMax = (hpBase + fl(hpPerKm × Lmm, 10^6)) × 10^6` µhp. Rango: 915 / 1235 / 1635 hp en 1200 / 2000 /
3000 m; un 600 equilibrado termina el ridge con ~2 %. Constantes: `hpBase` 435, `hpPerKm` 400.

### Drenaje de hp y fatiga final

Intención: correr rápido cansa con el cuadrado de la velocidad; la stamina lo divide y el coraje
reduce la fatiga de la fase final. `drain = fl(r × r × dK, 10^6)` µhp por tick, `r = fl(vOut × 1000, VBASE)`
(el cuadrado como producto entero); `dK = fl(kHp × 1000 × 1 200 000, stamDiv)` antes de la final y
`fl(kHp × 1000 × 1 200 000 × fat, stamDiv × 1000)` en la final, `stamDiv = 1 200 000 + kS × St`,
`fat = max(1000, fatigueBase − fl(fatigueCourage × C, 1200))`; glide en punta ×`glideLeadDrainPm`;
Altair ×`telemetryDrainPm` (950; término de regla). Rango: 0,86 / 1,12 hp por tick a 23,5 m/s con
St y C 600. Constantes: `kHp` 1000, `kS` 1200, `fatigueBase` 1500, `fatigueCourage` 400,
`glideLeadDrainPm` 980 (revisión 2; era 950), `telemetryDrainPm` 950.

### Agotamiento

Intención: sin hp la velocidad cae a un mínimo propio del bastidor y del terreno, sin boost.
`vMin = fl(fl(VBASE × exhaustSpeedPm × pwc × f_seg, 10^9) × (1000 + pace), 1000)`; empuje desactivado.
Rango: 17 m/s con PW 1,0 en llano. Constante: `exhaustSpeedPm` 850.

### Factor de segmento

Intención: cada terreno pide algo distinto. `flat` 1000; `climb` `1000 − fl(kClimb × grade‰, 1000)`;
`descent` `1000 + fl(kDescent × grade‰, 1000)`; `water` `1000 − fl(kWater × drag‰, 1000)`; `canyon`
`1000 + fl(kWind × wind‰, 1000)` (viento con signo); `curves`
`1000 − fl(kCurves × (1200 − min(A, 1200)) × curvesScale, 1 200 000)`; `jump` 1000. Modificadores:
override = máximo de los override, luego producto de los multiply, acotado a [500, 1500]. Boneyard
multiplica `curvesScale` por `repairableCurvesPm` (1500; término de regla). Rango de contenido: 800
(agua 0,2) a 1150 (viento a favor 0,15); curvas 900 a A 600 (Boneyard 850). Constantes: `kClimb`
150, `kDescent` 100, `kWater` 1000, `kWind` 1000, `kCurves` 200, `segFactorMin` 500, `segFactorMax`
1500, `repairableCurvesPm` 1500.

### Boost, energía y calor

Intención: el boost gasta energía y calienta; sin boost se enfría y, si el bastidor lo permite,
regenera. Por tick con boost: `energía −= kE` (pulso `fl(kE × pulseCostMult, 1000)`), `calor += kH`;
sin boost: `calor −= coolTick`, `energía += regenTick` (×multiplicador en el pelotón medio), con
`coolTick = fl(kCool × biomeCool × dissF, 10^6)` (neutro = `kCool`), ×`massThrustCoolPm[bioma]` en
Steinhaus (desierto 50; término de regla). Ninguna cantidad baja de 0 ni pasa su máximo. Rango:
100 de energía ≈ 100 ticks ≈ 20 m a PW 1,0. Constantes: `kE` 1000, `kH` 2000, `kCool` 1000,
`regenPerTick` 100 (brief 0,5 por tick; ADR-0005), `coolDissWeight` 0, `dissRef` 60, `biomeCool` 1000, `massThrustCoolPm`.

### Umbral de sobrecalentamiento y gobernador

Intención: el coraje es la stat dueña de la disipación: eleva el calor tolerable antes de la
penalización y antes de cortar el boost. `heatCap = fl(D × (1000 + fl(heatToleranceCourage × C, 1200)), 1000)`
mh con `D = dissipation × 1000`; sobrecalentado si `calor > heatCap`: ×0,92 en la velocidad movida y
`durability −= dmgTick` por tick (`1000 × (Steinhaus ? 2 : 1) × (ground ? 0,5 : 1)` md). Gobernador: un
tick de boost solo si `calor + kH ≤ capLim` (`capLim = D` en telemetry, `heatCap` en el resto); la
licencia de Steinhaus (plan y remate) e inmunidad permite superarlo si la durabilidad proyectada tras
la cola de enfriamiento queda sobre `overheatFloorPm`. Rango: 69 de calor con dissipation 60 y C 600;
ciclo neutro de 1/3. Constantes: `heatToleranceCourage` 300, `heatPenaltyMult` 920,
`overheatDurPerTick` 1000, `massThrustDurMult` 2000, `groundDamagePm` 500, `overheatFloorPm` 250.

### Durabilidad a cero

Intención (BRIEF §5): alas rotas pierden un cuarto de potencia el resto de la carrera, sea cual
sea el peso del PW. Dos factores, cada uno neutro en uno de los dos rulesets (ADR-0003 D56):
`PW' = fl(PW × durabilityZeroPowerMult, 1000)` entra en los pesos de PW como cualquier PW, y
`brokenSpeedPm` multiplica después el PW pesado de la variante rota:
`pwc' = fl((1000 + fl(pwCruiseWeight × (PW' − 1000), 1000)) × brokenSpeedPm, 1000)` (igual `pwb'`
con `pwBoostWeight`). Crucero, aceleración, mínimo y empuje son lineales en `pwc` y `pwb`, así que
caen todos `1000 − brokenSpeedPm` ‰; las reparaciones no lo deshacen. v1 (ADR-0005 «Pasada 2»):
`durabilityZeroPowerMult` 1000 y `brokenSpeedPm` 750, el PW × 0,75 del brief tal como cuesta a
peso completo; con los pesos 5 / 250 el corte de PW solo daba `pwc` 998 y `pwb` 937 (≈ 0,2 % de
tiempo). La especificación (`SPEC_RULESET`) rompe por el PW (750 y 1000): a pesos 1000 / 1000 las
dos vías dan tablas idénticas. Rango: empezar roto cuesta 29,6-30,7 % de tiempo en un campo S1 y
la velocidad media de una carrera en solitario queda en 0,76-0,77 de la intacta. El log lo explica
con el evento `durabilityBroken` (dónde, `PW'`) y `derived.brokenSpeedPm`. Constantes:
`durabilityZeroPowerMult` 1000, `brokenSpeedPm` 750.

### Pulsos Kōryū

Intención: ráfagas que rinden más por energía pero con enfriamiento. Ráfaga de `pulseTicks` ticks con
empuje `Bp` (cada `chainIndex`-ésima consecutiva ×(1 + bono)), coste 1200 por tick, `+kH` por tick;
luego `pulseCooldownTicks` (o el `pulse-cooldown` del tipo de segmento del disparo). El empuje de
cada tick de ráfaga ×`airPm[segmento]` (ver "Términos de regla"). Dispara si
`energía − 14 400 ≥ reserva de salto` y `calor + 24 000 ≤ heatCap`. Rango: un pulso cada 42 ticks como
máximo; 4,05 m/s × 12 ticks = 3,24 m por pulso a PW 1,0 (3,73 m en llano del desierto). Constantes:
`pulseTicks` 12, `pulseCooldownTicks` 30, `pulseBoostMult` 1350, `pulseCostMult` 1200.

### Salto

Intención: la técnica multiplica la energía disponible para despegar. `liftF = fl((600 + T) × (1000 + liftBonus), 1200)`,
`lift = fl(energía × liftF, 1000)`; éxito si `lift ≥ liftRequired × 1000`: gasta `min(energía, req)` y
cruza a velocidad de crucero; al aterrizar conserva `landPm = landBasePm + fl(landTechPm × min(T, 1200), 1200)`
‰ de la velocidad (T 600: 860; Lumière pierde el doble, Boneyard nada: términos de regla) y
vuelve a acelerar; fallo: `durability −= kCrash × 1000` (0 con guardia o blindaje) y
`kJumpPenaltyTicks` ticks parada; sin blindaje además `v = fl(v × crashSpeedMult, 1000)` y sprint de
recuperación; con `obstacle-armor` conserva la velocidad y la parada suma `extraTicks`; quien cae no
aterriza. Ground recorre `groundDetourMult` × longitud (Boneyard: la mitad del alargue) sin energía,
daño ni aterrizaje. Reserva de salto: `R_j = max(ceilDiv(req_j × 10^6, liftF), req_j × 1000 + R_{j+1})`;
con ella quien vuela nunca falla un salto que puede pagar, y el nicho de ground es el tiempo
(aterrizaje y energía de los demás contra su desvío). Rango: el salto de 20 pide 20 de energía a
T 600 (34 a T 100); un aterrizaje cuesta ~13,5 m (0,58 s) a T 600; un fallo cuesta ~3,35 s.
Constantes: `kCrash` 25, `kJumpPenaltyTicks` 20, `crashSpeedMult` 400, `groundDetourMult` 1100
(BRIEF 1,25; ADR-0003 D46), `landBasePm` 800, `landTechPm` 120.

### Agua

Intención: el agua frena (`f_seg`) y daña las alas al entrar. `daño = fl(drag‰ × waterHitPerDrag × (ground ? 500 : 1000), 1000)`
md (0 con guardia u `obstacle-armor`). Rango: 10 de durabilidad con drag 0,2. Constante:
`waterHitPerDrag` 50.

### Activación de habilidades

Intención: la Inteligencia decide si una habilidad sale, una vez por ranura y carrera.
`pAct = max(activationFloor, 1000 − ceilDiv(activationNumerator × 1000, I))`,
`p = clamp(fl(pAct × activationBase, 1000) + bonos de fase + (telemetry ? 150 : 0), 0, 1000)`
(lucky-bolt: 1000); se activa en el primer tick con disparador cumplido y `u < p`, con `u` ∈ [0, 999]
sorteado antes del tick 0. Una habilidad con `disabled` (solo el lote, ablación S4) tiene `p = 0`
antes de cualquier bono o de lucky-bolt y conserva su ranura de sorteo. Rango: I 300 → 700 ‰, I 600 → 850 ‰, I ≤ 112 → 200 ‰. Constantes:
`activationNumerator` 90, `activationFloor` 200, `telemetryActivationBonus` 150, `maxSkillActivations` 3.

### Ritmo e Inteligencia

Intención: la dispersión de tiempos de §12, con la Inteligencia elevando el ritmo medio sin cambiar
la dispersión (revisión 2). Ancho fijo `W0 = paceHalfWidth`; centro
`c = fl(paceCentreSpan × min(I, 1200), 1200) − fl(paceCentreSpan, 2)` ‰; `pace[fase]` uniforme en
`[c − W0, c + W0]` (tres sorteos previos). El plan percibe `energía × (1000 + planErr)` con `planErr`
en `±fl(planErrorMax × (1200 − min(I, 1200)), 1200)` (media cero, pero todo error cuesta tiempo).
Rango: c = −11 / 0 / +14 ‰ a I 300 / 600 / 1000 (+100 de I ≈ 0,36 % de velocidad ≈ 7 m en 2000 m);
σ del tiempo ≈ 1,0–1,3 % con margen de hp, igual para toda I; la tasa de victoria en un campo
igualado es no decreciente en I (S8). Constantes: `paceHalfWidth` 43, `paceCentreSpan` 43,
`planErrorMax` 150.

### Sprint final

Intención: gastar la energía para dejarla en 0 a 60 m de la meta, al ritmo que minimiza el tiempo
estimado. Candidatos de `sMax` hacia abajo en pasos de `sprintLevelStepMms`; cada uno gasta la
energía percibida en un tramo que termina en `L − 60 m` (o en la entrada de un salto que contenga ese
punto: `kickAt`; o en el agotamiento proyectado), con precio por calor (ticks permitidos
`fl(capLim − h1 + tb × coolTick, kH + coolTick)`) y por hp; gana el candidato limpio de mayor
ganancia neta (empates: el nivel más alto). Para quien no es ground el tramo cuenta solo distancia y
ticks fuera de los saltos (en el aire no hay empuje): el arranque del esfuerzo se corre hacia atrás
lo que mida el salto y el acumulador no suma dentro de él. Desde `kickAt`, remate con lo que quede.
Bastidores de pulsos (una sola definición, la de `docs/race-engine.md` §3.3):
`Bon = fl(fl(Bp × pulseBiomePm[bioma], 1000) × (dive ? diveStoopPm : 1000), 1000)`,
`costOn = fl(kE × pulseCostMult, 1000)`, `unit = Bon × pulseTicks`,
`sMax = fl(unit, pulseTicks + pulseCooldownTicks)` (cadencia máxima 12/42). Rango (dive con picada):
1,8 m/s desde 801 m en el sprint; 2,6 m/s desde 1800 m en el ridge (hover: 1,3 m/s desde 841 m y
1,5 m/s desde 1723 m); nivel máximo de pulsos en el desierto: shiden 38 758 vu (2,58 m/s), hayate
26 426 vu (1,76 m/s) (`pwBoostWeight` 250, `pulseBiomePm` 1450). Constantes: `finalSprintReserveMeters` 60, `sprintLevelStepMms` 100,
`maxReplans` 4, `pulseTicks`, `pulseCooldownTicks`, `pulseBiomePm`, `style.diveStoopPm`.

### Controladores de estilo

Intención: §5 hecho exacto. Dive boostea en descensos guardando el 50 %; hover alcanza al pelotón
medio (`posFrac > 750`) guardando el 50 % y planifica al 70 %; glide persigue la punta en salida y
media guardando el 60 %; ground gasta el 60 % del tanque de forma uniforme antes de la final.
`posFrac = fl(delante × 1000, n − 1)`; pelotón medio 250–750 ‰. Términos de estilo (la fase donde
brilla cada uno; con energía lineal los controladores solos dan tiempos iguales): dive, picada
(empuje ×1,4 en descensos y en la final); hover, rebufo (objetivo ×1,02 en la fase media dentro
del pelotón medio); glide, salida (aceleración ×1,1 en la fase de salida); ground, ruta de
obstáculos (desvío 1,10 sin aterrizaje ni energía de salto). Rango: S1 medias del desierto 25,6 /
26,3 / 26,2 / 22,0 % (dive / hover / glide / ground), ground gana el ridge (38 %). Constantes:
`style.*` (incluidos `diveStoopPm` 1400, `hoverDraftPm` 1020, `glideStartAccelPm` 1100),
`surplusHeatPm` 800, `regenOverflowHeatPm` 900, `freeBoostMaxTicks` 12.

### Términos de regla (numéricos; ADR-0003 D45)

Intención: que las casillas casa/débil de §7 salgan de la regla de cada fabricante. Cada regla gana
un término numérico que se compila con su `RuleSpec`. Son bonificaciones numéricas, en desviación
de BRIEF §7 («no como bonificación numérica»; ADR-0003 D45).

- Dentro del mecanismo de su regla, ligados a un bioma o a un tipo de segmento:
  - Steinhaus: `coolTick × massThrustCoolPm[bioma]` (desierto y urbano 50, tundra y montaña
    1250; ADR-0005). Ninguna stat lo iguala; en el desierto enfría 0,05 por tick: el ciclo de boost
    gobernado en el tope de calor baja de 1/3 a 1/41 y el tanque no se vacía en ninguna pista
    (≈ 46 / 58 / 77 ticks de boost en sprint / ridge / cañón).
  - Kōryū: empuje de ráfaga × `airPm = fl(pulseAirPm[segmento] × pulseBiomePm[bioma], 1000)`
    (descenso 2500, agua 600; desierto 1450; ADR-0005). Una ráfaga empuja ×1,45 en el desierto y
    ×3,625 en un descenso del desierto (agua del desierto ×0,87), con el crucero igual.
- Fuera del mecanismo de su regla:
  - Lumière: pérdida de aterrizaje × `regenLandLossPm` (2000). ≈ 54 m por aterrizaje en vez de
    13,5 m a T 600; ninguna técnica lo iguala.
  - Boneyard: pérdida de aterrizaje y alargue del desvío × `repairableRuggedPm` (0; ADR-0005):
    aterriza sin perder velocidad y su ruta de suelo mide lo mismo que el salto (−18 m de desvío en
    el ridge); penalización de curvas × `repairableCurvesPm` (1500), la de A 300 en las curvas.
  - Altair, global (todo segmento de toda pista, sin clave de segmento ni de bioma): drenaje ×
    `telemetryDrainPm` (950) y aceleración × `telemetryAccelPm` (800; ADR-0005). Equivale a ≈ +84
    de stamina y −240 de técnica a 600 / 600: `St' = (1000 + St) / 0,95 − 1000` y `T' = 0,8 T − 120`.
    Sus casillas salen del largo de la pista.

Ninguna regla lee un rasgo de pista. Rango (PW y estilo iguales, constantes de ADR-0003): Altair
+0,77 % en el sprint y −1,22 % en el cañón; Boneyard +2,89 % en el sprint y −0,99 % en el ridge;
Lumière +0,60 % en el ridge frente a −2,93 % en el sprint; Kōryū y Steinhaus < 0,2 % con `kE` 1000.
Con los valores de ADR-0005 (bastidores reales, S2 `full`, 600 carreras por pista): Kōryū 35 % del
sprint y del ridge, Boneyard 33-34 % del ridge, Altair 36 % del cañón; Steinhaus ≤ 10 %, Lumière 0 %
del ridge, Altair 5-6 % y Boneyard 0 % del sprint. Constantes: las nombradas.

### Llegada y márgenes

Intención: tiempos sub-tick y márgenes reales en milímetros. `finishMilli = t × 1000 + fl((L − prevPos) × 1000, disp)`
mili-ticks; margen = distancia real del siguiente al cruzar el anterior; guarda DNF
`dnfTicksPerMeter × L_m + dnfTicksBase`. Constantes: `dnfTicksPerMeter` 8, `dnfTicksBase` 2400.

### Rivales de las carreras objetivo

Intención: bastidores de la misma clase de PW que la jugadora (banda de PW) y stats algo por debajo
de la curva de la Falconess de referencia (política de la stat más baja, 220 / 339 / 470 / 591 por
stat en las carreras de T12 / T24 / T36 / T46): razón 0,83-0,86, más cerca al principio de la
temporada. No es un campo igualado en stats: la referencia gana ≈ la mitad de sus carreras objetivo
(43-58 % según la Falconess; cuota justa 12,5 %) y las metas piden puesto, no victoria (escalera
7 / 6 / 5 / 3, decisión del dueño, ADR-0005 «Pasada 2»). Potencia
`fl(5 × (rivalBase + rivalPerTurn × turno) × (1000 ± rivalNoise), 1000)` repartida por pesos de estilo
(±`rivalStatJitter`); bastidores genéricos con `|PW − pw0| × 1000 ≤ rivalPwBandPm × pw0`, donde
`pw0` es el PW base del bastidor de la jugadora (banda relativa del 5 %; mínimo 1 bastidor, elección
con reemplazo); los rivales no llevan piezas ni peculiaridades (revisión 3), así que su PW construido
es su PW base y queda dentro de la banda;
`min(rivalMaxSkills, fl(turno, rivalTurnsPerSkill))` activas genéricas. Rango: media por stat 183 /
291 / 399 / 489 en los turnos 12 / 24 / 36 / 46 (`rivalBase` 75, `rivalPerTurn` 9; ADR-0005: la
curva del stub, 95 + 9 × turno, dejaba la primera meta a la par; 60 + 8 × turno, razón 0,71-0,74,
hacía casi automáticas las carreras objetivo). Constantes: `FIELD.*`.

### Métricas del lote (D14)

Intención: que `pnpm sim:batch` juzgue cada métrica de BRIEF §12 con un tamaño de muestra que quepa
en su presupuesto. Perfil `pr` (`--runs 10000`, < 60 s, cada PR): S1 1200, S2 600 + 900, S3 2700
carreras de dos, S4 1240, S5 1440, S7 ≤ 720 carreras objetivo, S8 1200 (suma 10 000; escala con
`--runs`); perfil `full` (nocturno, < 20 min) con S3, S5 y S8 completos. Veredicto con el intervalo
del 95 %: falla si queda entero fuera del objetivo, no concluyente si cruza un borde (lo decide el
siguiente `full`). Métrica 2: el campo de S2 tiene cinco entradas designadas, una por fabricante:
un bastidor no firma de ese fabricante, sorteado de forma uniforme. Las completan tres bastidores
neutros `none`, que no cuentan para nadie. La tasa de un fabricante es victorias de su entrada /
carreras; un empate en el primer puesto reparte la victoria. La cuota justa es 12,5 %, con un
veredicto por casilla casa o débil (fabricante, pista). La variante de PW igual usa el mismo campo
y el mismo conteo. Métrica 3: S3 en 1 contra 1 pareado, las dos entradas de la misma Falconess
(stats base 600, sus letras de aptitud, su habilidad única como única activa, sin piezas, genérico
sin peculiaridades). Un veredicto por casilla (par, pista); «bioma casa» se lee como desierto en
v1, porque no hay pistas urbanas ni de montaña (ADR-0003 D47). Métrica 5: los puntos de tasa de
victoria que gana una corredora `δ` más rápida que las otras siete en un campo igualado con tiempos normales de σ relativa; 3 puntos ≈ `δ`
0,155 % con σ 0,99 % y 0,185 % con σ 1,18 % (las piezas del contenido inicial valían 5-87 puntos, `docs/race-engine.md`
R18; ADR-0005 las deja en ≤ 2,3). Métrica 7, literal: cuota de temporadas con `gradeFor ≥ B` ≥ 60 % por Falconess con la
política de la stat más baja, donde `seasonScore = total de stats + scorePerSkill × habilidades +
scoreWinBonus × victorias + scorePodiumBonus × segundos y terceros puestos`, y B exige
`seasonScore ≥ 2900` y ningún objetivo fallado (un fallo limita la nota a C). Constantes: `SEASON.gradeThresholds`, `scorePerSkill` 20, `scoreWinBonus` 50,
`scorePodiumBonus` 20, `gradeCapOnGoalFailure`; los tamaños de muestra viven en el lote
(`apps/cli`), no en el ruleset.

## Constantes v1 (valores iniciales, BRIEF §6)

| Constante       | Valor     | Intención                                        |
| --------------- | --------- | ------------------------------------------------ |
| `k_a`           | 0.35      | Cuánto pesa `agility` en la velocidad de crucero |
| `k_acc`         | 0.40 m/s² | Aceleración base                                 |
| `k_hp`          | 1.0       | Drenaje de hp por tick a velocidad base          |
| `k_s`           | 1.2       | Cuánto reduce `stamina` el drenaje               |
| `k_boost`       | 3.0 m/s   | Velocidad extra con boost                        |
| `k_e`           | 1.0       | Energía por tick de boost                        |
| `k_h`           | 2.0       | Calor por tick de boost                          |
| `k_cool`        | 1.0       | Enfriamiento por tick sin boost                  |
| `k_crash`       | 25        | Daño a durabilidad por salto fallido             |
| `k_jumpPenalty` | 20 ticks  | Ticks perdidos por salto fallido                 |
