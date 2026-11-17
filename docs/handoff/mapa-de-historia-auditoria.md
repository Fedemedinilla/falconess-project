# Auditoría de la historia de Falconess (base para el mapa de historia)

Fecha: 2026-11-16. Rama `playtest-ui` (commit `2d0bf0c`). Es una foto de ese día, hecha en solo
lectura para el traspaso `docs/handoff/mapa-de-historia.md`, que manda sobre este archivo. Objetivo: inventario de todo lo que ya existe sobre historia, lore,
personajes, textos y escenas; cómo se disparan las escenas; y qué falta para un «mapa de historia»
completo (lore + personajes + mapa de escenas: qué escena va dónde y qué contiene).

---

## 0. Resumen

- **Hay un método completo y una sola historia hecha.** El método vive en `docs/design/canon.md`
  (canon / temporada / «¿y si…?»), `docs/design/escenas.md` (cómo se hace una escena) y
  `docs/design/investigacion-personajes.md` (teoría). La única historia aplicada es la de
  **Peregrina**: crónica canónica (`docs/design/canon-peregrina.md`), guía y ficha
  (`docs/design/historia-peregrina.md`), **17 escenas** (`packages/content/story/`) y **9 temas de
  chat** (`packages/content/chat/`), todas con texto en castellano e inglés.
- **Cernícala y Caracara no tienen historia:** 0 escenas, 0 chats, sin canon, sin ficha; sus metas v3
  son genéricas (no moldeadas a una historia). Solo tienen una línea de presentación, prompts de arte
  y eventos viejos de v1/v2 (pausados en v3).
- **El lore del mundo no existe:** `docs/world.md` es un esqueleto de 10 líneas; `docs/characters/`
  **no existe** (aunque CLAUDE.md lo protege y BRIEF/ROADMAP lo prevén para las biblias de voz).
- **Eventos:** 31 archivos en `packages/content/events/`, **ninguno sale en la v3** (pausados o
  quitados, `docs/design/eventos-en-pausa.md`).
- **Personajes con nombre fuera de las jugables:** Milana (rival de la Larga, corre de verdad), la
  Jefa y la Novata (nombres provisorios), «Falconess dormida» (Milana antes de presentarse),
  Gerifalte (rival espejo de la Copa, sin personalidad), y Esmerejona y Aguilucha (solo nombres en el
  BRIEF). Todos los nombres están en revisión (generador de nombres pendiente).
- **Principales huecos para el mapa:** biblia del mundo, fichas por personaje, cronología del mundo
  (canon de todas en una línea de tiempo), mapa de relaciones, catálogo de escenas con capa y orden
  como dato (hoy la capa vive solo en el doc y «Historia» lista en orden alfabético), historias de
  Cernícala y Caracara, rivales con nombre, cuadrillas y sus líderes, Modo Historia.

---

## 1. Documentos

### 1.1 Mapa de documentos

| Documento                                                                                    | Qué define                                                                                                                                                                                                           | Estado                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `docs/design/canon.md`                                                                       | Método para todas las historias: 4 capas, 8 reglas, orden de escritura, Modo Historia                                                                                                                                | Decidido con el dueño, 2026-11-13                       |
| `docs/design/canon-peregrina.md`                                                             | Crónica del canon de Peregrina, su bisagra, la capa de cada escena, lo que las otras historias pueden recordar                                                                                                       | Decidido; «Después» pendiente                           |
| `docs/design/escenas.md`                                                                     | Formatos, tiempos, arte, escritura, voz del jugador, disparadores, implementación, ritmo, lista de control                                                                                                           | Decidido 2026-11-12, ampliado 11-13 y 11-14             |
| `docs/design/historia-peregrina.md`                                                          | Guía de la temporada de Peregrina: punto de partida, ficha (1b), el entrenador como padre, Milana, estructura «Ícaro sin culpa», escaleta, formatos, tabla de escenas en el juego, formato para que el dueño escriba | Mezcla de borrador (2026-11-11) y aplicado (2026-11-13) |
| `docs/design/investigacion-personajes.md`                                                    | Informe de investigación (fuentes JA/ZH/KO): 18 reglas, reparto de 48 semanas, finales, entrenador, antiestereotipos, voz, cómo trabajan los equipos, plantillas de ficha y de arco, lista de 26 preguntas           | Referencia teórica                                      |
| `docs/design/eventos-en-pausa.md`                                                            | Qué eventos se quitaron o pausaron en v3 y su efecto en el balance                                                                                                                                                   | Vigente (2026-11-13)                                    |
| `docs/design/vinculo-sintonia.md` + `docs/decisions/ADR-0016-sintonia-con-las-cuadrillas.md` | Vínculo y sintonía con las cuadrillas; los eventos de cuadrilla siguen en pausa y el vínculo puede ser su llave                                                                                                      | Aplicado                                                |
| `docs/world.md`                                                                              | «Biblia del mundo (esqueleto)»: 5 viñetas de secciones previstas                                                                                                                                                     | **Vacío** (se iba a completar en D18)                   |
| `docs/characters/`                                                                           | Biblias de voz por Falconess (BRIEF §11, ROADMAP D18)                                                                                                                                                                | **No existe**                                           |
| `docs/BRIEF.md`                                                                              | Pilares (elenco de seis), fabricantes y patrocinios (§7), eventos y `handwritten` (§8), pipeline de contenido y evaluación de voz (§11), decisiones abiertas (§15)                                                   | Fuente de verdad general; partes viejas                 |
| `docs/ROADMAP.md`                                                                            | Estado al 2026-11-13 (§0), D18-D21 pendientes (Fase 3), Modo Historia (§9)                                                                                                                                           | Vigente                                                 |
| `docs/design/temporada-v3.md`                                                                | T5 escuelas, T6 tres cuadrillas por escuela, T7 Falconess de apoyo, T17 rivales y **tono**, T18 «eventos clave en semanas fijas», T20 Némesis, T22 radio, T23 la veterana                                            | Ideas y decisiones de 2026-10-30                        |
| `docs/design/prompts-arte-provisional.md`                                                    | Aspecto de las tres jugables, bustos de expresión de Peregrina, fondos de escenas                                                                                                                                    | Vigente                                                 |
| `docs/design/album-suno.md`                                                                  | Música; repite el tono T17 («cool y con filo, no kawaii»)                                                                                                                                                            | Sin historia                                            |
| `docs/decisions/ADR-0012/13/14/15/16`                                                        | Copa y Gerifalte; herencia e inspiraciones; categorías y metas de Peregrina; Milana y la Larga; sintonía                                                                                                             | Aceptadas                                               |
| `docs/handoff/generador-de-nombres.md`                                                       | Único traspaso escrito hasta ahora (formato en 1.3)                                                                                                                                                                  | Generador no presente en esta rama                      |
| `.work/prompts/research-personajes.md`                                                       | El prompt que se le dio a Claude Research para el informe de personajes                                                                                                                                              | Local, no versionado                                    |

### 1.2 Qué define cada documento (reglas)

#### `docs/design/canon.md` (dueño, 2026-11-13)

- **Cuatro capas:** **Canon** (lo que pasó en el mundo; una sola versión; lo escribe solo el dueño;
  vive en `docs/design/canon-<falconess>.md` y quizás en un Modo Historia), **Temporada** (la partida;
  sigue al canon salvo donde el jugador lo cambia), **«¿Y si…?»** (final o momento que contradice el
  canon y se gana jugando muy bien), **Resto** (eventos de suerte, entrenamientos, nota: colorea sin
  contar la historia).
