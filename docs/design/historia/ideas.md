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
- Abierto: si el jugador es su entrenador; en qué año del mundo arranca respecto de las crónicas de
  las estrellas.

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
