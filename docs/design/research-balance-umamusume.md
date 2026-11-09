# Cómo equilibra Umamusume: Pretty Derby sus carreras (técnicas, datos y lecciones para un juego determinista)

Cygames casi nunca equilibra Umamusume bajando lo que el jugador pagó: lo hace subiendo lo que quedó atrás y, sobre todo, agregando mecánicas de carrera nuevas atadas a umbrales de stats que reordenan el meta sin tocar el número impreso en ninguna carta. Para un juego determinista, sin pay-to-win y hecho por una sola persona, conviene copiar la parte de "mecánicas que dan valor a stats olvidados" y la rotación de pistas, y evitar la acumulación de sistemas opacos que la propia Cygames reconoce como "difícil de entender".

## TL;DR

- **Técnica dominante:** subir lo débil y añadir sistemas (Guts rework, 位置取り争い, スタミナ勝負, 全開スパート) en lugar de nerfear; el único caso de bug favorable a cartas de pago (escenario 無人島, junio de 2025) se resolvió subiendo todas las demás opciones y compensando, no corrigiendo el bug.
- **El meta se mueve por umbrales y por pista:** cada aniversario JP añade un umbral nuevo (Power >1200, Stamina >1200, Speed >2000, Wit >1200 para escalar skills), y cada Champions Meeting fija una pista y distancia que rota qué estilo y qué stat importa; en JP llegaron a usarse reglas especiales (Champions Meeting sin debuffs).
- **Para tu juego:** el azar de Umamusume (salida tarde, kakari, activación por Wit) es el que hace que la misma build no gane siempre; si tu juego es determinista, necesitas otra fuente de variedad (rotación de pistas, interacciones entre estilos, información oculta del rival) y un simulador propio para medir balance.

## Resumen en 10 líneas

1. Cygames prácticamente no publica nerfs a contenido de pago; no se encontró ninguna declaración oficial de "no nerfear", pero el patrón es consistente (fuentes oficiales vía prensa japonesa y recopilaciones de Game8/GameWith).
2. El caso de 無人島 (junio de 2025) es la prueba más clara: según Dengeki Online, el bug aplicaba la bonificación de las instalaciones "島合宿期間の全トレーニング" y dejó "特定のサポートカード編成が想定より強力な状態" (un blog de jugador lo identifica como el mazo de 5 cartas de Speed con Tucker Brine); el bug se convirtió en "comportamiento oficial" y se subió todo lo demás (oficial, vía Dengeki Online).
3. Los grandes cambios de meta llegan en aniversarios (24 de febrero y 24 de agosto en JP) y casi siempre son mecánicas nuevas, no ajustes de números.
4. Cada mecánica nueva le da un "trabajo" a un stat: Guts (2022), Power y Stamina (2023), Speed y Wit (2026).
5. Los umbrales funcionan como escalones: >1200 en Power, Stamina y Wit; >2000 en Speed; además, el valor por encima de 1200 cuenta a la mitad (ingeniería inversa, GameTora).
6. El estilo Nige ha sido el más difícil de equilibrar; Cygames lo admitió por escrito en la carta de desarrolladores del 5.º aniversario y anunció como remedio un ajuste de la リード確保システム (oficial, citado por オタク総研 en Yahoo!ニュース).
7. El Champions Meeting rota pista, distancia y condiciones cada mes; eso por sí solo rota el meta, y Cygames lo ha usado con reglas especiales (prohibición de debuffs en un CM de milla en JP).
8. El azar es real pero acotado: retraso de salida de hasta 0,1 s, kakari una vez por carrera según Wit, activación de skills según Wit; los simuladores comunitarios lo modelan con Monte Carlo.
9. Global se lanzó el 26 de junio de 2025 con calendario acelerado y recibió las mecánicas del primer aniversario JP el 11 de noviembre de 2025, rompiendo la "guía resuelta" que traían los veteranos de JP.
10. Lección central: equilibrar subiendo y con sistemas es amigable con el jugador pero genera inflación y complejidad; en un juego determinista y sin gacha puedes permitirte nerfear con más libertad, siempre que lo comuniques bien.

## Key Findings

