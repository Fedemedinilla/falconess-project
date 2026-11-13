# Cómo se hace una escena en Falconess

Reglas de dirección, arte, escritura e implementación de las escenas de historia. Valen para todas
las Falconess. Decididas con el dueño el 2026-11-12, probadas en el juego con Peregrina. Antes de
escribir, leer también `docs/design/investigacion-personajes.md` (por qué un personaje se siente
vivo), `docs/design/canon.md` (canon, temporada y «¿y si…?») y el canon y la guía de la Falconess
(por ejemplo, `docs/design/canon-peregrina.md` y `docs/design/historia-peregrina.md`).

## 1. Los tres formatos

| Formato                       | Para qué                                                                                                                                                    | Cómo se ve                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cuadro de diálogo** (`box`) | La escena común: antes y después de una meta, momentos de la semana.                                                                                        | Fondo pintado a pantalla completa, cuadro blanco abajo con el nombre en una placa del color del fabricante, el texto se escribe letra a letra, ▼ cuando termina. |
| **Cinemático** (`cine`)       | Las escenas clave: prólogo y presentación de la Falconess, final de la temporada, algún diálogo o evento secreto. Pocas: si todo es cinemático, nada lo es. | Bandas negras arriba y abajo, fondo oscurecido con viñeta, subtítulos centrados que aparecen palabra por palabra, la frase clave grande en el centro.            |
| **Chat** (`ChatTopic`)        | Opcional, para conocerla. No cambia nada de la temporada.                                                                                                   | Chat del celular: el jugador toca una pregunta (pill) y ella contesta con «escribiendo…», burbuja por burbuja. Temas que se abren con las semanas.               |

## 2. Dirección: el tiempo de una escena

Los menús y las escenas son interfaces muy distintas: el paso de una a otra nunca es de golpe.

- **Entrada, en pasos (≈ 2,8 s hasta la primera línea):**
  1. 0-0,8 s: el juego se desenfoca y se oscurece (todavía se ve que es el menú).
  2. 0,5-1,8 s: aparecen el tono de la escena y el fondo, con un fundido y un leve acercamiento.
  3. 1,1-1,8 s: entran las bandas negras (cinemático), la tarjeta del capítulo y los botones.
  4. 2,8 s: la primera línea.
- **Tarjeta del capítulo:** siempre, también para quien salta. Rótulo arriba («Prólogo»,
  «Capítulo 1», «Final») y el nombre del capítulo grande en cursiva.
- **Texto:** en el cuadro, letra a letra (26 ms); en el cinemático, palabra por palabra (110 ms),
  con todas las palabras ocupando su lugar desde el principio (las que faltan, invisibles) para que
  nada empuje al nombre de quien habla.
- **Avanzar:** un toque en cualquier parte. Si la línea se está escribiendo, se completa; si ya
  terminó, pasa a la siguiente.
- **Auto:** 4,5 s por línea terminada.
- **Registro:** relee lo dicho hasta ahí.
- **Saltar:** siempre visible. La escena se va en 0,8 s y queda el aviso «Capítulo · Título —
  Escena saltada. Podés verla cuando quieras en Menú → Historia». Quien juega rápido sabe que hay
  historia y dónde está.
- **Salida:** fundido de 0,8 s de vuelta al juego.
- **Movimiento reducido** (ajuste del teléfono): sin animaciones, la escena aparece directo.
- **Cuándo sale:** solo cuando nada más está en pantalla («Lo que pasó», un evento, una inspiración,
  la transición de carrera). Una escena se ve una vez por temporada; «Historia» la repite.
- **Orden de una semana de carrera:** escena previa a la meta (al llegar al menú de esa semana) →
  acción → su resultado («¡ÉXITO!» y «Lo que pasó») → posición → carrera (con la transición del
  águila) → «Lo que pasó» de la carrera → escena posterior.

## 3. Arte

### Fondos (`background`)

