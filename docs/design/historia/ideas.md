# Bandeja de ideas

Todo lo que cuenta el dueño, tal como lo cuenta. Estados: **idea**, **en discusión**, **decidida**,
**descartada**. «Va a» dice en qué pieza termina (ver `README.md`).

## Estado

**2026-11-16 (sesión 1).** Se aprobó la distribución en seis piezas (`README.md`). El dueño volcó
sus primeras ideas (I1-I5). Decidido: habrá una historia principal del deporte (I1b) además de la
de cada corredora. Abierto: si el jugador es entrenador de la protagonista y en qué año arranca la
historia principal; después, el resto de las preguntas del traspaso.

## Ideas

### I1 · Un Modo Historia por corredora (2026-11-16)

> «Mi idea es que haya un Story Mode. Así como en Umamusume, cada corredora tiene su propio Story
> Mode, que son capítulos de escenas, cinemáticas. Sin gameplay. Solo historia en escenas con mucho
> diálogo y mucha personalidad.»
- Estado: **decidida** la parte «uno por corredora» (2026-11-16, ver abajo); lo demás en discusión.
- Va a: mapa de escenas (orden del Modo Historia) y, cuando toque, ROADMAP §9.
- Decidido (2026-11-16): el Modo Historia de cada Falconess existe «solo desde la perspectiva de
  ese personaje y el trainer» y «se enfocaría más en la historia y personalidad de la Falconess».
- Relación con lo que existe: el Modo Historia ya está decidido como idea (`docs/design/canon.md`
  §5, `docs/ROADMAP.md` §9: «el canon de cada Falconess entero y en orden, sin entrenar»). Lo nuevo
  es que sea **uno por corredora**, en capítulos, con mucho diálogo y personalidad.
- Abierto: si el Modo Historia es solo el canon de la temporada contado entero o también trae
  escenas que no salen en la temporada; si se abre jugando (como el afecto en Umamusume) o está
  disponible de entrada.

### I1b · Main Story Mode: la historia principal del deporte (2026-11-16)

> «La función del story mode principal, podemos decirle Main Story Mode, debería ser la espina
> dorsal del deporte y de las otras historias. Es la que realmente avanza con los años y se le suman
> capítulos en lo que las seasons y actualizaciones van apareciendo.»
- Estado: **decidida** (2026-11-16).
- Va a: cronología (es su columna), biblia del mundo y mapa de escenas.
- Se suma con I2 e I3: cada temporada o actualización (reglas, modos nuevos) llega como capítulos
  nuevos de la historia principal.

### I2 · El deporte es nuevo en el mundo (2026-11-16)

> «El deporte de Falconess, las carreras y todo eso, está muy nuevo todavía (en el mundo en el que
> transcurre el juego), es un deporte y espectáculo nuevo, por lo que pueden haber modificaciones,
> nuevas reglas, nuevos modos.»
- Estado: **en discusión**.
- Va a: biblia del mundo (historia del deporte) y cronología.
- Por qué importa (dueño): es una fortaleza que Umamusume no tiene; las carreras de caballos reales
  tienen reglas fijas.

### I3 · Nuevos tipos de carrera para temporadas futuras (2026-11-16)

> «Que se agreguen carreras urbanas, con tráfico, u obstáculos, o carreras más parecidas a Le Mans,
> donde sea sobre resistencia vs el clima y el tiempo, o carreras en equipos!! Donde se implementen
> skills de soporte y se pueda armar un team que realmente trabaje junto y en teamwork.»
- Estado: **idea** (para actualizaciones futuras, no para la temporada actual).
- Va a: biblia del mundo (el deporte y su calendario) y cronología (cuándo aparece cada modo).
- Tres tipos: urbanas (tráfico, obstáculos); resistencia tipo Le Mans (clima, tiempo); por equipos
  (habilidades de soporte, trabajo en equipo).
- A tener en cuenta cuando se diseñe el juego (no ahora): hoy las pistas no tienen clima
  (`docs/decisions/ADR-0007-pistas-sin-biomas.md:18-24`, el dueño dijo «lo agregaremos después si
  es necesario») y el motor de carrera está congelado (ADR-0010); cada modo nuevo sería un ruleset
  nuevo con su ADR.

### I4 · La protagonista de la historia principal (2026-11-16)

