# Falconess v3 · El vuelo como diferencial

2026-11-03. Para el dueño. Revisa y adapta `.work/design6/distancias-y-posiciones.md` y Umamusume a Falconess.
Prototipo: `.work/design7/wt`, rama `race-v3-proto` (7e9fddd → 6bb4615; ronda 5: 69f9074, df9f83d, 6bb4615), sin
push. Medida: `measure/final.md` y `measure/round-5.md` (dos bases, n 1600 por celda; WING-0 con seis). Diseño:
`diseno-v3-vuelo.md` sobre `diseno-v3.md`. `M` = `.work/design7/wt/packages/sim/src/race`. Sin medida = INFERENCIA.

## 0. Resumen en 6 líneas

1. Lo que nos separa de Umamusume es el vuelo: cuatro despegues que se reconocen, una lucha arriba que cuesta y una picada que acelera en el aire y se cobra en puestos.
2. De Umamusume quedan tres ideas: lo fijo contra lo proporcional, una stat pilar (la Agilidad, como la Velocidad) y la Resistencia como umbral de lo largo. Se van las letras de distancia, las categorías y el ritmo por etiqueta.
3. Volar ya no es gratis: el aire tiene su sorteo (pre-sorteado), sostener alto cuesta más, detrás de otra hay aire sucio, la línea se pelea y caer sobre el tráfico prueba el Coraje.
4. Medido: de 48 criterios de la etapa 1 pasan 39, fallan 6 y 3 esperan tu mirada. v1 y v2 siguen byte a byte, no hay contra-elección (−0,01 a 0,03 puntos) y el ruido no sube.
5. Lo flojo: la lucha paga poco en lo largo, el sprint tiene 16 % de vuelos bajo el plan, Planeo+Punta falla en 3 celdas y el campo vuela 12-20 % (T21 pedía 30-45 %).
6. Te pido 5 decisiones. La primera es mirar la vista 1.V en tu teléfono: sin eso no cierro ADR-0009.

## 1. Qué se tomó de Umamusume, qué se adaptó y qué se descartó

El informe de design6 investigó bien Umamusume, pero lo tradujo por hp y Resistencia: el vuelo, los saltos y
la picada no aparecían (`audit-report.md:10-11`). Esto es lo que quedó, ya pasado por el vuelo.

