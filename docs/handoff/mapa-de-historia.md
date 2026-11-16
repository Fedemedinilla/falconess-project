# Traspaso: el mapa de la historia de Falconess

Para una sesión nueva de Claude Code en este repositorio (`falconess`). Base: rama `playtest-ui`.
Escrito el 2026-11-16 al cerrar otra sesión, que investigó cómo se hace esto en la industria y
relevó todo lo que el repo ya tiene sobre la historia.

Junto a este archivo:

- `docs/handoff/mapa-de-historia-auditoria.md`: inventario completo de lo que existe (documentos,
  escenas, chats, personajes, cómo se disparan las escenas, contradicciones y huecos), tomado en el
  commit `2d0bf0c`.
- `docs/handoff/mapa-de-historia-investigacion.md`: cómo lo hacen Cygames (Umamusume), los estudios
  japoneses y la industria en general, con fuentes y qué tan verificado está cada dato.

## Antes de empezar

- **Trabajá en tu propia copia,** nunca en la carpeta donde trabaja la sesión del flujo: cambiar de
  rama ahí le cambia los archivos a la otra sesión.
  - Si ya estás en una copia propia (por ejemplo, una sesión en la nube):
    `git fetch origin playtest-ui && git switch -c historia-mapa origin/playtest-ui`.
  - Si arrancás en esa carpeta compartida:
    `git fetch origin playtest-ui && git worktree add ../falconess-historia -b historia-mapa origin/playtest-ui`,
    y seguí todo desde `../falconess-historia` (si `pnpm lint` no encuentra Biome, primero
    `pnpm install`).
  - Todo el trabajo va en `historia-mapa` (`git push -u origin historia-mapa`). No hagas commits en
    `playtest-ui` ni mezcles las ramas: eso lo decide el dueño.
- **No toques `apps/web/`** (sobre todo `src/mobile/`, `e2e/` y `scripts/`) mientras siga abierto el
  trabajo del flujo de pantallas del celular, que otra sesión hace en `playtest-ui`. Preguntale al
  dueño si ya terminó.
  - Ahí está cambiando qué escenas salen en cada modo y en qué orden (paso 5.2, bandera
    `sceneFilters`) y dónde va la tarjeta de herencia (paso 5.3, bandera `order`).
  - Cada bandera de `apps/web/src/mobile/flow/policy.ts` dice qué paso la quita. El plan completo
    (`.work/flow/plan-final.md`) es local a la máquina de esa sesión y está fuera de git.
  - Antes de describir cuándo sale una escena, leé el código actual:
    `apps/web/src/mobile/flow/scenes.ts`, `flow/beats.ts` y `mobile/storyModel.ts`.
- Leé `CLAUDE.md` entero antes de tocar nada: sus reglas no se negocian.

## Qué es el proyecto (en tres líneas)

Falconess es un juego de crianza estilo Umamusume Pretty Derby: el jugador entrena durante 48
semanas a una corredora adulta con alas mecánicas (una «Falconess») y la hace correr carreras
deterministas, con escenas de historia que salen según lo que pasa en la temporada. Monorepo pnpm en
TypeScript. El dueño es hispanohablante: hablale en español, sin jerga técnica.

## El pedido del dueño

En sus palabras: «Quiero que me ayude a crear el mapa. Y a organizar mis ideas de historia, y cómo
aplicarla al juego Falconess». El alcance es «Falconess y todo lo referente, incluyendo las biblias
de personajes». El mapa abarca el lore, los textos, los personajes, el mapa de escenas y qué va en
cada una.

A la pregunta «¿Las tres Falconess corren el mismo año del mundo?» respondió «No lo sé todavía». No
lo supongas: es una de las decisiones que hay que trabajar con él cuando exista la cronología.

## Tu papel

Sos su editor de historia y diseñador narrativo, no el autor. Ordenás, preguntás, proponés opciones,
encontrás contradicciones y huecos, y convertís lo decidido en documentos y después en contenido del
juego. Nunca des por canon algo que él no aprobó.

- **El canon, las bisagras y sus «¿y si…?» los decide él** (`docs/design/canon.md` §2 y regla 3).
- **Las biblias de voz también son suyas:** el ROADMAP (D18) dice que «las biblias de voz las
  escribe el dueño», a mano. Vos preparás borradores con sus palabras y él los aprueba o los
  reescribe.