> «Crear un personaje como Special Week. Típico de Personaje Principal, que funcionaría como los ojos
> del player descubriendo y viviendo el mundo. Haría que el player conociera las G3 o las carreras
> comunes y de bajo nivel, que conociera el avance del Mundo y de la historia del mismo. Un personaje
> que empiece desde 0, desde abajo, al cual le explican las reglas, no solo del deporte, sino también
> del mundo en sí, qué tipo de tecnología hay, por qué se inventaron las Falconess, el porqué de
> muchas cosas.»
>
> «Que la versión de Special Week nuestra no sea jugable fuera del Main Story Mode, que sea única de
> ese modo, ya que sería incoherente que una Special Week recién amateur corra vs Peregrina o
> Caracara, las cuales hay que tomarlas como no solo pioneras, sino también como las estrellas del
> momento.»
- Estado: **decidida** la idea (2026-11-16); personaje sin nombre ni ficha todavía.
- Va a: biblias de personaje (nueva, id provisorio a definir), relaciones, cronología.
- Personaje propio con el papel de Special Week (la recién llegada que descubre el mundo), no una
  copia de ella.
- No jugable fuera del Main Story Mode.
- Decidido de paso: Peregrina y Caracara son **pioneras y estrellas del momento** del deporte.
- Decidido (2026-11-16): **el jugador es su entrenador, y también es nuevo** en el mundo: «alguien
  que solo quiere ayudarla a la protagonista a entrar en el mundo de las Falconess, pero que no tiene
  mucha experiencia de entrenador, por lo que también va a aprender las reglas y métodos y todo lo
  que significa ser un entrenador de Falconess» (el dueño lo compara con la historia de Oguri Cap).
- Decidido (2026-11-16): **arranca el mismo año en que las tres originales ya son las estrellas** «en
  sus propios sectores, representando a sus cuadrillas».
- Decidido (2026-11-16): «sector» es la distancia: **Peregrina, la estrella de las cortas; Cernícala,
  de las medias; Caracara, de las largas.** Coincide con sus letras de distancia (`docs/BRIEF.md:265`:
  Peregrina A-A-B-C, Cernícala C-B-A-B, Caracara C-C-B-A).
- Decidido (2026-11-16): lo que tiene «banner» es la **escudería** (Kōryū Racing, etc.); la cuadrilla
  sigue siendo su equipo de mecánicos.
- Abierto: si Caracara es la estrella de las largas ese mismo año, ¿dónde estaba en la gran Larga
  de Peregrina? La crónica dice que «todas las demás eran fondistas» y que ganó Milana
  (`docs/design/canon-peregrina.md`, §1).

### I6 · Las escuderías tienen varias Falconess (2026-11-16)

> «Las cuadrillas [escuderías, aclarado el mismo día] tienen a varias Falconess bajo su banner. Por el momento solo estas 3 son las que
> se pueden jugar, pero a futuro vamos a crear más cuadrillas, más Falconess.»
- Estado: **decidida** (2026-11-16).
- Va a: biblia del mundo (escuelas y cuadrillas) y relaciones.
- Aclarado (2026-11-16): «Dentro de Kōryū Racing hay más Falconess aparte de Peregrina, con los
  mismos colores. Mi idea es ir sacando Falconess como saca Umamusume sus corredoras. Tienen los
  colores de su escudería, pero tienen sus propias personalidades. También tienen los mismos valores
  que la escudería, pero pueden afrontarlos y mostrarlos de un modo diferente dependiendo de sus
  personalidades, ejemplo, Kōryū Racing es claramente como Ferrari, lujo y deportista al mismo
  tiempo, y hay diferentes formas de representar eso, sin ir totalmente en contra y no encajando
  coherentemente.»
- Regla para las biblias: cada Falconess lleva los colores y los valores de su escudería, mostrados
  a su manera, nunca en contra. Kōryū Racing: lujo y deporte a la vez (como Ferrari).
- Consecuencia para la cronología: las tres originales son estrellas a la vez, el mismo año. Falta
  confirmar con el dueño que eso responde «¿corren el mismo año del mundo?» del traspaso.

### I5 · Creá tu propia Falconess, al azar (2026-11-16)

> «Crea tu propia Falconess y Trainer, pero con medidas random, es decir, el player la entrena, pero
> su Falconess es random, creada de una seed random, con stats y skills básicas random (obviamente
> nivelados ambos) y hasta con nombre random. Esto sería una mezcla de Rimworld (que genera
> personajes randoms con sus falencias y fortalezas) y especialmente e importantísimo: XCOM, el
> player se debería de poder enamorar de su Falconess que le tocó random. Se puede llamar desde Red
> Crimson, Hopeful Comet, Crimson Red, etc! Pero es la que le tocó, y está en él si la acepta para
> entrenarla, o tirar el dado para que le toque otra.»
- Estado: **idea** (para más adelante, cuando exista la infraestructura).
- Va a: biblia del mundo (de dónde salen estas Falconess) y ROADMAP.
- Ya hay piezas: el juego entero sale de una semilla, y existe un generador de nombres
  (`docs/handoff/generador-de-nombres.md`, `pnpm names`).