| Umamusume                                                                                                    | En Falconess                                                                                                                 | Por qué                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La Velocidad es el pilar: el máximo es el piso de toda build                                                 | **Tomado.** La Agilidad es el pilar: +100 = 30-41 m, igual que en v2 (AGI-1)                                                 | Tu decisión. No se aplana: cada otra stat tiene umbral y momento (§4)                                                                                       |
| Lo fijo (aceleración, ventaja de la punta) gana en lo corto; lo proporcional (coeficientes, HP), en lo largo | **Adaptado al vuelo.** La picada da metros fijos (pesa en lo corto). Sostener se cobra por metro y lo largo pide Resistencia | Explica corto contra largo sin tablas ni categorías                                                                                                         |
| HP = D + coeficiente × Resistencia; umbral nítido                                                            | **Tomado como umbral.** Bajar la Resistencia a 300 cuesta hasta 189 m en lo largo; +100 vale 0 m en el sprint                | «Le faltó aire» se entiende. Sin coeficiente por estilo: sería bono por etiqueta                                                                            |
| Letra de distancia S-G y categorías Sprint, Mile, Medium, Long                                               | **Descartado**                                                                                                               | Decreto que no se entrena y se sube con suerte. Rasgos abstractos (ADR-0007). La única letra sigue en la posición y escala la Inteligencia (ADR-0008:86-91) |
| Estilos con velocidad propia por fase                                                                        | **Adaptado:** la posición es un plan de vuelo (cuándo y a qué banda). Sin velocidad propia                                   | El «ritmo por posición» de design6 daba a la Punta 43-50 % en 1200 m a cualquier nivel y rompía ADR-0008 (`audit-report.md:39-62`, E1-E7)                   |
| Position keep y marcapasos «del estilo más adelantado»                                                       | **Descartado**                                                                                                               | Lee el estilo de la rival. Acá el lugar se ve por banda y nada lee la posición de otra (INV-3)                                                              |
| Pelea por la punta con gasto extra                                                                           | **Adaptado:** lucha por la línea arriba (aire sucio, pasar por arriba, que te bajen), en bandas y metros                     | Castiga hacia adentro: 92 % de los pares en aire sucio son de la misma posición (CONT-3)                                                                    |
| Tiradas: sprint aceptado al azar, aceleración en una curva al azar, demora de largada                        | **Descartado como tirada.** Queda varianza acotada y pre-sorteada: el ritmo de cada fase y el aire de cada vuelo             | T18: el azar da variedad, no arruina. Cero sorteos en el tick (INV-2)                                                                                       |
| La recta final y dónde cae el 2/3 deciden el estilo                                                          | **Adaptado a rasgos:** la Remate despega en la cornisa, en el último Salto o 150 m antes de la final                         | La pista inclina por sus rasgos, no por su nombre                                                                                                           |
| Modo bajada (gasto ×0,4)                                                                                     | **Adaptado:** la Bajada es cornisa (subir a mitad de costo y de ticks) y carril de la gran picada                            | Se ve como caída, no como un multiplicador                                                                                                                  |
| «Guardar piernas» y la tensión de la última recta                                                            | **Tomado:** la Remate espera arriba y cae una vez (GRAN PICADA)                                                              | Es el momento de la maqueta que te encantó                                                                                                                  |
| «La Front sola pierde»: apostar a la sala                                                                    | **Descartado**                                                                                                               | Invita a contra-elegir. Elegir mirando el campo gana −0,01 a 0,03 puntos (CP-1)                                                                             |
| Carriles y costo por carril en curva                                                                         | **Descartado**                                                                                                               | No hay carriles con geometría. Nuestro eje distinto es vertical: cuatro bandas                                                                              |
| Carrera plana; el espectáculo son cortes pregrabados                                                         | **Lo que hacemos distinto**                                                                                                  | La altura es un recurso honesto: se compra, se pelea y se cobra, y todo sale del registro (T16)                                                             |

**La Verificación de design6, revisada.** En 1200 m la Agilidad sí mueve el orden (E1); la estela por posición
estaba mal contada (E2); la tabla era de una base y n 800 (E3); «ninguna regla gana por etiqueta» no valía para el
ritmo por posición (E7). Se conservan la investigación y sus pruebas (contra-elección, dos bases, Wilson).

## 2. El vuelo como diferencial

**El ala dice cómo sube. La posición dice cuándo y a qué banda. La pista dice cuánto conviene.**

### 2.1 Cuatro despegues, uno por ala (`M/flight.ts:246-294`)

| Estilo · ala             | Gesto                                  | Física                                                                                   | Costo                     | Premio                                                   | Medido                                   |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| **Lanza** · Picada       | Vertical: se agacha y sale para arriba | 2 ticks por banda: techo en 0,4 s y 9 m. Conserva el 96 % de la velocidad                | Subir ×1,25               | Picada ×1,25; cae en 2 ticks por banda                   | Energía 1,21-1,25 × la neutra            |
| **Columna** · Suspensión | En escalones, alas en V                | 4 ticks por banda: techo en 0,8 s y 18,6 m. Conserva el 98 %                             | Subir ×0,9; sostener ×0,8 | Remolque ×1,02 y su línea +6 ‰                           | 0,85-0,88 ×                              |
| **Rampa** · Planeo       | Diagonal larga, sin frenar             | 8 ticks por banda: techo en 1,6 s y 38 m. Conserva el 100 %. Desde una cornisa, la mitad | Sostener ×0,8             | No pierde velocidad; la cornisa le rinde más que a nadie | 0,84-0,93 ×                              |
| **Turbina** · Rasante    | A ras, empujada por el bastidor        | Solo la banda baja, 3 ticks. Conserva el 100 %                                           | Subir ×0,5; sostener ×0,6 | Sin picada; daño ×0,5 (de siempre)                       | Despega en el canyon por defecto (STY-5) |