- **Política de facto "no nerf":** de todo lo revisado, el único "下方修正" documentado en el juego afectó a una rival controlada por la IA (Narita Taishin en el 菊花賞 del escenario de Biwa Hayahide, abril de 2021), no a una carta o personaje de pago. En Global, la skill única de Taiki Shuttle ("Shooting for Victory!") cambió de condición en noviembre de 2025; Game8 lo presentó como buff, aunque la comprobación de posición quedó "slightly stricter" y, según la comunidad, deja de funcionar en pistas con curva final muy tardía.
- **Mecánicas como palanca principal:** en cada aniversario JP se añadió al menos un sistema de carrera nuevo, con efectos medibles por la comunidad en pocas semanas.
- **Admisión oficial del problema de Nige:** "作戦『逃げ』は一人だと勝利しづらく、複数だと大幅に強くなるピーキーさによって、バランスを取りづらい状態が続いていました" (carta de desarrolladores, 11 de marzo de 2026, citada por オタク総研 en Yahoo!ニュース, que añade que se corrigió ajustando la "リード確保システム").
- **Admisión oficial del problema de legibilidad:** la función "発動スキルの確認", lanzada el 11 de marzo de 2026, se creó, en palabras del equipo, "率直に申し上げて難解なこのゲームのレース展開を理解しやすくし、アプローチを考える一助となるべく開発いたしました" (Yahoo!ニュース/オタク総研); según gamebiz, también explica por qué una skill no se activó ("賢さに応じた確率による未発動、スキルの条件による未発動、特殊ルールによる未発動").
- **Los jugadores miden con simuladores:** uma-skill-tools (alpha123) y sus forks (kachi-dev, mackoz, TheCing/Moomoolator, NeoAdonis/uma-tools-rs) usan Monte Carlo y, en la versión Rust, semillas pareadas para reducir varianza al comparar builds.

## 1. Herramientas de balance de Cygames

**Qué tocan cuando algo está fuerte o débil.** La evidencia apunta de forma consistente a subir lo demás:

- El ajuste del 24 de febrero de 2022 (1.er aniversario JP) relajó condiciones de activación de 57 skills y cambió el sistema de posición de 31 skills; la comunidad lo llamó "ウマ娘2" por la magnitud (jugadores: Uma Musume Labo). Famitsu lo resumió como "根性の上方修正" más "位置取り争い" y "大逃げ" (oficial vía prensa).
- El ajuste del 3.er aniversario (24 de febrero de 2024) añadió 8 skills nuevas para Oikomi y reescribió skills únicas poco usadas (por ejemplo, "KEEP IT REAL." pasó de acelerar poco a poco a "速度を少し上げ続ける"; "ブレイクスルー" dejó de exigir estar "最後方付近") (oficial resumido por Game8 JP).
- La actualización del 2.º aniversario (24 de febrero de 2023) subió las stats de eventos de entrenamiento, hizo seguras las salidas (お出かけ) y facilitó "情熱ゾーン" de las cartas de grupo (Game8 JP).

**Frecuencia.** Los ajustes grandes llegan en los aniversarios (24 de febrero) y medios aniversarios (24 de agosto), con parches intermedios: 20 de diciembre de 2023, 30 de mayo de 2024, 26 de junio de 2024, finales de octubre de 2024, 30 de junio de 2025 y 29 de junio de 2026 (Game8 JP, GameWith, inside-games). GameWith registra también un ajuste en el 5.5 aniversario (24 de agosto de 2026), cuyo detalle no se pudo verificar en esta investigación.

**Cuántas veces se nerfeó algo de pago.** No se encontró ningún nerf anunciado como tal a una support card o uma de pago en JP. Casos límite:
- 無人島 (27 de junio de 2025, ajustado el 30 de junio a las 23:20): bug que, según Dengeki Online, aplicaba la "パラメータ・スキルPtボーナス" de las instalaciones a "島合宿期間の全トレーニング", con lo que "特定のサポートカード編成が想定より強力な状態となっていました" (el blog Hatena silvervine0822 identifica ese mazo como "スピードサポートカード5枚と《タッカーブライン》編成"). Cygames decidió "施設効果の修正は行わず" (no corregir el efecto), cambió el texto para que coincidiera y subió las instalaciones de Stamina, Power, Guts y Wit, además de compensar con 1.500 joyas (oficial, vía Dengeki Online). El mismo blog de Hatena (2 de julio de 2025) lo explicó así: "これまで育成していたウマ娘問題があるため下方修正ではなく上方修正となり更なるインフレが進むことになってしまいました".
- Taiki Shuttle en Global (11 de noviembre de 2025): cambio de condición presentado como mejora; sin datos de reacción en Reddit verificables (no se encontró hilo concreto).
- **Reacción de la comunidad:** en 5ch, ya en 2022, los jugadores asumían que no habría nerf directo a "地固め" y que el debilitamiento sería "相対的" con skills superiores; esa expectativa se ha cumplido (jugadores, blog de recopilación de 5ch).

