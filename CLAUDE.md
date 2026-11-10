# Falconess (nombre provisional)

Simulador de crianza estilo Umamusume: corredoras adultas con alas mecánicas, carreras todoterreno
deterministas, gacha sin pay-to-win. Fuente de verdad del diseño: docs/BRIEF.md. Plan de trabajo:
docs/ROADMAP.md. Leer ambos antes de cualquier tarea de diseño o de balance.

## Arquitectura (no negociable)

- packages/sim es TypeScript puro: sin DOM, sin Date, sin Math.random, sin Math.pow/sin/cos, sin imports
  de React/Phaser/Supabase. Aleatoriedad solo con rng.next*(stream). Aritmética de carrera en enteros.
  tests/repo/purity.test.ts lo verifica en cada commit.
- packages/schema es la única definición de datos. Tipos con z.infer; nunca interfaces paralelas.
- Contenido en packages/content como JSON validado. El código no contiene prosa de juego.
- apps/web y Phaser solo leen estado y logs. Si falta un dato en el log, se amplía el log.
- Todo estado y contenido lleva rulesetVersion. Los rulesets viejos no se borran.
- Puertas abiertas: gacha y multiplayer están fuera de foco, pero sus esquemas (GachaPool, Build,
  BlackBox) y las decisiones que los hacen posibles (semilla + inputs, sim sin dependencias) se conservan.

## Flujo de trabajo

1. Plan primero: para cualquier cambio en sim, schema o rulesets, presentar el plan y esperar aprobación.
2. Test que falla → implementación → `pnpm typecheck && pnpm test` → commit pequeño con mensaje imperativo.
3. Cambios de balance: modificar constantes en packages/sim/src/rulesets/v1/constants.ts, correr
   `pnpm sim:batch`, pegar el diff de métricas en el PR. Nunca ajustar números sin el reporte.
4. Preguntar antes de decidir cuando la especificación no cubra el caso; no inventar reglas.
5. Balance de la carrera v3 (ADR-0010, docs/design/barandas-balance.md): el motor está congelado,
   solo se corrigen errores. Un cambio de balance usa una sola palanca de contenido (pistas y
   calendario, letras, crecimiento, kit), pasa las ocho barandas B1-B8 en las dos bases de semillas
   y lleva nota de cambio. Nunca agregar una regla de motor para mover un número. Los umbrales no se
   tocan sin un ADR nuevo.

## Prohibido sin aprobación explícita

- Editar tests/golden/, docs/characters/, packages/sim/src/rulesets/, o archivos con "handwritten": true.
- Agregar dependencias a packages/sim.
- Cambiar nombres de campos de esquemas (requiere ADR en docs/decisions/).
- Usar `any`, `as unknown as`, `// @ts-ignore`.

## Convenciones

- Identificadores en inglés; texto de juego en packages/content/text/<lang>.json con claves.
- Ids de contenido en kebab-case. Un archivo JSON por entidad (quirks.json y gacha.json son la excepción).
- Fórmulas documentadas en docs/formulas.md con intención y rango esperado antes de implementarlas.
- Commits: feat/fix/balance/content/docs + alcance (`balance(race): reduce k_boost to 2.8`).
- Multiplicadores en per-mille (1000 = ×1.0). Unidades públicas ×1000 (1 m = 1000, 1 m/s = 1000) en constantes, log y docs; dentro del motor de carrera, posición en pu = 1/225 mm y velocidad en vu = 1/15 mm/s (ADR-0003 D1).

## Comandos

pnpm typecheck · pnpm test · pnpm test:golden · pnpm lint · pnpm content:validate · pnpm bench
pnpm sim -- --seed 42 --falconess peregrina · pnpm play -- --seed 42 --falconess peregrina
pnpm sim:race -- --seed 1 --course ridge · pnpm sim:batch -- --runs 10000
pnpm sim:season-batch -- --runs 500 · pnpm golden:update -- --yes (solo el líder, con ADR)
Detalle de cada comando: docs/commands.md.

## Lecciones aprendidas