Son los gestos que pediste (vertical, por el suelo con los propulsores, subida en horizontal) más los escalones.
El estilo cambia cómo se ve, no regala metros: contra el ala neutra, −2,0 a +2,4 m (puerta ±4,6 m, STY-2).

### 2.2 Arriba se lucha

- **Su aire.** Cada vuelo trae su aire (±18 ‰, slots 28 y 30 ya sorteados) más el 80 % del sorteo de ritmo de la
  fase, como en el suelo (`M/flight.ts:366-371`, `M/state.ts:915-923`). La Técnica corre el centro ±7,5 ‰ y nada
  angosta la ventana. Antes se picaba siempre a 84,60 km/h; hoy p90 − p10 da 5-12 km/h.
- **Sostener cuesta.** Alta y techo ×1,3 por banda y metro (`M/flight.ts:453`). El Acecho gasta 24 / 31 / 39 de
  energía por carrera (sprint / ridge / canyon), ≥ 1,15 × la ronda 2.
- **Aire sucio y remolque.** A 5 m o menos detrás de otra de su banda: sostener hasta ×2,5 (menos con Técnica) y
  sin descanso de piernas. De 5 a 11 m (24 m en alta): remolque ×1,005 (Columna ×1,02), pagando el aire turbio
  (`M/flight.ts:454-459`, `M/engine.ts:857-868`). Nadie se remolca de una corredora en el suelo.
- **La línea se pelea.** A los 20 ticks (1,3 s) de aire sucio intenta pasarla por arriba (una vez). Si no puede,
  a los 30 + 50·C/1200 ticks (3,7 s con Coraje 600) la bajan una banda (`M/engine.ts:1095`). Ganarla paga: sostiene
  al precio de la banda que dejó y su picada suma 650 ‰ de una banda más (`M/engine.ts:1309`, `:1366-1370`). Pareado:
  ganarla vale +2,4 / +1,6 / +0,4 m; perderla, −3,8 / −3,2 / −2,7 m.
- **Riesgo real.** Sin energía cae sin picada y paga el aterrizaje (`M/engine.ts:1398`). Bajo el plan: 16 / 7 / 2 % (sprint / ridge / canyon).
- **El nervio.** Si toca con picada y hay otra en el suelo de 3 m atrás a 6 m adelante, se achica con
  clamp(400 − C/2, 50, 400) ‰ (Coraje 300: 25 %; 600: 10 %; ≥ 700: 5 %): pierde la picada. Si aguanta, ×1,10. Usa el
  slot 29, ya sorteado (`M/engine.ts:1377-1429`). 1,45 pruebas por carrera; decide la ganadora en el 1,5 %.
- **No se moja.** Arriba el líquido y la Colina pesan el 90 %, sin cobro de agua (`M/flight.ts:480-481`).

### 2.3 La picada

- Δv: alta 5,11 m/s, techo 5,43 m/s; el Coraje da η = 700 + 600·C/1200 ‰ (`M/flight.ts:415-417`). Cada banda que
  baja suma su parte en el aire (`M/engine.ts:1036`). Cada ala cae a su ritmo: Lanza 5,6, Columna 7,2, Rampa 10,1 ticks.
- Medido: gran picada de 6,2 m (alas neutras, Coraje 600); Remate+Picada, 8,2 m pareados en el sprint (0,53σ); pico
  +30 %, 108-114 km/h en p90 desde el techo. El 100 % acelera antes de tocar; el 44-46 % gana un puesto en 3 s
  (sprint 62-68 %, canyon 29 %). 4 despegues y 3,3-3,5 picadas por carrera.

### 2.4 Qué siente el jugador, momento por momento

