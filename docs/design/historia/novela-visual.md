# Escenas tipo novela visual para los Modos Historia (propuesta)

Pedido del dueño (2026-11-17): la historia principal necesita «un sistema e interfaz más adecuado a
novelas gráficas que el actual que usan las escenas de historia en la temporada de Peregrina». Mostró
tres capturas de Umamusume: una escena de capítulo del Modo Historia y dos de un evento dentro de la
temporada.

**Decidido (dueño, 2026-11-17):** dos formatos, como Umamusume. Los Modos Historia (la historia
principal y la de cada estrella) usan la «conversación»; la temporada sigue con el cuadro y el
cinemático de hoy.

**Prototipo (2026-11-17):** página «Vuela Alto · Capítulo 1» (https://claude.ai/artifact/NSyxoymeyBMx8PJc9soGwW),
fuera del juego, con texto de ejemplo que no es canon y nombres provisorios. Muestra escenario con
tres lugares, conversación que se acumula, narración, cambio de fondo, ilustración a pantalla
completa (el cuadro), una respuesta elegible del entrenador, indicaciones de música, Auto y Saltar.

**Ajustes del dueño (2026-11-17):** la interfaz va bien, pero «hay que mejorar los tamaños»: como
en Umamusume, el escenario de arriba más chico y muchos diálogos abajo. La versión 2 del prototipo
deja el escenario en ≈ 27 % de la pantalla y la conversación compacta (con 390 × 844 se leen unas
cinco líneas a la vez). Aprobado tal cual: la respuesta elegible, la transición a la ilustración con
su descripción, y los colores.

**Lo nuevo arriba (dueño, 2026-11-17):** «si el chat va en esta dirección, el player está viendo abajo
de la pantalla y pierde de vista la escena de arriba». La línea más nueva entra arriba, justo debajo
del escenario, y lo leído baja (más tenue); así se lee y se ve la escena a la vez. Las opciones
también salen arriba. La escena ocupa toda la pantalla del celular, con Auto y Saltar en una barra
al pie (versión 4 del prototipo).

**Versión 5 (2026-11-17): reescrita con la biblia de escritura** (`docs/design/biblia-escritura.md`).
Texto de ejemplo, no canon. Cuatro escenas con su hoja (objetivo, obstáculo, giro, salida), solo
las diez expresiones del esquema, dos tarjetas de narración en unas cuarenta líneas, una ilustración
en el giro mayor sin narración, y una elección con tres posturas (aceptar, rechazar, desviar), cada
una con su expresión de respuesta y su propia versión de la línea de vuelta. El botón «Dirección»
muestra las hojas de escena, la acción que hay debajo de cada línea y la postura de cada opción.
Probada en los tres caminos, en claro y en oscuro (iPhone 13), sin errores.

**Efectos de texto (dueño, 2026-11-17, a partir de Doki Doki Literature Club): versión 7, propuesta.**
Cada efecto es una acotación del guion (`[EFECTO: …]`) y tiene que tener un motivo dramático;
pocos por escena. Probados en el prototipo:

| Efecto                    | Para qué                                           | En el prototipo                                          |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Texto rápido              | Urgencia, reflejo, ráfaga                          | «¡La agarro!», «¿Yo vuelo? ¿No era el trapo?»            |
| Texto lento               | Duda, cansancio, recuerdo                          | el «…» de la veterana, «De chica no miraba a las cinco.» |
| Pausa dentro de la línea  | El tiempo de leer o de dudar                       | «Vuela Al… O.»                                           |
| Énfasis                   | La palabra que importa, en el color de quien habla | «El trapo es a las _cinco_.»                             |
| Sacudida del globo        | Un grito, un freno en seco                         | «¡Por el borde no!»                                      |
| Temblor del escenario     | Un golpe físico (con sonido)                       | el ala encastra: «Clac»                                  |
| Susurro                   | Un aparte, algo dicho por lo bajo                  | «Igual que yo.»                                          |
| Entrada de la frase clave | La línea que queda                                 | «Peor empezó esta escudería.»                            |

Ideas sin probar: tachar y corregir (un personaje se desdice), el globo que tarda en aparecer (alguien
duda antes de hablar) y una interferencia visual reservada para la escudería sombra, con sus colores.
Con «movimiento reducido» en el celular, ningún efecto se mueve.

Estado del resto: **propuesta**. Nada de esto está aprobado ni empezado. Tocar el juego pide (1) que termine el
trabajo del flujo de pantallas en `playtest-ui` (`docs/handoff/mapa-de-historia.md`, «Antes de
empezar») y (2) un plan aprobado, porque cambia el formato de las escenas (`packages/schema`).

## Lo que muestran las capturas

|                    | Modo Historia (captura 1)                                                                                                                | Evento de temporada (capturas 2 y 3)                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Pantalla           | Arriba, un escenario con el personaje de cuerpo entero en un lugar. Abajo, la conversación entera como una lista que crece y se desplaza | Fondo a pantalla completa; el personaje grande, de pie, en el centro; un globo abajo               |
| Texto              | Tarjetas: narración en blanco; cada línea con el retrato redondo y el nombre de quien habla                                              | Un globo por línea, con el nombre en una pestaña de color; la narración sin nombre                 |
| Lo leído           | Queda a la vista: se puede volver a leer subiendo                                                                                        | En un botón «Log» aparte                                                                           |
| El jugador         | Sus respuestas aparecen en la conversación, con un ícono propio                                                                          | Narra en primera persona («I take out my phone…»)                                                  |
| Contexto del juego | Ninguno: es lectura pura                                                                                                                 | Siguen a la vista las semanas que faltan, la meta, la energía y un cartel con el nombre del evento |
| Botones            | Foto, Auto, Menú                                                                                                                         | Saltar, Rápido, Log, Menú                                                                          |

## Lo que tiene hoy Falconess

Tres formatos (`docs/design/escenas.md` §1): cuadro de diálogo (parecido al evento de temporada, pero
la escena arranca en negro y tapa el juego), cinemático y chat. Una escena tiene un solo fondo, un
retrato de la cintura para arriba por línea, y no tiene elecciones, música propia ni varios
personajes a la vez (`packages/schema/src/story.ts`).

## Lo que le faltaría a una escena de Modo Historia (propuesta, para elegir)

1. **Formato «conversación»** como la captura 1: escenario arriba, lo dicho acumulado abajo.
2. **Varios personajes en escena** a la vez, con lugar (izquierda, centro, derecha), y entradas y
   salidas.
3. **Cambio de fondo dentro de la escena** (el hangar de Vuela Alto, la ciudad, la casa con el cuadro
   de las mensajeras).
4. **Ilustraciones especiales a pantalla completa** para los momentos clave (el cuadro de la carrera
   de la paz).
5. **Respuestas del jugador** dentro de la conversación. Si alguna elige entre dos, solo cambia las
   líneas que siguen, nunca el juego (las escenas son pura presentación).
6. **Hablantes con nombre** para los entrenadores canon y el de la historia principal (hoy el
   entrenador es siempre `trainer`, sin cara).
7. **Música y efectos** por escena o por línea.
8. **Capítulos y episodios:** historia → capítulo → escena, con orden y desbloqueo (ya estaba
   previsto: «capa, capítulo y orden» en el traspaso, fase 5).