**Ejemplos concretos con fecha:**
- **Guts (24 de febrero de 2022 JP / 11 de noviembre de 2025 Global):** el Guts empieza a aumentar la velocidad de la última recta y es el stat central de 位置取り争い y 追い比べ.
- **位置取り争い:** entre 150 m desde la salida y poco después del inicio de la mitad de carrera, entre Nige a menos de 3,75 m (5 m entre 大逃げ); consumo de stamina ×1,4 (Nige), ×3,5 (大逃げ), ×3,6 (Nige en kakari) y ×7,7 (大逃げ en kakari) (ingeniería inversa, GameTora).
- **スタミナ勝負 (24 de agosto de 2023):** Stamina >1200, carreras de más de 2100 m, efecto mayor cuanto más larga la carrera y más Power (oficial; distancia mínima por ingeniería inversa, GameTora). Reforzado a finales de octubre de 2024 para carreras largas (oficial vía inside-games).
- **全開スパート (24 de febrero de 2026):** Speed >2000 con "余力十分" en la última recta, sube la velocidad máxima de forma continua; en el lanzamiento solo el escenario "Dreams" permitía superar 2000 de Speed (oficial y guía kamigame).
- **Wit (24 de febrero de 2026):** con Wit >1200, sube el efecto de skills de velocidad únicas, evolucionadas y doradas; la comunidad fija 1600 como punto práctico donde el beneficio empieza a aplanarse (jugadores, Yahoo!知恵袋).

## 2. Balance por sistemas y no por números

El patrón es claro: **cada sistema nuevo crea un uso para un stat o estilo débil**, y el meta se reacomoda solo.

- **2022, Guts:** antes era el stat "basura"; tras el rework, decks de Guts se volvieron viables (Game8 Global señala a Haru Urara SSR como carta accesible que ganó valor).
- **2023 (2.º aniversario), Power:** "脚をためる" premia Power >1200 durante la primera mitad y lo libera como aceleración ("脚色十分") en la última recta (oficial vía gamebiz / Game8 JP).
- **2023 (2.5 aniversario), Stamina:** スタミナ勝負 convierte el excedente de Stamina en velocidad final; 位置取り調整 y リード確保 consumen stamina para ganar posición en mitad de carrera, y 持久力温存 usa Wit para decidir si conviene reservarla.
- **2026 (5.º aniversario), Speed y Wit:** 全開スパート y el escalado de skills por Wit; además, "助走距離" (sistema nuevo) y ajuste de リード確保 para que un Nige solitario pueda abrir distancia.

**Por qué funciona (INFERENCIA):** un sistema nuevo cambia el valor de cartas viejas sin cambiar su texto; el jugador siente que su compra "ganó" o "no perdió" valor en vez de sentir que se lo quitaron. El costo es que cada sistema agrega una capa de reglas ocultas.

## 3. Balance de estilos y distancias

- **Mecanismo base (ingeniería inversa, GameTora):** los estilos tienen coeficientes de velocidad por fase distintos (por ejemplo, Nige 1,0 / 0,98 / 0,962 y Sashi 0,938 / 0,998 / 0,994 en inicio, mitad y final, según la tabla recopilada por EOG.GG); Sashi y Oikomi convierten Stamina en HP con hasta un 11 % más de eficiencia que Senkō.
- **Position Keep:** todos los estilos se posicionan respecto al "pacemaker" (el Nige más adelantado); si no hay Nige, un Senkō hace de líder y "se vuelve muy peligroso" (jugadores, Umamusume Reference). Por eso el número de Nige en la carrera cambia todo el ritmo.
- **El problema crónico de Nige:** con un Nige solo era difícil ganar; con varios, se potenciaban (位置取り争い da velocidad a ambos). Cygames lo admitió y en febrero de 2026 ajustó リード確保 para que el efecto sea mayor sin rivales cerca (oficial, carta de desarrolladores y resumen de kamigame). Antes, en octubre de 2024, ya había ajustado el posicionamiento para que, sin Nige en carrera, el número de compuerta no afectara al líder (oficial vía inside-games).
- **Cuando Oikomi quedó débil:** 8 skills nuevas para Oikomi en el 3.er aniversario (febrero de 2024).
- **Datos de uso y victorias por estilo:** Cygames no publica estadísticas oficiales por estilo. Datos comunitarios disponibles: en una simulación de NGA para la Leo Cup (servidor chino), Maruzensky (verano) acumuló cerca del 50 % de las victorias y Sashi y Oikomi rindieron "很差" (jugadores, NGA vía Sina). En un CM de milla JP sin debuffs, Game8 JP calificó a Sashi como "頭一つ抜けた". No se encontró una serie histórica pública de uso por estilo por parche (uma.moe y zenno no se pudieron consultar).

