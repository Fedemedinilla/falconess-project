# ADR-0003: Fijar las interpretaciones y los huecos del motor de carrera v1

- Estado: **aceptado** entero (D1-D49) por el dueño del proyecto el 2026-10-28, sin puntos
  excluidos. Los términos de estilo (D44) y de regla (D45) quedan como constantes iniciales que la
  pasada de balance mide; cualquiera se neutraliza con su constante en 1000.
- Fecha: 2026-10-28 (revisión 4 tras la tercera ronda de críticos; revisión 3 tras la segunda;
  revisión 2: 2026-10-27)
- Alcance: sim, schema (`RaceRule`, D42; `RaceSkill.disabled`, D49), lote de balance (D48)

## Contexto

BRIEF §5-§7 y §12 describen el motor de carrera con fórmulas y reglas iniciales, pero deja huecos
(hp máximo, velocidad inicial, desaceleración, controladores de estilo, qué es "una evaluación" de
habilidad, cómo se realiza un "boost sostenido") y tiene contradicciones internas (el pseudocódigo
pone el boost dentro de `approach` mientras el texto dice `v += k_boost·PW`; la tolerancia de coraje
como corte de boost por encima del umbral de penalización hace que el coraje perjudique; la fórmula
de activación evaluada por tick deja a la Inteligencia sin efecto). Tres diseños independientes y dos
jueces los resolvieron; `docs/race-engine.md` es la especificación final (base: determinism-perf,
total combinado 94, con los injertos de ambos jueces y las correcciones del prototipo del editor).
CLAUDE.md exige un ADR para cambiar una regla del brief; este ADR lista cada desviación y cada
decisión de hueco, con la misma numeración que `docs/race-engine.md` §27. Una ronda de críticos
encontró once problemas (unidades sin autorización, bastidor neutro no representable, energía
varada en saltos, métricas de estilo, fabricante, firma e Inteligencia que la especificación no
producía, banda de rivales); la revisión 2 los corrige (D1, D13, D16-D18, D22, D37, D40-D47; índice en
`docs/race-engine.md` §28.1). Una segunda ronda encontró ocho más (plan de pulsos definido de tres
maneras, presupuesto del lote imposible, ablación de habilidades no construible, métrica 7 mal
mapeada, puerta parcial con etiquetas incompletas, métrica 5 inalcanzable, peculiaridades de los
rivales); la revisión 3 los corrige sin tocar ninguna regla física ni constante (D37, D40, D47-D49 y
las etiquetas de todos los puntos; índice en `docs/race-engine.md` §28.2). Una tercera ronda
encontró tres más:
- la métrica 2 no tenía regla de conteo;
- la construcción de S3 no estaba definida;
- D45 no nombraba el principio de BRIEF §7 «no como bonificación numérica» y afirmaba que todos
  los términos actúan dentro del mecanismo de su regla.

La revisión 4 los corrige sin tocar ninguna regla física ni constante (D40, D45, D47; índice en
`docs/race-engine.md` §28.3).

## Decisión

Se adoptan las reglas de `docs/race-engine.md`. Cada punto lleva una sola etiqueta, con la misma
definición que `docs/race-engine.md` §27 (revisión 3):

- **[desviación]** el punto cambia o reinterpreta una regla que el brief escribe (fórmula, línea de
  pseudocódigo, texto de regla, definición de métrica), aunque la reinterpretación sea la lectura
  que la especificación defiende como intención del brief; se nombra la sección del brief afectada.
- **[hueco]** el brief calla y el punto llena el silencio sin contradecir ninguna regla escrita.
- **[literal]** el punto conserva el comportamiento del brief, alcanzable con las constantes
  nombradas en sus valores por defecto.

La etiqueta dice por qué un punto necesita la atención del dueño, no si la necesita: la puerta G1
pide el ADR aceptado entero, huecos incluidos (CLAUDE.md: "preguntar antes de decidir"). Cuenta:
32 desviaciones, 16 huecos, 1 literal.

- **D1 [desviación: BRIEF §2 regla 2 y §6 "unidades internas ×1000"] Escalas internas** pu = 1/225 mm y vu = 1/15 mm/s. Razón: a
  15 ticks por segundo la escala literal (mm, mm/s) no representa las constantes del propio brief:
  un tick a 23,5 m/s mueve 1566,67 mm y `k_acc` 0,40 m/s² cambia la velocidad 26,67 mm/s por tick.
  pu y vu son mm y mm/s con el resto por tick guardado en el mismo entero (`pos = 225 × posMm +
  resto`); un tick mueve exactamente `v` y una aceleración en mm/s² es exactamente el cambio por
  tick, sin deriva. Las unidades públicas (1 m = 1000, 1 m/s = 1000) no cambian en ninguna frontera
  (constantes, log, documentos). Alternativa equivalente si se rechaza: dos campos por magnitud
  (`posMm` + resto, `vMms` + resto) con las mismas operaciones enteras y logs idénticos byte a byte.
  Al aceptarse, el líder cambia la línea de convenciones de CLAUDE.md por: "Unidades públicas ×1000
  (1 m = 1000, 1 m/s = 1000) en constantes, log y docs; dentro del motor de carrera, posición en
  pu = 1/225 mm y velocidad en vu = 1/15 mm/s (ADR-0003 D1)", y aplica el bloque `RACE`/`FIELD` y
  los tipos ampliados de `docs/race-engine.md` §26 en `packages/sim/src/rulesets/` (ruta protegida)
  antes del primer commit de D8.
- **D2 [desviación: BRIEF §2 regla 3 y §6 "Activación": `rng.next("race")` por tick, por corredora, por habilidad] Bloque RNG predibujado:** `n × 32` `nextU32("race")` antes del tick 0 (carril → ranura;
  habilidades en orden de id) más un `nextU32("quirks")` por portador de lucky-bolt; se consumen en el
  orden del brief (tick → carril → id). Razón: número de sorteos constante, ningún sorteo depende de la
  dinámica, números aleatorios comunes para las ablaciones de §12.
