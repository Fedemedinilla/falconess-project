# Cómo se hace una escena en Falconess

**Antes de escribir cualquier escena (dueño, 2026-11-17):** leer enteras `docs/design/biblia-escritura.md`
y `docs/design/investigacion-personajes.md`. Este documento dice cómo se monta una escena; la biblia,
cómo se escribe.

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

Los menús y las escenas son interfaces muy distintas: el paso de una a otra nunca es de golpe, y el
menú nunca se ve detrás (dueño, 2026-11-13). Así quedó construido (ADR-0017):

- **Entrada, en pasos (Normal, y siempre desde «Historia»: 2,8 s hasta la primera línea):**
  1. 0 s: negro opaco desde el primer cuadro. Lo que queda debajo (el menú, la tarjeta de la
     carrera, el resultado) no se ve a través, y un aviso de error que estuviera arriba se corta.
  2. 0,3 s: aparecen «Saltar», Auto y Registro (un fundido de 0,12 s).
  3. 0,5-1,8 s: el tono de la escena y el fondo pintado salen del negro con un fundido,
     desenfocados y un poco más cerca: el fondo se enfoca mientras se aleja apenas (de 1,06 a 1).
     Después queda con un acercamiento lentísimo.
  4. 1,1-1,9 s: entran las bandas negras (cinemático); 1,2-1,8 s, la tarjeta del capítulo, que
     queda entera hasta 2,55 s.
  5. 2,55-2,8 s: la tarjeta se desvanece (0,25 s) y a los 2,8 s llega la primera línea. En el
     cuadro de diálogo, el cuadro entra con un fundido de 0,22 s subiendo 8 px.
- **En Rápido y Directo** (resumen, §6b) la entrada es corta: el fondo 0,2-0,9 s, la tarjeta
  0,4-0,8 s y entera al menos 0,7 s, la primera línea a los 1,75 s.
- **Movimiento reducido** (ajuste del teléfono): nada se mueve. La escena aparece entera en su
  negro, la tarjeta queda quieta 0,9 s y después la primera línea, entera; la salida es inmediata.
- **Tocar durante la entrada la apura:** todo lo que todavía entra sigue desde donde está y llega
  en 0,12 s (nada salta), la tarjeta queda entera y la primera línea sale 0,5 s después (0,3 s en
  un resumen), nunca más tarde que sin el toque. Un segundo toque la muestra enseguida. Un doble
  toque cuenta como uno solo.
- **Tarjeta del capítulo:** siempre, también para quien salta. Rótulo arriba («Prólogo»,
  «Capítulo 1», «Final») y el nombre del capítulo grande en cursiva.
- **Texto:** en el cuadro, letra a letra (26 ms); en el cinemático, palabra por palabra (110 ms),
  con todas las palabras ocupando su lugar desde el principio (las que faltan, invisibles) para que
  nada empuje al nombre de quien habla.
- **Avanzar:** un toque en cualquier parte. Si la línea se está escribiendo, se completa; si ya
  terminó, pasa a la siguiente.
- **Auto:** 4,5 s por línea terminada.
- **Registro:** relee lo dicho hasta ahí.
- **Saltar:** visible desde los 0,3 s. Termina la escena en el toque y no queda nada en su lugar
  (el dueño sacó el aviso de escena el 2026-11-18): la escena queda guardada en Menú → Historia,
  que es donde se ve de nuevo. Un doble toque salta una sola escena: si otra sigue, el segundo
  clic no la salta también.
- **Salida (0,8 s) sobre la pantalla que sigue:** la escena termina en el toque que la cierra
  («Saltar», la última línea, Auto o el fin del resumen). El juego sigue enseguida debajo y la
  escena se desvanece en 0,8 s sobre la pantalla real que viene: el menú, la tarjeta de la carrera,
  el resultado, el final o la tarjeta de herencia, que entra encima. Esa pantalla ya responde
  durante el fundido; la escena que se va no toma toques ni sigue escribiendo. El segundo clic de un
  doble toque que cierra una escena no elige nada debajo (ni una posición, ni la carrera del menú).
