# ADR-0007: Pistas sin biomas ni clima

- Estado: **decisión del dueño (2026-10-31); implementación en la rama `nobiome`, pendiente de que
  el líder la integre**. Cinco detalles de la implementación son elecciones provisionales que el
  dueño puede cambiar sin tocar el resto («Elecciones provisionales»).
- Fecha: 2026-10-31
- Alcance: schema (`core`, `course`, `falconess`, `season`, `build`, `race`, `blackbox`,
  `manufacturer`), content (pistas, Falconess, fabricantes, `text/es.json`), sim (rulesets v1 y v2,
  stats, motor de carrera, temporada, campo de rivales, golden), race-view, cli, web, docs.
- Deja sin efecto: ADR-0003 D47 («bioma casa» leído como desierto) y la parte de D45 y D55 que
  dependía del bioma (términos de regla por bioma, `geometry.biome` en el log). ADR-0003 y ADR-0005
  no se reescriben: son el registro de lo que se decidió entonces.

## Contexto

El dueño, el 2026-10-31:

> «Ya no más biomas para pistas. Lo agregaremos después si es necesario. Por ahora, todas serán el
> mismo terreno, mismo clima. Hay que quitar todo lo que sea dependiente del bioma.»

Las características de una pista son abstractas: una pista solo sabe que tiene un Salto, Terreno
líquido, una Colina o una Bajada (y curvas, que son la forma de la pista). La piel visual puede
cambiar por pista (una colina puede ser una montaña, un edificio o una duna); las reglas no lo
leen. El clima se va: no hay viento.

Las tres pistas de v1 eran del desierto, así que el bioma solo movía tres cosas: la letra de bioma
de cada Falconess sobre `agility`, el viento del cañón y las casillas casa y débil de los
fabricantes ligadas al desierto.

## Decisión

1. Se quitan los biomas de todo, también de los rulesets v1 y v2 (que no se duplican: el dueño
   aceptó que los guardados, las repeticiones y los digests viejos cambien).
2. Toda constante por bioma pasa a un solo número, **su valor del desierto**, para mover el balance
   lo menos posible. Las letras de bioma desaparecen (sin multiplicador: ×1000). Para Peregrina las
   dos reglas chocan (su letra del desierto era A, ×1050): manda la regla explícita de las letras,
   y de ahí sale su −4,8 % de `agility`. La casa y la debilidad de un fabricante en el desierto sí
   siguen la regla del valor del desierto: pasan a valer en todas las pistas (`everywhere`).
3. Se quita el viento: el segmento `canyon` ya no tiene `wind` y su factor es 1000.
4. Los ids de pista pierden el prefijo `desert-` y los nombres visibles pasan a ser neutros; el
   agua se presenta como «Terreno líquido».
5. No se recalibra el balance: se mide y se reporta («Efecto medido»).

## Qué se quitó (lista exacta)

**Esquema** (`packages/schema`):

- `Biome`, `BIOMES` y `BiomeAptitudes` (`core.ts`).
- `Course.biome`; el campo `wind` del segmento `canyon` (queda `{ type, length }`).
- `Falconess.biomeAptitude`, `SeasonState.biomeAptitude`, `Build.biomeAptitude`,
  `EntryInput.biomeAptitude` (entrada de carrera).
- En el `RaceLog`: `derived[].biomeAptitude` (la letra aplicada) y `geometry.biome` (ADR-0003 D55).
  El `param` de un tramo `canyon` es 0.
- En la caja negra: la variante `aptitude.kind: "biome"` (queda solo `kind: "style"`).
- En fabricantes: `Terrain.biomes` de `home` y `weak` (quedan `segments` y `traits`). Se agrega
  `Terrain.everywhere` (booleano, `false` por defecto): una casa o debilidad que vale en toda pista,
  que es lo que fue un bioma que cubría todas las pistas de v1.

**Constantes** (`packages/sim/src/rulesets/v1/constants.ts`; v2 hereda la carrera de v1):