## 4. Balance por pista y por copa

- Cada Champions Meeting fija pista, distancia, superficie, estación, clima y estado del terreno; las skills verdes dependen de esas condiciones (Game8 JP, ejemplo Hanshin 1600 m, invierno, despejado, terreno firme).
- **Ejemplo Global:** CM16 Leo Cup (julio de 2026) en Nakayama 1200 m de césped, meta Senkō con prioridad "Speed = Power > Wit > Guts >> Stamina"; CM17 Virgo Cup en Oi 2000 m de tierra, donde "dirt surface narrows viable pool significantly" (comunidad, EOG.GG).
- **Uso deliberado como herramienta:** Cygames aplicó reglas especiales, como un CM sin skills de debuff (Game8 JP). También ajustó la geometría de pistas reales en 2023 y 2026 y cambió cómo funcionan las skills "最終直線" en Niigata 1000 m (recta única) (oficial vía Game8 JP).
- **Umbrales por pista:** algunas pistas tienen umbrales de stats; superarlos sube Speed un 5 % por cada múltiplo de 300, hasta un 20 % a los 900 (ingeniería inversa, GameTora).
- **Opinión de jugadores:** las guías por copa (NGA/Bilibili) describen la pista como el factor que decide el estilo; por ejemplo, la Taurus Cup de JP favoreció a quienes llegan desde atrás por la recta final de Tokyo, que según JRA-VAN mide 525,9 m ("最後の直線距離は525.9mで、新潟の外回りコースに次ぐ長さ") (jugadores, NamuWiki). **INFERENCIA:** la rotación mensual de pistas es la herramienta de balance más barata de Cygames, porque no toca ninguna carta.

## 5. Balance entre personajes

- **Reescritura de skills únicas (固有スキル):** 3.er aniversario JP (Gold City, Narita Taishin, Hishi Akebono, Fine Motion, Sakura Bakushin O); 1.er aniversario con decenas de skills (Game8 JP, Uma Musume Labo). Uma Musume Labo destaca que skills como "キラキラ☆STARDOM" pasaron de exigir 1.º a aceptar 2.º puesto.
- **Eventos y objetivos:** en junio de 2026 se subieron las stats de los objetivos con requisito G2 o inferior (Daiwa Scarlet) o de fans (Haru Urara, Tamamo Cross), y se eliminaron eventos que restringían entrenamientos (Gold Ship, Fine Motion, Gold City) (Game8 JP).
- **Inflación de poder:** cada escenario nuevo eleva el techo de stats (por ejemplo, Dreams con techo de hasta 2500 mediante factores; 全開スパート requiere más de 2000). Los nuevos personajes tienden a "redefinir" estilos: Mihono Bourbon (San Valentín) "redefinió lo que necesita un Nige", según la comunidad (EOG.GG). **INFERENCIA:** la inflación está controlada por escenario más que por personaje, porque las stats las limita el escenario de entrenamiento.

## 6. Economía y balance