- **Reglas:**
  0. La temporada es para jugar (sacar cajas negras); el canon se muestra en el Modo Historia. Una
  bisagra tiene que ser posible, ni imposible ni fácil.
  1. El canon fluye hacia la temporada, nunca al revés.
  2. Las otras historias recuerdan solo el canon.
  3. Pocas bisagras, elegidas por el dueño.
  4. El canon es lo más probable, no lo obligatorio (la Larga: 37 % al nivel del dueño).
  5. El jugador nunca falla por el canon (si el canon es derrota, la meta es «Correr»).
  6. Un final temprano no es canon ni «¿y si…?»: es la temporada cortada antes; cuenta la misma
     herida, antes.
  7. El resto colorea pero no decide; nunca contradice ni crea canon.
- **Orden de escritura:** (1) el canon como crónica; (2) una o dos bisagras con su «¿y si…?»; (3) metas
  y rivales medidos con el lote (ADR-0014/0015); (4) escenas marcadas con su capa (canon / ¿y si…? /
  final temprano) en el doc de canon; (5) chats: canon salvo que digan lo contrario.
- **Modo Historia (más adelante):** el canon entero y en orden, sin entrenar; las escenas canon son su
  materia prima.

#### `docs/design/canon-peregrina.md`

- **Crónica:** Peregrina (Kōryū) ya es la Falconess modelo; gana cuatro seguidas (Sprint y Milla); S16
  Cernícala llora tras perder contra ella y Peregrina no lo entiende; la Novata le pregunta qué se
  siente perder («No sé. Nunca me pasó»); S30 una Falconess duerme en la tribuna y la Jefa la
  reconoce; una pileta que odiaba le salva una carrera y le da la razón al entrenador; tras la cuarta
  victoria la invitan a la gran Larga (3600 m) y se anota sola; S44 conoce a Milana («¿Vos sos la
  rápida? Qué cansador»); en la Larga se queda sin fuerzas a 400 m, la pasa Milana y después todas;
  llega última; no sabe qué sentir; el entrenador la calma. **«Después: se escribe más adelante con el
  dueño».**
- **Bisagra única:** la Larga (S48). Canon: pierde. «¿Y si…?»: gana agotada, vuelve a las Sprint y
  Milana pasa a ser su Falconess modelo. Las cuatro victorias son canon fijo; perder una es final
  temprano.
- **Tabla de 17 escenas con su capa** (15 canon, 1 «¿y si…?», 1 final temprano) y nota de Exigente.
- **Lo que las otras historias pueden recordar** (y lo que nunca).

#### `docs/design/escenas.md` (dueño, 2026-11-12; §5 2026-11-13; §6b 2026-11-14)

- **Formatos:** `box` (cuadro de diálogo, escena común), `cine` (cinemático, escenas clave, pocas),
  `ChatTopic` (chat opcional que no cambia nada).
- **Tiempos:** entrada ≈ 2,8 s hasta la primera línea en pasos; tarjeta de capítulo siempre (rótulo +
  título); texto letra a letra 26 ms (cuadro) o palabra a palabra 110 ms (cine); Auto 4,5 s; Registro;
  Saltar siempre visible (aviso «Escena saltada… Menú → Historia»); salida 0,8 s; movimiento
  reducido sin animaciones; una escena se ve una vez por temporada.
- **Arte:** fondos pintados 9:16, sin personajes en primer plano, tercio de abajo tranquilo, escala
  Falconess (pistas enormes), hangares con identidad del fabricante, sin letras ni logos. Fondos que
  hay: `hangar` (Kōryū), `track`, `finish`. Retratos de cintura para arriba 3:4, 10 expresiones
  (`calm happy eager bored annoyed surprised focused tired sad blank`).
- **Escritura:** cuadro 6-12 líneas, cine 6-14, chat 1-4 burbujas; hablantes `narrator` (presente,
  corto), `sfx` (uno por escena como mucho), `trainer` («Vos»), personajes con `speaker.<id>`; una
  frase clave por cine (`key: true`); mostrar, no explicar; lo cómico protege lo serio; la voz de cada
  Falconess es suya; sembrar antes de cosechar; nada de romance obligatorio, humillación como lección
  ni trauma como único motor; chat = su voz más directa; cada texto en `es.json` y `en.json`.
- **4b Voz del jugador (dueño, 2026-11-12):** neutro y razonable, recién llegado que aprende, firme
  cuando ya la conoce, siempre amable, su rol cambia según la Falconess (padre, entrenador, hermano,
  amigo), **sin género**.
- **5 Disparadores:** `start`, `turn`, `goal-before`, `goal-after` (`win` / `placed` / `pass`), `end`
  (`completed` / `goal-failed`). Orden de modos (dueño, 2026-11-13): entrenamiento / menú (decisión,
  efectos, escena de la semana) / carrera (transición, escena previa, posición, carrera, escena
  posterior, resultado). **Una escena por disparador y Falconess (lo exige el test).**
- **6 Implementación** y **6b Ritmo:** resumen («digest») en Rápido y Directo (≈ un tercio de las
  líneas, siempre la primera y la última, al menos tres); una escena vista en otra temporada no se
  repite (aviso con «Ver»); desde Historia o «Ver», siempre entera. **Regla de escritura derivada:
  la primera y la última línea tienen que contar solas lo esencial.**
- **7 Lista de control (12 puntos)** antes de dar una escena por terminada.

#### `docs/design/historia-peregrina.md`

- §1 Punto de partida (quién es, cómo corre, su arte, metas ADR-0014), tres ángulos de premisa,
  antiestereotipos, 8 preguntas para la biblia.
- §1b **Ficha de Peregrina (con el dueño, 2026-11-12)**: deseo visible (seguir en el tope), creencia
  y grieta (la velocidad y su talento pueden con todo), comedia (no sabe ir lento), voz (formal y
  piloto con usted → vos cuando confía), miedo (no saber qué es si no es rápida), al ganar («¿Mañana
  se puede?»), cómo llega a la Larga, vínculos (Jefa, Novata, Cernícala y Caracara), final. Dice:
  «Borrador de trabajo: pasa a `docs/characters/peregrina.md` cuando el dueño la apruebe».
- **El entrenador con Peregrina:** un padre que quiere conocer a su nueva hija modelo; su arco: ve que
  le falta resistencia y no quiere romperle la ilusión.
- **Milana:** milano real, opuesta (relajada, aparenta pereza; tono Seiun Sky), Acecho y Larga A.
- §2 Estructura «Ícaro, sin culpa», metas, finales, **escaleta** P / M1a-M5a / E1-E4 / F1-F3 (E1 y E4
  eran eventos con opciones), idea opcional: una línea la primera vez que hace cada entrenamiento.
- §2b Formatos elegidos (cinco maquetas). §2c Tabla de escenas en el juego. §3 **Formato para que el
  dueño escriba** (`ESCENA M1a · …`, acotaciones entre paréntesis; `EVENTO E2 · semanas …` con
  `OPCIÓN A: texto → efecto`).

#### `docs/design/investigacion-personajes.md`

18 reglas (personaje que existe antes del jugador; deseo visible y oculto; una sola grieta con raíz;
revelar por etapas; lo cómico protege lo serio; hechos reales como armazón; sorprender sin
traicionar; no borrar la herida; rivalidad sin rencor; el entrenador también es alguien; diseño que
cuenta; mostrar con detalles; voz como decisión; coherencia; crecimiento desde límites reales; el
mundo ordena a los personajes; **planificar con anticipación y custodiar el canon**). §5.2 reparto
recomendado de 48 semanas (prólogo 1-2, presentación 3-12, complicación 13-24, punto medio 25-30,
punto más bajo 31-38, resolución 39-46, final 47-48). §10 para un desarrollador solo: «una biblia
breve con la premisa del mundo en una frase, una ficha por corredora y un registro de canon (qué se
reveló, cuándo y con qué palabras)». Plantillas: **ficha de personaje**, **arco de temporada** y
**lista de 26 preguntas**. La sección «Aplicación» propone otra Peregrina (procedimiento, «usted→tú»,
muletilla «Procedimiento completo») que **no es la del canon**: manda la ficha §1b.

