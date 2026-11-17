# ADR-0017 · El flujo del celular (`#juego`): orden, capas y movimiento

- **Estado:** aceptada por el dueño (2026-11-15: D1-D7 y los O aprobados como estaban, con O4 «solo
  N.º», O9 sin cambios, O10 aprobado y construido, O13 no). Construida del 2026-11-15 al 2026-11-17
  en `playtest-ui` (pasos 0.1-7.3 del plan de flujo, local en `.work/flow/plan-final.md`, y la
  revisión final).
- **Alcance:** el juego del celular (`apps/web`, `#juego`) y dos valores de texto. Nada cambia en
  `packages/sim`, `packages/schema`, los rulesets, `tests/golden` ni `docs/characters`; ningún campo
  nuevo en `RunInput`. La vista de pruebas sigue igual.
- **Relacionadas:** `docs/design/escenas.md` (tiempos y orden de las escenas), ADR-0013 (herencia),
  ADR-0014 (categorías), las lecciones de CLAUDE.md «Semana de carrera en el celular», «Orden de
  pantallas del celular», «Efectos y escenas», «Escritorio» y «Ritmo».

## Contexto

El flujo del celular vivía en el estado de React de `MobileGame`: una vista con banderas sueltas
que decidía qué pantalla, qué escena y qué capa mostrar. El relevamiento (28 puntos frágiles F1-F28,
los ítems de movimiento H1-H6, M1-M10 y L1-L14, los conflictos C1-C20 entre las reglas del dueño y el
código) encontró, entre otros:

- una semana de carrera decidida solo en React: al recargar o cambiar el idioma se podía ver la vista
  previa y elegir otra acción (C5);
- escenas fuera de orden o debajo de otra cosa, dos capas a la vez, ids duplicados, un aviso que
  pisaba al anterior, un menú que se veía un cuadro entre el modo carrera y una escena;
- temporizadores que volvían a arrancar cuando cambiaba la identidad de un objeto, sonidos que salían
  de un temporizador, efectos que se superponían;
- el aviso de escena invisible con movimiento reducido (C7), animaciones sin tokens, y una pestaña
  oculta que dejaba correr todo sin que nadie lo viera.

## Decisión

### 1. Un modelo puro decide la pantalla

- **`deriveFlow(ctx, facts, ui)`** (`src/mobile/flow/`, TypeScript puro y sin textos: lo verifica
  `flow/imports.test.ts`) decide todo lo que se ve: el modo, la pantalla, la capa de adelante, el HUD,
  el panel del escritorio y la música.
- Su núcleo es **`beatsOf`**: la cola ordenada de lo que el juego espera («beats»). Solo el primero
  (`flow.top`) se muestra o recibe toques, así que nada sale fuera de orden.
- **Los hechos** (`factsOf`) salen de los stores: la partida del controlador, su huella (`fp`), el
  último paso y si se leyó, el registro de la semana de carrera, su vista previa (una sola caché,
  `previewResult`), las escenas vistas en la temporada y alguna vez, las tarjetas de herencia
  mostradas, el Ritmo, el movimiento reducido y si hay una hoja abierta. React guarda solo la
  navegación en reposo, los beats que terminaron en este montaje y los avisos (`flow/ui.ts`).
- **Ninguna fase del flujo vive solo en React:** cada final queda guardado (la semana leída, las
  escenas vistas, las tarjetas mostradas, el registro de la semana) o se repite a propósito al
  recargar.
- **Claves por partida:** las de un paso y de una semana decidida llevan la huella; las de escenas y
  tarjetas, la semilla; la de un evento, su semana. Una clave vieja no hace nada.
- **Comandos** (`flowCommands(ports)`): los toques y los temporizadores pasan por ellos; `game.act` y
  el cambio de pantalla van en el mismo manejador síncrono. El mismo código de comandos juega las
  temporadas enteras de las pruebas en node (`web-flow`).
- **Beats instantáneos** (`ack`, `enter`, `pass`) se resuelven antes de pintar y no dibujan nada.
- **Las capas** (efectos, tarjeta de herencia, escena, emblema, evento) las maneja `LayerHost`: a lo
  sumo una «adentro». La que se va queda como una copia sin ids, `inert`, `aria-hidden` y sin
  punteros, dibujada con sus últimos datos, y un temporizador la saca (nunca `animationend`). Mientras
  una capa está adelante, el HUD y la pantalla de abajo son `inert` y el foco está en el control de
  la capa; cuando se va la última, el foco vuelve al control de la pantalla.