| Momento      | Del registro                                                        | En el teléfono                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Carga    | `flightPlan[k].aMm`; el próximo `takeoff` o `noLift`                | Chip «DESPEGUE · 60 m» 3 s antes. El último segundo, el gesto: anillo bajo los pies (Lanza), alas en V (Columna), diagonal fantasma (Rampa). Con `noLift`: humo y «SIN ENERGÍA» en el visor |
| 1 · Despegue | `takeoff {style, cost, climbTicks, vMms, vAfterMms, airPm}`         | Polvo y golpe de llama. La barra de energía baja `cost` exacto. Lanza: −0,9 m/s en rojo                                                                                                     |
| 2 · Subida   | `bandReached`; bits de altura de `flags`                            | El trazo del estilo; altímetro BAJA → ALTA → TECHO; el horizonte cae                                                                                                                        |
| 3 · Arriba   | `takeoff.airPm`; la banda                                           | Sombra más lejos por banda; estela de condensación en el techo; cinta lisa («LÍNEA LIMPIA») o serrucho («AIRE PICADO»)                                                                      |
| 4 · Lucha    | `airDirty`; bit `dirtyAir`; `lineChange {over, knock}`              | Tiembla 1-2 px, marca roja en su barra, aro que se llena; «¡POR ARRIBA!» o «LA BAJARON»                                                                                                     |
| 5 · Picada   | `diveStart {fromBand, vMms}`; `dive.airMms`                         | Alas en flecha, estela roja, líneas de velocidad de 2 × (km/h − 80) px; los km/h suben en el aire. «GRAN PICADA», una vez por carrera                                                       |
| 6 · Impacto  | `dive {gainMms, surgeMm}`; `touchdown {cause}`; `nerve {held, pPm}` | Pausa de 80 ms, anillo y temblor de 4 px. «AGUANTÓ» o «SE ACHICÓ», con la pérdida en rojo                                                                                                   |
| 7 · Cobro    | `pass {band}` durante `surgeTicks`                                  | «+2 PUESTOS · 108 km/h», o «impulso +6 m» si no pasó a nadie; «PASÓ EN EL AIRE»                                                                                                             |
| 8 · Turbina  | `takeoff` turbine; bit `boosting`                                   | Llama baja, polvo o espuma, chispas en curvas. Sin empuje en el registro, sin llama                                                                                                         |

Celular: bandas de 18 px o más (la 1.V usa 64 px a 360), 2 carteles como máximo, chips solo para ella y la
líder, «reducir movimiento» saca el temblor. Tono T17: metal, llama, estela; nada kawaii. Cámara: Táctica en la
etapa 1; Visor, Piloto, cámara lenta (×0,4, elegida antes del resultado) y Director en la 2. **Hoy** la vista 1.V
(`wt/docs/design/prototipo/falconess-vuelo.html`, 4 carreras reales) dibuja bandas, estelas, líneas de velocidad,
temblor, carteles y chips, con 47 de 47 números del registro. Es esquemática (glifos, sin arte). Privada, para tu
teléfono: https://claude.ai/artifact/4uB5HwJKRF4Zx6Hn4UdH11.

## 3. Posiciones, alas y pistas

**Posiciones** (ADR-0008: se eligen antes de largar; la letra va en la posición; las rivales usan la de sus
alas). Ninguna regla lee la posición de otra: aire sucio, remolque y nervio leen bandas y metros (`M/engine.ts:868`).

|                                                 | ▲ Punta                             | ■ Pelotón                                       | ◆ Acecho                                    | ▼ Remate                                                   |
| ----------------------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Vuela en la etapa 1                             | No: solo salta                      | A ras (banda 1) en cada Pasillo; lo decidís vos | Alta, de L/4 a 0,7·L                        | Techo al final: cornisa, último Salto o 150 m antes        |
| Su lucha                                        | —                                   | Banda baja, sin aire propio (efecto suelo)      | La más larga: su aire, aire sucio, la línea | Corta: comparte el techo con otras Remates; nervio al caer |
| Stats que pesan arriba                          | —                                   | Técnica (subir)                                 | Técnica, Coraje, Resistencia                | Coraje, Técnica                                            |
| % a 600, campo parejo (sprint / ridge / canyon) | 22 / 23-25 / 27-30                  | 21 / 20-23 / 21-22                              | 25-27 / 26-27 / 22-23                       | 29-32 / 27-29 / 27                                         |
| Etapa 3                                         | A ras sobre Colina, líquido y Salto | Abanico en la final                             | igual                                       | igual                                                      |

