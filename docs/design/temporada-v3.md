# Temporada v3: decisiones abiertas y recomendaciones

Registro vivo de las ideas del dueño para rediseñar la temporada después del playtest 1 y de las
reglas v2 (ADR-0006). Cada entrada dice qué se propone, qué existe hoy, qué recomienda el equipo y
qué decidió el dueño. Cuando una entrada se decide, pasa a una ADR en `docs/decisions/` y se
implementa en un ruleset nuevo; v1 y v2 quedan para reproducir las partidas que ya existen.

Estados: **Abierta** (esperando al dueño), **Decidida** (va a una ADR), **Futuro** (fuera del MVP,
pero el diseño de hoy no debe cerrarle la puerta).

Guías: `docs/BRIEF.md` (§5 aptitudes, §7 fabricantes y bastidores, §8 temporada y hangar, §9 gacha
y reglas anti pay-to-win), los datos de `packages/content` (fabricantes, bastidores, Falconess) y
`docs/world.md`, que todavía es un esqueleto. No hay biblias de personajes en el repo
(`docs/characters/` no existe).

## Resumen

| #   | Tema                                     | Estado  | Recomendación en una línea                                                            |
| --- | ---------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| T1  | Piezas de bastidor                       | Abierta | Sacarlas del juego en v3; quedan como contenido viejo para v1 y v2                    |
| T2  | Cuadrillas como support cards            | Abierta | Cuadrillas elegibles con líder y vínculo visible, agrupadas por escuela (ver T5)      |
| T3  | Carreras opcionales                      | Abierta | Calendario con carreras opcionales que dan puntos de habilidad                        |
| T4  | Taller                                   | Abierta | Visita gratis antes de la acción; ahí se gastan los puntos de habilidad               |
| T5  | Fabricantes como escuelas                | Abierta | Sí: cada escuela con su doctrina, expresada con las reglas que ya existen             |
| T6  | Tres cuadrillas por escuela              | Abierta | Sí, con un modelo de datos para N cuadrillas; contenido del MVP más chico             |
| T7  | Falconess como apoyo                     | Futuro  | Sí, en el mismo mazo que las cuadrillas; nunca como ventaja comprable                 |
| T8  | Bastidor firma como mejor opción         | Abierta | Ya existe (genérico al 85-90 %); reforzar el vínculo con su escuela, sin obligar      |
| T9  | Gráfica e ilustración                    | Futuro  | Retratos provisionales con iniciales y colores de escuela; dirección de arte después  |
| T10 | Elección de cuadrillas (A, B o C)        | Abierta | Reemplazada por T2 + T5 + T6                                                          |
| T11 | Qué se juega y qué entra al gacha        | Abierta | De acuerdo; falta decidir qué pasa con los bastidores genéricos y el firma sin suerte |
| T12 | Monetización sin depender del ilustrador | Abierta | Gacha de corredoras + pases + pinturas de alas generadas por código                   |
| T13 | Acabados de alas generados por código    | Abierta | Realista: un modelo de bastidor, cientos de acabados con reglas visuales de escuela   |

## T1 · Piezas de bastidor

**Propuesta del dueño:** eliminar la sección de piezas: complica sin aportar.

**Hoy:** 8 piezas en 4 ranuras (turbina, batería, estabilizador, firmware), instaladas gratis en el
taller. La métrica 5 las limita a ≤ 3 puntos de victoria cada una, así que la decisión casi no se
nota. En el playtest 1 el dueño nunca fue al taller; la política de referencia instala 0 piezas.

**Recomendación:** sacarlas del juego en v3 sin borrar sus archivos: las carreras golden y las
partidas v1 y v2 usan piezas. El esquema `Part` queda como puerta abierta. La métrica 5 se retira
con su ADR. Si después falta una decisión antes de cada carrera, un «ajuste de pista» (una
elección entre tres, gratis, en la pre-carrera) reemplaza al inventario; no ahora.

## T2 · Cuadrillas como support cards

**Propuesta del dueño:** reformularlas; hoy son abstractas. Deben ser más elegibles (T6).

**Hoy (BRIEF §8):** el hangar de 4 bastidores trae la cuadrilla de cada fabricante. Aparece en los
entrenamientos de sus stats con 35 % + 5 % por nivel de vínculo y suma 15 %. El vínculo no se ve y
cada fabricante tiene un solo evento.