- Pintados, estilo anime de gacha de alto presupuesto, **vertical 9:16**, con buen encuadre de
  cámara (ángulo bajo o tres cuartos, gran angular, profundidad de campo, luz de hora dorada):
  nunca una imagen plana.
- **Sin personajes en primer plano:** el retrato de la Falconess va encima. Solo figuras chicas a lo
  lejos.
- **El tercio de abajo tranquilo:** ahí va el cuadro de diálogo. Lo interesante, en la mitad de
  arriba.
- **Escala de Falconess:** las pistas no son de autos ni de caballos. Son enormes (kilómetros, anchas
  como un valle, hasta el horizonte), con espacio vertical para volar (pilones altos, aros
  flotantes), y la tribuna se ve chiquita a lo lejos. Sin asfalto ni marcas de neumáticos.
- **Hangares con la identidad del fabricante:** colores, estandartes, trofeos, mecánicos con sus
  monos. Kōryū: rojo de carrera con acentos amarillos, competitivo y elegante (inspirado en una
  escudería italiana, pero original: sin marcas reales).
- Sin letras, números ni logos.
- Prompts y correcciones: `docs/design/prompts-arte-provisional.md` («Fondos de las escenas
  comunes»).
- En el juego: en el cuadro de diálogo, con su color y un oscurecido abajo; en el cinemático, más
  oscuro (55 %) y con viñeta.
- Fondos que hay: `hangar` (Kōryū), `track` (pista antes de la carrera), `finish` (línea de
  llegada). Uno nuevo se agrega en `StoryBackground` (schema) y en `BACKDROP` (`StoryOverlay.tsx`).

### Retratos

- De la cintura para arriba, vertical 3:4, mismo encuadre en todos (así al cambiar de gesto solo
  cambia ella), sin alas (se las pone para correr), con gestos de manos que salen de su
  personalidad.
- Diez expresiones: `calm`, `happy`, `eager`, `bored`, `annoyed`, `surprised`, `focused`, `tired`,
  `sad`, `blank`. Cada línea de diálogo marca la suya (`expression`) aunque el retrato todavía no
  esté.
- Prompts: `docs/design/prompts-arte-provisional.md` («Bustos de expresión»).

## 4. Escritura

- **Largo:** escena común de 6 a 12 líneas; cinemático de 6 a 14; una línea, una o dos oraciones.
  Un chat, de 1 a 4 burbujas por respuesta.
- **Quién habla:**
  - `narrator`: sin placa, en cursiva, en presente y corto («Y ya no estaba.»);
  - `sfx`: un sonido escrito grande («¡TAC TAC TAC TAC!»), uno por escena como mucho;
  - `trainer`: el jugador, «Vos», que habla de vos y sin género;
  - los personajes llevan su nombre en `speaker.<id>`.
- **Una frase clave por cinemático** (`key: true`): la línea que resume la escena, grande en el
  centro («¿Plan? Ser rápida.»). Corta.
- **Mostrar, no explicar.** La personalidad sale de lo que hace y cómo reacciona (llega tarde
  corriendo, firma gorras sin frenar), no de que alguien la describa.
- **Lo cómico protege lo serio:** el humor sale del mismo valor que la define, así la escena sincera
  no rompe el tono, lo confirma.
- **La voz de cada Falconess es suya:** si tapás el nombre, se tiene que saber quién habla.
  Peregrina: formal y con jerga de piloto con el entrenador (usted) al principio; pasa al vos cuando
  confía; apurada, cero paciencia.
- **Siembra antes de cosechar:** lo que pega al final (la Larga, Milana, la derrota) se insinúa
  antes en escenas chicas, sin explicarlo.
- **Nada de romance obligatorio, humillación como lección ni trauma como único motor.**
- **El chat es su voz más directa:** respuestas con personalidad, nunca un manual de juego.
- **Cada texto en los dos idiomas:** `es.json` y `en.json`, mismas claves (`story.<escena>.<n>`,
  `chat.<tema>.<n>`). La traducción conserva el tono, no las palabras.