El problema conocido: el Acecho volaba más, casi gratis, y ganaba menos (13,9-19,3 % en la ronda 2). Hoy paga
su vuelo y gana 21,8-27,2 % a 600.

**Alas** (la física de siempre queda, ADR-0008:47-66). Campo parejo, 600, % de victorias, v3 · v2:

| Ala        | En el aire                           | sprint      | ridge       | canyon      |
| ---------- | ------------------------------------ | ----------- | ----------- | ----------- |
| Picada     | Lanza, picada ×1,25                  | 28,4 · 30,2 | 22,0 · 20,7 | 20,4 · 23,2 |
| Suspensión | Columna, remolque ×1,02 y línea +6 ‰ | 25,8 · 27,8 | 24,8 · 18,9 | 26,6 · 26,1 |
| Planeo     | Rampa                                | 30,3 · 26,8 | 26,3 · 21,9 | 31,3 · 30,7 |
| Rasante    | Turbina                              | 15,6 · 15,3 | 26,9 · 38,5 | 21,8 · 20,0 |

Rasante dejó de ser «el ala del ridge» (38,5 → 26,9 %). Flojos: Rasante en el sprint y Planeo+Punta (§5). La
Picada (Peregrina) pierde algo en lo largo: se compensa con su kit, nunca bajando la Agilidad (la Lanza, el Coraje
en η y en el nervio, la habilidad cargada L7: +2,8 / +1,8 puntos de métrica 7).

**Pistas** (rasgos abstractos, ADR-0007; la piel cambia, la regla no):
- **Salto:** el momento compartido; un vuelo propio lo cruza sin pagar sustentación. **Bajada:** cornisa y gran picada.
- **Colina y líquido:** arriba pesan el 90 % y no mojan. **Pasillo:** el Pelotón a ras. **Curvas:** Agilidad. **Llano
  largo:** casa de su aire, de la Técnica y de la Columna.

La mejor posición cambia con la pista (600, campo parejo): Remate en el sprint, el ridge y la Escalera; Punta
en el Circuito y en el canyon a 450; Pelotón o Punta en el Mirador; Acecho en la Travesía (27,4 / 26,6 %); el
Cielo abierto queda parejo (23-27 %). Campo en el aire (por defecto, 600): 12-20 % según la pista.

## 4. Balance medido

Valores v3a / v3b, salvo «bases juntas». Fuente: `measure/round-5.md`.