Cómo trabajar con él:

- Una o dos preguntas por vez, cada una con dos a cuatro opciones y tu recomendación primero.
- Lo que diga queda escrito en el mismo turno, en el documento que corresponde. Si no sabés dónde
  va, a la bandeja de ideas (abajo). Nada de lo que cuente se pierde en el chat.
- Cada dato lleva su estado: **decidido** (con fecha), **propuesta** o **abierto**.
- Los términos de la industria (por ejemplo «storylet») se explican una vez, en una línea, o no se
  usan.
- Al cerrar cada sesión: un resumen corto de qué quedó decidido, qué quedó abierto y qué sigue,
  dicho en el chat y escrito con fecha arriba de la bandeja (sección «Estado»), con su commit. La
  sesión siguiente empieza leyendo eso.

## Cómo lo hacen otros (resumen)

Detalle, fuentes y estado de verificación en `mapa-de-historia-investigacion.md`.

- **En lo que se encontró, nadie trabaja con un único mapa dibujado a mano.** Los equipos tienen
  varias fuentes de verdad, cada una con su dueño, unidas por ids de escena: una biblia del mundo y
  de los personajes, una tabla de producción con una fila por escena (id, condiciones para salir,
  personajes, propósito, estado), el texto de cada escena y pruebas automáticas. No se encontró si
  algún estudio guarda además un mapa maestro; Deus Ex: Human Revolution tenía todo el juego en un
  solo Excel, que es una tabla, no un dibujo.
- **Umamusume (Cygames)**, según charlas y entrevistas públicas:
  - un director de guion dueño de las tramas largas;
  - las fichas de personaje en una wiki interna;
  - una herramienta de guion propia que avisa cuando un texto rompe las reglas del título (largo,
    palabras prohibidas, cómo llama cada personaje a cada otro);
  - una web que dibuja las relaciones;
  - la historia real de cada caballo, que entra desde la ficha del personaje. Que la usen como
    esqueleto con desvíos «¿y si…?» es probable, pero no está verificado.
  - El contenido de la temporada viene en capas: eventos en fechas fijas, eventos al azar, cadenas
    de las cartas de apoyo y eventos ocultos que piden un logro. Aparte hay una historia de siete
    episodios por personaje que se abre con el afecto.
- **Juegos donde las escenas salen del estado de la partida:** cada escena tiene contenido,
  requisitos para salir y efectos (los «storylets» de Failbetter y Emily Short). Si varias
  califican, gana la más específica (Valve) o la de más prioridad y peso (Hades). Un diagrama de
  flujo no da abasto con este tipo de contenido (Jon Ingold, de inkle). Failbetter arma primero el
  esqueleto (escenas y condiciones), lo prueba, y recién después escribe el texto.
- **En Falconess las escenas no tienen efectos ni opciones:** son pura presentación (CLAUDE.md,
  `packages/schema/src/story.ts`). Lo que cambia el juego son los eventos. Agregarles efectos,
  opciones o variantes sería un cambio de esquema, con plan aprobado por el dueño.

El repo ya va por ese camino: `canon.md` (crónica primero, después bisagras, metas y escenas con su
capa) es, en chico, el método de Cygames. Lo que falta es todo lo que rodea a Peregrina.

## Lo que ya existe

No empieces de cero. Leé, en este orden:

1. `CLAUDE.md`, sobre todo «Lecciones aprendidas» del 2026-11-11 al 2026-11-14 (historias, escenas,
   canon y temporada, Modo Historia, orden de pantallas, ritmo).
2. `docs/design/canon.md`: el método (capas canon / temporada / «¿y si…?», reglas 0-7, orden de
   escritura, Modo Historia).
3. `docs/design/canon-peregrina.md`: la única crónica escrita, con su bisagra y la capa de cada
   escena.
4. `docs/design/escenas.md`: cómo se hace una escena (formatos box, cine y chat; tiempos; fondos;
   voz del jugador sin género, 4b; disparadores; ritmo y resumen, §6b; lista de control).