#### `docs/design/eventos-en-pausa.md` (dueño, 2026-11-13)

Chatarra fuera de v3; **ningún evento sale en v3**. Quitados: `boneyard-botch-1`, `sponsor-photo`,
`caracara-scrap-run`. En pausa: 4 de cuadrilla, 2 de resultado, 1 al azar, 16 de suerte y 5 de
historia escritos a mano. Sin eventos la temporada es 9-12 puntos más fácil; al volver, medir de
nuevo.

#### `docs/BRIEF.md` (partes narrativas)

- §1 pilar 1: **elenco de seis Falconess adultas** basadas en rapaces reales.
- §7 tabla de fabricantes: patrocina — Steinhaus → **Gerifalte**, Lumière → **Esmerejona**, Kōryū →
  Peregrina, Altair → Cernícala, Boneyard → Caracara y **Aguilucha**.
- §8 eventos: fuentes `crew`, `falconess` (historia personal, escritos a mano), `random`,
  `race-result`; «los eventos de historia tienen `weight: null` y turno fijo. Las escenas clave de
  cada Falconess son texto escrito a mano y se marcan `handwritten: true`».
- §11 biblia de voz por Falconess en `docs/characters/<id>.md` (registro, léxico permitido y
  prohibido, valores, reacción a ganar/perder/lesionarse, tres frases de ejemplo y tres que nunca
  diría); evaluación de voz con situaciones golden y juez (`tools/evals/voice/`, no existe).
- §15 decisión abierta: «Avatar del jugador: entrenador/a con presencia narrativa o "el taller" sin
  rostro» (de hecho resuelta por `escenas.md` 4b).

#### `docs/ROADMAP.md`

- §0 (2026-11-13): temporada completa de Peregrina (17 escenas, 9 chats); canon y Modo Historia;
  pendiente del dueño: retratos de Peregrina y **nombres definitivos de la Jefa, la Novata y Milana**.
- Fase 3: **D18** (biblias de voz y `docs/world.md`, 10 eventos de historia a mano), **D19-D21**
  (generadores, eventos 31-40, evaluación de voz): todo pendiente; «las biblias de voz las escribe el
  dueño».
- §9: **Modo Historia** después del MVP; Falconess 4-6 con biblias de voz.

#### `docs/design/temporada-v3.md` (ideas con peso narrativo)

- **T5 Escuelas:** colores y doctrina de cada fabricante (Kōryū rojo/amarillo agresiva; Steinhaus gris
  acero, resistencia; Lumière marfil y dorado, precisión; Altair azul noche/celeste, cerebral; Boneyard
  óxido/oliva, varianza). «Gerifalte, Esmerejona y Aguilucha ya tienen escuela asignada».
- **T6:** tres cuadrillas por escuela, cada una con **un líder distinto** (15 líderes, ≈ 45 eventos).
- **T7:** Falconess como apoyo (futuro). **T17 (decidido 2026-10-30): tono «cool y badass»**, ni
  oscuro, ni depresivo, ni violento, con riesgo y menos alegre; no el mundo kawaii de idol. Rival
  recurrente por temporada (a decidir). **T18:** los eventos clave de cada corredora salen en semanas
  fijas. **T20** Modo Némesis (futuro). **T22** la radio (gritos del jugador). **T23 la veterana:** la
  Falconess de la caja negra aparece en la temporada y enseña (aprobada sin diseño).

#### ADR que tocan la historia

- `ADR-0012-dificultades-y-copa.md`: Exigente y la Copa; **Gerifalte** es la rival espejo
  (`mirrorRival`), armada sobre la Falconess del jugador, nombre en pantalla «Gerifalte».
- `ADR-0013-herencia-con-suerte.md`: dos cajas, inspiraciones en S24 y S40 (tarjeta de herencia en el
  menú); no define historia (T23 la veterana sigue sin diseño).
- `ADR-0014-categorias-de-carrera.md`: metas de Peregrina G3/G2/G1, «Correr» (`minPlace` 8),
  `goal-after` suma `placed`, la invitación pasa a la meta 4, la Larga con escena previa y dos finales.
  **La temporada de cada Falconess es suya** (no toca el calendario compartido ni a las otras).
- `ADR-0015-milana-y-la-larga.md`: Milana corre de verdad (`namedRival`) con un campo de fondistas
  (`field`); las dos dificultades corren la misma Larga; **Gerifalte deja de correr la final de
  Peregrina**; ajuste del dueño «posible, no fácil» (37 % al nivel del dueño).
- `ADR-0016-sintonia-con-las-cuadrillas.md`: +50 ‰ a las cuatro metas con categoría de Peregrina;
  eventos de cuadrilla en pausa; `frameAffinity` sin efecto.

### 1.3 Cómo se escribió el traspaso anterior (`docs/handoff/generador-de-nombres.md`)

(Nota para quien escribió el traspaso; manda `docs/handoff/mapa-de-historia.md`.)

Formato a imitar:

1. `# Traspaso: <tema>`.
2. Primer párrafo: para quién («Para una sesión nueva de Claude Code en este repositorio
   (`falconess`, rama de trabajo `playtest-ui`)») y cuándo («Escrito el 2026-11-11 al cerrar otra
   sesión»).
3. `## Qué es el proyecto (en tres líneas)` + «leer `CLAUDE.md` antes de tocar nada» + «El dueño es
   hispanohablante: hablarle en español».
4. `## El pedido del dueño` (con lo que todavía no está decidido, en negrita).
5. Una sección de orientación de diseño basada en Umamusume («Qué hacen bien los nombres de
   Umamusume»).
6. `## Lo que pido que haga la primera versión` (lista numerada, concreta).
7. `## Dónde ponerlo y reglas del repo que aplican` (qué no tocar, prohibiciones de CLAUDE.md,
   comandos antes de cada commit, nunca `git stash`, agregar lección en CLAUDE.md, documentar
   comandos).
8. `## Preguntas abiertas para el dueño (hacerlas al empezar)` (numeradas).

Estilo: castellano rioplatense (vos), frases cortas, rutas entre comillas invertidas, sin relleno.
Un segundo ejemplo de prompt (para Claude Research, no para Claude Code):
`.work/prompts/research-personajes.md` (contexto, restricciones de fuentes, corpus, entregables).

---

## 2. Contenido

### 2.1 Personajes (jugables y no)