### 2. El orden (los beats)

1. **Semana normal:** «Entrenar» → elegir y confirmar → el resultado (HUD en la semana N) → el menú
   con los efectos de la semana (el HUD sigue en N) → un toque o su tiempo → semana N + 1 → la
   tarjeta de herencia, si toca → la escena `turn`, si la hay, sobre negro opaco → su aviso.
2. **Semana de carrera:** el resultado de la acción (vista previa) → sus efectos (parte `action`) →
   el emblema (entra en 160 ms, tapa a los 160, termina a los 1240, sale en 280) → la escena
   `goal-before`, que aparece al empezar la salida del emblema, en su propio negro → la tarjeta de
   posición (sin «Volver») → «Correr» → la carrera → la llegada (1,2 s, «N.º») → `goal-after`/`end`
   → el resultado, que entra 0,4 s después de empezar la salida de la escena → «Continuar» → el menú
   con los efectos de la carrera (parte `race`: ánimo y puntos).
3. **Semana 39 → 40 (Peregrina):** los efectos de la 39 → la tarjeta de herencia de la 40 →
   `peregrina-first-vos` → el menú de la 40 → la acción y el modo carrera.
4. **Directo:** el resultado (×0,35) → los efectos → `enter` (sin emblema) → la escena previa
   resumida en su negro → la tarjeta → «Correr» abre en el resultado, o antes en la escena
   posterior (`goal-after`/`end`) resumida si la hay (en la primera temporada, toda meta ganada
   tiene una); «Ver otra vez» repite con su
   llegada de 420 ms.
5. **Inicio de temporada con padres:** el título → la selección → «Empezar» → el prólogo (el menú y
   el HUD montados debajo) → la tarjeta «¡Herencia!» entra sobre la salida del prólogo → «Continuar»
   → el menú, y después el aviso del prólogo.
6. **Fin de temporada con carrera:** la caja negra se guarda en «Correr»; carrera, escena,
   resultado; «Continuar» → el final entra en 320 ms con los efectos de la carrera encima. «Ver
   carrera» la repite sin emblema; «Continuar» vuelve al final con el mismo desplazamiento.
7. **Fin de temporada sin carrera** (Caracara, Cernícala): el resultado del entrenamiento de la
   semana 48 → el final con los efectos encima.
8. **Recarga:** una semana normal sin leer repite su resultado; una semana de carrera decidida en la
   etapa `action` repite la acción y después el emblema (si nada de la semana se jugó en este montaje,
   el emblema abre ya tapando); en la etapa `race`, la tarjeta sin la acción ni el emblema (antes,
   la escena previa si no se había terminado: una escena se marca vista al terminar); después de
   «Correr», la
   carrera otra vez (Directo: el resultado) hasta que se vea el resultado.
9. **«Ver otra vez»:** la carrera vuelve con un fundido de 200 ms → su llegada (si termina sola) → el
   resultado → «Continuar» → los efectos de la carrera.
10. **Semana lesionada:** sin resultado de entrenamiento; el menú con el sello «RECUPERACIÓN» (y el
    ánimo, si cambió).

El orden se prueba en node con las caminatas de temporada (`walk-*.test.ts`, invariantes I1-I22) y
las secuencias de `golden.test.ts`, y en el navegador con los e2e `mobile-*.spec.ts`.

### 3. Las decisiones del dueño, como quedaron

- **D1 · Pantallas.** Una pantalla nueva entra con un fundido de opacidad de 200 ms (320 ms el menú
  con que abre una partida y el final), sin moverse, y responde desde el primer cuadro. Lo que cambia
  adentro de una pantalla no vuelve a entrar, salvo la carrera que vuelve con «Ver otra vez» (§2,
  punto 9). El HUD es el ancla: no se mueve; después del modo
  carrera vuelve con su propio fundido de 200 ms. El emblema va solo de la semana al modo carrera,
  nunca al repetir una carrera desde el final.
- **D2 · Tarjeta de herencia.** Al final de una semana: los efectos, la tarjeta, la escena `turn`.
  Al empezar la temporada: el prólogo y después la tarjeta. Cada tarjeta sale una sola vez en ese
  navegador (`falconess.juego.herencia`, §5).
- **D3 · Tarjeta para planear.** El botón de la semana de carrera del menú abre la tarjeta de
  posición sin escena ni transición, con «Elegir la acción» y «Volver»; la posición elegida ahí se
  guarda (`planned`, §5).
