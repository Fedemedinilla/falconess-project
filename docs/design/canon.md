# Canon, temporada y «¿y si…?»: cómo se escriben las historias de Falconess

Decidido con el dueño el 2026-11-13. Vale para todas las Falconess. Antes de escribir la historia de
una Falconess, leer esto, `docs/design/escenas.md` (cómo se hace una escena) y
`docs/design/investigacion-personajes.md` (por qué un personaje se siente vivo).

## 1. La idea

Lo que pasó en el mundo de Falconess (el canon) y lo que vive el jugador en una partida (la
temporada) son cosas distintas. La temporada tiene **la espina dorsal del canon**, con cambios
pequeños que el jugador hace con su gameplay. A veces, en un punto elegido, el jugador puede torcer
el destino: eso es un «¿y si…?».

Es lo que hace Umamusume con caballos reales: la historia real es el punto de partida, la que todos
sienten que «debería» pasar, y la temporada del jugador es la versión en la que el cariño y el
entrenamiento alcanzan para cambiarla. El final feliz pesa porque se sabe cuál era el otro.

## 2. Las cuatro capas

| Capa          | Qué es                                                                                        | Quién la escribe                                  | Dónde vive                                                  |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| **Canon**     | Lo que pasó en el mundo. Una sola versión.                                                    | Solo el dueño                                     | `docs/design/canon-<falconess>.md`; quizás un Modo Historia |
| **Temporada** | Una partida: la versión que vive el jugador. Sigue al canon salvo donde el jugador lo cambia. | El dueño escribe el camino; el jugador lo recorre | El juego: escenas, metas, rivales, chats                    |
| **«¿Y si…?»** | Un final o momento que contradice el canon y se gana jugando muy bien.                        | El dueño lo escribe; el jugador lo alcanza        | Escenas propias en la temporada                             |
| **Resto**     | Lo que colorea una partida sin contar la historia: eventos de suerte, entrenamientos, nota.   | El juego                                          | Eventos, entrenamientos, «Lo que pasó»                      |

## 3. Las reglas

0. **La temporada es para jugar; el canon se muestra en el Modo Historia** (dueño, 2026-11-13). La
   temporada es el modo para sacar cajas negras y divertirse: su historia acompaña, no obliga. Una
   bisagra tiene que ser posible, ni imposible ni fácil.

1. **El canon fluye hacia la temporada, nunca al revés.** Lo que pasa en una partida no reescribe el
   mundo.
2. **Las otras historias recuerdan solo el canon.** Si en la historia de Cernícala aparece Peregrina,
   aparece la que perdió la Larga.
3. **Pocas bisagras, elegidas por el dueño.** Una bisagra es el punto donde el jugador puede cambiar
   el canon. Todo lo demás es canon fijo o resto. Si todo se puede cambiar, nada importa.
4. **El canon es lo más probable, no lo obligatorio.** Las metas y las rivales se arman para que la
   temporada caiga más seguido en el canon, pero el «¿y si…?» tiene que estar al alcance de quien
   entrena bien (la Larga: 37 % al nivel del dueño).
5. **El jugador nunca falla por el canon.** Si el canon es una derrota, la temporada igual se completa
   con buena nota (la Larga de Peregrina es «Correr»). Fallar es otra cosa: no llegar.
6. **Un final temprano no es canon ni «¿y si…?».** Es la temporada que se cortó antes (falla una meta
   anterior a la bisagra). Su escena cuenta la misma herida, que llega antes.
7. **El resto colorea, pero no decide.** Un evento de suerte puede pasar en cualquier partida; nunca
   contradice el canon ni lo crea.

## 4. Cómo se escribe la historia de una Falconess

1. **El canon primero**, como una crónica: qué pasó, en qué orden, quién estuvo, qué le quedó.
2. **Las bisagras:** una o dos, donde el jugador puede cambiar el destino, y cuál es el «¿y si…?» de
   cada una.
3. **Las metas y las rivales**, para que el canon sea lo más probable y el «¿y si…?» sea difícil pero
   posible (medido con el lote, como en ADR-0014 y ADR-0015).
4. **Las escenas**, cada una marcada con su capa en el documento de canon de esa Falconess:
   - **canon:** cuenta algo que pasó en el mundo; la ve todo jugador que llega ahí;
   - **¿y si…?:** solo existe porque el jugador cambió una bisagra;
   - **final temprano:** la temporada se cortó antes de la bisagra.
5. **Los chats:** canon (es quien es antes de la bisagra), salvo que digan lo contrario.

## 5. Más adelante: un Modo Historia

Las temporadas son del jugador. El canon, entero y en orden, podría vivir en un **Modo Historia**
aparte: los capítulos tal como pasaron, sin entrenar, para quien quiere conocer el mundo (como la
historia principal de Umamusume, separada de sus temporadas). Las escenas marcadas como canon son su
materia prima. Queda anotado en `docs/ROADMAP.md` (después del MVP).