| Grupo               | Criterio                      | Puerta                                                                           | Medido                                                                                       | Veredicto              |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| Posiciones          | POS-0                         | Cada una entre 10 y 40 %, 8 pistas, 300-750                                      | 128 chequeos, 0 fallan; peor: Acecho 12,2 % (Circuito, 300)                                  | PASA                   |
| Posiciones          | BEST-1                        | Ninguna mejor en más de 8 de 12 celdas                                           | Remate 7, Punta 3, Pelotón 1-2, Acecho 0-1                                                   | PASA (Remate al borde) |
| Posiciones          | AIR-3                         | σ del Acecho 0,85-1,10 × la del suelo                                            | 0,88-0,92                                                                                    | PASA (frágil)          |
| Alas                | WING-0                        | Ninguna ala ni par por defecto peor que v2 + 3 puntos (6 bases)                  | 3 fallas claras de 96, todas Planeo+Punta                                                    | FALLA                  |
| Alas                | STY-2 / STY-3 / STY-4         | Estilo ±4,6 m; energía ≥ 70 % neutra; ≤ 8 de 96 celdas fuera                     | −2,0 a +2,4 m; 0,84-1,25; 2-3 celdas                                                         | PASA                   |
| Pistas              | FLY-1b                        | Aire del campo ≥ 15 % en ridge y canyon, ≥ 10 % en sprint                        | 14,3 / 20,4 / 19,8 %                                                                         | PASA                   |
| Pistas              | FLY-9 / AIR-5                 | El aire no baja contra la ronda 2; volar no moja                                 | canyon 12,0 → 19,8 %; 0 cobros de agua                                                       | PASA                   |
| Falconess           | F7-1                          | Métrica 7 ≥ 60 % (Wilson, bases juntas)                                          | Peregrina 72,4 [69,5-75,1] · Cernícala 65,7 [62,7-68,6] · Caracara 71,0 [68,1-73,7]          | PASA                   |
| Falconess           | F7-3                          | «Moneda» de T46 ≤ ronda 2 + 5                                                    | Cernícala a 0,9 puntos; objetivo v2 + 2: Peregrina +11,5                                     | PASA (frágil)          |
| Stats               | AGI-1                         | La Agilidad no se toca                                                           | Términos de v2; +100 = 30-41 m (×1,00-1,05)                                                  | PASA                   |
| Stats               | STAT-1                        | Cada otra stat bajada a 300 cuesta ≥ 2 m en alguna celda                         | Resistencia 189, Técnica 34, Coraje 22, Inteligencia 22 m                                    | PASA                   |
| Stats               | STAT-2                        | Técnica 1.ª o 2.ª del Acecho; Agilidad 1.ª de Rasante                            | Técnica 3.ª-5.ª en 3 de 6 celdas (ridge 300, canyon 300 y 600); Agilidad de Rasante 2.ª en 3 | FALLA                  |
| Stats               | STAT-3                        | El Coraje vale > 0 donde hay picada                                              | +1,6 puntos [1,3-1,9]                                                                        | PASA                   |
| Vuelo               | FLY-2 / FLY-3 / FLY-4 / FLY-5 | Picadas visibles; gran picada 5-8 m; Remate+Picada 0,4-0,7σ; volar en llano ±3 m | ≥ 95 % de carreras con gran picada; 6,2 m; 8,2 m (0,53σ); −0,5 m                             | PASA                   |
| Vuelo               | DIVE-1 / AIR-1 / AIR-2        | La picada acelera en el aire; el aire no es constante; volar cuesta              | 100 %; 5-12 km/h; 24-39 de energía                                                           | PASA                   |
| Vuelo               | CONT-1                        | Momento de lucha en ≥ 25 % de los vuelos largos                                  | sprint 45 %, ridge 33 %, canyon 22,7-23,6 %                                                  | FALLA                  |
| Vuelo               | CONT-2                        | Lucha entera ≤ +0,5 m; ganar ≥ +0,5; perder ≤ −0,5                               | sprint 600 +0,67 m; ganar en canyon +0,38 [0,26-0,50]                                        | FALLA                  |
| Vuelo               | RISK-1                        | Vuelos bajo el plan 1-15 % a 600                                                 | sprint 16,1-16,3 %                                                                           | FALLA                  |
| Sensación           | FEEL-2 / FEEL-3 / NRV-1       | Picada que gana puesto ≥ 35 %; 2-15 pasadas en el aire; nervio acotado           | 44-46 %; 4,1-5,8; 1,45 pruebas y 1,5 % decidido                                              | PASA                   |
| Sensación           | VIEW-1 / VIEW-4               | Solo dibuja el registro; legible a 360 px                                        | 64 px por banda; 47 de 47 números                                                            | PASA                   |
| Sensación           | VIEW-2 / VIEW-3 / STY-5       | Reconocés estilos, momentos y la Turbina                                         | Falta tu mirada                                                                              | SIN CONCLUIR           |
| Sin contra-elección | INV-3 / CP-1 / CONT-3         | Nada lee la posición de otra; mirar el campo gana ≤ 1 punto                      | 0 lecturas; −0,01 / 0,03 puntos; 92 % misma posición                                         | PASA                   |
| Ruido               | NOISE-1 / INV-2               | σ ≤ 1,05 × v2; cero sorteos en el tick                                           | 15,3 / 27,9 / 31,0 m (v2: 15,2 / 28,0 / 31,5); 32·n                                          | PASA                   |
| Determinismo        | INV-1 / INV-5 / INV-6         | v1 y v2 byte a byte; el registro no mueve la carrera                             | sha256 de 900 registros iguales; digests iguales                                             | PASA                   |
| Rendimiento         | PERF-1                        | p95 < 5 ms; ≤ 1,2 × v2 (blando)                                                  | 3,18 ms; 1,23 ×                                                                              | FALLA (blando)         |