- **D4 · Escritorio.** El panel de al lado se apaga (45 %, un poco menos de color, 200 ms) y no
  recibe toques mientras hay una capa adelante, el resultado de un entrenamiento o el modo carrera
  (también la tarjeta decidida); se despierta cuando la capa empieza a irse. Durante la carrera
  muestra los datos de antes: Metas dice «esta semana» y Registro no tiene la semana que se corre
  hasta el resultado. En la última carrera el panel sigue (apagado) y la columna se desliza al centro
  en 280 ms cuando llega el final.
- **D5 · La semana decidida sobrevive** a una recarga, al cambio de idioma y a salir de `#juego` y
  volver (en la tarjeta decidida el gesto atrás ya no sale, §6). Se valida por huella, semana,
  cantidad de entradas, que sea semana de carrera y que la vista previa corra; lo inválido se
  descarta.
- **D6 · Palabras.** «Vista» sigue contando las escenas saltadas y las resumidas; el aviso dice «Ya
  salió en otra temporada.» y la etiqueta del resumen «Versión rápida» (paso 7.1).
- **D7 · Llegada y salida de escena.** Una carrera que termina sola se queda quieta con «N.º»
  estampado `1200 ms × Ritmo` (720 ms en Rápido, 420 ms en las repeticiones de Directo, nunca menos
  de 400 ms); tocar el cartel es «Saltar», y «Saltar» se salta carrera y llegada juntas. Una escena
  termina en el toque y se desvanece en 0,8 s sobre la pantalla real que sigue, que ya responde; el
  resultado entra 0,4 s después.

### 4. Los O, como quedaron

- **O1:** una recarga repite la semana sin leer desde su primer beat (§2, punto 8); el emblema se
  repite solo si la recarga fue antes de entrar al modo carrera.
- **O2:** una semana lesionada no tiene resultado de entrenamiento: sus efectos muestran
  «RECUPERACIÓN» (clave nueva `ui.m.fx.recovery`), con el tono de la lesión, en un entrenamiento o
  un descanso, junto con el ánimo si cambió.
- **O3:** mientras salen los efectos, el calendario, la meta y el ánimo del HUD muestran la semana
  recién jugada; al irse, el calendario da vuelta la hoja en 240 ms y el ánimo cambia de color en
  200 ms. El vigor no vuelve atrás: después de un entrenamiento o de la tarjeta de carrera queda
  donde lo dejó su «±N»; después de un descanso o una salida se mueve cuando se van los efectos.
- **O4:** el cartel de llegada muestra solo «N.º» (`ui.m.race.place`), sin otra palabra.
- **O5:** los últimos efectos de la temporada salen sobre el final.
- **O6:** el emblema entra en 160 ms y sale en 280 ms; tapa todo a los 160 ms y bloquea los toques
  hasta los 1240; su salida no bloquea. Una semana restaurada abre con el emblema ya tapando. La
  regla 12 del dueño («la escena solo después del emblema») queda así: la escena `goal-before`
  aparece cuando el emblema empieza a irse, y sus primeros 300 ms son negro puro.
- **O7:** «Saltar», Auto y Registro desde los 0,3 s; un toque en la entrada la apura, otro muestra
  la línea; el resumen tiene una entrada corta con la tarjeta entera 0,7 s (escenas.md §2).
- **O8:** las repeticiones de la vista de pruebas ya no arrancan a ×2 cuando el celular está en
  Rápido.
- **O9:** sin cambios: `#juego` guarda la caja negra al terminar una temporada v3; el final de la
  vista de pruebas solo la muestra.
- **O10:** construido (paso 5.6b), §6.
- **O11:** la etiqueta «Equipada» del taller tiene su propia clase.
- **O12:** no adoptado: ni un fundido a negro de 260 ms antes de las escenas ni un deslizamiento o
  fundido cruzado entre pantallas. Siguen el negro de una vez y la opacidad sola.
- **O13:** no construido: una recarga en plena carrera la repite desde el principio (O1); «Saltar»
  está a un toque.
- **O14:** una semana de carrera decidida en `#juego` y jugada distinto en la vista de pruebas
  descarta el registro (sin callejón sin salida; la regla 45 obliga solo a `#juego`). El marco de la
  tableta (≥ 700 px de ancho y 640 de alto, sin escritorio) lleva `transform: translateZ(0)`, como la columna del
  escritorio: el título, las escenas, el emblema, los efectos, la tarjeta de herencia, los avisos y
  el chat quedan dentro del marco de 390 px, y lo que se medía por el ancho de la ventana se mide
  por el del marco (`--framew`).