| Id / nombre           | Tipo                                                                                                         | Dónde está definido                                                                                                                                                                                                   | Qué hay                                                                                                             | Qué falta                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `peregrina`           | Jugable (Kōryū, halcón peregrino)                                                                            | `packages/content/falconess/peregrina.json`; `docs/design/historia-peregrina.md` §1/§1b; `docs/design/canon-peregrina.md`; `docs/design/prompts-arte-provisional.md`; `ui.m.pick.line.peregrina`                      | Stats, aptitudes, firma Shiden Kaminari, ficha, canon, 17 escenas, 9 chats, 2 eventos a mano v1/v2 + 2 de suerte v2 | Biblia en `docs/characters/`, «Después» del canon, retratos                                         |
| `cernicala`           | Jugable (Altair, cernícalo)                                                                                  | `packages/content/falconess/cernicala.json`; `ui.m.pick.line.cernicala` («Calma y analítica. Mide antes de moverse.»); prompts de arte; eventos `cernicala-chart`, `cernicala-stillness` (a mano), `luck-cernicala-*` | Aparece en una escena de Peregrina (`peregrina-tears`, solo «…»)                                                    | **Todo**: canon, ficha, escenas, chats, metas a su medida, rival                                    |
| `caracara`            | Jugable (Boneyard, carancho)                                                                                 | `packages/content/falconess/caracara.json`; `ui.m.pick.line.caracara` («Aventurera. Si hay un atajo, lo prueba.»); prompts de arte; eventos `caracara-ground-truth`, `caracara-scrap-run` (a mano), `luck-caracara-*` | Nada en escenas                                                                                                     | **Todo** (como Cernícala)                                                                           |
| `milana`              | Rival de historia, no jugable (milano real)                                                                  | `docs/design/historia-peregrina.md` («Milana»); `docs/decisions/ADR-0015-milana-y-la-larga.md`; `packages/content/calendars/v3.json` (`namedRival`); `speaker.milana`; `ui.m.race.named.milana`                       | 3 escenas como hablante (5 líneas) + 1 como `dormida`; chat `peregrina-the-sleeper`; corre la Larga                 | Escuela/fabricante, ficha, canon propio («puede tener la suya más adelante»), nombre definitivo     |
| `dormida`             | Hablante: Milana antes de presentarse                                                                        | `speaker.dormida` («Falconess dormida»); `peregrina-nap`                                                                                                                                                              | 1 línea («Zzz…»)                                                                                                    | —                                                                                                   |
| `jefa`                | NPC: jefa de cuadrilla de Kōryū                                                                              | `historia-peregrina.md` §1b («veterana del box, la conoce de chica, la reta por apurada; sabe lo que viene»); `speaker.jefa`                                                                                          | 8 escenas, 13 líneas; chat `peregrina-the-chief`                                                                    | Nombre (provisorio), ficha; relación con la entidad de juego «Box Kōryū» (`crew.koryu`) sin definir |
| `novata`              | NPC: novata que admira a Peregrina                                                                           | `historia-peregrina.md` §1b; `speaker.novata`                                                                                                                                                                         | 3 escenas (5 líneas) + narrada en `peregrina-debut`; chat `peregrina-rookie-topic`                                  | Nombre (provisorio), ficha, escuela (entrena en el box de Kōryū desde S28)                          |
| `trainer`             | El jugador («Vos»)                                                                                           | `escenas.md` 4b; `historia-peregrina.md` («un padre…»); `speaker.trainer`                                                                                                                                             | 17 escenas, 47 líneas                                                                                               | Su rol con Cernícala y Caracara                                                                     |
| Gerifalte             | Rival espejo de la Copa (Exigente de Cernícala y Caracara); en el BRIEF, Falconess patrocinada por Steinhaus | `ADR-0012`; `ui.race.runner.mirror`, `ui.m.race.mirror`; BRIEF §7; `temporada-v3.md` T5                                                                                                                               | Solo un nombre y una mecánica                                                                                       | Personalidad, canon, decidir si es «tu espejo» o una persona                                        |
| Esmerejona, Aguilucha | Falconess 4-6 previstas (Lumière y Boneyard)                                                                 | BRIEF §1/§7; `temporada-v3.md` T5; handoff de nombres                                                                                                                                                                 | Solo nombres                                                                                                        | Todo                                                                                                |
| Periodista            | Figurante                                                                                                    | `peregrina-press` (narrado)                                                                                                                                                                                           | —                                                                                                                   | —                                                                                                   |
| Cuadrillas            | Entidades de juego (5)                                                                                       | `packages/content/manufacturers/*.json`, `crew.*` («Box Kōryū», «Sala de telemetría Altair», «Atelier Lumière», «Taller Steinhaus», «Cuadrilla Boneyard»)                                                             | Nombre, stats, bono                                                                                                 | Líderes (T6), personalidad, eventos v3                                                              |
| Rivales genéricas     | Corredoras del campo                                                                                         | `ui.race.runner.rival` («Rival {n}»)                                                                                                                                                                                  | —                                                                                                                   | Ningún plantel de rivales con nombre                                                                |
| La veterana           | Idea T23 (herencia con presencia)                                                                            | `temporada-v3.md` T23                                                                                                                                                                                                 | —                                                                                                                   | Diseño                                                                                              |

Cinco fabricantes/escuelas: `packages/content/manufacturers/{koryu,altair,boneyard,lumiere,steinhaus}.json`
(regla, paleta, cuadrilla, `sponsors`: Kōryū → peregrina, Altair → cernicala, Boneyard → caracara;
Lumière y Steinhaus sin patrocinadas en el contenido). Alas firma: `frame.peregrina-signature`
(Shiden Kaminari), `frame.cernicala-signature` (Nimbus Vigil), `frame.caracara-signature` (Mule
Carancho).

### 2.2 Catálogo de escenas (todas de Peregrina), en el orden en que salen (Normal)

«Sale» = momento real en que el juego la muestra. Capa según `canon-peregrina.md`.

| Sale                                   | Id (`packages/content/story/…`) | Rótulo · título                                 | Formato · fondo | Disparador                | Capa           | Líneas | Hablantes                           | Frase clave                                            | Qué pasa                                                        |
| -------------------------------------- | ------------------------------- | ----------------------------------------------- | --------------- | ------------------------- | -------------- | ------ | ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| S1, menú, antes de todo                | `peregrina-prologue`            | Prólogo · Lista para despegar                   | cine · hangar   | `start`                   | canon          | 14     | narrador, Vos, Jefa, sfx, Peregrina | «¿Plan? Ser rápida.»                                   | Llega media hora tarde, presentación de piloto, afiches         |
| S10, modo carrera antes de la posición | `peregrina-debut`               | Capítulo 1 · No hace falta calentar             | box · track     | `goal-before` 0           | canon          | 12     | +Jefa                               | —                                                      | El cartel de la Novata; «calentar rápido»                       |
| S10, tras la carrera (si gana)         | `peregrina-debut-win`           | Capítulo 1 · ¿Mañana se puede?                  | box · finish    | `goal-after` 0 (`win`)    | canon          | 12     | +Novata, Jefa                       | —                                                      | Firma la gorra sin frenar; respira más hondo de lo que deja ver |
| S17, menú (tras la decisión de S16)    | `peregrina-tears`               | Capítulo 2 · Fue solo una carrera               | box · finish    | `turn` 16                 | canon          | 11     | +Cernícala («…»)                    | —                                                      | Carrera de práctica; Cernícala llora; «¿Debería?»               |
| S20, antes                             | `peregrina-warmup`              | Capítulo 3 · Ir lento                           | box · track     | `goal-before` 1           | canon          | 12     | +Jefa                               | —                                                      | Doce segundos de calentar lento                                 |
| S20, después (gana)                    | `peregrina-press`               | Capítulo 3 · La cara del afiche                 | box · finish    | `goal-after` 1 (`win`)    | canon          | 9      | —                                   | —                                                      | Prensa; ya mira la larga del calendario (siembra)               |
| S29, menú                              | `peregrina-rookie`              | Capítulo 4 · No aplica                          | box · hangar    | `turn` 28                 | canon          | 11     | +Novata, sfx                        | —                                                      | «¿Qué se siente perder?» «No sé. Nunca me pasó.»                |
| S30, antes                             | `peregrina-chief-warning`       | Capítulo 5 · Una pista que no se gana corriendo | box · hangar    | `goal-before` 2           | canon          | 12     | +Jefa                               | —                                                      | La advertencia; «le falta aire para las largas»                 |
| S30, después (gana)                    | `peregrina-nap`                 | Capítulo 5 · La que dormía                      | box · finish    | `goal-after` 2 (`win`)    | canon          | 11     | +dormida, Jefa                      | —                                                      | Milana duerme en la tribuna; la Jefa la reconoce                |
| S40, menú (tras S39)                   | `peregrina-first-vos`           | Capítulo 6 · Vos tenías razón                   | box · hangar    | `turn` 39                 | canon          | 12     | —                                   | «Vos tenías razón…» (`key` en un `box`)                | La pileta le salvó una carrera; pasa al vos                     |
| S40, antes                             | `peregrina-summit`              | Capítulo 7 · La cima                            | cine · track    | `goal-before` 3           | canon          | 10     | +Novata, Jefa                       | «Yo soy el viento, Jefa.»                              | Estadio lleno; un segundo quieta                                |
| S40, después (gana)                    | `peregrina-invitation`          | Capítulo 7 · La invitación                      | cine · finish   | `goal-after` 3 (`win`)    | canon          | 11     | +Jefa                               | «Si vuelo más rápido, se acorta.»                      | Se anota a la Larga; la foto de Milana en el cajón              |
| S45, menú                              | `peregrina-tiresome`            | Capítulo 8 · Qué cansador                       | box · track     | `turn` 44                 | canon          | 12     | +Milana                             | —                                                      | «¿Vos sos la rápida? …Qué cansador.»                            |
| S48, antes                             | `peregrina-long`                | Capítulo 9 · La Larga                           | cine · track    | `goal-before` 4           | canon          | 11     | +Milana                             | «Va a ser corta. Ya vas a ver.»                        | El ritual; «aire para el final»                                 |
| S48, después (corre y no gana)         | `peregrina-long-lost`           | Final · ¿Y ahora qué se hace?                   | cine · finish   | `goal-after` 4 (`placed`) | **canon**      | 13     | —                                   | «¿Y ahora… qué se hace?»                               | Sin fuerzas a 400 m; Milana la pasa; respira con el entrenador  |
| S48, después (gana)                    | `peregrina-long-won`            | Final · Mi Falconess modelo                     | cine · finish   | `goal-after` 4 (`win`)    | **«¿y si…?»**  | 14     | +Milana                             | «La pileta también. …Mi Falconess modelo dice que sí.» | Gana agotada; Milana, su modelo                                 |
| Al fallar cualquier meta               | `peregrina-end-failed`          | Final · ¿Y ahora qué se hace?                   | cine · finish   | `end` `goal-failed`       | final temprano | 10     | —                                   | «¿Y ahora… qué se hace?»                               | La misma herida, antes; quieta en la recta                      |