- **El resultado de la carrera** entra 0,4 s después de empezar ese fundido, cuando la escena ya
  casi no se ve: el panel sube 12 px y aparece en 0,32 s, el puesto («1.º») se estampa, después el
  consejo y el pie. «Continuar» responde desde el primer cuadro.
- **Una escena no deja aviso** (dueño, 2026-11-18): saltada, vista o ya salida en otra temporada,
  la pantalla que viene queda limpia. Igual queda marcada como vista y no vuelve sola; Menú →
  Historia la lista y la pasa entera.
- **Pestaña oculta:** si el jugador se va a otra pestaña o bloquea el teléfono, la escena se queda
  donde estaba (la entrada, la tarjeta, la línea a medio escribir) y sigue con el tiempo que le
  quedaba al volver.
- **Cuándo sale:** solo cuando nada más está en pantalla (los efectos de la semana, la tarjeta de
  herencia, la transición del emblema, un evento, una hoja abierta). Una escena por vez: si dos
  caen juntas, la segunda arranca en su propio negro después de la primera. Una escena se ve una
  vez por temporada; «Historia» la repite.
- **En la semana de carrera** la escena previa a la meta sale en el modo carrera, después de la
  transición del emblema, y la posterior después de la carrera, antes del resultado (§5).

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
  - `trainer`: el jugador, «Tú», al que se le habla de tú y sin género;
  - los personajes llevan su nombre en `speaker.<id>`.
- **Una frase clave por cinemático** (`key: true`): la línea que resume la escena, grande en el
  centro («¿Plan? Ser rápida.»). Corta.
- **Mostrar, no explicar.** La personalidad sale de lo que hace y cómo reacciona (llega tarde
  corriendo, firma gorras sin frenar), no de que alguien la describa.
- **Lo cómico protege lo serio:** el humor sale del mismo valor que la define, así la escena sincera
  no rompe el tono, lo confirma.
- **La voz de cada Falconess es suya:** si tapas el nombre, se tiene que saber quién habla.
  Peregrina: formal y con jerga de piloto con el entrenador (usted) al principio; pasa al tú
  cuando confía; apurada, cero paciencia.
- **Siembra antes de cosechar:** lo que pega al final (la Larga, Milana, la derrota) se insinúa
  antes en escenas chicas, sin explicarlo.
- **Nada de romance obligatorio, humillación como lección ni trauma como único motor.**
- **El chat es su voz más directa:** respuestas con personalidad, nunca un manual de juego.
- **Cada texto en los dos idiomas:** `es.json` y `en.json`, mismas claves (`story.<escena>.<n>`,
  `chat.<tema>.<n>`). La traducción conserva el tono, no las palabras.
- **Español latino neutro (dueño, 2026-11-18):** todo el castellano del juego va en tuteo neutro,
  sin voseo ni marcas de un país: `tú`, `eres`, `tienes`, `mira`, `elige`, `toca`, `cuéntame`;
  nunca `vos`, `sos`, `tenés`, `mirá`, `elegí`, `tocá`, `contame`, `dale`, `che`, `pileta` ni
  `cansador`. Para varias a la vez, `ustedes` (nunca `vosotros`). El `usted` sigue siendo una
  decisión de personaje (Peregrina con el entrenador hasta que confía), no un regionalismo: el
  beat de `peregrina-first-vos` es el paso de `usted` a `tú` (tutearse). El id de la escena queda
  como está; las palabras cambian.

## 4b. La voz del jugador («Tú», `trainer`) (dueño, 2026-11-12)

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
- **Sin género:** se le habla de tú y nada en el texto le asigna género.

## 5. Cuándo sale cada escena (`trigger`)