| Antes                                                                               | Después                                                                           |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `kWind` 1000                                                                        | quitado                                                                           |
| `biomeCool` 1000 en los cinco biomas                                                | quitado (`cool0 = max(1, fl(kCool × dissF, 1000))`, el mismo número)              |
| `massThrustCoolPm` { desert 50, mountain 1250, coast 1000, urban 500, tundra 1250 } | `massThrustCoolPm` 50                                                             |
| `pulseBiomePm` { desert 1450, otros 1000 }                                          | `pulseBasePm` 1450 (renombrado; también `RuleTerms.pulseBiomePm` → `pulseBasePm`) |

`SPEC_RULESET` (la copia congelada de ADR-0003 para los tests) hace lo mismo con sus valores del
desierto: `massThrustCoolPm` 500 y `pulseBasePm` 1150.

**Contenido:**

- `biome: "desert"` de las tres pistas; `wind` −0,1 (600 m) y +0,15 (400 m) del cañón.
- `biomeAptitude` de las tres Falconess (Peregrina tenía A en desierto; Cernícala y Caracara, B).
- Fabricantes: Kōryū casa `desert` → casa en todas las pistas (`home.everywhere`); Steinhaus
  débil `desert` → débil en todas (`weak.everywhere`); se quitan Altair casa `urban`, Lumière casa
  `coast` y `urban`, Steinhaus casa `tundra` y `mountain` y débil `urban`. Boneyard no tenía
  biomas. Las casillas de la métrica 2 quedan iguales a las de v1.
- Textos: `biome.coast/desert/mountain/tundra/urban` y `ui.turn.aptitude.biome`;
  `ui.race.track.meta` pierde `{biome}`.

**Efectos que solo existían fuera del desierto (quitados, ninguna pista los usaba):** el
enfriamiento de Steinhaus en montaña y tundra (1250), costa (1000) y ciudad (500); el empuje de
Kōryū fuera del desierto (1000); la casa de Altair en ciudad, la de Lumière en costa y ciudad, la de
Steinhaus en tundra y montaña y su debilidad en ciudad. Ninguna habilidad, pieza, peculiaridad,
bastidor ni pasiva leía un bioma; las pasivas `talon-lock` y `scrap-armor` y la habilidad
`canyon-sense` leen el segmento `canyon`, que se conserva.

**Interfaz:** la fila de letras por bioma (perfil, nueva temporada), el bioma y su letra en el
panel de la carrera objetivo, el bioma del encabezado de la repetición (web) y de `sim:race` (CLI),
los cinco íconos de bioma; el ícono del cañón ya no es viento.

## Qué se renombró

- Ids de pista: `desert-sprint` → `sprint`, `desert-ridge` → `ridge`, `desert-canyon` → `canyon`
  (archivos, `seasonGoals`, golden, fixtures, e2e, bench, CLI por defecto).
- Nombres: «Sprint de las Dunas» → «Sprint»; «Cresta del Espinazo» → «Pista de saltos»;
  «Garganta del Viento Rojo» → «Pista larga».
- Segmentos: `water` «Agua» → «Terreno líquido»; `climb` «Subida» → «Colina»; `canyon` «Cañón» →
  «Pasillo». Los textos que decían agua, subida o cañón siguen ese cambio (`mud-runner` «Pisada
  firme», `water-skimmer` «Rasante», `canyon-sense` «Sentido del pasillo», el daño por terreno
  líquido en la carrera de la web y de la CLI).
- Eventos de temporada: `ev.sandstorm-week` («Tormenta de arena») → «Mantenimiento: la pista cierra
  dos días»; `ev.luck-tailwind` deja de hablar de viento de cola. Ids y mecánica iguales.
- Métrica 1 del lote: de «por bioma» (`desert/<estilo>`) a «todas las pistas» (`all/<estilo>`), el
  mismo promedio de las tres pistas. La clave de la línea base cambia.

## Elecciones provisionales (el dueño puede cambiarlas)

1. **Segmento `canyon`:** se conserva el tipo, sin datos, con el nombre «Pasillo». Rinde como un
   llano; lo siguen leyendo `canyon-sense`, `talon-lock` y `scrap-armor`. Quitarlo movería más el
   balance (Boneyard repara +2 por cada llano nuevo) y renumeraría los tipos de segmento.