## 5. Qué falló o quedó flojo

1. **La lucha paga poco en lo largo y se ve poco.** Canyon: ganar la línea vale +0,38 m y solo el 23 % de los vuelos
   largos tiene un momento de lucha. Sprint, al revés: la lucha entera deja +0,67 m. Subir el premio arregla uno y
   rompe el otro; un bono de aire limpio por metro daba +3,7 a +4,6 m (descartado, `tune6/s7.log`).
2. **El riesgo está mal repartido.** Bajo el plan: sprint 16,3 %, canyon 1,7 %. Caer sin energía casi no pasa
   (≤ 0,04 por carrera). INFERENCIA: con la bajada a 34 ticks el sprint pasaría.
3. **Planeo+Punta.** Las 3 fallas de WING-0: canyon a 300 y 450, ridge a 750. La Punta no vuela en la etapa 1 y
   gana cuando las voladoras pagan su vuelo con stats bajas.
4. **Técnica y Resistencia arriba.** En el canyon a 600 la Técnica es la 5.ª stat del Acecho (6,9 m contra 45 de
   Resistencia). La Resistencia no tiene rol en «sostener la altura»: arriba las piernas descansan apenas ×0,99
   (`M/flight.ts:414`); «cuerpo por banda» fue un acantilado (−5 a −11 puntos). Hueco abierto.
5. **Peregrina.** 72,4 %, contra 79-81 % en v2. Pasa la puerta, pero la parte «moneda» de su meta T46 sube 13,5
   puntos sobre v2. El vuelo suma azar; la palanca real es la segunda oportunidad de T18.
6. **Todavía se vuela poco:** 12-20 % del campo; la Punta no vuela. La puerta de la etapa 5 (≥ 25 % con 2 o más
   rasgos de vuelo) fallaría 10 de 16 chequeos. «Corren mucho pero no vuelan mucho» queda a medias hasta la etapa 3.
7. **El Acecho con stats bajas:** 12,2 % en el Circuito a 300 y 14-18 % en el Mirador a 300-450.
8. **Rendimiento y proceso.** 1,23 × v2 (tope blando 1,2). Nadie vio la vista en un teléfono real. El prototipo
   tiene ≈ 2200 líneas de motor con perillas de cada ronda: no se copia tal cual. El §17 de `diseno-v3-vuelo.md`
   dice `overDivePm` 1000; el código y la medida usan 650 (`M/flight.ts:484`).
9. **Al borde:** AIR-3 (0,88, piso 0,85), F7-3 de Cernícala (0,9 puntos), BEST-1 (Remate 7 de 12, tope 8) y
   Picada+Remate en el sprint a 750 (36-38 %, tope futuro 38).

## 6. Costo y plan por etapas

Cada paso: prototipo → arnés (dos bases) → informe → tu aprobación → implementación con tests y ADR. Todo en
ruleset v3; v1 y v2 byte a byte en cada paso.

