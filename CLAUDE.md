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
pnpm sim:race -- --seed 1 --course desert-ridge · pnpm sim:batch -- --runs 10000
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
- Una regla nueva de temporada va detrás de constantes cuyo valor viejo no sortea (una opción, probabilidad 0): `v1-invariance.test.ts` compara v1 con los digests de `5f0fd65`, y un estado solo avanza con el ruleset con el que empezó.