En Exigente salen las mismas escenas; la Larga es la final de la Copa y hay que ganarla:
`peregrina-long-won` si gana, `peregrina-end-failed` si pierde (`peregrina-long-lost` no puede salir).

### 2.3 Conteos

- **Escenas:** 17, todas `falconess: "peregrina"`. Cernícala 0, Caracara 0.
- **Por disparador:** `start` 1 · `turn` 4 (S16, S28, S39, S44) · `goal-before` 5 (metas 0-4) ·
  `goal-after` 6 (5 `win` en metas 0-4 + 1 `placed` en la meta 4) · `end` 1 (`goal-failed`).
  Sin uso: `goal-after … pass`, `end … completed`.
- **Por formato:** 10 `box`, 7 `cine`. **Por fondo:** `finish` 8, `track` 5, `hangar` 4.
- **Por capa:** canon 15, «¿y si…?» 1, final temprano 1.
- **Líneas:** 197 (narrador 51, Peregrina 72, Vos 47, Jefa 13, Novata 5, Milana 5, dormida 1,
  Cernícala 1, sfx 2). Peregrina usa 9 de las 10 expresiones (`calm` 17, `happy` 11, `eager` 10,
  `surprised` 9, `focused` 7, `blank` 7, `tired` 4, `bored` 4, `annoyed` 3; `sad` nunca).
- **Escenas por personaje (como hablante):** Peregrina 17, Vos 17, narrador 17, Jefa 8, Novata 3,
  Milana 3 (+1 como `dormida`), sfx 2, Cernícala 1.
- **Chats:** 9 (todos de Peregrina), 25 respuestas.
- **Eventos:** 31 archivos; **0 activos en v3**. Por fuente: cuadrilla 5, resultado de carrera 2,
  al azar con elección 2, suerte al azar 10, suerte de una Falconess 6 (2 por jugable), historia a
  mano (`handwritten: true`) 6 (2 por jugable; 3 con `fixedTurn: 3`, 3 con `turnRange` [10, 40]).
- **Textos** (`packages/content/text/es.json` y `en.json`, 1947 claves cada uno, planos):
  `story.*` 231 (17 títulos + 17 rótulos + 197 líneas), `chat.*` 34, `ev.*` 80, `speaker.*` 7
  (`peregrina`, `jefa`, `novata`, `trainer`, `cernicala`, `milana`, `dormida`), `falconess.*` 3 (solo
  nombres), `crew.*` 5, `mfr.*` 5; UI de historia en `ui.m.story.*`, `ui.m.chat.*`,
  `ui.m.race.named.milana`, `ui.m.race.mirror`, `ui.race.runner.mirror`. **Ninguna clave de escena
  o chat falta en inglés**; 3 son idénticas en los dos idiomas a propósito («Zzz…», «Peregrina…» ×2).
  Ninguna clave `story.*` o `chat.*` sobra.

### 2.4 Chats (`packages/content/chat/`)

| Id                           | Desde semana | Pregunta                              | Respuestas |
| ---------------------------- | ------------ | ------------------------------------- | ---------- |
| `peregrina-why-race`         | 1            | ¿Por qué corrés?                      | 3          |
| `peregrina-day-off`          | 1            | ¿Qué hacés en tu día libre?           | 2          |
| `peregrina-favorite-track`   | 1            | ¿Cuál es tu pista favorita?           | 3          |
| `peregrina-the-chief`        | 1            | ¿Qué pensás de la Jefa?               | 2          |
| `peregrina-why-koryu`        | 1            | ¿Por qué Kōryū?                       | 3          |
| `peregrina-ever-lost`        | 10           | ¿Alguna vez perdiste?                 | 3          |
| `peregrina-rookie-topic`     | 13           | ¿Quién es la novata?                  | 3          |
| `peregrina-hardest-training` | 20           | ¿Qué es lo más difícil de entrenar?   | 3          |
| `peregrina-the-sleeper`      | 37           | ¿Viste a la que dormía en la tribuna? | 3          |

Ella habla de usted en los chats (canon antes de la bisagra; el vos llega en S39 pero los chats no
cambian después).

### 2.5 Eventos (`packages/content/events/`), todos fuera de v3

- **Historia a mano (`handwritten: true`, v1/v2, pausados):** `peregrina-first-dive` (S3 fija),
  `peregrina-speed-doubt`, `cernicala-chart`, `cernicala-stillness` (S3 fija), `caracara-ground-truth`,
  `caracara-scrap-run` (S3 fija, **quitado**). Solo el dueño puede editarlos.
- **Cuadrilla:** `altair-contract-1`, `koryu-data-session-1`, `lumiere-calibration-1`,
  `steinhaus-maintenance-1` (pausados), `boneyard-botch-1` (quitado).
- **Resultado de carrera:** `hard-loss`, `podium-interview`. **Al azar:** `sandstorm-week`,
  `sponsor-photo` (quitado).
- **Suerte (`auto`, solo v2):** `luck-{fan-letter, head-cold, long-sleep, lost-goggles, radio-critic,
  rival-smile, sky-gust, stormy-night, tailwind, veteran-visit}` y
  `luck-{peregrina-late-replay, peregrina-thermal, cernicala-feather, cernicala-notebook,
  caracara-finger, caracara-hammock}`.

