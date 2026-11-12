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
- Multiplicadores en per-mille (1000 = ×1.0). Distancias y velocidades ×1000 dentro del motor.

## Comandos

pnpm typecheck · pnpm test · pnpm test:golden · pnpm content:validate · pnpm sim -- --seed 42
pnpm play -- --seed 42 · pnpm sim:batch -- --runs 10000 · pnpm lint
pnpm names -- --a winds --b alloys --n 30 --seed 1 · pnpm names:import -- --all (herramienta de nombres; ver docs/commands.md)

## Lecciones aprendidas

(Al cerrar cada tarea, agregar aquí en una línea lo que conviene recordar. No borrar entradas.)
- El test de pureza también lee strings y JSDoc: `**` en un literal dispara la regla del operador exponente.
- Encadenar `floor` en una fórmula multiplicativa pierde puntos: multiplicar todo y redondear una vez al final.
- `structuredClone` no está en `lib: ES2022`; `packages/sim` clona el estado con JSON porque el estado es el formato de guardado.
- Las ganancias de entrenamiento 8–14 del brief dejan la temporada en ~135 por stat con 48 turnos; la base inicial recalibrada es 44–76 (ver docs/formulas.md).
- El RNG por input se deriva de `seed/inputsApplied`: el estado no carga RNG y la reproducción es trivial.
- Las herramientas de desarrollo que necesitan azar usan `new Rng("<herramienta>:<semilla>")` con un stream existente; no se agregan streams del juego a `packages/rng` por ellas.
- Datamuse (`rel_gen`) mezcla sentidos de la palabra consultada: toda receta de nombres se revisa con `--dry-run --show-dropped` y se poda con `deny` antes de escribir el mundo.
- WordNet se cita por sentido (`wind.n.01`), no por palabra: `pnpm names:import -- --senses <palabra>` antes de elegir la raíz de una receta; los términos raros de WordNet no figuran en SUBTLEX y llegan con frecuencia desconocida.
- La página de nombres guarda mundos y favoritos en la base del artefacto, no en el repo: sincronizar a mano con Claude (ver docs/commands.md) y republicar la página cuando cambian los mundos del repo.
- Adjetivos y colores van primero en un nombre: los mundos que los traen llevan `position: "first"`; las recetas de adjetivos y verbos necesitan `includeRoots` para no perder la palabra raíz.
- La fuente de la página de nombres es `apps/cli/names/page/gatera.html`; `page.test.ts` falla si su copia del generador o de los mundos se separa del repo. Se republica pasando la URL del artefacto.