**Recomendación:** separar la cuadrilla del bastidor. Antes de la temporada se arma un **equipo de
apoyo** (4 lugares) con cuadrillas (y, más adelante, Falconess: T7). El hangar queda solo para
correr. Cada apoyo tiene:

- un líder con retrato, nombre y carácter;
- una barra de vínculo visible;
- el **entrenamiento en sintonía** con el vínculo al máximo: un bonus grande, como el arcoíris de
  Umamusume;
- una cadena de 3 eventos que cuenta su historia y regala la pista de una habilidad de su escuela.

Esto cambia la regla del BRIEF «el hangar reemplaza a las support cards»: va con ADR.

## T3 · Carreras opcionales

**Propuesta del dueño:** como en Umamusume, que el jugador decida entre correr y entrenar: correr
da más puntos de habilidad; entrenar da lo normal, pero fijo.

**Hoy:** 4 carreras objetivo fijas por Falconess y nada en el medio. Los puntos de habilidad salen
casi solo del simulador (+5 por sesión).

**Recomendación:** algunas semanas (2 o 3 por mes, nunca la de una carrera objetivo ni la anterior)
ofrecen una carrera opcional. Cuesta la semana y unos 15 de vigor; paga puntos de habilidad según
el puesto (≈ 30 al ganar, ≈ 5 al 8.º), chatarra y ánimo +1 al ganar (6.º o peor ya resta en v2). La
tercera carrera seguida cuesta más vigor o puede bajar el ánimo. El simulador da menos puntos.
Fama como recurso (requisito de las carreras objetivo) y táctica en la pre-carrera quedan para
después. Antes de implementar: estudio con temporadas simuladas para que correr mucho y entrenar
mucho sean viables y ninguna estrategia gane siempre.

**Pregunta abierta:** ¿el calendario repite las 3 pistas actuales con distancias distintas o
necesita pistas nuevas?

## T4 · Taller

**Hoy y estudio (`.work/design2/taller.md`):** nadie va porque la visita cuesta la semana y rinde
menos que entrenar.

**Recomendación:** visita gratis, una por semana, antes de la acción. Con T1 y T3 el taller queda
para cambiar de alas, reparar, re-sortear rarezas de Boneyard y aprender habilidades con los
puntos que dan las carreras. En la pantalla de la semana, un aviso de qué tiene el taller para la
próxima carrera.

## T5 · Fabricantes como escuelas

**Propuesta del dueño:** cada fabricante es un bando o escuela, como las academias de Umamusume:
sus colores, su metodología, más agresiva o más prudente. Un jugador puede enamorarse de una
escuela (por ejemplo Kōryū) y querer un equipo entero de esa escuela.

**Hoy:** casi todo está escrito. Cada fabricante tiene regla de carrera, paleta, stats de cuadrilla,
bioma casa y débil, y patrocina Falconess (BRIEF §7).

**Recomendación:** sí. La doctrina de cada escuela se expresa con sistemas que ya existen (vigor,
fallo, ánimo, eventos con azar), no con números nuevos:

| Escuela   | Colores (paleta)     | Doctrina en carrera (regla)      | Doctrina al entrenar (propuesta)                                   |
| --------- | -------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Kōryū     | rojo y amarillo      | Ráfagas, ataca en bajadas        | Agresiva: más ganancia, más desgaste (vigor o deriva del ánimo)    |
| Steinhaus | gris acero y plata   | Fuerza bruta, no frena por calor | Resistencia: devuelve vigor, menos lesiones                        |
| Lumière   | marfil y dorado      | Eficiencia, recarga energía      | Precisión: menos fallo con vigor bajo                              |
| Altair    | azul noche y celeste | Telemetría, nunca se recalienta  | Cerebral: pistas de habilidades, más inteligencia, más información |
| Boneyard  | óxido y verde oliva  | Se repara sola, rarezas al azar  | Varianza: eventos con azar, chatarra, picos buenos y malos         |

Una escuela no obliga a nada: mezclar escuelas cubre más stats; un equipo de una sola escuela
concentra su doctrina y sus eventos (la regla de diseño del hangar del BRIEF §8, trasladada al
equipo de apoyo). Las Falconess también pertenecen a una escuela por su patrocinador (Peregrina a
Kōryū, Cernícala a Altair, Caracara a Boneyard; Gerifalte, Esmerejona y Aguilucha ya tienen
escuela asignada).