Lo que dicen de las otras dos (única caracterización en contenido): Cernícala pega gráficos de calor
anotados a mano, se suspende veinte minutos corrigiendo milímetros, lleva un cuaderno; Caracara dice
que saltar es para quien no sabe correr, vuelve del desguace con piezas que nadie pidió, duerme en una
hamaca hecha de alas viejas, arregla motores ajenos.

### 2.6 Metas y rivales (`packages/content/calendars/v3.json`)

- **Peregrina, Normal:** S10 Sprint G3 (`fieldPm` 700) · S20 Mirador G3 (700) · S30 Sprint G2 (850) ·
  S40 Mirador G2 (850), todas «ganar» · S48 Cruce G1 (900) «Correr» (`minPlace` 8), campo de
  fondistas y `namedRival` Milana (piso 1050).
- **Peregrina, Exigente:** cuatro G2 (850) · S48 Cruce G1, final de la Copa (`minPlace` 1), Milana (piso
  1150).
- **Cernícala y Caracara:** Normal, cuatro metas genéricas (S12/24/36/46, puesto mínimo 6-3); Exigente,
  tres metas + Copa (clasificatoria S44, semifinal S46 y final S48 con `mirrorRival`, es decir
  Gerifalte).
- `packages/content/falconess/*.json` todavía lleva `seasonGoals` de v1/v2 (S12/24/36/46); las metas
  v3 viven en el calendario.

---

## 3. Esquema y código

### 3.1 Esquema (`packages/schema/src/story.ts`)

- `StoryScene` (`strictObject`): `id`, `version`, `falconess`, `style` (`box` | `cine`), `background`
  opcional (`hangar` | `track` | `finish`), `titleKey`, `kickerKey`, `trigger`, `lines`.
- `StoryLine`: `speaker` (slug: `narrator`, `sfx`, `trainer` o un id con `speaker.<id>`), `textKey`,
  `expression` opcional (10 valores), `key` opcional.
- `StoryTrigger`: `start` · `turn` (1-48) · `goal-before` (meta 0-9) · `goal-after` (meta 0-9,
  `win` | `pass` | `placed`) · `end` (`completed` | `goal-failed`).
- `ChatTopic`: `id`, `version`, `falconess`, `questionKey`, `fromTurn` (1-48), `replyKeys` (1-6).
- **No tiene:** capa (canon / ¿y si…? / final temprano), orden o número de capítulo como dato,
  dificultad, `rulesets`, `handwritten`, condiciones (stats, ánimo, vínculo, herencia, entrenamiento,
  chats vistos), opciones del jugador, retrato por hablante. Al ser `strictObject`, agregar cualquiera
  de esos campos es un cambio de esquema (plan aprobado; renombrar campos pide ADR).
- Eventos: `packages/schema/src/event.ts` (`GameEvent`: `source`, `conditions`, `weight`/`fixedTurn`,
  `handwritten`, `rulesets`, `auto`, opciones con efectos y ramas de azar). Son lo único con
  elecciones y efectos; las escenas son pura presentación.
- Personajes: `packages/schema/src/falconess.ts` (`Falconess`: especie, stats, aptitudes, habilidades,
  patrocinador, metas; **ningún campo de lore**), `NamedRival` y `SpecialistField` en `SeasonGoal`.

### 3.2 Cuándo sale una escena

- Carga: `apps/web/src/content/story.ts` (`allScenes()`, `allTopics()`: `import.meta.glob` ordenado
  por ruta, es decir **alfabético por id**).
- Condición: `triggerHolds` en `apps/web/src/mobile/storyModel.ts`:
  - `start`: `turn <= 1` y temporada activa;
  - `turn` N: `turn > N` y activa (**sale en el menú de la semana N+1**, después de la decisión de N);
  - `goal-before` N: activa, la meta N sin resultado y `turn === goal.turn`;
  - `goal-after` N: meta cumplida (`met`) y `win` = puesto 1, `placed` = cumplida sin ganar, `pass` =
    cualquiera cumplida;
  - `end`: temporada terminada con ese `endReason`.
- Modos y orden: `apps/web/src/mobile/flow/scenes.ts` (`dueScenes`, `SCENE_KINDS`, `SCENE_ORDER`,
  `menuOrder`) bajo `apps/web/src/mobile/flow/policy.ts`. **El juego usa `LEGACY_POLICY`**
  (`ACTIVE_POLICY`): `goal-before` solo antes de la posición; cualquier otra en el menú, la carrera o
  el final, **en orden de archivo**; la tarjeta de herencia antes que las escenas. `TARGET_POLICY`
  (por migrar, pasos 5.2/5.3 del plan de flujo) ordena por tipo (`start`, `goal-before`,
  `goal-after`, `end`, `turn`), luego por meta o semana, luego por id; en el menú: metas y final, la
  tarjeta, las de la semana.
- Herencia: `apps/web/src/mobile/inspirationScene.ts` (tarjeta de inicio y de las inspiraciones S24 y
  S40). No es una `StoryScene` ni tiene texto de historia.
- Una escena por temporada (por semilla). El motor nunca lee escenas ni chats.

### 3.3 Lo visto, «Historia», ritmo

- `localStorage` (`createStoryStore`): `falconess.juego.historia` =
  `{ runs: { <semilla>: [ids] }, ever: [ids] }`; `falconess.juego.chat` = ids leídos. Por navegador;
  no viaja con la partida exportada.
- «Historia» (`apps/web/src/mobile/StoryListSheet.tsx`, montada en `RunView.tsx`): las escenas de esa
  Falconess vistas alguna vez en ese navegador, **en orden alfabético de id** (no cronológico).
- Vista en otra temporada: no se repite; aviso «Ya salió en otra temporada.» (antes «Ya la viste en
  otra temporada.») con «Ver» (`flow/beats.ts`, `flow/commands.ts`; el aviso lo muestra
  `mobile/NoticeHost.tsx` con `mobile/noticeSlot.ts`, que reemplazaron a `StoryToast.tsx`).
- Resumen (`digestLines` en `storyModel.ts`, usado por `StoryOverlay.tsx`): `max(3, ⌈n/3⌉)` líneas
  repartidas, siempre la primera y la última; 1100 ms (Rápido) o 650 ms (Directo) por línea.
- Presentación: `apps/web/src/mobile/StoryOverlay.tsx` (fondos `BACKDROP` con
  `art/bg-{hangar,track,finish}.webp`; placa del nombre con el color del patrocinador de la Falconess de
  la escena, `--s1`, igual para todos los hablantes: la Jefa, Milana o Cernícala llevan el rojo de
  Kōryū). **Las expresiones no se dibujan** (no hay retratos todavía).
- Chat: `apps/web/src/mobile/ChatSheet.tsx`, `openTopics` (por `fromTurn`).

### 3.4 Validación y pruebas

- `packages/content/src/story.test.ts`: valida el esquema, ids únicos, Falconess existentes, cada texto
  y cada `speaker.<id>` en es y en, **una escena por disparador y Falconess**.
- `packages/content/src/text-lang.test.ts`: mismas claves y `{placeholders}` en es y en.
- `packages/content/src/content.test.ts`: «al menos 2 eventos de historia a mano por Falconess».
- `apps/web/src/mobile/storyModel.test.ts` (semántica de `goal-after` y `turn`, orden),
  `apps/web/src/mobile/flow/scenes.test.ts` (modos, prioridad, `menuOrder`),
  `apps/web/src/mobile/digest.test.ts`, `flow/walk-*.test.ts` (alcanzan «alguna escena»).
- e2e: `apps/web/e2e/mobile.spec.ts` («story: …prologue…», «story order», «passed by», «Rápido»),
  `mobile-flow.spec.ts`, `mobile-seeds.spec.ts` (`peregrina-end-failed`), `mobile-seams.spec.ts`.