### 5. Dos claves nuevas del navegador

Las dos pasan por el almacenamiento con guarda (`game/storage.ts`: sin almacenamiento duran la
visita) y están en la lista fija de `src/storage-keys.test.ts`.

- **`falconess.juego.semana`** (`flow/decidedWeek.ts`, `WeekStore`): `{ v: 1, …WeekRecord }`, un solo
  registro, de la partida cuya huella lleva:
  - `planned` (`fp`, `turn`, la posición elegida en la tarjeta para planear);
  - `decided` (`fp`, `turn`, `inputs`, la acción sin posición, la posición, `stage`: `action` hasta
    que empieza el modo carrera, `race` después);
  - `raced` (`fp` de la partida que dejó «Correr»): la carrera se repite al recargar hasta ver su
    resultado, también la última de la temporada;
  - `raceSeen` (`fp`): su resultado se vio.

  Se vuelve a leer en cada lectura del flujo (otra pestaña pudo escribirlo) y solo se borra cuando se
  juzgó que no es de la partida en juego (`validRecord` en `factsOf`, el borrado en `useFlow`);
  nunca lo borra una pestaña cuya partida va atrás de la del registro (la misma temporada con más
  entradas: otra pestaña siguió jugando, `isLaterInSeason`). Un final guardado por una versión
  anterior, sin registro `raced`, no repite su última carrera; sus efectos salen una vez. Un final
  que una versión anterior guardó después del entrenamiento de la semana 48 (Caracara, Cernícala)
  abre una vez en el resultado de ese entrenamiento, que esa versión no mostraba, y después el final
  (decisión abierta 7). Una semana de carrera decidida en una versión anterior vivía solo en React:
  después de actualizar vuelve sin decidir, y se puede elegir otra acción esa única vez.
- **`falconess.juego.herencia`** (`flow/inspirations.ts`, `InspirationStore`): `{ v: 1, seeds:
  [[semilla, claves], …] }`, las tarjetas mostradas por temporada (`semilla:start`, `semilla:24`,
  `semilla:40`), como mucho 20 temporadas (se van las más viejas). La primera vez que no existe la
  clave, marca las tarjetas que la versión anterior ya mostró en la partida guardada (la del inicio y
  la de cada semana leída), una sola vez, y escribe la clave en esa primera carga. Una tarjeta que la
  versión anterior mostró en una semana todavía sin leer (la mostraba antes de los efectos) sale otra
  vez, una sola. Se vuelve a leer en cada lectura y, al marcar, une lo que
  otra pestaña haya guardado.

Dos pestañas jugando la misma partida no están soportadas (la partida guardada es del último que
escribe); los stores no pierden lo que otra pestaña marcó y lo leen en cada lectura (paso 7.3): una
tarjeta de herencia, una escena (`falconess.juego.historia`) o un tema del chat
(`falconess.juego.chat`) que mostró una pestaña no se repite en la otra, aunque esa ya tuviera el
menú abierto. Una lectura que no encuentra nada nuevo devuelve los mismos objetos.

### 6. El gesto atrás (O10)

El gesto atrás (el de Android, el borde en iOS, el botón del navegador) hace dentro de `#juego` lo
mismo que el «Volver» de la pantalla, y nada donde no lo hay (`mobile/useBackGesture.ts`):

- **Entrenar, el taller y la tarjeta para planear:** vuelve al menú, como «Volver» (mismo comando,
  mismo sonido).
- **Una hoja abierta** (Menú, un panel, la pista, la salida, el chat, Exportar, Temporadas,
  Historia) se cierra primero, como su «Cerrar»; una por gesto. Durante los 180 ms en que una hoja
  se cierra, el gesto ya actúa sobre lo de abajo.
- **Mientras la semana juega** (un resultado, los efectos, una tarjeta, una escena, el evento, el
  emblema), en la tarjeta decidida, en el modo carrera, al repetir una carrera y en el final: nada.
- **En el menú y en la selección:** sale de `#juego`, como siempre.

El juego empuja una sola entrada propia del historial al salir del reposo y la consume al volver por
otro camino, así no se acumulan.

### 7. Los avisos