- **Gacha:** tasa base de SSR del 3 %, 0,75 % por carta en rate-up, "spark" a 200 tiradas sin arrastre entre banners; en promedio hacen falta unas 400 tiradas para el máximo de copias (MLB) de una SSR; un spark cuesta entre 240 y 408 USD (comunidad, EOG.GG). Sin copias, una SSR a 0LB suele rendir por debajo de una SR al máximo (comunidad).
- **Ligas del Champions Meeting:** Graded League sin límite de rango y Open League para umas de rango A+ o inferior en el aviso oficial de Global del 31 de octubre de 2026 (Capricorn Cup). Fuentes comunitarias anteriores indican B o inferior en Global, así que el límite parece haber subido (**conflicto entre fuentes**: oficial A+, GameTora/uma.guide B).
- **Formato:** rondas 1 y 2 de 2 días con hasta 4 entradas diarias de 5 carreras 3v3v3 (9 umas); 3 victorias en una entrada te llevan al grupo A (oficial / GameTora).
- **Medidas contra la brecha de pago:** la Open League limita el rango, no las cartas; por eso existe una subcultura de "optimizar justo por debajo del límite" (jugadores, NamuWiki). Los jugadores también calculan que, con un 33 % de victoria por carrera y 8 entradas, se llega al grupo A con un 71,9 % de probabilidad (jugador, tma.main.jp): **el formato premia la constancia más que el pico de poder**.

## 7. El azar como herramienta de balance

Fuentes de azar documentadas (ingeniería inversa, GameTora):
- **Retraso de salida:** cada uma tira entre 0 y 0,1 s; desde 0,066 s cuenta como salida tarde (pierde la aceleración inicial) y no depende de Wit. Algunas skills multiplican la tirada.
- **Kakari:** probabilidad según Wit, una vez por carrera, entre la mitad del inicio y la mitad de la mitad de carrera; cada 3 s hay un 60 % de terminar y como máximo dura 12 s; consumo de stamina ×1,6. Umamusume Reference indica un 55 % (**conflicto menor entre fuentes**). Cuesta, en promedio, el equivalente a 45–180 de Stamina base.
- **Activación de skills:** chequeo de Wit y punto de activación aleatorio dentro de la zona válida (uma-skill-tools: ActivationSamplePolicy.ts).
- **Otros:** chequeos de Wit en Position Keep, 持久力温存 y bajadas; リード確保 con un 20 % cada 2 s según una versión de umamusu.wiki.

**Cuánto decide el azar.** No existe una cifra oficial. Indicadores de jugadores: jugadores fuertes reportan tasas del 72–98 % en rondas (por ejemplo, 63 victorias y 18 derrotas, un 77,8 %, en un CM de milla, y 39 de 40, un 97,5 %, en la ronda 1 de octubre de 2026, ambos en note.com), lo que sugiere que la build domina en promedio y el azar decide los enfrentamientos parejos. **INFERENCIA:** Cygames usa el azar para que el "ganador esperado" no gane siempre y para justificar Wit como stat; no se encontró declaración oficial de que sea intencional.

## 8. Stats y umbrales

- **Reglas base (ingeniería inversa, GameTora):** stats de 1 a 2000 (el techo de entrenamiento se amplía según escenario); por encima de 1200, el excedente cuenta a la mitad; el ánimo modifica ±2 % por nivel; Speed solo afecta a la velocidad objetivo en la fase final.
- **Jerarquía:** Speed como pilar; Stamina como "piso" (EOG.GG: estar 300 por debajo de lo recomendado "turns Speed into a decoration"); Power para aceleración y cambio de carril; Guts para última recta y duelos; Wit para skills y control.
- **Umbrales que cita la comunidad:** Stamina >1200 para スタミナ勝負 (más de 2100 m); Power >1200 para 脚をためる; Speed >2000 para 全開スパート; Wit >1200 (práctico: 1600) para escalar skills; Wit de 1200 o más para builds de debuff (Game8 JP, Uma Musume Labo).
- **Cómo los usa Cygames:** cada umbral se fija justo encima del techo típico del escenario vigente, lo que convierte el escenario nuevo en "la llave" del sistema nuevo (**INFERENCIA** basada en 全開スパート, que requería "Dreams" al salir).

## 9. Diferencias entre JP y Global

- Global salió el 26 de junio de 2025, publicado por Cygames directamente, con calendario acelerado de banners y eventos (oficial, anuncio recogido por Siliconera); según Game8, Cygames anunció la fecha en X el 27 de abril de 2025 y el prerregistro empezó el 28 de abril.
- El 11 de noviembre de 2025 (medio aniversario de Global) llegaron mecánicas del 1.er aniversario JP mucho antes de lo esperado (Guts, Spot Struggle, Dueling, Runaway); la prensa lo describió como el fin de la sincronía con la "guía resuelta" de JP (GameDaily).
- En el 1.5 aniversario de Global, el balance ya estaba a la par del 2.º aniversario JP (comunidad, GameTora). La función Independent Training llegó a JP el 29 de junio de 2026 y a Global el 22 de julio de 2026 (Fandom).
- **Qué aprendieron (INFERENCIA):** adelantar sistemas que arreglaron problemas en JP (Guts inútil, eventos frustrantes) evita repetir en Global los "años malos" del meta japonés.