- **No hay:** prueba de alcanzabilidad por escena (que cada escena pueda salir en Normal y en
  Exigente); `pnpm content:validate` (`apps/cli/src/content-validate.ts`) **no mira** `story/` ni
  `chat/`; nada que compare escenas con la capa del doc de canon.

---

## 4. Huecos e inconsistencias

### 4.1 Documentos que no coinciden

1. **Gerifalte como rival de la Larga de Peregrina.** Lo dicen `docs/design/historia-peregrina.md`
   (líneas 25, 136 y 197: «la final de la Copa contra Gerifalte»), la tabla de
   `ADR-0014` (línea 38) y `CLAUDE.md` línea 118 («la rival de la Larga de Peregrina, Gerifalte»).
   Lo vigente es `ADR-0015` y `calendars/v3.json`: **Milana** corre la Larga en las dos dificultades y
   Gerifalte ya no corre la final de Peregrina.
2. **`fieldPm` de Peregrina:** `ADR-0014` dice 650/650/800/800/1100 (Normal) y 1000 en la final de
   Exigente; el calendario tiene 700/700/850/850/900 y 900 (ajustes de `ADR-0016` +50 ‰ y `ADR-0015`).
   ADR-0014 no lo anota.
3. **`docs/characters/` no existe**, pero `CLAUDE.md` (línea 34) lo protege, BRIEF §11 y ROADMAP D18
   lo prevén, y `historia-peregrina.md` §1b dice que la ficha pasa ahí. La ficha sigue como «borrador
   de trabajo».
4. **`handwritten` y escenas:** BRIEF §8 dice que las escenas clave se marcan `handwritten: true`; el
   esquema `StoryScene` no tiene ese campo, así que el hook `.claude/hooks/guard-protected-paths.mjs`
   **no protege** `packages/content/story/` ni `chat/`. Hay que decidir con el dueño si las escenas
   escritas con él quedan protegidas (y cómo).
5. **Elenco de seis** (BRIEF §1, §7: Gerifalte con Steinhaus, Esmerejona con Lumière, Aguilucha con
   Boneyard) contra el contenido: `steinhaus.json` y `lumiere.json` tienen `sponsors: []`, y Gerifalte
   es hoy un espejo del jugador sin identidad. ¿Gerifalte es una persona o «tu sombra»?
6. **Avatar del jugador** sigue abierto en BRIEF §15, pero `escenas.md` 4b ya lo decidió (entrenador con
   voz, sin género).
7. **`historia-peregrina.md` mezcla capas de tiempo:** «Estado: borrador de estructura (2026-11-11)» y
   «La historia la escribe el dueño», con una escaleta «para revisar» cuyas E1 y E4 eran eventos con
   opciones; lo implementado (§2c) son escenas `turn` sin opciones. La opción del jugador de «intentar
   frenarla» (§1b) no existe en el juego.
8. **La «Aplicación» de `investigacion-personajes.md`** describe otra Peregrina (procedimiento,
   «Procedimiento completo», usted→tú al confiar su miedo). Manda la ficha de `historia-peregrina.md`
   §1b y el canon.
9. **Nombres provisorios:** Peregrina, Cernícala, Caracara, Gerifalte, Esmerejona, Aguilucha, la Jefa,
   la Novata y Milana pueden cambiar (`docs/handoff/generador-de-nombres.md`, ROADMAP §0). El generador
   no está en esta rama (no hay `apps/cli/src/names.ts`). El mapa debería usar ids estables y una tabla
   de nombres.

### 4.2 Contenido que choca con el canon o las reglas

1. **Eventos viejos (pausados; `peregrina-first-dive`, `peregrina-speed-doubt` y `cernicala-chart` son
   `handwritten`, solo el dueño; `hard-loss` no):** `peregrina-first-dive` («no dice nada
   durante un minuto entero») choca con su impaciencia; `peregrina-speed-doubt` (duda de su velocidad)
   choca con la grieta del canon (no duda hasta la Larga). `cernicala-chart` («Revisarlo juntas») y
   `hard-loss` («Revisar la carrera juntas») le dan género femenino al jugador (regla 4b: sin género).
   Al reformular los eventos de v3 hay que revisarlos contra el canon.
2. **Chat `peregrina-ever-lost`:** «Una vez llegué segunda en una carrera de práctica… No cuenta», contra
   el canon «No sé. Nunca me pasó» (S28). Es un chiste coherente con ella, pero es un dato de canon que
   el dueño debería confirmar.
3. **`peregrina-tears` (S16)** cuenta una carrera de práctica que el jugador no corre (las carreras
   opcionales, T3, no están en el juego). Funciona, pero el mapa debería marcar «carreras fuera de
   pantalla» como un recurso.
4. **Las líneas de NPC no marcan expresión:** las 13 de la Jefa, las 5 de la Novata, la de Cernícala y la
   de `dormida` (`escenas.md` §7 punto 5 pide expresión en cada línea de un personaje; Milana sí la
   lleva).
5. **`peregrina-first-vos`** es `box` y tiene una línea `key: true` (la frase clave es del cinemático).

### 4.3 Disparadores y lógica

1. **Disparadores que no pueden salir:** `peregrina-long-lost` en Exigente (la final exige ganar; es a
   propósito, la nota de `canon-peregrina.md` lo explica). Ninguno sin usar es un error: `pass` y
   `end completed` no tienen escenas. En Normal las 17 pueden salir.
2. **La frase clave se pierde en el resumen:** `digestLines` no prioriza `key`. En Rápido/Directo se
   pierde en 6 de las 8 escenas que la tienen: `peregrina-summit`, `peregrina-long`,
   `peregrina-long-lost`, `peregrina-long-won`, `peregrina-end-failed`, `peregrina-first-vos` (solo
   sobrevive en `peregrina-prologue` y `peregrina-invitation`). O se escribe con eso en mente (primera
   y última línea), o se cambia el resumen.
3. **«Historia» lista en orden alfabético** (`chief-warning` = Capítulo 5 primero). Para listar en
   orden hace falta un orden como dato (capítulo o semana) o derivarlo del disparador y las metas.
4. **Semana 40 cargada:** en el menú de S40 salen la tarjeta de herencia (inspiración S40) y
   `peregrina-first-vos` (`turn` 39); después, en el modo carrera, `peregrina-summit`, la carrera y
   `peregrina-invitation`. Cuatro momentos seguidos.
5. **Huecos de ritmo:** contando la semana en que cada escena sale de verdad (`turn` N sale en la
   N+1), hay escenas solo en S1, S10, S17, S20, S29, S30, S40, S45 y S48. Sin ninguna: S2-S9,
   S11-S16, S18-S19, S21-S28, **S31-S39** (el «punto más bajo» de la investigación), S41-S44 y
   S46-S47 (39 semanas). Con los eventos pausados, esas semanas no tienen ninguna voz.
6. **Sin filtros:** una escena no sabe de dificultad ni de ruleset. Si una temporada v2 de Peregrina
   llegara al juego del celular, las escenas leerían las metas viejas (S12/24/36/46, sin meta 4): hay
   que verificarlo antes de confiar en que solo corre v3.
7. **Un disparador por escena y Falconess** (test): no hay variantes (Normal/Exigente, por resultado
   de un entrenamiento, por vínculo), ni dos escenas en el mismo disparador.
8. **El «¿y si…?» solo existe por resultado de meta.** No hay disparadores por vínculo/sintonía,
   herencia (T23), primer entrenamiento de cada tipo (idea de la escaleta), chats leídos, elecciones
   previas ni carreras opcionales.

### 4.4 Lo que falta para un mapa de historia completo