## T6 · Tres cuadrillas por escuela

**Propuesta del dueño:** dentro de cada escuela, 3 cuadrillas con la metodología y los colores de
la escuela, pero con un líder distinto y beneficios distintos.

**Recomendación:** sí. Las tres varían en un eje dentro de la doctrina, por ejemplo en Kōryū:

- una centrada en Agilidad (la más agresiva),
- una centrada en Inteligencia (la «sesión de datos»),
- una de bajadas y riesgo (Coraje, vuelo de riesgo).

Ejes posibles para diferenciarlas: stat principal y secundaria, tipo de bonus (más ganancia, menos
fallo, vigor devuelto, pista de habilidad), umbral de la sintonía y su cadena de eventos.

**Alcance:** 15 cuadrillas son 15 líderes, 15 retratos y unos 45 eventos. El modelo de datos admite
N cuadrillas por escuela desde el inicio; el contenido del MVP podría ser 2 por escuela, o 3 solo
en las escuelas de las 3 Falconess del MVP (Kōryū, Altair, Boneyard).

**Regla anti pay-to-win:** en Umamusume las support cards son el principal motivo para pagar
(rareza y copias repetidas suben su poder). Las cuadrillas se desbloquean jugando (vínculo,
historia de la escuela), no en el gacha; si algún día entran, rigen las invariantes del BRIEF §9:
los repetidos dan aspecto e historia, nunca poder.

## T7 · Falconess como apoyo (futuro)

**Propuesta del dueño:** que las propias Falconess también puedan ser support cards.

**Recomendación:** sí, en el mismo equipo de apoyo que las cuadrillas: una Falconess de apoyo
entrena a tu lado, tiene vínculo, sintonía y eventos compartidos, y puede aparecer como rival en
alguna carrera. Mismas reglas anti pay-to-win que T6. Fuera del MVP; el esquema del equipo de apoyo
debe admitir los dos tipos desde el principio.

## T8 · Bastidor firma como mejor opción

**Propuesta del dueño:** el bastidor firma ata a cada Falconess con una escuela y es su mejor
opción, pero el jugador puede elegir otro, como entrenar a Sakura Bakushin O para distancias
largas solo porque se puede.

**Hoy:** ya funciona así. El firma copia las stats del genérico de su estilo y solo cambia el
pasivo; el genérico rinde entre el 85 % y el 90 % del firma (invariante 2 del BRIEF §9). Las letras
de aptitud de estilo (Peregrina: Picada A, Rasante E) ya permiten el caso Bakushin: Peregrina con
alas de Rasante corre, peor, pero corre.

**Recomendación:** mantener el margen del 85-90 % y reforzar el vínculo con la escuela con algo
de historia, no de poder: por ejemplo, el firma junto a cuadrillas de su escuela habilita sus
eventos de escuela. Revisar que la pantalla de elección no esconda las alas que «no convienen».

## T9 · Gráfica e ilustración (futuro)

**Propuesta del dueño:** pensar en arte para el futuro.

**Recomendación:** hasta que haya dirección de arte, retratos provisionales: iniciales del líder
sobre los colores de su escuela, para que el sistema se pruebe sin arte. Cuando se encare: una
biblia visual por escuela (uniforme, colores, forma de las alas) y fichas de personaje, en
`docs/world.md` y `docs/characters/`.

## T11 · Qué se desbloquea jugando y qué entra al gacha

**Propuesta del dueño:**

- Las cuadrillas se desbloquean jugando.
- El apoyo de cada Falconess se desbloquea jugando con esa Falconess.
- Al gacha entran solo las Falconess nuevas (como corredoras) y sus bastidores firma.

**Hoy (BRIEF §9):** dos pools, Falconess y bastidores. El pool de bastidores trae también los
genéricos SR y SSR de cada fabricante (Falke, Étoile, Hayate…). Las Falconess repetidas suben un
rango que da trajes y episodios, nunca stats; los bastidores repetidos se desguazan por chatarra.

**Recomendación:** de acuerdo; refuerza el pilar sin pay-to-win, porque nada de lo que da poder al
entrenar se compra. Tres puntos a cerrar:

1. **Bastidores genéricos:** con la propuesta salen del gacha. Se desbloquean jugando con la
   escuela (por ejemplo, al subir el vínculo con sus cuadrillas). Cambia el BRIEF §9: va con ADR.