2. **`climb` se llama «Colina»**, como dijo el dueño.
3. **Ids `sprint`, `ridge`, `canyon`:** coinciden con los golden. «ridge» y «canyon» siguen siendo
   palabras geográficas en el id (no en el texto); la alternativa neutra sería `jumps` y `long`.
4. **Eventos de clima de la temporada** (`sandstorm-week`, `luck-tailwind`, `luck-sky-gust`,
   `luck-stormy-night`): se conservan (quitarlos cambia los sorteos de eventos); solo cambia el
   texto de los dos que hablaban de arena y viento de cola. Ráfaga y tormenta quedan como sucesos
   de la semana, no como clima de una pista.
5. **`wind-hover`** (única de Cernícala) y `second-wind` conservan id y nombre: no leen viento.

La herencia queda con la aptitud de estilo: hoy las tres Falconess registraban su A de bioma (se
consideraba primero y ganaba el empate); ahora registran su A de estilo (Peregrina picada, Cernícala
suspensión, Caracara rasante), que al heredarse sube `intelligence` en vez de `agility`.

## Digests, golden y fixtures regenerados

- **Golden v1** (`tests/golden/v1`, 12 archivos): `pnpm golden:update -- --yes` dos veces, idénticas
  byte a byte. Cambian todos por la forma del log (sin `geometry.biome` ni `derived[].biomeAptitude`,
  ids nuevos). Los resultados de g01, g02, g04, g07, g10 y g11 (sprint y ridge sin Peregrina) son los
  mismos; g05 y g08 (Peregrina sin su A) cambian tiempos sin cambiar el orden; los cuatro del cañón
  (g03, g06, g09, g12) cambian tiempos, y g03, g06 y g09 también el orden.
- **Invariancia de v1:** los digests de `5f0fd65` ya no valen (el estado perdió `biomeAptitude`,
  Peregrina su A y el cañón su viento). Se grabaron de nuevo, del mismo modo y dos veces idénticas,
  en `packages/sim/src/season/__fixtures__/v1-invariance-adr0007.json` (el de `5f0fd65` se borró;
  queda en la historia). El playtest 1 del dueño termina igual (B, puestos 1, 1, 2, 1) con otro
  estado intermedio. De las 30 temporadas mixtas, 6 cambian de largo y 3 de nota (Peregrina C → D,
  D → E, C → E). v2 no tenía digests fijados: sus estados cambian por la misma forma.
- **Anclas del prototipo:** el prototipo del spec (`.work/proto/proto2`) sin el viento da los tiempos
  del motor al milítick (solos tranquilos y con ruido, el campo de ocho, la dispersión de 300
  semillas). Las tablas de 25.4 y los valores trabajados de 11.4 y 14.4 del cañón se rehicieron con
  esa corrida (`docs/race-engine.md`).
- **CLI:** los logs de los fixtures se editaron a mano (sin bioma, ids nuevos, `param` 0 en el
  cañón; la carrera del cañón sigue siendo la que corrió con viento, como ya pasaba con D56) y el
  snapshot se regeneró: cambian el encabezado y los nombres. Dos campos de prueba de los consejos
  del cañón cambiaron de semilla (`advice-4`, `pt8-canyon`): sin viento la que estaba gastada
  ganaba y la Steinhaus ya no se sobrecalentaba.
- **Guardados web:** son semilla + entradas; cargan, pero al rejugarlos dan otro resultado. Un
  `start` con padres cuya caja negra sea `kind: "biome"` ya no pasa el esquema.

## Efecto medido (sin recalibrar)

`pnpm sim:batch -- --runs 10000` (perfil pr) y `pnpm sim:season-batch -- --runs 500`, antes
(`playtest-ui` en `419deee`) y después, en v1 y v2. Ojo: las semillas del lote incluyen el id de la
pista, así que renombrar las pistas vuelve a sortear todo; las diferencias pequeñas en sprint y
ridge son ruido de muestreo, no reglas.