1. **Biblia del mundo** (`docs/world.md` vacío): qué es una Falconess y por qué las alas son
   desmontables, las cinco escuelas (historia, filosofía, cómo hablan), las carreras y su calendario
   (G3/G2/G1, la Copa, la gran Larga), economía y prensa, tono (T17).
2. **Cronología del mundo:** el canon de todas en una sola línea de tiempo (el de Peregrina es «ese
   año»; ¿Cernícala y Caracara corren el mismo año?). La regla 2 de `canon.md` lo exige: las otras
   historias recuerdan solo el canon.
3. **Fichas por personaje** (plantilla de `investigacion-personajes.md` y biblia de voz de BRIEF §11):
   las tres jugables, Milana, la Jefa, la Novata, Gerifalte; luego Esmerejona y Aguilucha.
4. **Mapa de relaciones:** quién conoce a quién, rivalidades (Peregrina–Milana, Peregrina–Cernícala),
   mentores (Jefa), admiradoras (Novata), escuelas.
5. **Catálogo de escenas como dato:** capa, capítulo y orden, semana real, Falconess, hablantes, qué
   siembra y qué cosecha, qué recuerda de otras historias. Hoy la capa vive solo en
   `canon-<falconess>.md`.
6. **Canon e historia de Cernícala y Caracara:** crónica, bisagras, metas a su medida (ADR-0014), rival
   con nombre (ADR-0015), escenas, chats. La de Cernícala ya tiene un hecho fijo: lloró en S16 tras
   perder por un ala contra Peregrina en una carrera de práctica.
7. **«Después» del canon de Peregrina** y el epílogo (qué hace en la temporada siguiente, qué recuerdan
   las otras).
8. **Cuadrillas y sus líderes** (T6) y la relación entre la Jefa y la cuadrilla de juego «Box Kōryū».
9. **Rivales con nombre** (T17) para las carreras de meta de cada una, en vez de «Rival {n}».
10. **Fondos** de los hangares de Altair y Boneyard (hoy solo existe el de Kōryū) y retratos.
11. **Eventos de v3 reformulados** (cuadrilla, historia con elección), con su lugar en el mapa.
12. **Modo Historia:** estructura (capítulos en orden) y qué escenas canon lo forman.
13. **Nombres definitivos** (generador de nombres).

---

## 5. Reglas del dueño sobre historia en `CLAUDE.md`

«Prohibido sin aprobación explícita» (línea 34): editar `docs/characters/` o archivos con
`"handwritten": true`. Convenciones (líneas 13 y 41): el código no contiene prosa de juego; texto en
`packages/content/text/<lang>.json` con claves.

«Lecciones aprendidas», en orden:

- Línea 118 (dueño, 2026-11-11): **Historias:** como en Umamusume, las Falconess con nombre no son solo las jugables; cada historia puede presentar Falconess nuevas que después aparecen en las de las otras (cita a «Gerifalte» como la rival de la Larga: **desactualizado**, hoy es Milana). Las metas se moldean a la historia, no al revés.
- Línea 119 (2026-11-11): **Idiomas:** una clave nueva va en `es.json` y `en.json` a la vez; `text-lang.test.ts` exige mismas claves y `{placeholders}`.
- Línea 121 (2026-11-12): **Escenas de historia:** `StoryScene` y `ChatTopic` son pura presentación; la web decide cuándo sale una escena (`mobile/storyModel.ts`) y guarda lo visto en el navegador; el motor nunca las lee. Buscar ids de vistas nuevas antes en `src/` (`m-capitulo`).
- Línea 122 (dueño, 2026-11-12): Semana de carrera: el resultado de la acción se muestra antes de la posición (afecta dónde cae la escena previa).
- Línea 123 (dueño, 2026-11-12): **Escenas:** toda escena nueva sigue `docs/design/escenas.md`.
- Línea 124 (ADR-0014, dueño 2026-11-13): **Categorías de carrera:** una historia de «gana todo» se arma con `fieldPm` por meta; la temporada de cada Falconess es suya (no toca el calendario compartido, las letras ni a las otras).
- Línea 125 (ADR-0015, dueño 2026-11-13): **Rivales de historia:** una carrera que la historia dice que se pierde necesita una rival de verdad (`namedRival`) y un campo a su medida (`field`).
- Línea 126 (dueño, 2026-11-13): **Canon y temporada:** primero la crónica del canon (solo del dueño, una versión, la única que recuerdan las otras), después pocas bisagras con su «¿y si…?», después metas y rivales para que el canon sea lo más probable sin que el jugador falle por él, y cada escena marcada con su capa en `docs/design/canon-<falconess>.md`.
- Línea 127 (dueño, 2026-11-13): **Temporada y Modo Historia:** la temporada es para jugar y sacar cajas; el canon es del Modo Historia; una bisagra se calibra «posible, ni imposible ni fácil» (≈ 35-40 % al nivel del dueño).
- Línea 128 (dueño, 2026-11-13): **Pausar contenido de la v3:** un evento sale de v3 con `rulesets`, nunca borrando el archivo; los archivos `handwritten` piden aprobación explícita aunque la orden sea general.
- Línea 129 (dueño, 2026-11-13): **Orden de pantallas:** tres modos; la escena `turn` vale desde la semana siguiente; carrera: transición, `goal-before`, posición, carrera, `goal-after`/`end`, resultado.
- Línea 130 (dueño, 2026-11-13): **Efectos y escenas:** una escena arranca en negro opaco, nunca sobre el menú difuminado.
- Línea 135 (dueño, 2026-11-14): **Ritmo:** Rápido pasa las escenas como resumen (`digestLines`); una escena vista en otra temporada no se repite (aviso con «Ver»); desde Historia o «Ver», siempre entera.

Reglas del dueño fuera de CLAUDE.md que también cuentan: `canon.md` reglas 0-7 (2026-11-13);
`escenas.md` 4b voz del jugador (2026-11-12) y §6b (2026-11-14); tono T17 «cool y badass» en
`temporada-v3.md` (2026-10-30); T18 «eventos clave en semanas fijas» (2026-10-30).

---

## 6. Insumos para el traspaso

(Nota para quien escribió el traspaso; manda `docs/handoff/mapa-de-historia.md`, que tiene la
lista de lectura y las preguntas completas.)

**Leer primero, en este orden:** `CLAUDE.md` · `docs/design/canon.md` · `docs/design/canon-peregrina.md`
· `docs/design/escenas.md` · `docs/design/historia-peregrina.md` (§1b ficha, §2c tabla) ·
`docs/design/investigacion-personajes.md` (reglas, §5.2, §10, plantillas, lista de 26) ·
`docs/decisions/ADR-0014…`, `ADR-0015…` · `docs/design/temporada-v3.md` T5, T6, T17, T23 · BRIEF §7, §8,
§11 · `docs/world.md`.

**Límites:** el canon lo escribe solo el dueño; `docs/characters/` y los archivos `handwritten` no se
tocan sin aprobación explícita; las escenas y chats son contenido (JSON + textos es/en); agregar campos
a `StoryScene` es un cambio de esquema (plan primero; renombrar pide ADR); las metas de una Falconess
se cambian con su ADR y el lote; nada de esto toca el motor.

**Preguntas que conviene hacerle al dueño al empezar:** dónde vive el mapa (¿`docs/world.md` +
`docs/characters/` + `canon-<falconess>.md`, o un archivo de mapa nuevo?); si las tres corren el mismo
año del mundo; quién es Gerifalte; si las escenas escritas con él se marcan como protegidas; si la capa
y el orden pasan a ser datos de la escena (Modo Historia, «Historia» en orden); qué hacer con los
nombres provisorios mientras tanto; qué se recupera de los eventos pausados.