| Disparador    | Cuándo                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `start`       | La primera semana, antes de todo (el prólogo).                                                           |
| `turn`        | Después de la decisión de esa semana (o la primera vez que se llega después).                            |
| `goal-before` | En el modo carrera de la meta N (0 = la primera): después de la transición, antes de elegir la posición. |
| `goal-after`  | Después de la carrera de la meta N, antes de su resultado: `win` (primera), `placed` o `pass` (la pasó). |
| `end`         | Después de la última carrera, antes de su resultado: `completed` (todas las metas) o `goal-failed`.      |

**El orden (dueño, 2026-11-13; construido así, ADR-0017).** Tres modos, que no se mezclan:

1. **Entrenamiento:** la pantalla donde se elige qué entrenar y su resultado.
2. **Menú de la temporada:** la decisión de la semana y lo que hizo, como sellos sobre el menú (los
   efectos de la semana; no hay ventana «Lo que pasó»). Después de los efectos, la tarjeta de
   herencia si toca (al llegar a las semanas 24 y 40), después la escena de la semana, si la hay,
   y el menú de la semana siguiente. Al empezar la temporada: el prólogo y después la tarjeta
   «¡Herencia!». Cada tarjeta sale una sola vez (el navegador la recuerda).
3. **Carrera:** la transición del emblema, la escena antes de la carrera, la elección de la
   posición, la carrera, la llegada, la escena después de la carrera, el resultado (puesto, meta,
   tiempo, consejo) y de vuelta al menú, con los efectos de la carrera.

**Una semana de carrera, paso a paso:**

1. La acción de la semana y su resultado (una vista previa: todavía no se aplica), después sus
   efectos (sueño, vínculo, habilidades compradas) sobre el menú. Desde acá la acción queda
   decidida, también si se recarga la página.
2. La transición del emblema: el rojo del patrocinador entra en 0,16 s sobre la última pantalla de
   la semana, y solo cuando ya tapa todo el modo carrera ocupa su lugar debajo. Termina a los
   1,24 s y se desvanece en 0,28 s. Los toques esperan esos 1,24 s.
3. La escena previa a la meta aparece cuando el emblema empieza a desvanecerse, en su propio negro
   (sus primeros 0,3 s son negro puro): nunca debajo del emblema mientras tapa (regla del dueño,
   reformulada en ADR-0017, O6). Sin escena, el emblema se desvanece sobre la tarjeta y «Correr» ya
   responde.
4. La tarjeta de posición, sin «Volver» (la acción ya está decidida). Viene elegida la posición de
   las alas con que corre después de la acción; tocar esa otra vez no es elegir.
5. «Correr» y la carrera. Si termina sola, queda quieta en su último cuadro con el puesto («1.º»)
   estampado: 1,2 s en Normal, 0,72 s en Rápido, nunca menos de 0,4 s. Tocar el cartel es como
   «Saltar»; «Saltar» se salta la carrera y la llegada juntas.
6. La escena posterior (`goal-after` o `end`), después el resultado, que entra durante su salida
   (§2).
7. «Continuar»: el menú con los efectos de la carrera (el ánimo y los puntos) y la semana
   siguiente. El ánimo de la semana, también el de la acción (una salida), se muestra recién acá,
   junto con el de la carrera: el ánimo es de la parte de la carrera (regla del dueño 36).

- **Directo:** sin emblema. La escena previa (resumida) sale en su negro y después la tarjeta;
  «Correr» abre directo en el resultado, o antes en la escena posterior (resumida) si la hay: en la
  primera temporada, toda meta ganada tiene una. **Movimiento reducido:** sin emblema.
- **«Ver otra vez»** (en el resultado) y **«Ver carrera»** (en el final): la carrera vuelve con un
  fundido de 0,2 s, con su llegada si termina sola, y después su resultado. Nunca con emblema ni
  escenas.
- **La tarjeta de la carrera desde el menú** (el botón de la semana de carrera) es una tarjeta para
  planear: sin escena ni transición, con «Elegir la acción» y «Volver»; la posición elegida ahí se
  recuerda aunque se recargue la página.
