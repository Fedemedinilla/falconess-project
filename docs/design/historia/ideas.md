# Bandeja de ideas

Todo lo que cuenta el dueño, tal como lo cuenta. Estados: **idea**, **en discusión**, **decidida**,
**descartada**. «Va a» dice en qué pieza termina (ver `README.md`).

## Estado

**2026-11-16 (sesión 1): resumen de todo lo que hay.**

Cómo trabajamos: seis piezas en `docs/design/historia/` (`README.md`) más `secretos.md`; la biblia del
mundo en `docs/world.md`.

Decidido:

- **Modos de historia.** Un Main Story Mode, espina dorsal del deporte, que crece con cada temporada
  y actualización. Su protagonista es una recién llegada que descubre el mundo, no jugable fuera de
  ese modo; el jugador es su entrenador, también nuevo. Aparte, un Modo Historia por cada Falconess
  con nombre, contado desde ella y su entrenador (I1, I1b, I4).
- **Dos tipos de Falconess.** Las de nombre (hechas a mano, temporada con camino propio, dejan cajas
  negras, nunca se enfrentan entre jugadores) y las al azar (se elige una de tres; equipo de tres
  por cuenta con una principal; se arman libres; temporada larga y competitiva sin historia; cara
  del jugador en el multijugador). Las cajas negras tienen usos (ej. 3) y se gastan en los dos
  modos (I5).
- **El mundo.** Propio y futuro, «parecido, pero no tanto». Alas de colores «a lo anime». Guerras de
  unas tres generaciones, un clima que hizo imposible viajar y comunicarse, las Falconess como
  mensajeras, una carrera entre bandos que trajo la paz (la imagen encuadrada en muchas casas). La
  guerra terminó hace 30 años; una ex mensajera fundó el deporte hace 10; **este año es la primera
  liga oficial**. Hoy el clima es hostil en partes pero vivible, con restos de la guerra en el
  paisaje. La guerra es pasado: no se olvida, nunca es el tema.
- **Las Falconess.** Nacen con el «algo»: ganas de volar y sentidos levemente aumentados, heredados
  de las mensajeras; base creíble con algo de mito.
- **Las escuderías.** Nacen de los bandos; hoy son casas deportivas con orgullo de origen. Muchas;
  cada una con varias Falconess que muestran sus valores a su manera (Kōryū: lujo y deporte, «como
  Ferrari»). Puerta abierta a escuderías menos fair play. En el multijugador, los grupos de
  jugadores también son escuderías.
- **El trío pionero.** Peregrina (cortas), Cernícala (medias) y Caracara (largas), estrellas a la vez
  y ganadoras de la primera liga. Caracara no corrió la gran Larga, pero vio perder a Peregrina.
- **Futuro del deporte.** Carreras urbanas, de resistencia contra el clima y por equipos (I3).
- **Secreto:** la escudería sombra, entrenada para ganarle a cada estrella; trae las habilidades
  ofensivas cuando se revele (`secretos.md` S1).
- Gerifalte queda para después (I8).

Abierto (lo más importante):

- El resto del secreto (lo va a contar el dueño): Milana, la Jefa, quién mandó la invitación.
- Caracara: si ganó las largas de la primera liga, por qué no corrió la gran Larga.
- El mundo: países y mapa, cómo funcionan las alas, la fundadora, la carrera de la paz, la historia
  de cada escudería, carreras, vida cotidiana, glosario.
- La temporada de la Falconess al azar: con qué se rellena.
- Contradicción a corregir con permiso: `docs/design/historia-peregrina.md:85-86` (quién invita).

Sigue: completar el secreto; después, la fundadora y la carrera de la paz, o las escuderías.

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
- Decidido (2026-11-16): **las cajas también gastan usos en las temporadas de las estrellas.** «Así
  que está en el player decidir si usa una black box perfecta para entrenar a una Peregrina e
  intentar sacar una black box perfecta++, o usarla para su Falconess random.» (Cambia
  `docs/decisions/ADR-0013-herencia-con-suerte.md`, que hoy no tiene usos: va con su ADR cuando se
  lleve al juego.)
- Decidido (2026-11-16): **la Falconess al azar no pertenece a ninguna escudería.** En el
  multijugador, los grupos de jugadores (guilds, clanes) se llaman **Escuderías**, con colores que
  elige quien la funda («Guild Master o Chief»).