| Métrica                                             | Antes                                               | Después                                                                      |
| --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1 · estilo (dive / hover / glide / ground)          | desierto 25,1 / 26,9 / 23,6 / 24,3 %                | todas 27,3 / 26,0 / 25,5 / 21,2 % (pasa)                                     |
| 2 · Kōryū                                           | casa sprint 42,5 %, casa ridge 35,5 %, cañón neutro | casa ridge 30,0 % (inconclusa), débil cañón 8,5 % (pasa), sprint sin casilla |
| 2 · Steinhaus                                       | débil en las tres (0,5 / 7,0 / 5,5 %)               | sin casillas                                                                 |
| 2 · Altair cañón (casa)                             | 42,5 % (inconclusa)                                 | 33,5 % (inconclusa)                                                          |
| 3 · firma, Peregrina sprint / ridge / cañón         | 0,81 / 0,90 / 0,86                                  | 0,91 / 0,83 / 0,86 (inconclusas, pr)                                         |
| 6 · dispersión cañón                                | 1,07 %                                              | 1,03 %                                                                       |
| 7 · temporada v2 (Caracara / Cernícala / Peregrina) | 76,7 / 48,3 / 88,3 %                                | 75,0 / 51,7 / 78,3 %                                                         |
| 7 · temporada v1                                    | 80,0 / 73,3 / 85,0 %                                | 81,7 / 75,0 / 83,3 %                                                         |

Veredicto del lote: inconcluso antes y después, en v1 y en v2 (ninguna casilla falla).

Temporada (`sim:season-batch`, 500 por Falconess):

|                                           | Antes v2       | Después v2     | Antes v1            | Después v1          |
| ----------------------------------------- | -------------- | -------------- | ------------------- | ------------------- |
| Peregrina completa / ≥ B / gana objetivos | 89 / 87 / 49 % | 82 / 80 / 43 % | 88 / 85 / 59 %      | 85 / 81 / 55 %      |
| Cernícala                                 | 62 / 61 / 28 % | 63 / 62 / 27 % | 76 / 72 / 45 %      | 77 / 73 / 44 %      |
| Caracara                                  | 72 / 72 / 36 % | 72 / 72 / 36 % | ≥ B 73 %, gana 46 % | ≥ B 73 %, gana 46 % |

Lectura:

- **Peregrina pierde su A de desierto** (−4,8 % de `agility` efectiva en toda carrera): es el único
  cambio grande. En v2 su métrica 7 baja 10 puntos (88 → 78 %) y su temporada completa baja 7 (89 →
  82 %); sigue pasando la métrica 7 y la puerta de D12 (≥ B 80 % contra 60 %).
- **Sin viento, la pista larga es más rápida** (el tramo de 600 m pasa de 0,90 a 1,00 y el de 400 m
  de 1,15 a 1,00): ≈ 1 s menos para un neutro (135,94 → 134,90 s). El planificador sale más tarde
  (1,80 m/s desde 2401 m en vez de 2365 m). S1 en el cañón pasa de 22 / 29 / 33 / 16 a 24 / 29 / 32
  / 16 % (anclas del motor, 800 carreras).
- **Métrica 2 cambia de forma, no solo de número:** Kōryū pierde su casa en el sprint (era solo por
  el desierto) y el cañón pasa de neutro a débil (agua); Steinhaus se queda sin ninguna casilla, así
  que su regla ya no se mide. Que una escuela no tenga casa ni debilidad es una pregunta para el
  dueño (T5 de `docs/design/temporada-v3.md`).
- Cernícala y Caracara casi no cambian (tenían B en desierto). Cernícala sigue siendo la que falla
  la métrica 7 en v2 (51,7 %, inconclusa), como antes.

`pnpm bench` sigue bajo el presupuesto (la puerta del p95 se movió al id `canyon`).

## Consecuencias

- Una pista nueva se escribe solo con segmentos y rasgos; si un día vuelven los biomas, entran con
  un ADR nuevo, sus campos y sus constantes, sin reabrir este.
- Los guardados y repeticiones anteriores a este cambio cargan pero no reproducen su resultado.
- La línea base de `sim:batch` (`out/baseline.json`) hay que regenerarla: las claves de casilla
  cambiaron (`desert/dive` → `all/dive`, `koryu/desert-sprint` → `koryu/sprint`).
- `docs/tutorial/build.py` cambió su texto de aptitudes; el PDF del tutorial no se regeneró.