- **D3 [desviación: pseudocódigo de BRIEF §6, boost y velocidad de habilidad dentro del objetivo de `approach`] Boost y velocidad de habilidad son términos instantáneos** fuera de `approach`. Razón: el texto
  del brief (`v += k_boost·PW`); dentro del objetivo, con 0,4 m/s², un pulso de 12 ticks rinde 0,32 de
  sus 4,05 m/s y la regla Kōryū no vale nada.
- **D4 [desviación: BRIEF §6 "Salto" (tras `v = 0,4·v` se acelera con `k_acc`); la salida en sí es un hueco] Salida:** `vStart` 3 m/s y un sprint de salida de +24 m/s² hasta 0,85 × min(vBase,
  objetivo) (Umamusume reconstruido); el mismo sprint tras un salto fallido. `k_acc` se mantiene
  literal en 0,40 m/s². Razón: desde parado a 0,4 m/s² se tarda ~59 s en llegar a crucero; sin el
  sprint de recuperación un salto fallido cuesta ~12 s (medido); con él, 3,35 s.
- **D5 [desviación: pseudocódigo de BRIEF §6, `approach(v, target, accel)` "acelera o frena hacia target"] Desaceleración:** limitada a 3 m/s², separada de la aceleración. Razón: con 0,4 m/s² en
  ambos sentidos el agua de 200 m casi no frena.
- **D6 [hueco] hpMax** = 435 + 400 × L_km hp, solo de la pista. Razón: la stamina ya divide el drenaje
  (contarla dos veces la eleva al cuadrado); la parte fija hace que las pistas largas pidan stamina.
  Un 600 equilibrado termina el ridge con ~2 % de hp.
- **D7 [desviación: BRIEF §5 "se agota → velocidad cae a mínimo"] Agotamiento:** objetivo `0,85 × vBase × PWc × f_seg × (1 + ritmo)` sin agilidad; empuje
  desactivado ("velocidad cae a mínimo"); la velocidad de habilidades activas sigue sumando. Razón:
  un mínimo absoluto deja sin valor la stamina de los bastidores lentos; sin agilidad se mantiene la
  monotonía.
- **D8 [hueco] f_seg:** salto = 1,0; `radius` de curvas sin uso en v1; coeficientes explícitos;
  `segment-factor` override = máximo (independiente del orden), luego multiplicadores; acotado a
  [0,5; 1,5].
- **D9 [desviación: pseudocódigo de BRIEF §6, `e.v = applyHeatPenalty(e, e.v)` en cada tick] Penalización ×0,92 sobre la velocidad movida**, una bandera de sobrecalentamiento por tick
  calculada tras las habilidades; nunca se guarda en `v`. Razón: el orden del pseudocódigo la compone
  cada tick hacia 4,6 m/s.
- **D10 [desviación: BRIEF §6 "si heat > dissipation"] Umbral de sobrecalentamiento = dissipation × (1 + 0,3·C/1200) para toda regla salvo
  telemetry** (dissipation cruda). Razón: con el umbral literal y la tolerancia como corte de boost, el
  coraje resta (−1,44 m/s·tick por unidad de calor); así el coraje es la stat dueña de dissipation
  (§5) y "calor + ráfaga ≤ dissipation × tolerancia" significa "un pulso nunca sobrecalienta".
- **D11 [desviación: BRIEF §6-§7, la regla Steinhaus no tiene gobernador ni piso; §5 coraje "antes de cortar el boost" leído como gobernador] Gobernador de calor y licencia de sobrecalentamiento:** quien no tiene licencia nunca boostea
  por encima del umbral; Steinhaus (en el plan de sprint y el remate) y los portadores de inmunidad
  (también en su modo de estilo, dentro de su ventana) pueden hacerlo mientras su durabilidad
  proyectada tras la cola de enfriamiento quede sobre el 25 %. Razón: sin licencia la regla
  mass-thrust sería inerte; medido: una licencia también en el plan y en los estilos quemaba 104 de
  140 de durabilidad por carrera sin ganar tiempo.
- **D12 [hueco] Controladores de estilo exactos:** reservas 50/50/60 %, pelotón medio 250-750 ‰, plan de
  hover al 70 %, ground gasta el 60 % del tanque de forma uniforme antes de la final, sostén de 12
  ticks para hover y glide. Razón: §5 es cualitativo. Con las constantes del brief estos
  controladores solos dan tiempos idénticos a dive, hover y glide (cada unidad de energía vale lo
  mismo cuando se gaste); la columna "fase donde brilla" de §5 la producen los términos de D44.
- **D13 [desviación: BRIEF §5 glide "sufre si la alcanzan" y ground "resiste daño"; §6 "Pelotón: la posición solo afecta a positionRange y a la regeneración de hover"] "Glide sufre si la alcanzan"** = drenaje ×0,98 mientras lidera (revisión 2; era 0,95), que
  pierde al ser alcanzada, más el gasto para recuperar la punta; **"ground resiste daño"** = toda
  pérdida de durabilidad ×0,5. Razón: dar forma mecánica y legible a dos frases del brief; 0,9 deja
  a una glide sola sin agotarse en el cañón, y con el término de salida de D44 a 0,95 glide gana el
  44 % del cañón en S1 (a 0,98, el 33 %).