- Decidido (2026-11-16): **su temporada no tiene historia.** «Hay que ver cómo rellenar esos
  espacios, pero la idea es que sea una temporada más compleja y larga que la de las 3 estrellas
  […] ya que la temporada de la Falconess random es más de y para competición que de historia y
  singleplayer.» Abierto: con qué se rellena.
- Decidido (2026-11-16): **cada cuenta tiene un equipo de tres Falconess al azar, con una principal**
  que es la cara de la cuenta. «Le damos la chance de nunca terminar de grindear su "perfecta" […]
  le quedan aún 2 Falconess más para levear y mejorar, si es que quiere correr en pvp en las
  carreras que su perfecta actual no entra.»
- Abierto: las escuderías del mundo (Kōryū Racing…) y las de los jugadores comparten nombre. ¿Las de
  los jugadores son escuderías nuevas dentro del mundo (el deporte es joven y crece) o algo aparte?
- Nota para las opciones de abajo (superadas el 2026-11-16): gastar usos de cajas ya es un riesgo (lo que se arriesga en cada
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

### I7 · El trío pionero (2026-11-16)

> «[Caracara] no corrió esa Larga. Lo agregaremos a su historia/temporada. Pero sí vio a Peregrina
> correr y perder. Hay que pensar en incluir más a las otras 2 estrellas en las historias de
> Peregrina. Así entre las 3 forman el trío pionero.»
- Estado: **decidida** (2026-11-16).
- Va a: cronología (ya anotado), relaciones, canon de Peregrina y de Caracara, mapa de escenas.
- Canon: Caracara no corrió la gran Larga; la vio desde afuera y vio perder a Peregrina. Por qué no
  corrió se escribe en su historia.
- Abierto: en qué escenas de Peregrina aparecen más Cernícala y Caracara.

### I8 · Gerifalte, para después (2026-11-16)

- Estado: **decidida** la postergación (2026-11-16: «Gerifalte déjala para después. No importa
  ahora»). Sigue siendo la rival espejo de la Copa en Exigente, sin personalidad.

### I9 · Empezamos por el mundo (2026-11-16)

- Estado: **decidida** (2026-11-16). El dueño pidió saber cómo se construye un mundo que parezca
  vivo (Tolkien, Cygames) y por dónde empezar; la explicación y las primeras preguntas se dieron en
  el chat de la sesión 1. Va a: `docs/world.md`.

### I10 · El trasfondo: guerras, clima y mensajeras (2026-11-16)

- Estado: **decidida** (2026-11-16). Ordenada en `docs/world.md` §1-§5 con las palabras del dueño:
  mundo propio y futuro; alas «a lo anime»; el «algo» de las Falconess; guerras, clima imposible,
  mensajeras, la carrera que trajo la paz y la ex mensajera que funda el deporte; las escuderías
  nacen de los bandos.

### I11 · Milana y la invitación: una trama escondida (2026-11-16)

> «Milana sabía demasiado y exactamente cómo ganarle a Peregrina... además... ¿quién envió la
> invitación a la Larga a Peregrina??? HHMMMMMMMMMMMMM»
- Estado: **en discusión**. Pista del dueño, dicha a propósito sin revelar más. Se cruza con la
  idea de una escudería «sombra», menos fair play, con un jefe veterano (`docs/world.md` §5).
- Lo que ya hay en el juego y no lo contradice:
  - La crónica dice solo «la invitaron» (`docs/design/canon-peregrina.md:19`).
  - La escena «La invitación» dice «llega un sobre rojo al box», sin remitente, y cierra con la Jefa
    guardando el sobre en un cajón sobre «una foto vieja de otra Falconess, dormida en una tribuna»
    (`packages/content/text/es.json`, `story.peregrina-invitation.1` y `.11`).
- Lo que sí lo contradice: `docs/design/historia-peregrina.md:85-86` dice que la invitan «fans,
  prensa, Kōryū». Ajustar si el dueño lo confirma.

### I12 · Temporadas futuras (2026-11-16)

Cada una trae una actualización de pistas o mecánicas. **Condición del dueño: no cambian el motor**
(«PERO NO CAMBIAN EL MOTOR»). Estado: **idea**; el orden entre ellas no está decidido. Va a:
cronología (después del año de la primera liga), biblia del mundo, `secretos.md` (la primera).

1. **La escudería sombra.** Se descubre; sus miembros están entrenadas y perfeccionadas para ser la
   contraparte de las tres estrellas. Trae: habilidades que perjudican a otras (debuffs), acciones
   agresivas como bloqueos o rebufos «con consciencia».
2. **Carreras por equipos.** Equipos de tres Falconess en la misma carrera. Trae: sinergia entre
   Falconess y habilidades que ayudan a otras (buffs).
3. **El Underground.** Hoy todas las carreras son oficiales, pero en las ciudades hay un circuito
   subterráneo: Falconess sin escudería o demasiado jóvenes para las ligas mayores compiten en
   callejones y entre el tráfico. Trae: pistas urbanas, obstáculos como autos y edificios.
4. **Carreras de resistencia (estilo Le Mans).** Duran días. Las participantes arman equipos
   improvisados dentro de la carrera, acampan, descansan y hacen otras actividades para seguir; se
   pueden rendir y salir. Trae: carreras que duran días.

Nota del editor, para cuando se lleven al juego (revisado en el código el 2026-11-16):

- Ya existe en el motor: bloqueo y rebufo (`packages/sim/src/rulesets/v3/constants.ts:130-184`,
  `blockMm`, `airDraftBand`) y tipos de tramo como saltos, curvas, cañón y agua (`courses-v3`).
- No existe: habilidades que afecten a otra corredora. Hoy una habilidad solo cambia a quien la usa
  (`packages/schema/src/skill.ts:16-25`, `SkillEffect`), y `docs/design/temporada-v3.md` T19 ya
  anotaba que las habilidades contra rivales piden un cambio de motor. Las temporadas 1 y 2 chocan
  con la condición «sin cambiar el motor» en esa parte.
- **Decidido (dueño, 2026-11-16):** para las temporadas 1 y 2 se acepta **un único cambio de motor,
  solo para «habilidades que afectan a otras»**, decidido y escrito (con su ADR) cuando se llegue a
  esas temporadas. Todo lo demás, sin tocar el motor.
- **Decidido (dueño, 2026-11-16):** **las Falconess al azar vienen del Underground,** sin escudería;
  el jugador las descubre en las pruebas de selección.
- Posible sin tocar el motor (propuesta): pistas urbanas armadas con los tramos que ya existen;
  puntaje por equipo calculado fuera de la carrera; la resistencia como varias etapas seguidas con
  decisiones entre etapas (acampar, descansar, rendirse) en la capa de temporada.

### I13 · La protagonista crece con el mundo, como en FFXIV (2026-11-16)

> «Cada expansión le agrega algo al personaje. Y sabiendo que es un MMORPG, es muy raro que haya un
> personaje principal que conecte a todas las expansiones. Yo veo a la protagonista así, que su
> historia va creciendo con la del mundo y cómo se va abriendo de a poco al jugador.»
- Estado: **decidida** la dirección (2026-11-16). Investigación: `investigacion-ffxiv.md`.
- **Decidido (dueño, 2026-11-16): es nieta de una de las mensajeras de la carrera de la paz** y lo va
  descubriendo de a poco. «Pero quiero que le cueste, que empiece desde 0, desde bien bien abajo. No
  como Special Week que ya de la nada es buena corriendo. Si bien haremos clichés de anime, no
  cometeremos sus errores.» Cómo se revela el lazo: `secretos.md` S2.
- **Decidido (dueño, 2026-11-16): el entrenador de la historia principal es un personaje oficial,
  masculino, con historia propia.** «Ambos son súper naive al inicio, ella es mala corriendo pero
  quiere mejorar, y él es malo entrenando, pero quiere mejorar. La Main Story va de eso.»
- **Decidido (dueño, 2026-11-16): son personas distintas.** El entrenador de las temporadas es «faceless»:
  «tiene que cumplir el rol de ser la cara del Player y listo, por eso su diálogo es tan neutro y sin
  tanta personalidad» (sigue la regla de `docs/design/escenas.md` §4b). El de la historia principal
  solo existe ahí.
- **Decidido (dueño, 2026-11-16): ella arranca trabajando en el hangar de una escudería chica**
  (limpia, carga piezas, mira correr a las demás). Propuesta, sin confirmar: el entrenador es alguien
  igual de chico en esa misma escudería.

### I14 · Cada estrella tiene su entrenador canon (2026-11-16)

> «En la historia de cada Falconess, ellas TIENEN a su entrenador o entrenadora oficial canon. Eso va
> a generar buenos diálogos y escenas entre Falconess estrella y su trainer.»
- Estado: **decidida** (2026-11-16). Va a: biblias de personaje (una por entrenador), relaciones,
  Modo Historia de cada Falconess.
- En la temporada, el entrenador es el jugador, sin cara (I13). En el Modo Historia de cada estrella
  está su entrenador canon, con personalidad.
- Ejemplos del dueño («imaginá…»), **propuesta** hasta que los confirme:
  - **Peregrina:** un entrenador lento y tranquilo, sin apuro. **Decidido (2026-11-16): no es
    dormilón;** dormir queda como marca de Milana. Encaja con el final del canon, donde le enseña a
    «respirar, despacio, sin apuro».
  - **Caracara:** «ella siendo tan compinche y amigable», su entrenador corre y entrena con ella, y
    después se toman unas cervezas juntos en el hangar o el taller.
  - **Cernícala:** «bien independiente e intelectual»; con su entrenador pelean por quién domina a
    quién, una dinámica constante de quién tiene el poder y quién da las órdenes.
- Rasgos de personalidad dichos de paso y tomados como **decididos**: Caracara es compinche y
  amigable; Cernícala es independiente e intelectual. Coinciden con sus líneas de presentación
  (`ui.m.pick.line.caracara`: «Aventurera. Si hay un atajo, lo prueba»;
  `ui.m.pick.line.cernicala`: «Calma y analítica. Mide antes de moverse»).
- **Decidido (2026-11-16): el Modo Historia de cada estrella tiene escenas propias,** más largas y
  con su entrenador canon. La temporada sigue con sus escenas y el entrenador neutro: cuentan lo
  mismo desde dos lugares. Las 17 escenas de Peregrina de hoy son de temporada.

### I15 · Vuela Alto, la escudería de la protagonista (2026-11-17)

> «Una escudería que no es nueva, pero que está súper descuidada, y lo mejor? sus colores son celeste
> y blanco, y se llama Vuela Alto (serían de "Argentina"). La protagonista cae ahí por una job offer,
> tienen solo 1 Falconess activa y que corre y sería como la modelo a seguir (como Silence Suzuka de
> Special Week) para la protagonista.»
- Estado: **decidida** (2026-11-17). Va a: `docs/world.md` §5, biblias, relaciones.
- Personaje nuevo: la única Falconess activa de Vuela Alto, modelo a seguir de la protagonista.
  Sin nombre ni ficha.
- **Decidido (2026-11-17):** Vuela Alto es la sexta casa fundadora y la del bando de la abuela; la
  sexta mensajera está escondida a plena vista en la imagen famosa (`secretos.md` S3).
- **Decidido (2026-11-17):** su única Falconess activa es una **veterana leal**, la última que se
  quedó cuando las demás se fueron a escuderías grandes; corre por orgullo y no gana tanto como
  antes. «Hay que darle una buena personalidad, no perfecta, ella también tiene problemas.»
  Borrador: `personajes/veterana-vuela-alto.md`.
- **Propuesta aceptada para empezar (2026-11-17):** su problema es el orgullo: no acepta que está en
  bajada, rechaza ayuda y esconde una lesión o un cansancio. «Luego lo veremos.»
- Tema de la historia principal decidido el mismo día: la luz (`docs/world.md` §5b).

### I16 · Temas importantes: neurodivergencia y salud mental (2026-11-17)

- Estado: **decidida** (2026-11-17): se muestran en rasgos, acciones, miedos, decisiones, gustos y
  disgustos, sin nombrar diagnósticos y sin taparlos con lo tierno (`docs/world.md` §8). Abierto: si
  se cruzan con los sentidos aumentados. Va a: `docs/world.md`
  §8 (tono) y a las biblias.
- Ya hay material en el canon que toca esto sin nombrarlo: después de la Larga, Peregrina «no supo
  cómo actuar ni qué sentir: no lloró, no se enojó, no le salía nada» (`docs/design/canon-peregrina.md`
  §1).

### I17 · Un sistema de novela visual para los Modos Historia (2026-11-17)

> «Para la historia principal, vamos a necesitar crear un sistema e interfaz más adecuado a novelas
> gráficas que el actual que usan las escenas de historia en la temporada de Peregrina.»
- Estado: **en discusión**. Comparación y propuesta: `novela-visual.md`. Va a: un plan para el juego
  (fase 5), cuando termine el trabajo del flujo en `playtest-ui`.

### I18 · Los spotters y el entrenador historiador (2026-11-17)

> «Las Falconess cuando eran mensajeras, si bien son la cara de todo, la realidad es que todas tenían
> a un "spotter", o a alguien que las guiaba desde tierra. Es la versión original de los trainers.
> Refuerza el hecho de que es un deporte que necesita de ambos, aunque no parezca.»
>
> «El entrenador no sabe entrenar, pero lo que sí sabe: historia. Estudió historia, y al no conseguir
> trabajo de nada, cayó acá como entrenador. […] Puede intentar traducir y traer eso del pasado, de la
> historia aburrida e "inútil", a convertirlo en entrenamiento, a su manera.»
- Estado: **decidida** (2026-11-17). Ordenada en `docs/world.md` §3b y en `personajes/entrenador.md`.
- También decidido: la protagonista no vuela enseguida; trabaja un tiempo hasta que le pica el
  bichito de intentarlo (`personajes/protagonista.md`).
- Aplicado en el prototipo (versión 9): la escena 4 revela la historia del entrenador en cada una de
  las tres respuestas, y el capítulo termina con ella al trapo, él anotando el viento «como los
  spotters», y la protagonista mirando el ala hasta que la veterana la frena: «Ni se te ocurra».

### I19 · Inútiles de verdad, y el viejo entrenador (2026-11-17)

> «El hecho de que la protagonista sea mala volando, y que el entrenador sea malo entrenando, debe
> siempre tomarse divertido pero también realmente inútiles, no hagas que den cosas por sentado u
> obvias, porque para ellos no lo son.»
>
> «La veterana no está sola, es la única que corre, pero necesita un entrenador para calificar y poder
> correr. Ese entrenador es un personaje anciano, el típico anciano que lo vio todo, sabio, pero al
> mismo tiempo tira quotes y consejos que no tienen nada que ver con nada ni sirven para la ocasión.»
- Estado: **decidida** (2026-11-17). Borradores: `personajes/protagonista.md`,
  `personajes/entrenador.md`, `personajes/viejo-entrenador.md`.
- Corrige I18: el entrenador no habla de mensajeras ni spotters al principio; la conexión llega
  después.
- Efecto nuevo usado en el prototipo (versión 10): imitación de voz (el entrenador imita a la
  veterana, en su color y su letra).

### I20 · El viejo, siempre en el hangar (2026-11-17)

> «Prefiero que el entrenador, el viejo, esté en el hangar siempre, pero durmiendo o diciendo una que
> otra oración a la veterana. Lo importante es que cuando le dice algo, es extremadamente correcto,
> como si la observara mientras duerme.»
>
> «La protagonista sigue diciendo que vuela mal. NO, ella no vuela. Ni quiere volar aún.»
- Estado: **decidida** (2026-11-17). En `personajes/viejo-entrenador.md` y `personajes/protagonista.md`.
- Prototipo versión 11: la protagonista dice «¿Yo? No. Vine a limpiar.»; la veterana presenta al viejo
  con las palabras del dueño; el capítulo cierra con el viejo, dormido, acertando sobre el hombro.
- **Decidido (2026-11-17):** el viejo también duerme: Milana duerme porque todo le cansa; el viejo
  duerme y lo ve todo.

### I21 · Todo el texto de juego a español neutro latino (2026-11-17)

- Estado: **decidida** (2026-11-17): «Definitivamente a neutro latino». Las 17 escenas y los 9 chats
  de Peregrina pasan de voseo a tuteo **cuando termine el trabajo de las pantallas en `playtest-ui`**
  (los textos los leen sus pruebas). Va con plan, como contenido (`packages/content/text/es.json`).
- **Decidido (dueño, 2026-11-17): también la interfaz. «No más voseo, en ningún lado.»** Todo el texto
  de juego en español neutro latino, en el mismo cambio que las escenas.
- Antes era abierto si también pasaba la interfaz. Hay voseo claro en unas 40 cadenas de interfaz (por ejemplo
  `ui.home.lead`: «Elegí una corredora, entrenala…»), además de las escenas (conteo aproximado con una
  búsqueda de formas como «elegí», «mirá», «tenés», 2026-11-17).

### I22 · Pasado y miedo del elenco de Vuela Alto (2026-11-17)

- Estado: **decidida** (2026-11-17). Las palabras del dueño y las fichas completas (núcleo, voz,
  banco de diez líneas, etapas de confianza) están en `personajes/protagonista.md`,
  `personajes/entrenador.md`, `personajes/veterana-vuela-alto.md` y `personajes/viejo-entrenador.md`.
  Cómo se llaman entre sí: `relaciones.md`. El secreto del viejo: `secretos.md` S4.
- Lo marcado como propuesta (deseos ocultos, objetos, líneas modelo) espera el visto bueno.

### I23 · Sin aves, rivales y la hija del viejo (2026-11-17)

- **Decidido (dueño):** «No tiene ave. Las estrellas se llaman así porque sí, pero atarnos a las aves
  reales no es una buena estrategia.» Los personajes no se construyen desde un ave real; corrige lo
  que sugiere `docs/design/investigacion-personajes.md` §8.3 para el elenco nuevo.
- **Decidido (dueño):** la rival de la veterana es una ex mejor amiga que se fue de Vuela Alto apenas
  la llamaron de otra escudería (`personajes/ex-amiga.md`).
- **Abierto:** la rival de la protagonista («está por verse aún»).
- **Decidido (dueño):** el viejo no perdió a la sexta; «pudo haber perdido a su hija, y él era su
  spotter». «No todo tiene que rondar alrededor de linajes y apellidos» (regla de tono).
- **Decidido (dueño, 2026-11-17):** la hija del viejo no murió: la guerra le dejó un trauma y él
  «perdió lo que era su hija». La ex amiga de la veterana se fue a Lumière Aéronef.

### I24 · Trauma: la hija del viejo y cómo estudiarlo (2026-11-17)

> «Ella aprendió a vivir con esa herida adentro, el que no aprendió fue el viejo, culpándose todo el
> tiempo. La hija nunca vio una carrera de Falconess, por lo que nunca vio esa "luz de esperanza" que
> la fundadora del deporte quiso mostrar en sus inicios.»
- Estado: **decidida** (2026-11-17). En `secretos.md` S4 y `personajes/viejo-entrenador.md`.
- Posibilidad abierta (propuesta, no canon): el día que la hija vea una carrera.
- Cómo estudiarlo (dueño): en lugar de lectores con experiencia vivida, leer a Tolkien. Lecturas
  sugeridas, para confirmar con los libros en la mano:
  - _El Señor de los Anillos_, prólogo de la segunda edición, donde Tolkien cuenta que para 1918
    habían muerto todos sus amigos cercanos menos uno.
  - Las secuelas de Frodo en el último libro: el dolor que vuelve en los aniversarios de sus heridas
    y su despedida en «Los Puertos Grises» (salvó la Comarca, «pero no para mí»).
  - «Las Casas de Curación» (Éowyn y Faramir): curar no es volver a ser el de antes.
  - Para el contexto: John Garth, _Tolkien and the Great War_ (Tolkien en la batalla del Somme, 1916).
- Opcional, de su país: testimonios de veteranos de Malvinas en libros y películas (por ejemplo, el
  libro de Daniel Kon _Los chicos de la guerra_, o _Iluminados por el fuego_), [SIN VERIFICAR los
  datos de edición]. Leer testimonios no reemplaza la lectura sensible, pero acerca la experiencia.

### I25 · Nombre de pista y el primer tramo (2026-11-17)

- Estado: **decidida** (2026-11-17). Ordenada en `historia-principal.md`: el nombre de pista, y el
  primer tramo de la historia principal (las alas, los primeros vuelos, el «no» del viejo, la promesa
  del entrenador).
- El generador de nombres se mejora más adelante para los nombres de pista de las Falconess al azar
  (dueño). Hoy el dueño lo ve sin terminar y con fuentes que dan nombres genéricos.