- Dos canales (`NoticeHost`): el de error arriba y el de escena. El de escena: «Escena saltada…»
  y «Queda guardada…» 4 s; «Ya salió en otra temporada.» con «Ver» 6 s; un error 6 s, con «Cerrar»
  (`ui.m.error.unexpected` cuando la simulación falla; en la selección, `#m-aviso-error`).
- Un aviso espera a que nada se esté mostrando delante del juego y dura su tiempo entero desde que se
  ve; si hay dos, el segundo espera al primero y a su copia que se va.
- Se va con un fundido de 400 ms (una copia sin ids) al cambiar de pantalla o al entrar los efectos o
  el resultado de un entrenamiento; bajo una escena, el emblema o la tarjeta de herencia se corta de
  golpe. Con movimiento reducido está quieto y entero, y se corta.
- **La regla de 6.2:** un aviso de escena que esperaba solo la salida de esa escena pertenece a la
  pantalla donde la escena dejó al jugador; si el jugador se va de ahí antes de que se vea, no sale
  (decisión abierta 1).
- **Dónde:** justo arriba del ancla de la pantalla (`[data-toast-anchor]`: la pestaña de la pista en
  el menú, el pie de la tarjeta, del resultado y del final, las opciones de la selección), con
  3 px de aire como mínimo (`NOTICE_CLEAR`) de todo control. Si ahí tapara un control, va al lugar
  libre más cercano que no tape ni un control ni lo marcado `[data-toast-avoid]` (el HUD, el nombre y
  el objetivo de la carrera); si no hay ninguno, abajo de la barra de arriba. Se reacomoda al
  desplazar la pantalla, y su subida de 10 px al entrar se limita al espacio que tiene debajo.
- «Ver» sale solo donde una escena puede pasar (el menú, una tarjeta, el resultado, el final).

### 8. Los sonidos

- Los sonidos de navegación salen solo dentro del toque que los causa, desde los comandos (iOS solo
  deja sonar ahí): el «whoosh» cuando un toque lleva a otra pantalla («Entrenar», «Taller»,
  «Volver», el gesto atrás que hace lo mismo, «Ver carrera», «Ver otra vez», «Continuar» de una
  carrera), y si no el toque. Nada que termina solo (un resultado, los efectos, el emblema, la
  llegada) hace sonar una transición; el emblema es mudo. «Correr» suena solo con su toque
  (decisión abierta 3).
- Los sonidos que son parte de lo que se ve (los sellos de los efectos, los «ping» del resultado, el
  de la tarjeta de herencia) cuelgan de temporizadores del flujo o de un montaje que solo trae un
  temporizador o un toque: con la pestaña oculta no suena nada. La música se pausa sola al ocultarse.

### 9. El movimiento

- **Tokens en un solo lugar:** `mobile/motion.css` (`--m-dur-*`, `--m-ease-*`) y su gemelo
  `mobile/motion.ts` (`MOTION`, `STORY`, `EMBLEM_MS`, `outMs`, `held`); `motion.test.ts` verifica que
  coincidan. Las pantallas, las capas, las hojas y los avisos no tienen duraciones propias; quedan
  detalles dentro de un componente con las suyas (el tipeo del chat, la salida del título, la
  tarjeta de la pista, el sello del resultado).
- **Pantallas:** solo entran, solo con opacidad (`screenIn`, relleno `backwards`); ninguna
  transformación toca una pantalla, y nunca hay dos pantallas a la vez. La tableta ensancha su
  marco de 390 a 720 px para la carrera en 280 ms; en el escritorio la columna se desliza solo al
  entrar al final.
- **Capas:** entran y salen por `LayerHost`: efectos y tarjeta de herencia 240/240 ms, emblema
  160/1080/280 ms, escena 800 ms de salida; las copias que salen no tienen ids ni toman toques, y se
  van cuando su fundido terminó, contado desde el cuadro en que empieza (no desde el toque). Las
  salidas (capas, hojas, el chat) usan `--m-ease-in`, que acelera sin cortar al final: su último
  cuadro ya está casi transparente.
- **Hojas:** entran en 220 ms subiendo 16 px y se van en 180 ms desvaneciéndose con lo que mostraban;
  se liberan al pedir el cierre, pero siguen siendo modales e `inert` hasta cerrarse (decisión
  abierta 2). Escape y el atrás de Android cierran igual. El foco vuelve a lo que las abrió (o, si
  eso ya no está, a lo que abrió aquello); una capa que entró debajo toma el foco al cerrarse. El
  chat entra en 240 ms y se va en 180; es una hoja dentro de la columna (así lo contienen el marco de
  la tableta y la columna del escritorio): mientras está abierto, el juego de abajo, sus avisos y el
  panel del escritorio (que se apaga) no reciben toques ni teclas, su «Cerrar» toma el foco, Escape
  lo cierra y al cerrarse el foco vuelve a lo que lo abrió.
