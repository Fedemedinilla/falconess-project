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