## 10. Herramientas de los jugadores para medir el balance

- **uma-skill-tools (alpha123):** archivos RaceSolver.ts, ActivationConditions.ts, ConditionParser.ts, ActivationSamplePolicy.ts, HpPolicy.ts y Random.ts. Por diseño simula **una sola uma**, porque simular la carrera completa "makes it too difficult to isolate the effects of a single skill".
- **Umalator y forks:** kachi-dev añade varianza por Wit (modo bajada, kakari, probabilidad de activación) y afirma que, contrastado con paquetes reales del juego, su tasa de última recta acierta "within a few %"; integra la lógica de Position Keep de mee1080. Andrew123Shi ofrece Monte Carlo sobre todas las pistas de una distancia.
- **uma-tools-rs (NeoAdonis):** cada fuente de azar tiene su propio flujo derivado de la semilla de la carrera, de modo que dos carreras que solo difieren en una skill son idénticas hasta que esa skill importa (**números aleatorios comunes**, la técnica estándar para separar build de azar).
- **Documento de KuromiAK:** base de casi todo el conocimiento de fórmulas, construido sobre la ingeniería inversa de @umamusu_reveng (inactivo), @kak_eng y @hoffe_33.
- **JP:** el simulador de しらす丼 (note.com, versión 5.0, mayo de 2026) implementó 全開スパート "仮実装" porque aún no estaba analizado.
- **Chino:** NGA hace "模拟赛" (torneos simulados) con tablas de victorias por personaje y estilo; ya existe un simulador web para el servidor chino (mioX-9527/uma-race-sim).
- **No consultado:** el repositorio umamusu_reveng, umasim, uma.moe y zenno no se abrieron en esta investigación.

## 11. Errores y polémicas

- **Era de Nige "oscura":** un jugador describe el período de varios Nige y 大逃げ como "暗黒時代" porque anulaba las skills vitales de Senkō; Cygames tardó años en abordarlo (jugador, blog livedoor; admisión oficial de 2026).
- **Bug de 無人島 (2025):** se convirtió en regla oficial; se evitó la ira de quienes ya habían entrenado, pero se aceptó un escenario más inflado (oficial, Dengeki).
- **Legibilidad:** la propia Cygames reconoció en 2026 que la carrera es "率直に申し上げて難解" y añadió la herramienta "発動スキルの確認" para ver qué skills se activaron y por qué no se activaron otras (Yahoo!ニュース/オタク総研; gamebiz).
- **Escenarios lanzados "en bruto":** un jugador de Yahoo!知恵袋 observa que Cygames "ある程度雑に放り出して数日経ってから修正" de forma repetida. Es opinión, no dato.

## 12. Lecciones para un diseñador

**Qué hace bien:**
- Subir en lugar de nerfear protege la confianza del jugador que pagó.
- Los sistemas atados a stats dan propósito a stats débiles.
- La rotación de pistas mueve el meta sin tocar contenido.
- Las ligas por rango crean espacios de competencia más justos.

**Qué hace mal:**
- Inflación sostenida y techos de stats cada vez más altos.
- Una capa tras otra de reglas ocultas que la comunidad debe descubrir por ingeniería inversa.
- Un problema estructural de estilo (Nige) que duró años.

**Qué copiar o evitar en tu juego (determinista, sin pay-to-win, una sola persona):**
1. **Puedes nerfear:** sin dinero en juego, el costo social es bajo; publica notas de cambio con el porqué.
2. **Umbrales visibles:** si usas escalones (por ejemplo, "Resistencia >X activa una mecánica"), muéstralos en la interfaz; evita el problema de "難解".
3. **Construye tu simulador desde el día 1:** con semillas o, en tu caso, determinismo total, puedes correr miles de combinaciones build contra build y detectar dominancias.
4. **Variedad sin azar:** rota las condiciones de pista (viento, altitud, corrientes para corredoras que vuelan) y diseña interacciones piedra-papel-tijera entre estilos (el equivalente a 位置取り争い: dos "líderes" se perjudican entre sí).
5. **Evita la dependencia del número de un estilo:** el problema de Nige vino de que su fuerza dependía de cuántos había; diseña mecánicas de estilo que escalen de forma suave.
6. **Rendimientos decrecientes:** el "excedente sobre 1200 cuenta a la mitad" es una herramienta simple para frenar builds de un solo stat.