5. `docs/design/historia-peregrina.md` (§1b la ficha, §2c la tabla de escenas en el juego).
6. `docs/design/investigacion-personajes.md`: 18 reglas, reparto de las 48 semanas, plantillas de
   ficha y de arco, lista de 26 preguntas. Su sección «Aplicación» describe otra Peregrina: mandan
   la ficha §1b y el canon.
7. Las decisiones y planes:
   - `docs/decisions/ADR-0013` (herencia), `ADR-0014` (categorías y metas), `ADR-0015` (Milana y
     la Larga), `ADR-0016` (sintonía);
   - `docs/design/temporada-v3.md` T5, T6, T17 (tono), T18, T23;
   - `docs/BRIEF.md` §7, §8, §11 y §15;
   - `docs/ROADMAP.md` §0, Fase 3 (D18) y §9 (Modo Historia);
   - `docs/world.md`.
8. El contenido:
   - `packages/content/story/` (17 escenas) y `packages/content/chat/` (9 chats);
   - los textos en `packages/content/text/es.json` y `en.json` (claves `story.*`, `chat.*`,
     `speaker.*`);
   - `packages/content/calendars/v3.json` (metas y rivales), `packages/content/falconess/` y
     `packages/content/manufacturers/`;
   - `packages/schema/src/story.ts`.

En resumen:

- **Una sola historia hecha, la de Peregrina:** crónica, ficha, 17 escenas (10 box y 7 cine) y 9
  chats, en castellano y en inglés. Su «Después» está pendiente.
- **Cernícala y Caracara no tienen historia:** ni canon, ni ficha, ni escenas, ni chats, ni metas a
  su medida, ni rival propia. Sí hay material para empezar:
  - su línea de presentación (`ui.m.pick.line.cernicala`, `ui.m.pick.line.caracara`);
  - sus prompts de arte (`docs/design/prompts-arte-provisional.md`);
  - los eventos viejos escritos a mano, en pausa (`cernicala-chart`, `cernicala-stillness`,
    `caracara-ground-truth`, `caracara-scrap-run`; resumen en la auditoría §2.5). Preguntale al
    dueño qué rescata.
  - Lo único fijo de Cernícala: lloró en S16 tras perder por un ala contra Peregrina en una carrera
    de práctica (`peregrina-tears`).
- **El mundo no está escrito:** `docs/world.md` es un esqueleto vacío y `docs/characters/` no
  existe.
- **Otros personajes con nombre:**
  - Milana, la rival de la Larga de Peregrina, que corre de verdad;
  - la Jefa y la Novata (nombres provisorios);
  - Gerifalte, la rival espejo de la Copa en Exigente, sin personalidad;
  - Esmerejona y Aguilucha, solo nombres en el BRIEF;
  - las cinco escuelas o fabricantes y sus cuadrillas.
  - Todos los nombres son provisorios: hay un generador de nombres pendiente
    (`docs/handoff/generador-de-nombres.md`).
- **Cuándo sale una escena** (al 2026-11-16):
  - `start`: al empezar;
  - `turn` N: en el menú de la semana N+1;
  - `goal-before`: en el modo carrera, antes de elegir la posición;
  - `goal-after` (según el resultado) y `end`: después de la carrera.
  - Lo visto se guarda en el navegador. Las escenas son pura presentación: el motor de la
    simulación nunca las lee.

## El método propuesto: seis piezas conectadas

En vez de un mapa dibujado a mano, que se desactualiza, seis piezas unidas por ids estables. La
ubicación es una propuesta: confirmala con el dueño antes de crear carpetas o archivos nuevos.