(Al cerrar cada tarea, agregar aquí en una línea lo que conviene recordar. No borrar entradas.)
- El test de pureza también lee strings y JSDoc: `**` en un literal dispara la regla del operador exponente.
- Encadenar `floor` en una fórmula multiplicativa pierde puntos: multiplicar todo y redondear una vez al final.
- `structuredClone` no está en `lib: ES2022`; `packages/sim` clona el estado con JSON porque el estado es el formato de guardado.
- Las ganancias de entrenamiento 8–14 del brief dejan la temporada en ~135 por stat con 48 turnos; la base inicial recalibrada es 44–76 (ver docs/formulas.md).
- El RNG por input se deriva de `seed/inputsApplied`: el estado no carga RNG y la reproducción es trivial.
- Biome 2.6 también formatea Markdown (y sus bloques de código): nunca correr `biome --write` sobre docs/; el formateador está apagado para docs/race-engine.md.
- `noUncheckedIndexedAccess` también afecta a los arrays tipados (Int32Array): las lecturas llevan `?? 0`.
- Los tests quedaban fuera de `tsc -b`; `tsconfig.tests.json` los incluye en `pnpm typecheck`.
- `Rng.nextRange(x, x)` no consume sorteo: un ruleset con ruido 0 desplaza los sorteos siguientes del mismo stream.
- El loader de tsx no pasa a los worker threads: los workers del lote arrancan con `worker-boot.mjs`, que registra `tsx/esm/api`.
- Commits con la identidad configurada del entorno (firma incluida); nunca pasar `-c user.email`. Los worktrees de agentes pueden nacer de `main`: resetearlos a la rama de trabajo antes de empezar.
- El prototipo del spec (`.work/proto`, local, no versionado) fue el oráculo del motor: con la misma entrada da el mismo resultado; útil para depurar diferencias.
- Agregar un campo al RaceLog hace fallar todos los golden y los fixtures de la CLI por el esquema estricto: regenerarlos con su ADR en el mismo cambio.
- Con conteos chicos (S3 en pr) el intervalo normal de la media colapsa: usar intervalos de puntuación.
- Antes de suponer que la política de referencia gasta puntos de habilidad, medirlo: con la economía v1 nunca llega a 60.
- Los e2e web de v2 juegan hasta encontrar la escena (un fallo, un evento, la deriva del ánimo) en vez de fijar los sorteos de una semilla: el contenido v2 nuevo cambia los sorteos de eventos y rompería esas semillas.
- Una regla nueva de temporada va detrás de constantes cuyo valor viejo no sortea (una opción, probabilidad 0): `v1-invariance.test.ts` compara v1 con los digests de `5f0fd65`, y un estado solo avanza con el ruleset con el que empezó.
- Un archivo de contenido nuevo no invalida la caché de módulos de Vitest (el `import.meta.glob` de la web queda viejo y `load.test.ts` falla): `pnpm vitest --clearCache`.
- Un evento de suerte (`auto`, v2) se aplica en la misma entrada, después de la acción: un test que mide el ánimo o el vigor de una semana v2 usa contenido sin eventos `auto`.
- En v2 un ánimo −1 le cuesta a la política cuidadosa ≈ una semana (≈ −5,7 puntos de B por evento) y un ánimo +1 vale ≈ +14 a la que nunca sale: los eventos de ánimo van con poco peso; medir cada tipo de efecto por separado antes de pesar contenido nuevo.
- Lo que agregó una entrada al log de temporada (notas, deltas, evento y su contenido) se lee con `stepLog` y `resolveLoggedEvent` de `@falconess/race-view`: la CLI y «Lo que pasó» los comparten; en los e2e el emoji del `<Icon>` entra en `textContent`.
- La métrica 7 es por Falconess: la media de las tres (64 % en v2) escondía que Cernícala falla (56 % en 1500 temporadas); reportar cada Falconess con Wilson y en más de una base de semillas antes de decir que pasa.
- «Lo que pasó» se mide en temporadas enteras a 390 × 700 (el peor caso es la semana de carrera con consejo y evento, no una semana normal), y un modal que abre justo después de cerrar otro con Enter enfoca su título, no su primer botón.
- Un texto de la página sobre un efecto sale del log o del estado, no de una frase fija: el ánimo topa en −2 y +2 (ahí la deriva, un fallo, un descanso o una salida no lo mueven) y un evento puede anular el vigor de la acción. Un layout se barre de 360 a 1600 px con las fuentes reales y con las de reserva (las de los e2e de la app, más anchas): la barra superior pide ≈ 70rem con unas y ≈ 78rem con las otras.
- Las semillas de `sim:batch` incluyen el id de la pista: renombrar una pista vuelve a sortear todo el lote, así que un antes/después de un cambio que renombra separa el ruido del efecto (ADR-0007). El prototipo `.work/proto/proto2` sigue sirviendo de oráculo si se le pasa la pista editada (por ejemplo, sin `wind`).
- Un renombre de campo del estado no obliga a regrabar los digests de `v1-invariance`: el test lleva el estado a la forma con que se grabaron (`legacyState`) y así prueba que el cambio no movió ni un sorteo (ADR-0008). Antes de regenerar golden, compararlos en la forma vieja.
- Para saber si una elección del jugador paga, correr la misma carrera con cada opción (misma semilla y mismo campo, diferencia pareada) y repetirla con las letras en B: en ADR-0008 la A de la posición por defecto decidía todo y la conducta casi no movía el resultado.
- Al separar un concepto en dos (ADR-0008: alas y posición), revisar en es.json cada texto que nombra el viejo y cada palabra nueva que ya tenía otro uso (los modos decían «caza en planeo» para cualquier posición; «Remate» era también la marca de los últimos 60 m y «Pelotón» un botón de vista): los ids del log pueden quedar, las palabras no.
- Un ruleset borrador puede vivir fuera de `rulesets/` (protegido) si el motor lo detecta por sus constantes (`flightOf`, design7): v1/v2 quedan iguales byte a byte y el arnés lo prueba; la picada como `vCore += Δv` suma un término cruzado Δv·(v − objetivo)/kDecel (11 m en sprint, 15 en canyon en vez de 6): medir los metros pareados, nunca la cuenta del ledger.
- Volar sin sorteo de ritmo baja la varianza de la voladora: en una carrera de 8, a igual media, la más constante gana menos (design7 ronda 1: el Acecho perdía 0 m pareados y caía de 26 a 12 % del sprint). Antes de culpar a la media de una regla, medir la diferencia pareada en metros y la parte de la varianza.
- El arnés de design7 cachea cada trabajo por el hash de su JSON, y el de v3 es `{"v":"v3","flight":{},"race":{}}` aunque cambien las constantes por defecto: antes de medir una ronda nueva, sacar del caché los trabajos v3 (los v2 pueden quedar).
- Una habilidad de velocidad que se dispara en el aire se pierde (en el aire no hay empuje ni habilidades): en el ridge v3 las Remates sobrevuelan la Bajada de la final y la única de Peregrina (final + Bajada) se gasta volando; antes de culpar a una stat, mirar qué disparadores caen dentro de un vuelo.
- Un registro nuevo se prueba inmóvil con un digest proyectado a los campos viejos tomado antes de tocar el motor (design7 `harness/inv5.ts`): con las perillas nuevas en su valor viejo el v3 dio la ronda 2 byte a byte. Lo que se confirma más tarde (una pasada que se sostiene 8 ticks, aire sucio de 15 ticks) entra al registro como candidato en su lugar y se descarta si no se sostiene, como `boostMode`.
- Para saber por qué una Falconess pierde una meta, medir su ventaja sobre la rival del puesto que necesita en cortes de la pista (design7 `tune3/t46gap.ts`): en T46 Peregrina no perdía en el aire sino en la primera Bajada, porque la reserva del vuelo planeado se guarda desde la largada y su energía de sobra (piezas) ya no se gasta ahí.
- Una reserva nueva que se suma a una guarda vieja cuenta dos veces la misma energía: en v3 la Remate guardaba `diveKeep` (lo que deja para la final) más la reserva de su vuelo al techo, que es la final misma, y no gastaba su sobra en la primera Bajada (T46 de Peregrina, moneda 35 %). Si la guarda pasa a pagar el vuelo, cobrar el sostener al precio del aire sucio o suben las caídas forzadas (RISK-1: ridge 300 de 0,09 a 0,68 por carrera con el vuelo del Acecho incluido).
- Un criterio con tolerancia fija en puntos de victoria (WING-0: 3 puntos sobre v2) tiene piso de ruido: v2 contra sí mismo en otra base de semillas falla 0-5 de 96 chequeos. Antes de adoptar o descartar una palanca, repetirla en bases nuevas (design7 `tune5/bases.ts`): `airTechPm` 15 bajaba WING-0 de 11 a 6 fallas en v3a/v3b y solo de 9 a 8 en v3c/v3d.
- Un bono gratis puede sostener el balance de un ala sin que se vea: en design7 el rebufo de Suspensión en el aire leía su puesto en la fila (no la banda) y valía ≈ 13-16 puntos del sprint a 750 para Suspensión+Acecho; al pasarlo a banda y metros (F6, ronda 5) el balance se movió más que con todas las otras reglas juntas. Antes de arreglar una regla, medir cuánto vale apagada sola, y compensar con la física del ala (no con la Agilidad).
- Una sonda corre el código del worktree en cada trabajo, pero su caché se indexa por el JSON del trabajo: tocar el motor mientras corre una sonda mezcla dos motores bajo la misma clave. Cambiar la etiqueta (`--tag`) en cada cambio de motor y no editar `job.ts` ni el motor con sondas andando.
- Para probar que unas perillas nuevas apagadas devuelven la ronda anterior byte a byte, tomar la referencia sobre el commit viejo (con un commit WIP, nunca `git stash`), proyectada a los tipos de evento, claves y ledger que ese commit escribía, con las claves ordenadas igual en las dos corridas (design7 `harness/inv6.ts`).
- Dos líneas por banda (design7, 2026-11-08): si la de atrás sale de lado por el aire sucio solo, se adelanta a la subida por arriba (y a su premio) y el Acecho pierde 4-8 puntos; que salga solo cuando la de adelante la bloquea (es más rápida) deja el balance cerca de la ronda 5 y las pasadas «a través» pasan a ser por el costado. Un evento que clasifica una pasada (passSide) pide a las dos sosteniendo la banda: una que sube o cae por esa banda no es «de lado».
- El arnés de design7 indexa la caché por el JSON del trabajo: el gemelo de una ronda anterior se lee con su etiqueta exacta (la ronda 5 cerró con `r5final`, no `r5`); antes de comparar contra una ronda, buscar en la caché con qué etiqueta quedó.
- Todas vuelan (design7, 2026-11-08): un vuelo a ras sin peaje de terreno le daba a la Punta 30-60 puntos del canyon (500 m de Colina) y saltar a ras gratis ahorraba ≈ 30 de energía en el ridge; un premio por metro (crucero) crece con lo largo de la pista y uno por despegue (empujón) con la cantidad de vuelos: medir la ganancia pareada de cada posición por pista (`allfly/paired.ts`) antes de mirar victorias. Un vuelo a ras dentro de la final le corta el remate de piernas (−13 m a la Punta del circuit).
- Alas neutras (design7, 2026-11-08): un gesto «gratis» igual regala metros por lo que no paga: subir lento no pagaba sostener y caer lento llevaba la picada sin frenar (Rampa en Acecho +2 m, Lanza −1 m); cobrar la subida como si ya estuviera en su banda y frenar la picada también en el aire deja cada gesto en ±0,4 m. Antes de mover victorias, medir «volar contra no volar» pareado por posición (`neutral/fly.ts`): el vuelo del Acecho rendía −14 m a 300 en el sprint, y la mitad de los cambios de banda eran escapes desde la banda baja.
- La Resistencia paga el esfuerzo (design7, 2026-11-09): un golpe de hp solo cuesta metros donde el hp ya ata (en el Sprint sobran 150-200 de físico; en la Media y la Larga todas se agotan), así que cualquier golpe por posición mueve 10-20 puntos en las pistas largas y nada en el Sprint: presupuestar en la barra los golpes del propio plan (a Resistencia 600) y cobrar solo el tráfico. Para que valga en el Sprint el golpe tiene que vaciarla, y vaciarse a 150-200 m de la meta (piso de velocidad) duplica la σ del sprint (15 → 31 m): medir NOISE-1, el vuelo neto y la línea ganada (`stamina/gates.ts`) antes que el valor de la stat. Una letra con el campo en B tiene que tener B como cero: con «A ±0, B −3 %» castigaba a todas las voladoras del arnés.
- Nunca `git stash` en el worktree con el arnés corriendo: cada trabajo importa el motor al arrancar, y un trabajo que arrancó en ese segundo cae (o mide el motor viejo con la etiqueta nueva); borrar del caché lo escrito en esa ventana y relanzar.
- Un término de stat absoluto que actúa solo en una parte del juego (el centro de Técnica del aire, solo desde la banda alta) sesga las posiciones por nivel de stats en campos parejos: probar cada stat a 750 en un campo de 300 (`kick/pos.ts` con OVER) encuentra la causa; y una optimización que también corre v2 baja el p95 pero no la razón v3/v2.
- Pulido de balance (design7, 2026-11-09): un término absoluto de stat que solo actúa en el vuelo (η de la picada por Coraje, el presupuesto del plan a Resistencia 600) hace que «volar contra no volar» cambie de signo con el nivel (open-sky Remate −7,7 m a 300, +1,8 m a 750): medir `neutral/fly.ts` a 300 y 750 antes de culpar a una posición; y la distancia de la picada a la meta decide al Remate más que su potencia (60 m: 17 %, 250 m sobre el último Salto: 35 %).
- Casas por pista (design7, 2026-11-09): un bono de pasiva sobre la picada (+50 % de Δv) vale el doble en las pistas cortas que en las largas (espejo de Remates: Sprint 11,8 → 25,6 %, Larga +2 puntos), porque la picada ya valía más donde la σ es chica; antes de fijar un bono de una Falconess, medir su espejo por pista y el caso del dueño, no solo la métrica 7. Un criterio pesado por calendario (CAL-1) se arregla con la rotación de pistas (pista del mes) sin tocar el motor: buscar la oferta antes de tocar una posición.
- Al diseñar una pista para una posición, medir también cuánto vuela esa posición ahí (aire % y vuelos): en la Escapada la primera versión ganaba porque el vuelo a ras de la Punta arrancaba dentro de un Salto y se perdía (corría sin pagar físico), no por el diseño.