- **D14 [desviación: BRIEF §5 dive "gasta todo en descensos y en el sprint final"; los modos gastan donde el texto del estilo no lo dice] Modos genéricos del controlador:** `SURPLUS` (gastar lo que la final no puede absorber, con
  calor y agotamiento proyectado), `REGEN` (no desperdiciar regeneración con el tanque lleno),
  `PREHEAT` (quien convierte calor en energía llega caliente a la final). Razón: sin ellos los
  bastidores de pulsos desperdician ~40 % del tanque, Lumière tira su regeneración y el pasivo
  heat-to-energy vale cero.
- **D15 [hueco] Boost binario con acumulador entero** para el nivel sostenido del plan y el nivel constante de
  ground (ciclo de trabajo exacto); sin acelerador continuo en la física. Razón: un solo mecanismo
  para boost continuo y pulsos, y el `boostOn` binario del brief.
- **D16 [desviación: BRIEF §5 Inteligencia "decisión de boost ... posicionamiento" y fórmulas de §6 (la Inteligencia gana un efecto de velocidad)] Canales de Inteligencia:** juicio de ritmo por fase en `[c(I) − W0, c(I) + W0]` (ancho
  fijo, centro que sube con I) y error de percepción del plan ±We(I) sobre energía y hp; las
  compuertas usan siempre valores reales. Razón: "peor estilo = peores decisiones de boost" sin
  convertir un salto fallido en una lotería oculta. La revisión 1 usaba una ventana de media cero
  que se estrechaba con I: solo reducía la varianza, y en un campo igualado eso hace perder más
  carreras (medido: I 300 ganaba el 15,1 % y I 1000 el 6,9 % del sprint); la aptitud de estilo, que
  actúa por I, premiaba entonces la peor letra. Ahora la tasa de victoria es no decreciente en I y en
  la letra (4,3 / 8,8 / 11,1 / 12,3 / 31,3 % para I 300 / 510 / 600 / 630 / 1000), y el lote lo
  verifica (S8). El error de percepción sigue siendo de media cero: todo error cuesta tiempo, así
  que estrecharlo con I nunca invierte el orden.
- **D17 [desviación: fórmula de crucero de BRIEF §6 (se añade un factor aleatorio por fase)] Fuente de varianza añadida:** juicio de ritmo por fase con semiancho fijo W0 = 43 ‰ para
  toda I y centro de −21 a +22 ‰ entre I 0 e I ≥ 1200 (`paceHalfWidth`, `paceCentreSpan`), sobre
  crucero y `vMin`. Razón: la dispersión de §12 (0,8-2 %) es inalcanzable con la mecánica del brief
  (0,1-0,3 %); es la regla reconstruida de Umamusume (ventana de ancho fijo cuyo límite sube con la
  Sabiduría); +100 de I vale ≈ 0,36 % de velocidad (≈ 7 m en 2000 m); se apaga con
  `paceHalfWidth = paceCentreSpan = 0`.
- **D18 [desviación: BRIEF §6 "se recalcula solo si una habilidad devuelve energía"] Detalles del sprint final:** niveles de arriba abajo en pasos de 0,1 m/s que maximizan los
  metros netos en una ventana que termina 60 m antes de la meta (o en la entrada de un salto que
  contenga ese punto: `kickAt`), cortada en el agotamiento proyectado; la ventana y `capFinal`
  cuentan solo distancia y ticks donde se puede empujar (los segmentos de salto de quien no es
  ground se saltan y el acumulador no suma en ellos; la revisión 1 los contaba y dejaba energía
  varada en el aire: 12-24 unidades medidas); calor (presupuesto de la compuerta en el umbral) y hp con precio; primero los candidatos
  limpios; empate al nivel limpio más alto; remate desde los 60 m; recálculo por reembolso (brief),
  salida de salto y alas rotas, máximo 4; hover planifica al 70 %; los pulsos cuentan solo ráfagas
  enteras. Razón: el brief fija el objetivo pero no el algoritmo; con energía lineal los candidatos
  empatan si no se ponen precio al calor y al hp.
- **D19 [desviación: BRIEF §7 shiden "la 3.ª ráfaga consecutiva +accel 20 %"] pulse-chain-accel** = cada chainIndex-ésimo pulso consecutivo gana empuje ×(1 + bono);
  "consecutivo" = disparado en el primer tick legal tras el enfriamiento. Razón: lo más cercano a
  "la 3.ª ráfaga consecutiva" que se repite en cadenas largas, y no deja que el genérico supere a la
  firma.
- **D20 [desviación: BRIEF §6 "Salto": se resuelve "al entrar" y "gasta liftRequired"; orden del pseudocódigo] Saltos:** se resuelven al inicio del tick siguiente, tras las habilidades; en el aire la
  velocidad se mantiene en el crucero del segmento, sin empuje, sin velocidad de habilidad ni
  penalización; un salto logrado gasta `min(energía, liftRequired)`. Razón: que una habilidad de
  `segment: jump` pueda proteger el aterrizaje; con técnica alta el lift supera a la energía.
- **D21 [hueco] "Pierde k ticks" = parada:** cuerpo congelado, el reloj de la carrera corre, el calor se
  enfría, se regenera, cuentan los temporizadores de habilidades; sin drenaje, sin daño, sin
  decisiones; el enfriamiento de pulsos se congela. Razón: el orden de llegada sigue siendo el orden de
  cruce.
- **D22 [desviación: BRIEF §5 dive "gasta todo en descensos" y el nicho de ground "evita jump"] Reserva de salto** (pasada hacia atrás sobre los saltos pendientes) que respeta toda
  compuerta; los saltos imposibles se omiten. Razón: un `jumpFail` se lee como un problema de build.
  Consecuencia aceptada: quien vuela nunca falla un salto que puede pagar, así que el riesgo de salto
  deja de ser parte del nicho de ground ("brilla en pistas con obstáculos"); ese nicho pasa a ser el
  costo de aterrizaje y la energía de sustentación que pagan los demás (D43) frente al desvío (D46).