- Abierto para más adelante: cuántas veces se puede tirar el dado; si estas Falconess tienen
  historia propia o solo la que arma la temporada; cómo convive con el gacha sin pago para ganar.

#### I5 y el multijugador (dueño, 2026-11-16)

> «La idea es que el juego llegue a ser Multiplayer. Es decir, mi Falconess random, corriendo vs las
> Falconesses random de otros más. Lo que sí no se hará, es mi Peregrina vs la Peregrina de otros.»

Confirmado y ampliado por el dueño el mismo día:

> «Hay dos tipos de Falconess "jugables". Las 3 que están ahora (y las que vengan después),
> handcrafted por nosotros y su personalidad. El jugador juega sus temporadas, puede ver sus Story
> Mode, y generar Black Boxes con los resultados de las temporadas. Y están las Falconess Random, que
> el jugador elige de entre 3 randoms, que son únicas de cada player, serían como la representante de
> la cuenta del jugador, la cara del jugador en el multiplayer, es random, sale de una seed, tiene
> fortalezas y debilidades (y stats básicos y bajos), y también tiene su propia temporada para que el
> player la pueda levear y armar COMO QUIERA, esta parte es importante, ya que Peregrina, por
> ejemplo, no puede armarse como uno quiera, ya tiene su camino predilecto. Lo que tiene de
> interesante la Falconess random, es que puede utilizar 2 black boxes salidas del otro modo […] (hay
> que hacer que las black boxes tengan su cantidad de usos, ejemplo, 3 usos MÁXIMO y después se
> destruyen).»
- Estado: **decidida** como dirección (2026-11-16); es diseño de juego, no de historia: cuando se
  lleve al juego va al BRIEF y a un ADR propio.
- **Falconess con nombre:** hechas a mano, con personalidad, temporada con camino propio, Modo
  Historia, y dejan cajas negras. Nunca corren entre jugadores.
- **Falconess al azar:** se elige una entre tres candidatas; sale de una semilla; única de cada
  jugador; es la cara de su cuenta en el multijugador; empieza con stats bajos, fortalezas y
  debilidades; tiene su propia temporada y se arma como el jugador quiera.
- **Cajas negras:** la Falconess al azar usa hasta dos por temporada; cada caja tiene usos (por
  ejemplo, 3 como máximo) y después se destruye.
- **El ciclo (ejemplo del dueño):** querés una Falconess de Sprint → repetís la temporada de
  Peregrina hasta sacar dos cajas buenas (Agilidad 3★, habilidades de Sprint) → se las ponés a tu
  Falconess al azar (cada una pierde un uso) → si la temporada sale mal, probás otra vez → cuando se
  gastan, volvés a Peregrina por más.
- Abierto: hoy las cajas también se usan en las temporadas de las Falconess con nombre (sacar una
  caja en Normal para pasar Exigente, `docs/decisions/ADR-0013-herencia-con-suerte.md`, contexto y
  decisión 1). ¿Eso sigue, y ahí también gasta usos?
- Abierto: ¿una sola Falconess al azar por cuenta o varias? ¿A qué escudería pertenece? ¿Qué
  historia tiene su temporada, si no tiene personalidad escrita a mano?
- Nota para las opciones de abajo: gastar usos de cajas ya es un riesgo (lo que se arriesga en cada
  intento), y «elegir entre tres» ya está decidido.

#### Opciones para I5 (propuesta, 2026-11-16, para que elija el dueño)

Qué arriesga la Falconess al azar (para que el jugador se encariñe, como en XCOM):

1. **Carrera con fin:** corre un número fijo de temporadas y se retira; queda en una sala con su
   historial. No vuelve nunca.
2. **Marcas que quedan:** lesiones o caídas dejan secuelas para siempre (un techo de stat más bajo,
   una manía); cada Falconess termina distinta.
3. **El accidente grave:** muy de vez en cuando una caída rompe las alas y termina su carrera. Quizá
   solo en un modo «sin red» que el jugador elige. Revisar con el tono (T17).
4. **El contrato:** si no rinde, la cuadrilla o el patrocinador la dejan ir.
5. **El legado:** solo lo que logra pasa a la siguiente (herencia, ADR-0013); una temporada mala es
   una herencia pobre.

Cuántas veces se tira el dado:

1. **Pocas tiradas que se recargan** (por ejemplo, tres por día).
2. **Pruebas de selección:** se presentan tres candidatas y se elige una; no hay dado.
3. **Tirar cuesta algo ganado jugando,** nunca dinero (gacha sin pago para ganar).
4. **Se cierra al empezar:** se puede tirar antes de la primera semana; después es la tuya, y las
   rechazadas no vuelven.
5. **Las rechazadas siguen en el mundo:** aparecen después como rivales en tus carreras (enlaza
   con el Modo Némesis, T20 de `docs/design/temporada-v3.md`).