| Pieza                    | Qué contiene                                                                                                                                                                                                  | Dónde (propuesta)                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Bandeja de ideas      | Arriba, una sección «Estado» con el resumen de cada sesión. Debajo, todo lo que el dueño cuente, sin juzgar, con su estado (idea, en discusión, decidida, descartada) y a qué pieza va                        | `docs/design/historia/ideas.md`                                                                                                                                             |
| 1. Biblia del mundo      | Qué es una Falconess y por qué las alas son mecánicas y desmontables; las escuelas (historia, filosofía, cómo hablan); las carreras y su calendario; economía y prensa; tono (T17); glosario de nombres fijos | `docs/world.md` (ya existe, vacío)                                                                                                                                          |
| 2. Biblias de personajes | Una por personaje: la ficha de `investigacion-personajes.md`, la voz (BRIEF §11), cómo llama a cada otro personaje, qué sabe y qué no, qué recuerdan de ella las otras historias                              | Borrador en `docs/design/historia/personajes/<id>.md`; pasa a `docs/characters/<id>.md` (carpeta protegida) cuando el dueño lo aprueba, como dice la ficha §1b de Peregrina |
| 3. Cronología            | El canon de todas en una sola línea de tiempo, con la pregunta abierta de si corren el mismo año                                                                                                              | `docs/design/historia/cronologia.md`                                                                                                                                        |
| 4. Relaciones            | Quién conoce a quién, rivalidades, mentoras, escuelas; tabla de cómo se llaman entre sí                                                                                                                       | `docs/design/historia/relaciones.md`                                                                                                                                        |
| 5. Mapa de escenas       | El catálogo (una fila por escena hecha o planeada) y sus vistas                                                                                                                                               | `docs/design/historia/mapa-de-escenas.md`                                                                                                                                   |

Las crónicas siguen en `docs/design/canon-<falconess>.md`, como pide `canon.md`.

**Campos del catálogo**, una fila por escena o chat: id; Falconess; capa (canon, temporada, «¿y
si…?», final temprano); capítulo y orden; semana y disparador (con el resultado que pide);
dificultad (Normal, Exigente o las dos); formato (box, cine, chat); fondo; quién habla; propósito
(qué cambia en la historia); qué siembra y qué cosecha; frase clave; estado (idea, esqueleto,
borrador, aprobada, en el juego).

**Ojo con las metas por número.** El disparador nombra la meta por número (`goal` 0 es la primera)
y las escenas no saben de dificultad.

- Peregrina tiene las mismas cinco semanas de meta en las dos dificultades.
- Cernícala y Caracara no: en Normal tienen 4 metas (S12, S24, S36, S46) y en Exigente 6 (S12, S24,
  S36 y la Copa en S44, S46 y S48). Una escena `goal-after 3` saldría en S46 en una y en S44 en la
  otra.
- Marcalo en cada fila y llevalo al dueño antes de armar sus escenas de meta.

**Vistas del catálogo**:

- Una grilla de 48 semanas por Falconess con las metas, las inspiraciones de S24 y S40 y las
  escenas. Muestra de un vistazo las semanas mudas y las cargadas.
- El orden del Modo Historia.

Mientras el catálogo viva en Markdown, las vistas se arman a mano desde él. Si algún día pasa a ser
dato del contenido (fase 5, con plan), se pueden generar solas.

**Primero el esqueleto, después el texto:** cargar el catálogo con escenas sin prosa (propósito,
disparador, quién habla), revisar el ritmo con el dueño sobre la grilla, y recién ahí escribir.

## Plan de trabajo sugerido

1. **Leer y escuchar.**
   - Leé lo de arriba y contale al dueño, en diez líneas, qué entendiste.
   - Proponele la distribución de archivos y abrí la bandeja.
   - Pedile que vuelque sus ideas de historia tal como las tenga, en el orden en que le salgan.
   - Ordenalas con él en las piezas. Esta fase puede llevar varias conversaciones: no la apures.
2. **Mundo y elenco.**
   - La biblia del mundo.
   - La lista de personajes con ids estables y nombres provisorios.
   - Los borradores de las biblias: primero Peregrina (partiendo de la ficha §1b), después Milana,
     la Jefa y la Novata, después Cernícala y Caracara.
3. **Cronología y relaciones**, incluida la decisión de si corren el mismo año. Presentale opciones
   con lo que implica cada una para lo que las otras historias pueden recordar (regla 2 de
   `canon.md`).
4. **Mapa de escenas.**
   - Cargá en el catálogo las 17 escenas y los 9 chats de Peregrina, contrastados con
     `canon-peregrina.md`.
   - Marcá los huecos: hay escenas solo en 9 semanas (S1, S10, S17, S20, S29, S30, S40, S45 y
     S48). En las otras 39 no habla nadie, y los huecos más largos son S2-S9 y S31-S39. La semana
     40, en cambio, junta la tarjeta de herencia, tres escenas y la carrera.
   - Armá el esqueleto de Cernícala y de Caracara en el orden de `canon.md`: crónica (del dueño),
     bisagras, metas y rivales, escenas.