| Etapa                             | Qué entra                                                                                                                                                         | Qué ve el jugador                                 | Tamaño (INFERENCIA)                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| 1.1 · El registro cuenta el vuelo | Eventos `takeoff`, `bandReached`, `diveStart`, `dive`, `touchdown`, `pass`, `airDirty`, `lineChange`, `nerve`; bits de altura; `flightPlan`. ADR-0009 y golden v3 | La CLI relata el vuelo; la carrera no cambia      | ≈ 300 líneas + tests                     |
| 1.2 · Arriba se lucha             | Su aire, costo por banda, aire sucio y remolque, la línea, caída forzada, nervio                                                                                  | «¡POR ARRIBA!», «LA BAJARON», «SE ACHICÓ»         | ≈ 500 líneas + propiedades               |
| 1.3 · Cuatro despegues            | Estilos, picada en el aire, habilidad cargada; Turbina y Pelotón en los Pasillos si los aprobás                                                                   | Lanza, Columna, Rampa y Turbina                   | ≈ 300 líneas                             |
| 1.V · La vista                    | Los momentos del §2.4 en `apps/web` (Táctica)                                                                                                                     | Despegar, luchar, picar e impactar en el teléfono | ≈ 200 de `race-view` + 400-600 de dibujo |
| 2 · La picada se gana             | Zarpazos del Acecho; la única de Peregrina al tocar con picada (ADR de habilidades); Visor, Piloto, cámara lenta, Director                                        | El Acecho golpea 2-4 veces; clips del vuelo       | M-L                                      |
| 3 · Todas vuelan                  | Punta a ras sobre Colina, líquido y Salto; techo del Pasillo; saltar barato; Abanico del Pelotón                                                                  | Más vuelo; aire sucio en la banda baja            | M                                        |
| 4 · Oficios de alas               | La pelea propia de cada ala                                                                                                                                       | Un gesto y una pelea por ala                      | M                                        |
| 5 · Pistas y metas                | 5 pistas nuevas y metas v3                                                                                                                                        | Tarjeta con perfil y techo                        | M                                        |
| 6 · Peleas internas               | Techo de una sola, pique en la punta                                                                                                                              | Peleas dentro de cada posición                    | M                                        |

**Etapa 1: ≈ 4 semanas para un dev solo** (INFERENCIA; el diseño decía 3 antes del nervio, la Turbina y el
Pelotón). El prototipo suma ≈ 2200 líneas de motor, 920 de tests, 145 de esquema y 325 de `race-view` (`git diff
--shortstat 7e9fddd^ 6bb4615`); sin las perillas de cada ronda, ≈ 1200-1500 (INFERENCIA). Antes de fijar
constantes: `sim:batch`, `sim:season-batch`, golden v3 dos veces, `v1-invariance` y `bench` (CLAUDE.md).

## 7. Decisiones para vos

1. **Mirar la vista 1.V en tu teléfono** (VIEW-2, VIEW-3) y, si reconocés los estilos y los momentos, aprobar
   ADR-0009 (el registro del vuelo). _Recomiendo: sí, primero._ Es lo único que falta para cerrar la revisión.
2. **Turbina y Pelotón a ras en los Pasillos.** Están prendidos y medidos: el canyon pasa de 12 a 20 % del campo
   en el aire. Piden un ADR que cambie ADR-0008:56 («Rasante: ruta × 1,1 sin despegue ni aterrizaje»). Si no, FLY-1b
   vuelve a fallar en el canyon. _Recomiendo: mantenerlos._
3. **Puertas interinas.** CONT-2: tope de la lucha entera en +1,0 m (≈ 0,07σ del sprint). WING-0: juzgar las
   etapas 1-2 a 450-600 (queda 1 falla clara) y volver a 300 y 750 en la etapa 3, cuando la Punta vuele.
   _Recomiendo: las dos._
4. **Técnica y Resistencia.** Adoptar la variante de STAT-2 (la Técnica, 1.ª del Acecho entre Técnica, Coraje e
   Inteligencia; la Agilidad, 1.ª de Rasante donde la Resistencia cumple). _Recomiendo: la variante ahora; la
   Resistencia sigue como umbral de lo largo y su regla de altura se mide en la etapa 3._
5. **T18 antes de la etapa 2.** El vuelo sube la «moneda» de la meta T46 de Peregrina 13,5 puntos sobre v2.
   _Recomiendo: priorizar la segunda oportunidad de T18 antes de sumar más azar arriba._

La Agilidad no necesita decisión: es el pilar, como la Velocidad en Umamusume, y ninguna regla v3 la toca (AGI-1).