## Tabla de cambios de balance con fecha

| Fecha (servidor) | Qué se cambió | Por qué (oficial o INFERENCIA) | Efecto en el meta | Tipo de fuente |
|---|---|---|---|---|
| 26/04/2021 (JP) | Stats de rivales IA en el 菊花賞; objetivo de 5.º a 3.º puesto | Dificultad excesiva (INFERENCIA) | Escenario más justo; primer "下方修正" (a la IA) | Oficial vía Famitsu/GAME Watch |
| 24/02/2022 (JP) | Guts rework, 位置取り争い, 追い比べ, 大逃げ; 57 skills relajadas | Dar valor a Guts y a skills muertas (INFERENCIA) | Builds de Guts viables; Nige más agresivos | Oficial vía Famitsu; jugadores |
| 08/2022 (JP, 1.5 aniv.) | Lógica de posición y "pacemaker" | Más duelos y adelantamientos | Pacemaker menos predecible | Game8 JP; GameTora |
| 24/02/2023 (JP) | 脚をためる (Power >1200), Pace Up Ex, geometría de pistas reales | Power útil; realismo | Power sube en prioridad | Oficial vía gamebiz; GameTora |
| 24/08/2023 (JP) | スタミナ勝負, 位置取り調整, リード確保, 持久力温存 | Stamina como valor ofensivo | Larga distancia premia Stamina >1200 | Oficial vía Dengeki/AUTOMATON |
| 24/02/2024 (JP) | 8 skills de Oikomi; reescritura de skills únicas; continuaciones de 3 a 5 | Oikomi débil; skills no usadas | Oikomi recupera presencia | Oficial vía Game8 JP |
| 26/06/2024 (JP) | Sin techo de stats en carrera por skills/ánimo | Skills desperdiciadas | Skills verdes valen más | Game8 JP |
| 29/10/2024 (JP) | スタミナ勝負 reforzada en carreras largas; posición sin Nige | Larga distancia y sesgo de compuerta | Stamina aún más valiosa | Oficial vía inside-games |
| 30/06/2025 (JP) | Bug de 無人島 convertido en regla; se suben las demás instalaciones | Proteger umas ya entrenadas | Escenario inflado; más mazos viables | Oficial vía Dengeki |
| 11/11/2025 (Global) | Mecánicas del 1.er aniversario JP traídas antes; cambio de Taiki | Ponerse al día con JP | Fin de la "guía resuelta" de JP | Oficial vía Siliconera/Game8 |
| 24/02/2026 (JP) | 全開スパート (Speed >2000), Wit >1200 escala skills, リード確保 para Nige solo, 助走距離 | Nige "ピーキー" | Speed y Wit muy altos; Nige solo viable | Oficial (carta de desarrolladores) vía prensa |
| 29/06/2026 (JP) | Fin de eventos restrictivos; más stats en objetivos débiles | Reducir frustración | Umas viejas más entrenables | Game8 JP |
| 24/08/2026 (JP) | Ajuste del 5.5 aniversario | Sin verificar | Sin verificar | GameWith (solo título) |

## Tabla de técnicas de balance