5. **Al juego.** Cada punto, como plan para que el dueño lo apruebe y después de que termine el
   trabajo del flujo en `playtest-ui`:
   - corregir las contradicciones, cada una con el visto bueno del dueño. En `CLAUDE.md` las
     lecciones no se borran ni se reescriben: se agrega una nueva, fechada, que corrige la vieja.
     En un ADR aceptado (ADR-0014), preguntale cómo anotarlo, por ejemplo con una nota que apunte a
     ADR-0015;
   - los campos de capa, capítulo y orden en `StoryScene` (cambio de esquema);
   - la validación de `story/` y `chat/` en `pnpm content:validate`;
   - una prueba de que cada escena del catálogo puede salir (el repo ya tiene bots que juegan
     temporadas enteras, en `apps/web/src/mobile/flow/testing/`);
   - escenas nuevas (JSON + textos);
   - metas y rivales de las historias nuevas (con su ADR y su lote).

## Reglas del repo que aplican

- **Canon:** solo del dueño. Una sola versión, la única que recuerdan las otras historias.
- **`docs/characters/` y los archivos con `"handwritten": true`:** prohibido editarlos sin
  aprobación explícita del dueño (CLAUDE.md), aunque la orden sea general.
  - El dueño pidió las biblias de personajes como parte de esta tarea, pero confirmá con él la
    carpeta y el formato antes del primer archivo, y pedí su visto bueno para cada cambio ahí.
  - Además, un hook (`.claude/hooks/guard-protected-paths.mjs`) bloquea Edit y Write en
    `docs/characters/` y en todo JSON `handwritten`. Con el permiso del dueño para un cambio
    concreto: `touch .claude/allow-protected`, hacé solo ese cambio y borralo enseguida
    (`rm .claude/allow-protected`).
  - Mientras ese archivo existe, desprotege también `tests/golden/`, los rulesets y todo archivo
    `handwritten` de esa carpeta de trabajo: nunca lo crees en la carpeta de la sesión del flujo.
  - No esquives el hook escribiendo desde la terminal. El archivo está en `.gitignore`: no se
    commitea.
- **Prosa de juego:** solo en `packages/content` (JSON validado, textos con claves). Una clave nueva
  va en `es.json` y `en.json` a la vez (`text-lang.test.ts`). Ids de contenido en kebab-case, un
  JSON por entidad.
- **Contenido nuevo** (cuando llegue la fase 5):
  - Un archivo nuevo en `story/` o `chat/` no invalida la caché de Vitest: si falla
    `load.test.ts`, corré `pnpm vitest --clearCache` (CLAUDE.md).
  - En `en.json` va la traducción real, no una copia del castellano: el e2e «language» juega una
    temporada en inglés buscando castellano.
  - Las pruebas del flujo (`apps/web/src/mobile/flow/golden.test.ts`, las `walk-*`) y las partidas
    grabadas de los e2e leen las escenas reales: una escena nueva o un disparador cambiado las
    rompe. Por eso todo eso espera a que termine el trabajo del flujo.
- **Escenas nuevas:** siguen `docs/design/escenas.md` y su lista de control:
  - voz del jugador sin género;
  - expresión en cada línea de un personaje;
  - la primera y la última línea cuentan solas lo esencial, porque son las que quedan en el
    resumen de Rápido y Directo (§6b).
- **Esquema y balance:**
  - Un cambio en `packages/schema` es «plan primero»; renombrar un campo pide un ADR.
  - Cambiar las metas o los rivales de una Falconess va con su ADR y su lote (ADR-0014, ADR-0015,
    `pnpm balance:barandas`).
  - El motor de carrera está congelado: la historia no lo toca.
- **Eventos:** un evento sale de la v3 con su `rulesets`, nunca borrando el archivo
  (`docs/design/eventos-en-pausa.md`).
- **Nombres:** provisorios. Usá ids estables y una tabla de nombres, así un cambio de nombre es una
  línea.
- **Markdown:** `pnpm lint` también revisa el formato de los `.md` de `docs/` (Biome, que por
  ejemplo rellena las tablas con espacios). Nunca `biome --write` sobre `docs/`.
  - Para ver cómo lo quiere Biome sin tocar nada:
    `pnpm exec biome format --stdin-file-path=<archivo> < <archivo>`.
  - Para chequear: `pnpm exec biome check <archivo>`.