## 4b. La voz del jugador («Vos», `trainer`) (dueño, 2026-11-12)

El jugador habla seguido en las escenas: no es un testigo mudo.

- **Neutro y razonable:** dice lo que diría cualquiera en su lugar. Nunca la trata mal, no se enoja
  con ella, no es despistado ni tonto: nada que aleje al jugador de su propio personaje.
- **Recién llegado que aprende:** es nuevo en el mundo de esta Falconess. Pregunta mucho, se
  sorprende, quiere entender qué la mueve.
- **Firme cuando ya la conoce:** una vez que entiende cómo funciona, habla de entrenamiento claro y
  corto, sin dudar. Firme no es duro.
- **Siempre amable y abierto a charlar.**
- **Su rol cambia según la Falconess:** puede sentirse padre, entrenador, hermano o amigo. La guía de
  cada Falconess define cuál.
- **Sin género:** habla de vos y nada en el texto le asigna género.

## 5. Cuándo sale cada escena (`trigger`)

| Disparador    | Cuándo                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| `start`       | La primera semana, antes de todo (el prólogo).                              |
| `turn`        | El menú de esa semana (o la primera vez que se llega después).              |
| `goal-before` | El menú de la semana de la meta N (0 = la primera), antes de la carrera.    |
| `goal-after`  | De vuelta al menú después de la meta N: `win` (primera) o `pass` (la pasó). |
| `end`         | La pantalla del final: `completed` (todas las metas) o `goal-failed`.       |

Una escena por disparador y Falconess (lo exige el test). Si dos escenas caen en la misma semana,
sale una por vez.

## 6. Implementación

- **Escena:** `packages/content/story/<id>.json`, validada por `StoryScene`
  (`packages/schema/src/story.ts`): `id`, `version`, `falconess`, `style` (`box` | `cine`),
  `background`, `titleKey`, `kickerKey`, `trigger`, `lines` (`speaker`, `textKey`, `expression`,
  `key`).
- **Tema de chat:** `packages/content/chat/<id>.json`, validado por `ChatTopic`: `questionKey`,
  `fromTurn`, `replyKeys`.
- **Textos:** en `packages/content/text/es.json` y `en.json`.
- **Pura presentación:** el motor nunca lee escenas ni chats; no cambian el estado ni sortean nada.
  La web decide cuándo mostrarlas (`apps/web/src/mobile/storyModel.ts`) y guarda lo visto en el
  navegador.
- **Comprobar:** `pnpm test` (`packages/content/src/story.test.ts`: validación, textos en los dos
  idiomas, un disparador por escena; `text-lang.test.ts`: mismas claves y `{placeholders}`), y el e2e
  «story» de `apps/web/e2e/mobile.spec.ts`.

## 7. Lista antes de dar una escena por terminada

1. ¿La escribí con la biblia de personajes a mano (`docs/design/investigacion-personajes.md`):
   mostrar y no contar, con personalidad, nunca aburrido?
2. ¿Está marcada su capa en el canon de la Falconess (canon, «¿y si…?» o final temprano), y si es
   canon, coincide con la crónica?
3. ¿Es el formato correcto (común, clave u opcional)?
4. ¿Tiene fondo, tarjeta (rótulo y título) y su disparador?
5. ¿Cada línea de un personaje marca su expresión?
6. ¿Tiene 6-12 líneas (cinemático hasta 14) y, si es cinemático, una sola frase clave?
7. ¿Se reconoce quién habla sin leer el nombre?
8. ¿El jugador habla con su voz: pregunta, se sorprende, firme en lo de entrenar, siempre amable?
9. ¿Algo de lo que dice o hace la muestra, en vez de describirla?
10. ¿Siembra algo de lo que viene?
11. ¿Está en castellano y en inglés, y pasan los tests?
12. ¿La viste en el teléfono, entera y saltándola?
