# Comandos

Comandos de desarrollo. Los del juego (`pnpm sim`, `pnpm play`, etc.) están listados en `CLAUDE.md`.

## `pnpm names`: generador de nombres compuestos

Herramienta de desarrollo, no parte del juego. Junta una palabra de un «mundo» A con una de un mundo
B («Special» + «Week»), y opcionalmente antepone una palabra de un mundo «casa» (escuela o fabricante,
como «Mejiro» en Umamusume). Código: `apps/cli/src/names.ts` y `apps/cli/src/names/`.

```bash
pnpm names -- --list
pnpm names -- --a winds --b alloys --n 30 --seed 1
pnpm names -- --n 30 --seed 1 --order free --explain
pnpm names -- --a raptors --b any --house makers --n 20 --seed 7 --out names.md
```

| Opción | Qué hace | Por defecto |
| --- | --- | --- |
| `--a`, `--b` | Mundo de la primera y de la segunda palabra. `any` (u omitirlo) elige cualquier mundo de palabras, sin repetir el de la otra. | `any` |
| `--house` | Mundo casa que va como prefijo. | sin prefijo |
| `--n` | Cuántos nombres. | 30 |
| `--seed` | Semilla. Misma semilla y mismas opciones, mismos nombres. | `1` |
| `--max-chars` | Largo máximo del nombre entero, con espacios. | 16 (26 con `--house`) |
| `--max-words` | Máximo de palabras del nombre entero. | sin límite |
| `--order` | `fixed`: el mundo A va primero. `free`: pueden invertirse. | `fixed` |
| `--rank` | `on`: junta 8 candidatos por nombre pedido, los puntúa y se queda con los mejores. `off`: orden de sorteo. | `on` |
| `--alliteration` | `prefer` suma un punto si las dos palabras empiezan igual, `avoid` lo resta, `neutral` no cuenta. | `neutral` |
| `--worn` | Archivo de palabras gastadas (−3 cada una); `none` lo desactiva. | `apps/cli/names/worn.txt` |
| `--max-repeat` | Cuántos nombres de la lista pueden compartir una palabra. | 2 |
| `--pool` | Candidatos por nombre pedido al puntuar. | 8 |
| `--favorites` | Archivo de nombres favoritos (uno por línea); cada palabra suya suma +1 cuando vuelve a salir. `none` lo desactiva. | `apps/cli/names/favorites.txt` |
| `--explain` | Muestra debajo de cada nombre qué reglas sumaron o restaron. | apagado |
| `--exclude` | Archivo de excluidos; `none` lo desactiva. | `apps/cli/names/excluded.txt` |
| `--worlds` | Carpeta de mundos. | `apps/cli/names/worlds/` |
| `--out` | Además de la terminal, escribe `.csv` (columna `favorite` vacía y `score`) o `.md` (lista con `[ ]`). | sin archivo |

Filtros que siempre aplican: no repite una palabra dentro del mismo nombre ni un nombre en la lista,
sin distinguir mayúsculas ni acentos. Si los filtros son muy estrictos, devuelve los que encontró y lo
avisa por stderr.

### Puntaje

Reglas en `apps/cli/src/names/score.ts`, todas en enteros:

| Regla | Puntos |
| --- | --- |
| Sílabas de las dos palabras (sin la casa): 4 o menos / 5 / 6 / 7 o más | +2 / +1 / 0 / −2 |
| Primera palabra igual o más corta que la segunda («Twin Turbo») | +1 |
| Primera palabra con 2 sílabas o más que la segunda | −1 |
| Las dos palabras terminan en las mismas tres letras | −2 |
| Aliteración, según `--alliteration` | ±1 |
| Cada palabra gastada (casa incluida) | −3 |
| Nombre de 12 caracteres o menos | +1 |
| Cada palabra que ya está en un favorito | +1 |

Las sílabas salen de los datos importados del mundo (`stats`); si una palabra no los tiene, se
estiman contando grupos de vocales. A igual puntaje se respeta el orden de sorteo, así que la
semilla sigue mandando.

### Mundos

Un mundo es un archivo `apps/cli/names/worlds/<id>.json`; el id es el nombre del archivo. Agregar un
mundo es agregar un archivo:

```json
{
  "name": "Winds and weather",
  "lang": "en",
  "role": "word",
  "provisional": true,
  "source": "datamuse:recipes/winds.json",
  "words": ["Chinook", "Foehn", "Squall"],
  "stats": { "Chinook": { "freq": 0.45, "syllables": 2 } }
}
```