- **Git:**
  - Nunca `git stash` (usá commits WIP).
  - Commits chicos, en imperativo y en inglés, como todo el historial: `docs(story): ...` para
    documentos y `content(story): ...` para escenas y chats.
  - Con la identidad configurada del entorno (firma incluida); nunca pases `-c user.email`.
  - Antes de cada commit: `pnpm lint` si solo tocaste documentos; `pnpm typecheck && pnpm test &&
    pnpm lint` si tocaste contenido o código.
- **Al terminar cada turno**, un hook corre `pnpm typecheck` y `pnpm test`. Tarda; si falla por algo
  que no tocaste, no lo arregles: avisale al dueño.
- Al cerrar una tarea, una línea nueva en «Lecciones aprendidas» de `CLAUDE.md` (las entradas viejas
  no se borran).

## Problemas conocidos para revisar con el dueño

Detalle en la auditoría (§4).

1. **Gerifalte o Milana:**
   - `CLAUDE.md` (lección del 2026-11-11), `historia-peregrina.md` y la tabla de `ADR-0014` todavía
     nombran a Gerifalte como rival de la Larga de Peregrina. Lo vigente es Milana (ADR-0015 y el
     calendario).
   - Además: ¿Gerifalte es una persona o «tu sombra»?
2. **Eventos en pausa que chocan con el canon:**
   - `peregrina-first-dive` y `peregrina-speed-doubt` contradicen el carácter de Peregrina.
   - «juntas» le da género al jugador en `cernicala-chart` (escrito a mano) y en `hard-loss` (no es
     `handwritten`). Esos textos viven en `es.json` y `en.json` (`ev.cernicala-chart.opt0`,
     `ev.hard-loss.opt0`), que el hook no protege: igual pedí permiso antes de tocar el texto de un
     evento escrito a mano.
   - `peregrina-first-dive`, `peregrina-speed-doubt` y `cernicala-chart` son `handwritten`: solo
     con permiso.
3. **El chat `peregrina-ever-lost`** dice que llegó segunda una vez, contra el «Nunca me pasó» del
   canon.
4. **`StoryScene` no tiene `handwritten`:** las escenas no están protegidas, aunque el BRIEF §8 dice
   que las clave sí. Protegerlas es un cambio de esquema (plan primero).
5. **La frase clave se pierde en el resumen del Ritmo Rápido** en 6 de las 8 escenas que la tienen.
6. **«Historia» lista las escenas en orden alfabético:** el Capítulo 5 sale primero. Hace falta un
   orden como dato.
7. **Ritmo:** solo 9 de las 48 semanas tienen escena (S1, S10, S17, S20, S29, S30, S40, S45 y S48;
   una escena `turn` N sale en la semana N+1). En las otras 39 no habla nadie: los chats no salen
   solos y los eventos están en pausa. La semana 40, en cambio, junta la tarjeta de herencia, tres
   escenas y la carrera.
8. **El elenco de seis del BRIEF** no coincide con el contenido. El BRIEF pone a Gerifalte con
   Steinhaus, a Esmerejona con Lumière y a Aguilucha con Boneyard, pero en el contenido Steinhaus y
   Lumière no patrocinan a nadie.

## Primeras preguntas para el dueño

Hacelas de a una o dos, en este orden, con tu recomendación primero:

1. Te propongo guardar todo en estos archivos (contáselo en palabras simples, sin rutas). ¿Te sirve,
   o preferís otra forma?
2. Contame tus ideas de historia tal como las tengas. Las anoto todas en la bandeja y después las
   ordenamos juntos.
3. ¿Por dónde querés empezar: el mundo, un personaje o las escenas de Peregrina?
4. Gerifalte hoy no es nadie: es la rival de la final de la Copa en Exigente (Cernícala y Caracara),
   que el juego arma copiando a tu Falconess. ¿Querés que sea una Falconess de verdad, con historia
   propia, o que quede como «tu sombra»?
5. ¿Querés que las escenas que escribamos juntos queden bloqueadas, para que ninguna sesión de
   Claude las cambie sin tu permiso? Hoy no se puede: hacerlo cambia el formato de las escenas y va
   con un plan para que lo apruebes.