- **D23 [desviación: BRIEF §5 durability "daño absorbible por saltos fallidos y obstáculos" (el daño por agua es nuevo) y §7 erzherzog "obstáculos cuestan tiempo, no durabilidad"] El agua daña durabilidad** al entrar (drag × 50 md); **obstacle-armor**: sin daño en agua, y
  en salto fallido sin daño ni frenazo, parada 20 + extraTicks. Razón: el esquema dice "cuestan ticks
  en vez de durabilidad", lo que presupone daño por agua; el pasivo SSR no debe ser una pérdida neta.
- **D24 [desviación: BRIEF §6 "la probabilidad por evaluación", en "los ticks donde su trigger se cumple"] Evaluación de habilidades:** un `u` predibujado por ranura de activación; la habilidad se
  activa en el primer tick donde el disparador se cumple y `u < p(t)`; `once: false` hasta 3
  activaciones. Razón: evaluada por tick, una habilidad con piso 0,2 se activa con 96 % en un segundo
  y la Inteligencia deja de importar.
- **D25 [desviación: BRIEF §7 lucky-bolt "una habilidad aleatoria gana activationBase 1,0"] Las habilidades únicas siguen la fórmula del brief; random-skill-guaranteed fija p = 1000**
  para una activa al azar por carrera (stream `quirks`). Razón: el literal "activationBase 1,0" no
  cambia nada en 14 de 15 activas; el nombre del tipo dice "garantizada".
- **D26 [hueco] free-first-boost:** en bastidores continuos los primeros 12 ticks de boost en ese tipo de
  segmento son gratis (mientras siga en el segmento); en bastidores de pulsos, el primer pulso entero.
- **D27 [hueco] no-pulse** solo afecta a bastidores de pulsos (pasan a boost continuo); `stutter` queda inerte
  en bastidores Boneyard (asunto de contenido).
- **D28 [hueco] heat-to-energy convierte todo el calor** (calor → 0); las razones se suman con tope 1,0.
- **D29 [hueco] Repairable** cuenta los segmentos `flat` en los que se entra cruzando un límite (el segmento
  inicial no se "entra").
- **D30 [desviación: BRIEF §7 Altair "activación de habilidades +15 %"] Telemetry:** compuerta y tope en la dissipation cruda; +150 ‰ aditivo en cada activación; el
  tope de PW 1,1 ya lo aplica `resolveFrameBuild`.
- **D31 [hueco] La regeneración** se acumula en todo tick sin boost (enfriamiento de pulso, espera, aire,
  parada), por el multiplicador de pelotón.
- **D32 [desviación: BRIEF §6 "Pelotón: la posición solo afecta a positionRange ... y al bono de regeneración de hover"] Clasificación por competencia** (los empates comparten puesto); la posición alimenta también
  los controladores de estilo y el drenaje de liderazgo de glide (§6 "Pelotón" solo menciona
  disparadores y regeneración de hover). Razón: la simetría "dos builds iguales empatan".
- **D33 [hueco] Tiempo de llegada en mili-ticks; márgenes como distancia real al cruzar el anterior;
  guarda DNF de 8 × L_m + 2400 ticks.**
- **D34 [hueco] Extensiones del RaceLog:** geometría, entradas con rasgos compilados, tabla `derived`
  (incluidos los términos de estilo y de regla), libro mayor, eventos además de los seis del brief
  (entre ellos `landing`), bandera de fotograma `drafting`, muestreo común a toda la carrera con
  conteo de boost por fila, `detail: "results"`. Razón: §2.5, si falta un dato para explicar, el log se amplía.
- **D35 [desviación: BRIEF §5 durability "el resto de la carrera" (la persistencia entre carreras es nueva)] La durabilidad persiste** entre carreras de la temporada mediante `frameDurability`.
- **D36 [hueco] skillSlots** no tiene efecto en carrera; se propone para la temporada un tope de aprendizaje
  `maxLearnedSkills + skillSlots` (≤ 8).
- **D37 [desviación: BRIEF §7 kite y mule "2 peculiaridades sorteadas" (los rivales Boneyard corren con las ranuras vacías); el generador en sí es un hueco] Generador de rivales:** bastidores de clase por una banda relativa sobre el PW base del
  bastidor de la jugadora (±5 %, al menos 1, elección con reemplazo; la revisión 1 usaba ±0,15
  absoluto y al menos 3), pesos de stats por estilo sobre la curva del stub, floor(turno/12)
  activas genéricas (≤ 3), **sin piezas ni peculiaridades** (revisión 3), Rng propio
  `${raceSeed}/field`; semilla de carrera `${seed}/race/${turn}`; D12 entrega S7 (cuota de
  temporadas con `gradeFor ≥ B` por Falconess, la puerta) y, como diagnóstico, la tabla de tasa de
  paso por Falconess y objetivo. Razón: con
  PW literal un campo sin restricción decide por bastidor (pilar 2: "clase de equipo igualado"), y
  la banda absoluta no igualaba a PW bajo: Caracara (0,7) recibía nimbus (0,85, 19-24 % más rápido)
  y Cernícala (0,85) bastidores de PW 1,0 (≈ 13 %), brechas que ninguna ventaja de stats cierra; con
  ello sus objetivos T46 pasaban en el 1 % y el 0 % (jugadora en la curva de rivales). Se usa el PW
  base y no el construido para que una pieza nunca traiga una clase más rápida al campo. Por la
  misma razón los rivales no llevan peculiaridades: con dos sorteadas por cada kite o mule,
  `loose-rivets` (+0,1 PW, +14 % de crucero sobre 0,7) aparecía en al menos uno de los siete rivales
  de Caracara en el 72 % de las carreras, y sus objetivos T36 / T46 a la par caían del 53 / 6 % al
  24 / 4 % (18 / 2 % con un rival loose-rivets) entrenara como entrenara (medido con el prototipo de
  la revisión 2; la tabla a la par de §21.1 ya se midió sin peculiaridades). Es una desviación de
  "2 peculiaridades sorteadas" (BRIEF §7) solo para los bastidores Boneyard de los rivales; los de
  la jugadora siguen sorteándolas. Alternativa para el dueño: sortear solo peculiaridades sin `mods`
  y de tipos casi neutros en tiempo (activation-bonus, heat-penalty-immunity,
  random-skill-guaranteed, no-pulse, lift-bonus) y volver a medir la tabla.