2. **El firma sin suerte:** quien tiene a la Falconess pero no su firma corre al 85-90 % con el
   genérico (invariante 2). Propuesta: además del gacha, el firma se gana jugando muchas temporadas
   con ella (un hito de su rango de vínculo), para que la suerte adelante el firma pero no lo
   bloquee.
3. **Cómo crece un apoyo:** el de una Falconess se desbloquea al terminar una temporada con ella y
   mejora con más temporadas (su historia avanza); una cuadrilla, con el vínculo acumulado en su
   escuela. Crecer jugando está bien; los repetidos del gacha nunca tocan el apoyo (invariante 4).

Consecuencia: al gacha le queda poco para gastar plumas. En v0 no hay dinero real, así que no
urge; más adelante, trajes y cosméticos de escuela pueden ser el resto de la oferta.

## T12 · Monetización sin depender de un ilustrador

**Problema del dueño:** si al gacha solo entran Falconess nuevas, queda poco para vender; vender
solo trajes y cosméticos ilustrados ata el proyecto a un ilustrador, que termina con más poder que
el estudio.

**Datos (con fuentes en la conversación del 2026-10-29):**

- El ingreso F2P está muy concentrado: en 55 lanzamientos móviles de 2025 (Moloco), el 5 % de
  pagadores con más gasto dio entre el 54 % y el 81 % del ingreso a los 10 meses.
- Umamusume separa corredoras y support cards en dos gachas; las guías recomiendan tirar support
  cards porque pesan más que la rareza de la corredora. Su gacha fuerte es justo el que T11 deja
  fuera.
- Regulación: Bélgica trata las cajas pagas como juego de azar; PEGI clasifica desde junio de 2026
  como mínimo 16 a los juegos que venden objetos aleatorios pagos; Brasil habría prohibido su venta
  a menores desde marzo de 2026 (sin confirmar en fuente oficial).

**Lectura económica:** con un gacha solo de corredoras, el ingreso depende del ritmo al que se
ilustran Falconess nuevas: el ilustrador fija el techo de facturación. Hay que separar el ingreso
del arte hecho a mano, vendiendo cosas que el código produce.

**Opciones:**

- **A · Híbrido (recomendada):** gacha de corredoras y firmas (T11) con pity alto y selector;
  pase mensual y pase de liga con tramo gratis y pago; y una línea de **pinturas de alas**
  generadas por código: colores, franjas, números, calcomanías de escuela, estelas en carrera,
  títulos y marcos de perfil. Las alas son máquinas, como los autos de un juego de carreras: su
  pintura no necesita ilustrador. Más adelante, un editor de pinturas compartidas por jugadores.
- **B · Juego pago con expansiones:** sin gacha; se compra el juego y cada expansión (bioma,
  pistas, escuela, Falconess). Sin riesgo regulatorio; menos ingreso y menos alcance.
- **C · Solo cosméticos ilustrados:** lo que el dueño quiere evitar.

**Sobre los ilustradores, en cualquier opción:** biblia visual y plantillas para que varios
ilustradores puedan trabajar con el mismo estilo; contratos de obra por encargo con cesión de
derechos; el arte a mano se reserva para personajes (lo que más valora este público) y todo lo
demás sale de sistemas paramétricos. El arte generado con IA exige declararlo en Steam y genera
rechazo en parte del público; no conviene basar el plan en él.

## T13 · Acabados de alas generados por código

**Propuesta del dueño:** crear por código 100 o más variantes de bastidor, como los Sparkling de
Aniimo: cambian colores, efectos, sonidos y detalles, no las stats. Que no parezcan «payasos» (el
botín de WoW que no combina), que respeten el sistema visual del juego y que por ser tantas cada
jugador sienta la suya como única.

**Cómo hacerlo realista:** separar el **modelo** del bastidor (Falke, Shiden…: forma y stats,
escaso, hecho a mano o modelado) del **acabado** (cosmético, generado). Un acabado es una semilla
que elige capas de bibliotecas curadas, nunca valores al azar sueltos:

| Capa                 | Biblioteca (ejemplo)                                    |
| -------------------- | ------------------------------------------------------- |
| Paleta               | 8 por escuela, armadas a mano, con su color de escuela  |
| Patrón               | franjas, bloques, degradé, número de dorsal, calcomanía |
| Acabado del material | mate, metalizado, perlado, carbono                      |
| Estela en carrera    | color y forma de partículas                             |
| Sonido               | timbre del motor por síntesis (tono, filtro, pulso)     |