- **La última carrera de la temporada:** sus efectos salen sobre el final.

La transición del emblema va solo del fin de la semana al modo carrera, en ningún otro lado.

Una escena por disparador y Falconess (lo exige el test). Si dos escenas caen en la misma semana,
sale una por vez.

**Una escena no avisa nada** (dueño, 2026-11-18). El aviso negro que decía «Escena saltada…»,
«Queda guardada en Menú → Historia.» o «Ya salió en otra temporada.» con «Ver» se sacó entero:
molestaba y no hacía falta. Una escena saltada, vista o pasada de largo queda marcada como vista y
no vuelve sola; **Menú → Historia** es el único lugar desde donde se vuelve a ver, y de ahí sale
siempre entera. El único aviso que queda en el juego es el de error (un acto rechazado o una
partida que no carga), con las mismas reglas de siempre (ADR-0017 §7).

## 6. Implementación

- **Escena:** `packages/content/story/<id>.json`, validada por `StoryScene`
  (`packages/schema/src/story.ts`): `id`, `version`, `falconess`, `style` (`box` | `cine`),
  `background`, `titleKey`, `kickerKey`, `trigger`, `lines` (`speaker`, `textKey`, `expression`,
  `key`).
- **Tema de chat:** `packages/content/chat/<id>.json`, validado por `ChatTopic`: `questionKey`,
  `fromTurn`, `replyKeys`.
- **Textos:** en `packages/content/text/es.json` y `en.json`.
- **Pura presentación:** el motor nunca lee escenas ni chats; no cambian el estado ni sortean nada.
  La web decide cuándo vale cada disparador (`apps/web/src/mobile/storyModel.ts`), en qué modo y en
  qué orden sale cada escena (`mobile/flow/scenes.ts`, `mobile/flow/beats.ts`) y guarda lo visto en
  el navegador. Los tiempos de la entrada salen de `introTiming` (`mobile/flow/scenes.ts`) y de
  `STORY`/`MOTION` (`mobile/motion.ts`); nada se fija en el componente.
- **Comprobar:** `pnpm test` (`packages/content/src/story.test.ts`: validación, textos en los dos
  idiomas, un disparador por escena; `text-lang.test.ts`: mismas claves y `{placeholders}`;
  `mobile/flow/scenes.test.ts`: modos, orden y tiempos de la entrada), y los e2e «story» de
  `apps/web/e2e/mobile.spec.ts`, `mobile-flow.spec.ts` (orden, y que una escena no deja aviso) y
  `mobile-motion.spec.ts` (entrada, apuro y salida).

## 6b. Ritmo y escenas ya vistas (dueño, 2026-11-14)

- **Ritmo** (Menú → «Ritmo: Normal / Rápido / Directo», guardado en el navegador, `mobile/pace.ts`).
  En Normal la escena sale entera. En Rápido y Directo sale un **resumen**, como el «skip» de
  Umamusume: más o menos un tercio de las líneas (siempre la primera y la última, al menos tres,
  `digestLines`), cada una entera de una vez y pasando sola (1,1 s en Rápido, 0,65 s en Directo),
  con la entrada corta (§2) y la etiqueta «Versión rápida». Tocar adelanta y «Saltar» la termina,
  como siempre.
- **Ya salida en otra temporada:** no se repite, y no avisa nada (dueño, 2026-11-18): el juego
  sigue de largo. Cuenta como salida también la que se saltó o se vio en versión rápida (dueño,
  D6); desde Menú → Historia se ve cuando se quiera.
- Desde Menú → Historia, la escena siempre sale entera, sin importar el Ritmo.
- Al escribir una escena, la primera y la última línea tienen que contar solas lo esencial: son las
  que quedan en todos los resúmenes.

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
11. ¿Está en castellano (latino neutro, sin voseo) y en inglés, y pasan los tests?
12. ¿La viste en el teléfono, entera y saltándola?