- **D38 [literal] Perillas en valores neutros del brief:** `pwCruiseWeight`, `pwBoostWeight`, `stylePace`,
  `coolDissWeight`/`dissRef`, `biomeCool`, `kWater`, `kWind`; moverlas es un cambio de balance con
  reporte del lote y una línea de ADR.
- **D39 [hueco] Las stats efectivas se validan ≤ 2000, no se acotan a 1200** (solo el término de curvas y las
  ventanas de Inteligencia usan `min(x, 1200)`); pista ≤ 10 km en el validador de carrera (cotas de
  2^53).
- **D40 [desviación: definiciones de las métricas de BRIEF §12] Definiciones de métricas del lote:** métrica de estilo sobre bastidores neutros de prueba
  (S1, `rule: "none"`, D42) con los reales como diagnóstico; ablaciones pareadas con sorteos
  alineados (S4 con el interruptor `disabled`, D49; S5, revisión 3, sobre el campo neutro igualado
  con una portadora en vez del campo mixto de S2, que diluía el efecto); firma en 1 contra 1 pareado
  con genérico sin peculiaridades, la construcción de D47 e intervalo del 95 %; variante de S2 con
  PW y estilo iguales; puerta S8 de Inteligencia; una pista casa y débil a la vez cuenta como
  neutra; ninguna corredora lleva peculiaridades salvo que el escenario lo diga.

  **Conteo de la métrica 2 (revisión 4, `docs/race-engine.md` §25.2).** El campo de S2 tiene cinco
  entradas designadas, una por fabricante: cada una es un bastidor sorteado de forma uniforme entre
  los bastidores no firma de ese fabricante, y las firmas nunca entran. Las completan tres
  bastidores neutros `none`, que no cuentan para ningún fabricante (hover, stats 600). La tasa de
  victoria de un fabricante es victorias de su entrada designada / carreras; un empate en el
  primer puesto reparte la victoria. Así la cuota justa es 12,5 % para todos los fabricantes, y
  hay un veredicto por casilla casa o débil (fabricante, pista). El techo «débil ≤ 15 %» queda 2,5
  puntos sobre la cuota justa: impide que un fabricante débil la supere, pero no le exige quedar
  por debajo. Razón: con «uno por fabricante + 3 al azar» un fabricante tenía de 1 a 3 entradas.
  Solo el número de entradas daba entre 12,5 y 37,5 % de victorias (≈ 20 % de media), lo que
  incumplía «débil ≤ 15 %» sin ningún efecto de regla y podía caer en la banda de casa por suerte
  en el sorteo. La alternativa de contar la tasa por entrada se descarta: las entradas del mismo
  fabricante se quitan victorias entre sí, y la composición del campo cambiaría con cada semilla.

  La métrica 7 se mide literal (revisión 3): cuota de temporadas con `gradeFor ≥ B` ≥ 60 % por
  Falconess con la política "entrenar la stat más baja"; la versión de la revisión 2 ("pasar los
  cuatro objetivos") era necesaria pero no suficiente, porque B exige además `seasonScore ≥ 2900`.
- **D41 [desviación: BRIEF §12 "más agility nunca da peor tiempo en flat"] Propiedades de monotonía** en tres niveles (estricta sin boost; un tick sin agotamiento, una
  ráfaga para bastidores de pulsos; 0,5 % con agotamiento).
- **D42 [hueco] `RaceRule = ManufacturerRule | "none"`** (tipo nuevo en `packages/schema/src/race.ts`):
  `RaceEntry.rule` lo usa; `Manufacturer.rule` no cambia; `rules/index.ts` es un
  `Record<RaceRule, RuleSpec>` con `none` sin efecto. Solo `neutralFixtureEntry` (lote y pruebas)
  escribe `"none"`, con valores fijos (`frameId "fixture-neutral"`, `manufacturer "none"`, PW 1000,
  energy 100, dissipation 60, durability 100, rasgos por defecto) y sin `freezeEntry` ni contenido;
  en el log aparece como `rule: "none"`. Las temporadas y los golden nunca lo contienen. Razón: la
  métrica de estilo S1 y las anclas "neutral" necesitan un bastidor sin regla, y sin un miembro del
  enum solo se podría construir con `as unknown as`, que CLAUDE.md prohíbe. Es un miembro nuevo de un
  esquema nuevo, no el cambio de nombre de un campo.
- **D43 [desviación: BRIEF §6 "Salto": el salto logrado "cruza en length / v_cruise ticks" y queda resuelto; la pérdida de aterrizaje es nueva] Pérdida de aterrizaje (motivo: BRIEF §5 technique "eficiencia en obstáculos"):** al salir de
  un salto en el aire, la corredora conserva `landPm = 800 + 120·min(T, 1200)/1200` ‰ de su
  velocidad (T 300: 83 %, T 600: 86 %, T 1200: 92 %) y vuelve a acelerar normalmente; evento
  `landing`. Quien cae tras un salto fallido cruza a pie y no aterriza. Razón: con la reserva de D22
  un salto solo le costaba a quien vuela su energía de sustentación (35 de energía ≈ 7 m en el
  ridge) y el desvío de ground (45 m con 1,25) no podía compensarse nunca: ground ganaba el 1 % del
  ridge, su propio terreno. Con D43 cada aterrizaje cuesta ≈ 13,5 m a T 600.
- **D44 [desviación: BRIEF §5 describe comportamientos; §6 "Pelotón ... solo"] Términos de estilo (con las constantes del brief hace falta un mecanismo para la columna
  "fase donde brilla"):** dive "picada" (empuje ×1,4 en
  descensos y en la final: "gasta todo en descensos y en el sprint final"); hover "rebufo" (objetivo
  de velocidad ×1,02 en la fase media mientras está en el pelotón medio: "se mantiene en el pelotón
  medio"; es un efecto de posición más allá de §6 "Pelotón", que solo menciona disparadores y
  regeneración de hover); glide "salida" (aceleración ×1,1 en la fase de salida: "toma la punta");
  ground, la ruta de obstáculos (D43, D46). `stylePace` queda neutro. Medido (S1, 800 carreras por
  pista): medias del desierto dive 25,6 %, hover 26,3 %, glide 26,2 %, ground 22,0 % (revisión 1:
  25,3 / 27,6 / 33,9 / 13,2 %); glide es la más rápida en la salida en las tres pistas, hover en la
  media en el sprint y el cañón (ground en el ridge), dive en la final en las tres; ground gana el
  ridge (38 %). Las constantes son valores iniciales para D14.
- **D45 [desviación: BRIEF §7 «implementada como `ManufacturerRule` en `packages/sim/rules/`, no como
  bonificación numérica», y los textos de las cinco reglas] Términos de regla (numéricos; redacción
  de la revisión 4):** cada regla de §7 gana un término numérico, que se compila con su `RuleSpec`.

  **Los términos y su equivalente en stats** (stats 600, PW 1,0):
  - Steinhaus: enfriamiento por bioma (desierto y urbano ×0,5, tundra y montaña ×1,25). Ninguna
    stat mueve el enfriamiento con las perillas neutras de D38; en el tope de calor, el ciclo de
    boost gobernado baja de 1/3 a 1/5.
  - Kōryū: empuje de ráfaga por tipo de segmento y bioma (desierto ×1,15, descenso ×1,2, agua
    ×0,6). Es el empuje de +0,15 de PW en el desierto, sin cambio de crucero.
  - Lumière: pérdida de aterrizaje ×2 (bastidor ligero). Pierde ≈ 54 m por aterrizaje en vez de
    13,5 m a T 600, más que todo el rango de técnica (T 0 → 1200: 27,6 → 4,4 m).
  - Altair: drenaje ×0,9 y aceleración ×0,85 (gobernador de potencia) en todo segmento de toda
    pista. Equivale a ≈ +178 de stamina y −180 de técnica a 600 / 600; la técnica solo cuenta en
    la aceleración.
  - Boneyard: pérdida de aterrizaje y alargue del desvío ×0,5. Aterriza como con T 1300 y ahorra
    9 m de desvío en el ridge. Además, penalización de curvas ×1,5: la de A 300 en las curvas.

  **La desviación.** Son bonificaciones y penalizaciones numéricas, justo lo que §7 excluye. Solo
  los términos de Steinhaus (calor y licencia) y de Kōryū (ráfagas) actúan dentro del mecanismo de
  su regla, ligados a un bioma o a un tipo de segmento. Los otros tres actúan fuera de él:
  - el de Lumière, sobre el aterrizaje, no sobre la regeneración;
  - el de Boneyard, sobre aterrizajes, desvíos y curvas, no sobre la reparación;
  - el de Altair es global: no lleva clave de segmento ni de bioma y no toca su mecanismo
    (compuerta de calor, activación, tope de PW). Es un intercambio fijo de stats, y sus casillas
    salen del largo de la pista: el hp pesa en las largas y la salida pesa en las cortas.

  Ninguna regla lee un rasgo de pista directamente.

  **Razón.** Sin estos términos ninguna casilla casa/débil podía salir de una regla. Con PW igual,
  las tablas de la revisión 1 las invertían (Lumière, débil en saltos, era el bastidor más rápido
  del ridge). Con las constantes del brief, los mecanismos de regen, telemetry y repairable no
  tienen clave de terreno, y dos de ellos casi no valen tiempo: la reparación importa solo con la
  durabilidad en 0, y con `kE` 1000 la compuerta de calor casi no muerde.

  **Medido con PW y estilo iguales** (campo y conteo de S2: una entrada por regla y tres `none`).
  Con las constantes v1 salen las casillas de Altair (casa cañón 35 %, débil sprint 1 %), Boneyard
  (casa ridge 37 %, débil sprint 0 %), Lumière (débil ridge 2 %) y Steinhaus (≤ 13 %). Kōryū (pulso
  −0,1 %) y la debilidad de Steinhaus por tiempo solo aparecen cuando baja `kE` (paso 2 de D14).
  Lumière, con regeneración 0,5, domina donde no es débil (82 % del sprint).

  **Alternativas para el dueño:** (a) volver a ligar el término de Altair a su propio mecanismo o
  a una propiedad de segmento o de largo, y volver a medir la tabla de PW igual (paso 4 de D14);
  (b) rechazar los términos numéricos, con lo que §7 queda literal, la métrica 2 no tiene casillas
  hechas por reglas en v1, y un ADR mueve la métrica 2 o las casillas salen del contenido de los
  bastidores.
- **D46 [desviación: BRIEF §6 "ruta 1,25 × length"] `groundDetourMult` 1,10:** con 1,25 ground gana el
  6 % del ridge aun con D43; con 1,10, el 38 %, y S1 queda dentro del 15-35 %.
- **D47 [desviación: métrica 3 de BRIEF §12 e invariante 2 de §9, parte de D40] Construcción,
  casillas y bioma casa de S3 (revisión 4; `docs/race-engine.md` §25.2):**
  - **Construcción.** Las dos entradas son la misma Falconess, construidas con `freezeEntry`: stats
    base 600 en las cinco, ánimo 0, sus mapas reales de aptitud de bioma y de estilo, y su
    habilidad única como única activa (stoop-strike, wind-hover, scavenger-stride), sin activas
    genéricas ni piezas. En el desierto quedan A 630 / 600 / 600 e I 630 (letra A de su estilo).
  - **Peculiaridades.** El genérico no lleva ninguna: mule tiene dos ranuras sorteadas, y una sola,
    loose-rivets, cambia su tiempo ≈ 7 %.
  - **Razón de la construcción.** 600 es la construcción de referencia de los demás escenarios y
    queda cerca de la curva a la par de T46. La única es la activa con la que empieza toda
    temporada, así que es la única que «la misma Falconess» lleva siempre; una lista genérica
    sería una construcción inventada que fijaría el valor de los pasivos de activación.
  - **Consecuencias.** Stoop-strike solo puede activarse en el ridge, la única pista con descenso
    en la fase final, así que el bono final de talon-lock solo actúa allí. Wind-hover nunca se
    activa en una carrera de dos (`posFrac` vale 0 o 1000). El +150 de Altair ya satura p a I 630,
    así que mid-activation es inerte en S3.
  - **Medido** (2000 semillas × 2 órdenes de carril): peregrina 1,35 / 0,99 / 1,03; cernícala 0,14
    / 0,14 / 0,14; caracara 1,00 / 1,00 / 0,22. A lo sumo 0,01 de diferencia con la tabla de la
    revisión 3, sin activas.
  - **Veredicto.** Hay uno por casilla (par, pista), 9 casillas, sin agregar pistas: un promedio
    aprobaría un pasivo que vale ≈ 2 % en una pista y nada en las otras.
  - **Bioma casa.** Se lee como desierto para los tres pares en v1, porque no hay pistas urbanas
    ni de montaña. Para Peregrina, el desierto es su mejor letra (A) y la casa de Kōryū. Cernícala
    (urbano A, Altair casa urbano) y Caracara (montaña A; la casa de Boneyard son las pistas con
    obstáculos) no tienen pista en su bioma casa. Para ellas la puerta en las tres pistas del
    desierto es más estricta que el brief. Cuando exista una pista urbana o de montaña, su puerta
    pasa a las casillas de su bioma casa con una línea de ADR.
  - **Intervalos.** S3 y S8 se juzgan con un intervalo del 95 %. En el perfil `full` (D48), si el
    intervalo cruza un borde de la banda, se duplican las muestras (hasta 8000).
- **D48 [desviación: BRIEF §12 "10.000 carreras en menos de 60 s" y "una métrica fuera de rango
  bloquea el merge"] Perfiles y veredictos del lote (revisión 3, `docs/race-engine.md` §25.2.1):**
  el perfil `pr` es el lote del brief (`pnpm sim:batch -- --runs 10000`, < 60 s, en cada PR que toque
  `sim` o `content`), con un presupuesto fijo por escenario que suma `--runs` (S1 1200, S2 600 + 900,
  S3 2700 carreras de dos, S4 1240, S5 1440, S7 ≤ 720 carreras objetivo, S8 1200); el perfil `full`
  (`--profile full`, nocturno en `main` y a pedido, < 20 min) corre S3, S5 y S8 con su tamaño completo
  (≈ 270 000 carreras). Veredicto: falla solo si el intervalo del 95 % queda entero fuera del
  objetivo; un resultado no concluyente no bloquea el PR y lo decide el siguiente `full`; un fallo
  del `full` en `main` bloquea todo PR posterior que toque `sim` o `content` hasta corregirlo o
  mover el objetivo con un ADR. Razón: S3 (≥ 72 000 carreras) y S8 (90 000) no caben en 10 000
  carreras en 60 s; con la cuenta del brief ninguna métrica fina se puede juzgar sin intervalos.
- **D49 [hueco] Soporte de ablaciones (revisión 3):** `RaceSkill.disabled` (campo nuevo de un
  esquema nuevo: p = 0 antes de cualquier bono, término de telemetry o elección de lucky-bolt; la
  habilidad conserva su índice j, sus ranuras `4 + 3j + k` y su lugar en el sorteo de lucky-bolt;
  nunca es `true` en temporadas ni golden), `freezeSkill` exportada, `neutralFixtureEntry` con
  `skills` y `build`, `fixtureBuild` (piezas y peculiaridades sobre el bastidor neutro con la
  aritmética de `resolveFrameBuild`) y `disableSkill`; solo lote y pruebas. Razón: quitar la
  habilidad corre las ranuras de las siguientes y `activationBase = 0` no basta (Altair +150, los
  bonos de activación y lucky-bolt la pisan); una opción de `simulateRace` no sirve porque las
  opciones nunca cambian un resultado (P7).

## Consecuencias

- El motor es implementable sin preguntas una vez pasada la puerta de `docs/race-engine.md` §0.2
  (este ADR aceptado entero, la línea de CLAUDE.md, el bloque de constantes y los tipos en la ruta
  protegida), y determinista por construcción (sin sorteos dentro del bucle, enteros con cotas
  probadas); los golden y las ablaciones son estables.
- Las constantes del brief se mantienen salvo `groundDetourMult` (1,25 → 1,10, D46); las nuevas
  viven en `rulesets/v1/constants.ts` con su intención en `docs/formulas.md`. Las perillas de
  balance (`pwCruiseWeight`, `pwBoostWeight`, `stylePace`, `coolDissWeight`, `biomeCool`) arrancan
  neutras; los términos de estilo (D44) y de regla (D45) son reglas de v1 con valores iniciales.
- Riesgos medidos que el lote D14 debe atender, en este orden (race-engine.md §25.3): PW domina con
  valores literales (R1); la economía de energía es lineal y vale ~1 sigma, así que los términos que
  actúan por empuje o calor son pequeños hasta bajar `kE` (R2); Lumière con regeneración 0,5 domina
  donde no es débil (R9); la métrica genérico/firma está fuera de banda en los tres pares y solo el
  contenido la arregla (R14, con la construcción de D47: peregrina 1,35 / 0,99 / 1,03; cernícala 0,14;
  caracara 1,00 / 1,00 / 0,22, contra 0,85-0,90); las casillas de fabricante necesitan el juego de energía antes de
  comprimir PW (R15); la métrica 7 es la nota (≥ B en el 60 % de las temporadas por Falconess), no
  las tasas de paso, que quedan como diagnóstico de D12 (R16); la persistencia de durabilidad cambia
  la temporada; la métrica 5 (ninguna pieza > 3 puntos, es decir ≤ 0,16-0,19 % de tiempo) no se
  alcanza con `pwCruiseWeight`, `kE` ni `kCurves` sin borrar lo que gobiernan: el estabilizador vale
  2,26 % en el sprint (3,96 % en Boneyard, que pierde su casilla débil), una turbina +0,1 vale 2,5 %
  aun con peso 250 y las baterías empeoran con `kE` 250; hacen falta tickets de contenido
  (estabilizador ≈ 0,97, turbinas ≈ +0,01-0,02 PW, baterías ≈ +5 tras el paso 2) o un ADR que mueva la
  métrica (R18).
- Puertas abiertas: carriles (`radius` reservado), ranuras RNG reservadas (28-31), reglas nuevas como
  un `RuleSpec` más.

## Alternativas descartadas

- `k_acc` como paso por tick (400 mm/s por tick = 6 m/s²): cambia la unidad de una constante del brief
  ×15, vuelve instantáneas las transiciones de terreno y saca las habilidades de aceleración de banda.
- Umbral literal en dissipation con la tolerancia como corte de boost: el coraje perjudica.
- Acelerador continuo (throttle) para el boost: dos mecanismos (continuo y pulsos) en vez de uno.
- Habilidades únicas siempre activas; forma de día de carrera (un sorteo, sin stat); ruido en 12
  secciones de ±8-11 % (se lee como lotería); sesgo de juicio en las compuertas (lotería oculta).
- hpMax proporcional a la longitud; velocidad mínima absoluta de 17 m/s.
- El conjunto de constantes ajustado por el diseño de balance (k_e 0,25, PW 50/500 ‰, regen 0,06,
  ritmos por estilo): queda como hipótesis documentada de la pasada de balance D14 (el desvío 1,10
  se adopta en D46, medido con las reglas de la revisión 2).
- Identidad de estilo con `stylePace` (multiplicador de velocidad por estilo y fase): es un bono
  numérico, no un comportamiento; queda como último recurso de D14 con su línea de ADR.
- Dejar que dive gaste en descensos hasta su necesidad de salto para que un error de ritmo o de
  percepción lo deje sin energía antes del salto: devolvería a ground el nicho de riesgo, pero solo
  mediante un error de juicio sobre la compuerta, la "lotería oculta" que los jueces rechazaron.
- Escalas literales del brief (mm y mm/s) con redondeo por tick: deriva que depende de la tasa de
  ticks; la variante con restos en dos campos es equivalente a D1 y queda como alternativa si el
  dueño rechaza D1.
- Banda de rivales absoluta (±0,15 PW, mínimo 3): no iguala la clase a PW bajo (D37).
- Rivales con dos peculiaridades sorteadas, o con la banda calculada sobre el PW construido y
  re-sorteo hasta entrar: `scrap-heart` (regen 0,25 ≈ 2,4 %) y `mud-runner` (≈ 2 % en el cañón) no
  tocan el PW y siguen decidiendo el campo (D37).
- Aceptación parcial de este ADR (D1 y los puntos marcados como desviación): con etiquetas
  incompletas dejaba pasar a D8 cambios de reglas del brief sin aceptar, y la puerta no era
  verificable (revisión 3, G1).
- Puerta de D12 por "pasar los cuatro objetivos en el 60 % de las temporadas": necesaria pero no
  suficiente para la nota B de la métrica 7 (D40).
- Desactivar habilidades con una opción de `simulateRace`: las opciones nunca cambian un resultado
  (P7); el interruptor va en la habilidad congelada y se ve en el log (D49).
- S3 y S8 con su tamaño completo dentro del lote de cada PR: 162 000 carreras, fuera de los 60 s del
  brief (D48).
- Alcanzar la métrica 5 con las perillas del motor: haría falta un peso de PW ≈ 20 ‰ (sin clases de
  bastidor) y una penalización de curvas ≈ 10 ‰ (sin término de curvas); la métrica se ataca con
  contenido o se mueve con un ADR (R18).
- Métrica 2 con el campo «uno por fabricante + 3 al azar», sumando las victorias de todas las
  entradas de un fabricante: medía el número de entradas (12,5-37,5 %, ≈ 20 % de media), no la
  regla. Tampoco se usa la tasa por entrada sobre ese campo: las entradas del mismo fabricante se
  quitan victorias entre sí (D40).
- S3 con una lista fija de activas genéricas: sería una construcción inventada cuyo reparto por
  fases fijaría el valor de los pasivos de activación. S3 con veredicto agregado por pista:
  aprobaría un pasivo que vale ≈ 2 % en una pista y nada en las otras (D47).
- Llamar a los términos de regla «parte del mecanismo de la regla»: es falso para Lumière,
  Boneyard y Altair, cuyo término es global; D45 los declara bonificaciones numéricas, en
  desviación de BRIEF §7.