Reglas que evitan el «payaso»: como máximo tres colores con proporción 60/30/10, el color de la
escuela siempre presente, contraste mínimo entre capas, patrones con densidad acotada y
combinaciones prohibidas listadas. Con 8 paletas, 6 patrones, 4 materiales, 5 estelas y 3 sonidos
salen 2880 acabados por modelo; se publican los que pasan las reglas y una revisión visual.

**Unicidad, en números:** con 100 acabados equiprobables, la chance de que una de las 7 rivales de
una carrera lleve el mismo que vos es 6,8 %; con 300, 2,3 %; con 1000, 0,7 %. Los acabados raros
(como Dazzling y Shadow de Aniimo, 0,5 % cada uno al usar un Sigil) bajan más esa chance.

**Reglas del proyecto que respeta:** el acabado es una semilla más (reproducible, como todo el
juego); vive en el estado y en el `Build`, nunca en `packages/sim` (invariante 3: nada comprable
cambia la carrera); no requiere ilustrador más allá de las bibliotecas iniciales.

**Estado:** el dueño aprueba la idea y pide dejarla firme para retomarla después; el prototipo
queda postergado.

### Modelo de datos (propuesta)

- `FinishLibrary` en `packages/content` (JSON validado por `packages/schema`): paletas por escuela,
  patrones, materiales, estelas y perfiles de sonido, cada uno con id, versión y escuela (o
  «cualquiera»).
- `FinishRules`: las reglas visuales que todo acabado cumple (máximo de colores y proporción,
  color de escuela obligatorio, contraste mínimo, densidad de patrón, combinaciones prohibidas).
- `Finish` = `{ frameModel, school, seed, libraryVersion }`. La semilla elige una capa de cada
  biblioteca con el RNG del proyecto (stream propio, por ejemplo `finish`), así que el mismo
  acabado se reconstruye igual en la web, la CLI y una liga. Si una combinación rompe una regla,
  se vuelve a sortear con la semilla derivada siguiente, de forma determinista.
- Catálogo publicado: lista de acabados aprobados (semilla + nombre + rareza), no todas las
  combinaciones posibles. Una biblioteca nueva sube `libraryVersion` y no cambia acabados viejos.
- El acabado vive en el estado de la temporada, en el `Build` y en la `BlackBox`; nunca entra a
  `packages/sim`. Un test lo verifica (invariante 3 del BRIEF §9).

### Rarezas (propuesta)

| Rareza    | Qué suma                                         | Parte del catálogo |
| --------- | ------------------------------------------------ | ------------------ |
| Estándar  | paleta, patrón y material                        | ≈ 80 %             |
| Brillante | estela de color y material metalizado o perlado  | ≈ 17 %             |
| Prisma    | estela animada, sonido propio, detalle exclusivo | ≈ 3 %              |

Ninguna rareza cambia stats, letras ni resultados de carrera.

### Cómo se consiguen (abierto, ligado a T11 y T12)

- Cada bastidor obtenido trae un acabado sorteado de su escuela, como el Sparkling de Aniimo.
- Pase de liga y logros: acabados de temporada o de campeona.
- Tienda: acabados elegidos (sin azar), lo que esquiva la regulación de objetos aleatorios pagos.
- Repintar: cambiar el acabado de un bastidor propio. Como en Aniimo 1.1, conviene poder volver a
  los acabados ya obtenidos.
- Pendiente: si se venden acabados al azar con dinero real, aplican las reglas de T12
  (probabilidades publicadas, clasificación por edad, mercados con restricciones).

### Qué se necesita y qué no

- Una vez: el arte vectorial en capas de cada modelo de bastidor (contorno, paneles, zonas de
  pintura), las paletas por escuela y los perfiles de sonido. Lo puede hacer cualquier diseñador
  con la biblia visual (T9).
- Siempre: nada más. Los acabados nuevos salen de la semilla y las bibliotecas.

### Prototipo pendiente (cuando haya presupuesto)

Una página que genere 100 acabados de un mismo bastidor con alas vectoriales provisionales,
agrupados por escuela, con un botón para generar otros y la lista de reglas que cumple cada uno.
Criterio de éxito: una persona reconoce la escuela de cada acabado sin leer el nombre, y ninguno
desentona.