`role` es `word` (por defecto) o `house`; los mundos `house` no entran en el «cualquiera con
cualquiera». `position` dice dónde va la palabra del mundo: `first` (adjetivos y colores: *Swift
Kestrel*, nunca *Kestrel Swift*), `second` o `any` (por defecto). Manda sobre `--order` y sobre
`--a`/`--b`, y al elegir mundos libremente no se cruzan dos que quieran el mismo lugar. `source` y `stats` son opcionales y los escribe el importador. No se aceptan palabras
repetidas, `stats` de palabras que no están en `words` ni campos desconocidos.

Mundos actuales, todos provisorios:

| Mundo | Palabras | Tipo | Lugar | Ejemplos |
| --- | --- | --- | --- | --- |
| `winds` | 41 | sustantivos | cualquiera | Khamsin, Mistral, Foehn |
| `raptors` | 23 | sustantivos | cualquiera | Kestrel, Tiercel, Erne |
| `alloys` | 29 | sustantivos | cualquiera | Inconel, Nichrome, Ormolu |
| `clouds` | 51 | sustantivos | cualquiera | Cirrus, Spica, Carina |
| `colors` | 75 | sustantivos de color | primera | Gold, Silver, Vermilion, Gamboge, Cerulean |
| `traits` | 64 | adjetivos | primera | Intrepid, Refulgent, Blistering |
| `moves` | 25 | verbos | cualquiera | Swoop, Stoop, Nosedive |

Todos salen de Datamuse y WordNet,
y `makers` (los cinco fabricantes de `docs/BRIEF.md`, escrito a mano).

### Excluidos y gastadas

- `apps/cli/names/excluded.txt`: una entrada por línea, `#` para comentarios. Una entrada de una
  sola palabra prohíbe esa palabra en cualquier nombre; una de varias palabras prohíbe ese nombre
  exacto.
- `apps/cli/names/worn.txt`: palabras trilladas. No prohíbe: resta 3 puntos al rankear, y el
  importador las descarta.

## `pnpm names:import`: mundos desde Datamuse y WordNet

Arma mundos con dos fuentes que se pueden combinar en una receta:

- [Datamuse](https://www.datamuse.com/api/): API gratis, sin clave. Necesita red al importar.
- WordNet 3.1 de Princeton, sin red, desde paquetes npm que son `devDependencies` de `apps/cli`
  (no del juego): `wordnet-db` (la base), `subtlex-word-frequencies` (frecuencia de uso, corpus
  SUBTLEX-US de unos 51 millones de palabras de subtítulos) y `cmu-pronouncing-dictionary`
  (sílabas a partir de la pronunciación).

El resultado es un archivo de mundo común: generar nombres no usa ninguna de las dos fuentes.
Código: `apps/cli/src/names-import.ts`, `apps/cli/src/names/recipe.ts`, `apps/cli/src/names/wordnet.ts`
y `apps/cli/src/names/lexicon.ts`.

```bash
pnpm names:import -- --senses wind
pnpm names:import -- --recipe winds --dry-run --glosses --show-dropped
pnpm names:import -- --all
```

`--senses <palabra>` lista los sentidos de WordNet con su definición, para elegir la raíz correcta
(`wind.n.01` es el viento; `wind.n.02`, «los vientos de cambio»). `--dry-run` muestra lo que
quedaría sin escribir; `--glosses` muestra cada palabra con su fuente (`dm` o `wn`) y, si viene de
WordNet, su definición; `--show-dropped` agrupa lo descartado por motivo.
Cada receta es `apps/cli/names/recipes/<id>.json` y escribe `apps/cli/names/worlds/<id>.json`:

```json
{
  "name": "Winds and weather",
  "lang": "en",
  "queries": ["rel_gen=wind", "rel_gen=storm"],
  "wordnet": { "roots": ["wind.n.01", "storm.n.01"], "depth": 3 },
  "maxFreq": 3,
  "deny": ["Bagpipe", "Kazoo"]
}
```

| Campo | Qué hace | Por defecto |
| --- | --- | --- |
| `queries` | Consultas de Datamuse en orden. `rel_gen=X` trae «tipos de X»; `rel_trg=X`, palabras asociadas; `ml=X`, de significado parecido. `md` y `max` los pone el importador. | `[]` |
| `wordnet.roots` | Sentidos de WordNet debajo de los cuales se juntan palabras: `palabra.n.NN` trae tipos de un sustantivo, `palabra.v.NN` formas de un verbo («rush» → *dart, hurtle*), `palabra.a.NN` adjetivos parecidos («fast» → *fleet, blistering*). | sin WordNet |
| `wordnet.includeRoots` | Guardar también las palabras de la raíz. Sirve para adjetivos y verbos (*Bold*, *Swoop*), no para sustantivos genéricos (*wind*). | `false` |
| `position` | Se copia al mundo: `first` para adjetivos y colores. | `any` |
| `wordnet.depth` | Cuántos niveles bajar en el árbol (1 a 6). | 3 |
| `wordnet.instances` | Incluir nombres propios (estrellas, lugares), no solo tipos. | `true` |
| `unknownFreq` | Qué hacer con palabras que la lista de frecuencias no conoce (pasa con términos raros de WordNet como *Khamsin*): `keep` las guarda con `freq` 0, `drop` las descarta. | `keep` |
| `maxFreq`, `minFreq` | Banda de frecuencia en apariciones por millón de palabras: arriba de `maxFreq` es demasiado común, abajo de `minFreq` suele ser taxonomía. | 5 y 0,01 |
| `syllables` | Rango de sílabas. | `[1, 3]` |
| `minLength`, `maxLength` | Largo de la palabra en letras. | 3 y 10 |
| `pos` | Categorías gramaticales que se aceptan (`n`, `v`, `adj`, `adv`). Una receta de adjetivos pone `["adj"]`; una de verbos, `["v"]`. | `["n"]` |
| `deny` | Palabras revisadas a mano y rechazadas: otro sentido, duplicado de grafía, demasiado cerca de un nombre real o del juego. | `[]` |
| `perQuery` | Resultados pedidos por consulta. | 200 |
| `role` | `house` para un mundo de prefijos. | `word` |

Una receta necesita `queries`, `wordnet` o las dos. Si una palabra llega por las dos fuentes, se
quedan los datos de Datamuse. Las frecuencias de cada fuente salen de corpus distintos (Datamuse usa
Google Books; WordNet, SUBTLEX-US), así que son comparables en orden de magnitud, no exactas.

Las dos fuentes mezclan sentidos («wind» también trae instrumentos de viento; WordNet, «Twister» o
«Starlet»), así que el flujo es: correr con `--dry-run --glosses --show-dropped`, agregar a `deny`
lo que no corresponde y recién después escribir.

## Página «Gatera de nombres» y su base de datos

La interfaz es un artefacto de claude.ai (privado del dueño), publicado en
https://claude.ai/artifact/FSPiDn4amt7gNg399bphSS. Su código fuente es
`apps/cli/names/page/gatera.html`: un solo archivo, sin `<!doctype>` ni `<head>` porque claude.ai
los agrega al publicar. Para cambiarla, se edita ese archivo y se le pide a Claude que lo republique
en la misma dirección.

Trae una copia del generador (entre `// GEN-START` y `// GEN-END`) y de los mundos del repo
(`DEFAULT_WORLDS`, los que se ven sin base). `apps/cli/src/names/page.test.ts` corre ese generador
contra el de `apps/cli/src/names/` con cinco combinaciones de opciones y compara los mundos: si se
toca uno sin el otro, o se reimportan mundos sin actualizar la página, `pnpm test` falla.

Genera con el mismo código que `pnpm names` (misma semilla, mismas opciones y mismos favoritos dan
la misma lista) y guarda en la base del artefacto:

| Documento | Qué tiene |
| --- | --- |
| `worlds/<id>` | Un mundo, con los mismos campos que `apps/cli/names/worlds/<id>.json`. |
| `favorites/<nombre-normalizado>` | Un favorito: `name`, `first`, `second`, `house`, `firstWorld`, `secondWorld`, `score`, `at`. |
| `config/lists` | Excluidos y palabras gastadas, como texto (una entrada por línea). |

Lee y escribe quien puede usar el artefacto (reglas por defecto); quien solo lo ve no escribe y la
página se lo indica. Sin acceso a la base, la página funciona con los mundos del repo que trae
adentro y guarda en el navegador.

El repo y la base no se sincronizan solos. Se pasa de uno a otro desde una sesión de Claude Code,
que lee y escribe la base con su herramienta de datos del artefacto:

- **Repo → página** (después de `pnpm names:import`): pedirle a Claude que suba
  `apps/cli/names/worlds/*.json` a `worlds/` y, si cambiaron, `excluded.txt` y `worn.txt` a
  `config/lists`. También hay que republicar la página para que los mundos que trae adentro (los
  que se ven sin base) queden al día.
- **Página → repo**: pedirle a Claude que baje `favorites/` a `apps/cli/names/favorites.txt` y los
  mundos editados a `apps/cli/names/worlds/`. Sin Claude: el botón «Copiar para favorites.txt» de
  la página y «Copiar JSON» de cada mundo.