- **Los temporizadores son el reloj:** todo lo que termina un beat o avanza una escena es un
  temporizador del flujo (`ui/flowTimer.ts`: `useFlowTimer`, `useFlowTimers`, `startFlowTimer(s)`,
  sobre `ui/timer.ts`), nunca `animationend`, `transitionend` ni `finished`
  (`no-animationend.test.ts`).
- **Movimiento reducido, una sola política:** cada animación tiene su regla con la misma
  especificidad, `animation: none` o `transition: none` con el estado final (nunca 0,01 ms ni
  `!important`), y `motion.test.ts` la exige para cada regla nueva. Quedan solo los fundidos de
  opacidad del arte (el fondo del entrenamiento, el título) y la respuesta al presionar
  (≤ 120 ms). Las esperas de lectura se mantienen (efectos ≥ 900 ms, el resultado del entrenamiento,
  la llegada, la tarjeta de la escena 900 ms, los avisos); las salidas son instantáneas, el emblema
  no sale (`enter`) y el resultado entra sin demora.
- **Ritmo** (`k`: Normal 1, Rápido 0,6, Directo 0,35):

  | Se escala por `k`                                                                                | No se escala                                 | Propio del Ritmo                                                                       |
  | ------------------------------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
  | Efectos (`fxTimeline`: 160k entre uno y otro, 1800k de vida, 450k por habilidad, piso de 900 ms) | Fundidos de pantallas, capas y hojas         | Directo: sin emblema (`enter`) y sin repetición ni llegada; las repeticiones sí        |
  | El resultado del entrenamiento (sus pasos y su espera)                                           | El emblema (1240 ms)                         | Resumen de escena: 1100 ms (Rápido) o 650 ms (Directo) por línea, con su entrada corta |
  | La llegada: 1200 / 720 / 420 ms, nunca menos de 400                                              | La salida de la escena (800 ms) y los avisos | Rápido: la carrera arranca al menos a ×2                                               |

- **Pestaña oculta:** los temporizadores del flujo se pausan (`pauseWhileHidden`, `ui/visibility.ts`)
  y las animaciones CSS de la columna también (`.app[data-app][data-hidden] *`, con especificidad
  mayor que cualquier regla `animation` del juego, porque el atajo `animation` vuelve a poner
  `running`); al volver, cada cosa sigue con el tiempo que le quedaba. Lo que mide su propio tiempo
  (la cuenta de los stats, el apuro de la escena, el tipeo) usa `visibleNow()`. Las animaciones Web y
  las transiciones CSS terminan sin verse; ningún beat las espera.

### 10. La migración terminó

El cambio se hizo como un estrangulador: limpieza, pruebas de base, costuras sin cambio de
comportamiento, el modelo puro probado en node, una sombra que lo comparaba con el juego viejo, el
modelo al mando con una política `LEGACY` que reproducía lo de antes, y un cambio visible para el
dueño por commit, cada uno quitando su bandera. La última (`fxHud`) se fue en el paso 6.10 con
`flow/policy.ts`: ya no hay políticas, y las caminatas de temporada corren una sola vez
(`walkMatrix`). Las pruebas de `mobile-seeds.spec.ts` que fijaban lo viejo («fragile spots, as the
plan fixed them», antes «LEGACY pins») hoy fijan el comportamiento nuevo.

## Medición

Medido el 2026-11-17 (paso 7.3, L14) sobre la app construida (`vite build`, servida con
`vite preview`), en Chromium (Playwright 1.63) a 390 × 844, con la CPU frenada 4× por CDP
(`Emulation.setCPUThrottlingRate`, el perfil de gama media) solo alrededor de cada toque, en un
contenedor de 4 núcleos Xeon; 10 muestras de cada uno, cada una en una página nueva con la partida
sembrada `peregrina-w10` (la semana 10 es de carrera):

- **El toque:** la entrada de Event Timing de su clic. «Proceso» es lo que corren sus manejadores
  (el comando, y el render y el commit de React, que caen en la misma tarea); «a la pintura» va del
  toque al cuadro siguiente pintado (en pasos de 8 ms).