| Técnica | Ejemplo en Umamusume | Fuente | ¿Conviene para un juego determinista? |
|---|---|---|---|
| Subir lo débil en vez de nerfear | 3.er aniv.: skills de Oikomi; 無人島 | Oficial (Game8 JP, Dengeki) | Parcial: sin gacha puedes nerfear; subir genera inflación |
| Mecánica nueva atada a un stat | Guts rework, スタミナ勝負, 全開スパート | Oficial; ingeniería inversa (GameTora) | Sí, con umbrales visibles |
| Umbrales/escalones | >1200 Power/Stamina/Wit; >2000 Speed | Ingeniería inversa; oficial | Sí, pero mostrados en la interfaz |
| Rendimientos decrecientes | Excedente sobre 1200 cuenta a la mitad | Ingeniería inversa (GameTora) | Sí, muy recomendable |
| Rotación de pista y condiciones | CM mensual con pista fija | Oficial; comunidad (EOG.GG) | Sí, la principal fuente de variedad sin azar |
| Reglas especiales por evento | CM sin debuffs | Game8 JP | Sí, barato y efectivo |
| Interacción entre estilos | 位置取り争い castiga a varios Nige | Ingeniería inversa | Sí, pero que no dependa de cuántos hay |
| Azar controlado por stat | Kakari y activación según Wit | Ingeniería inversa | No (contradice el determinismo); sustituir por información oculta |
| Ligas por rango | Open League ≤A+ | Oficial (umamusume.com) | Sí, si hay PvP asíncrono |
| Reescritura de skills viejas | Skills únicas de Gold City, Taishin | Oficial vía Game8 JP | Sí |
| Herramienta de legibilidad | "発動スキルの確認" (2026) | Oficial vía prensa | Sí, desde el lanzamiento |
| Simulación Monte Carlo/semillas | uma-skill-tools, uma-tools-rs | Ingeniería inversa (GitHub) | Sí: en determinista basta con un barrido exhaustivo |

## Caveats

- No se encontraron presentaciones de la GDC ni de la CEDEC de Cygames sobre el balance de Umamusume, ni entrevistas de Famitsu o 4Gamer centradas en la filosofía de balance; las citas oficiales provienen de avisos y de la carta de desarrolladores, en su mayoría a través de la prensa.
- Las fórmulas provienen de ingeniería inversa (KuromiAK, @umamusu_reveng, @kak_eng, @hoffe_33) y no están garantizadas; hay discrepancias menores (kakari: 60 % frente a 55 %).
- No se abrieron el repositorio umamusu_reveng, umasim, uma.moe ni zenno; no se dispone de series estadísticas oficiales de uso por estilo.
- No hay ningún hilo verificado de Reddit sobre la reacción al cambio de Taiki Shuttle.
- Se excluyeron todas las fuentes en español; NamuWiki se consultó en su traducción al inglés.

## Fuentes

**Oficiales (directas o reproducidas por la prensa):**
- Aviso oficial de Global "League selection period for Champions Meeting: Capricorn Cup" (umamusume.com, 31/10/2026).
- Aviso del 24/08/2023 (vía Dengeki Online, AUTOMATON, Excite/Inside y la copia de DMM en note.com).
- Ajuste del 24/02/2022 (Famitsu).
- Ajuste de octubre de 2024 (inside-games).
- Bug y ajuste de 無人島 (Dengeki Online, 01/07/2025; tuit de @uma_musu).
- Carta de desarrolladores del 5.º aniversario (Yahoo!ニュース / オタク総研).
- Ajuste del 菊花賞, 2021 (GAME Watch, Famitsu).
- Calendario acelerado de Global y ajustes del 11/11/2025 (Siliconera).

**De jugadores y comunidad:**
- Game8 JP (recopilación de ajustes; CM de diciembre).
- Game8 Global (parche del 11/11/2025; Spot Struggle; guía del CM).
- GameWith y kamigame (5.º aniversario, 全開スパート).
- Uma Musume Labo.
- note.com (しらす丼; informes de CM).
- Yahoo!知恵袋.
- Blog de recopilación de 5ch (dragonquestwalk).
- Blog PURUKO (livedoor).
- tma.main.jp (probabilidades del CM).
- NGA vía Sina/163; BWIKI de Bilibili.
- EOG.GG; Umamusume Reference; uma.guide; GameDaily; Fandom wiki; NamuWiki (en inglés); hilo de ResetEra.

**Ingeniería inversa y simuladores:**
- GameTora "Race Mechanics Handbook" (robflop y Gertas, sobre el documento de KuromiAK).
- umamusu.wiki "Game:Mechanics".
- GitHub alpha123/uma-skill-tools (RaceSolver.ts, ActivationSamplePolicy.ts, HpPolicy.ts, Random.ts).
- kachi-dev/uma-tools.
- mackoz/uma-tools.
- TheCing/uma-tools (Moomoolator).
- Andrew123Shi/Umalator.
- NeoAdonis/uma-tools-rs.
- systemless10/UmamusumePS (créditos de @umamusu_reveng, @kak_eng y @hoffe_33).
- mioX-9527/uma-race-sim.