- **El desglose:** una compilación aparte con `performance.measure` alrededor de la carrera de
  vista previa, de `game.act` y de `useGoalRaceLog` (no quedó en el código: solo los números).

Lo que dio:

- `choose`: la carrera de vista previa es la mayor parte (mediana 127 ms, p90 151); el resto es
  derivar el flujo y montar los efectos.
- `run`: la carrera del commit (`game.act`) 47 ms (p90 54), la que `useGoalRaceLog` vuelve a
  simular al dibujar 54 ms (p90 76), y unos 180 ms el montaje de la pantalla de carrera (la
  repetición: su primer cuadro y sus medidas).
- Sin freno (1×): `choose` 37 / 52 ms (proceso / pintura, medianas), `run` 80 / 112 ms.
- **El montaje del final** (el «Continuar» del resultado de la última carrera, con sus efectos
  encima): sin freno ≈ 10 ms y ninguna tarea larga; a 4× una tarea de 58-76 ms y ningún cuadro
  perdido de más de 83 ms. No congela un cuadro que se vea; la copia del aviso que se va sale a
  tiempo (≈ 410 ms sin freno, ≈ 450 ms a 4×).

Las dos medianas pasan el objetivo de 50 ms a 4×. Como dice el plan, no se cambió nada: queda como
decisión abierta del dueño (la 6, abajo). Los números, a 4×:

| Toque, 4×                                   | Proceso: mediana / p90 | A la pintura: mediana / p90 |
| ------------------------------------------- | ---------------------- | --------------------------- |
| `choose` («Descansar» en semana de carrera) | 186 / 224 ms           | 220 / 259 ms                |
| `run` («Correr»)                            | 266 / 359 ms           | 340 / 418 ms                |

## Comprobaciones en aparatos

Lo que las pruebas no pueden reemplazar; las hace el dueño a mano:

- **Pestaña oculta,** en un iPhone (Safari), un Android (Chrome) y una pestaña de escritorio: cambiar
  de app o bloquear el teléfono durante los efectos, el resultado de un entrenamiento, el emblema, la
  entrada de una escena y su tipeo, una carrera y su cartel de llegada, un aviso. Al volver, cada cosa
  sigue donde estaba, nada sonó afuera y vuelve la música. (El e2e solo simula `document.hidden`; el
  aparato además frena los cuadros y puede congelar o descartar una pestaña oculta mucho tiempo:
  entonces manda la recarga, D5.)
- **El gesto atrás:** el atrás de Android sobre una hoja nativa, el borde de iOS Safari sobre una
  pantalla que lo ignora, y que Chrome no saltee las entradas que el juego empujó sin un toque.
- **El movimiento a ojo:** el fundido de una pantalla a través del cielo (si se lee como un
  parpadeo, ver la decisión abierta 5), el emblema 160/1240/280 ms, la llegada, la salida de una
  escena sobre el resultado, las hojas 220/180 ms y sus 180 ms que se tragan un toque, el marco de la
  tableta al ensancharse, el deslizamiento al final en el escritorio, la carrera que vuelve con
  «Ver otra vez».
- **Doble toque en pantalla táctil** donde termina una escena (en su última línea y en «Saltar»),
  sobre los efectos encima del final y sobre las posiciones de la tarjeta de carrera: una sola
  decisión por gesto (iOS Safari y Android Chrome informan la cantidad de toques en `detail`, y esto
  depende de eso).
- **Los sellos de los efectos** sin la letra condensada (antes de que cargue, o sin red): una
  palabra nunca se corta; el sello se achica para entrar en su celda (paso 7.3).
- **El arte del menú después del modo carrera:** al volver al menú (el «Continuar» del resultado),
  la ilustración de la Falconess entra con el resto de la pantalla, no un instante después. En un
  contenedor muy cargado se vio llegar 0,1-0,2 s tarde (la imagen se decodifica de nuevo); no se
  reprodujo en 24 pruebas sin carga, con la CPU frenada 4× ni con carga alta. Si se ve en un aparato,
  el arreglo barato es `decoding="sync"` en esa imagen.
- **Movimiento reducido** con el ajuste del sistema (iOS «Reducir movimiento», Android «Quitar
  animaciones»): todo quieto y entero, todas las esperas de lectura en su lugar.

## Decisiones abiertas

El código mantiene lo de hoy hasta que el dueño responda:

1. El aviso de una escena no sale si el jugador deja la pantalla durante los 0,8 s de la salida de
   esa escena (6.2). Alternativa: dejarlo aparecer sobre el final de la salida.
2. Un toque sobre el juego durante los 180 ms en que se cierra una hoja no hace nada, porque la hoja
   que se cierra sigue siendo modal (6.9). Alternativa: cerrarla de verdad al pedir el cierre y
   desvanecer una copia inerte.
3. «Correr» suena solo con su toque (5.10).
4. En una semana de carrera, el menú debajo de los efectos de la acción muestra los stats de antes de
   la carrera.
5. El cuadro 0 del fundido de una pantalla es el cielo de la columna (después del modo carrera, el
   cielo solo): en un aparato puede leerse como un parpadeo (6.5). El plan ofrece un fundido cruzado
   con una foto de la pantalla anterior.
6. Los dos toques pesados de una semana de carrera pasan los 50 ms en un perfil de gama media
   (Medición): elegir la acción (≈ 0,2 s, casi todo la carrera de vista previa) y «Correr» (≈ 0,3 s:
   la carrera, la misma carrera simulada otra vez por la pantalla de carrera y el montaje de la
   repetición). Hoy el toque espera ese trabajo, porque el comando y el cambio de pantalla van en el
   mismo manejador síncrono (§1). Alternativas, cada una con su costo:
   - calcular de antemano, mientras el menú de la semana de carrera está quieto, la vista previa de
     cada acción (≈ 1 s de CPU de fondo a 4× por semana de carrera, y batería), así el toque la
     encuentra hecha;
   - que «Correr» guarde la carrera que corrió y la pantalla de carrera no la simule de nuevo (−54 ms
     a 4×, el mismo resultado);
   - montar la repetición un cuadro después de la pantalla de carrera (la pantalla aparece antes, la
     carrera arranca un cuadro más tarde);
   - pintar el toque primero y simular en la tarea siguiente: rompe la regla del toque y el cambio
     de pantalla juntos y agrega un estado intermedio que vive solo en React.
7. Un final que una versión anterior guardó después del entrenamiento de la semana 48 (Caracara,
   Cernícala; también la partida de prueba 1 del dueño) abre una vez en el resultado de ese
   entrenamiento, con la semana 48 en el HUD, y a los ≈ 2 s pasa al final: la versión anterior iba
   directo al final y dejaba la semana sin leer. Alternativa: que una partida terminada con su
   última semana sin leer abra en el final, marcando la semana leída (pierde ese resultado, que la
   jugadora nunca vio).
8. En un teléfono de 360 × 740 y en la tableta, el aviso «Escena saltada…» de la escena previa
   tapa, durante sus 4 s, el nombre y el objetivo de la carrera en la tarjeta decidida: ahí no queda
   lugar libre (las posiciones y la pista son controles) y el aviso va abajo de la barra de arriba,
   como dice §7. Alternativas: que tape la cabecera de las posiciones (texto, no un control) antes
   que el nombre y el objetivo, que tape el botón de la pista, o que espere a la pantalla siguiente.
9. Un aviso que se va al cambiar de pantalla se desvanece en 400 ms donde estaba: si la pantalla
   nueva tiene un control ahí (del resultado al menú: «Entrenar»), la copia, que no toma toques, se
   ve encima ≈ 0,3 s. Alternativas: que la copia se desvanezca debajo de la pantalla nueva, o que se
   corte al cambiar de pantalla.

## Consecuencias

- Una partida guardada sigue cargando igual. `falconess.juego.semana` se crea al usarse;
  `falconess.juego.herencia`, en la primera carga de la versión nueva (la migración). Una tarjeta de
  herencia que la versión anterior mostró en una semana ya leída no se repite; una que mostró en la
  semana sin leer en que se actualizó sale otra vez, una sola (§5). Una semana de carrera decidida
  en la versión anterior vuelve sin decidir, y un final después de un entrenamiento abre una vez en
  su resultado (§5, decisión abierta 7).
- Las pruebas del celular corren sobre partidas sembradas (`e2e/saves/*.json`) en vez de jugar hasta
  la semana 10, y un sondeo por cuadro (`probe`) hace fallar cualquier e2e de `#juego` con un id
  duplicado, dos pantallas o dos capas «adentro» en un mismo cuadro.
- El diálogo de eventos sigue con el estilo de la vista de pruebas mientras la v3 no tenga eventos
  (L12).
