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
cualquiera». `source` y `stats` son opcionales y los escribe el importador. No se aceptan palabras
repetidas, `stats` de palabras que no están en `words` ni campos desconocidos.

Mundos actuales, todos provisorios: `winds`, `raptors`, `alloys` y `clouds` (importados de Datamuse)
y `makers` (los cinco fabricantes de `docs/BRIEF.md`, escrito a mano).

### Excluidos y gastadas

- `apps/cli/names/excluded.txt`: una entrada por línea, `#` para comentarios. Una entrada de una
  sola palabra prohíbe esa palabra en cualquier nombre; una de varias palabras prohíbe ese nombre
  exacto.
- `apps/cli/names/worn.txt`: palabras trilladas. No prohíbe: resta 3 puntos al rankear, y el
  importador las descarta.

## `pnpm names:import`: mundos desde Datamuse

Arma mundos con la API de [Datamuse](https://www.datamuse.com/api/) (gratis, sin clave). Necesita
red solo al importar; el resultado es un archivo de mundo común y generar nombres sigue sin red.
Código: `apps/cli/src/names-import.ts` y `apps/cli/src/names/recipe.ts`.

```bash
pnpm names:import -- --recipe winds --dry-run --show-dropped
pnpm names:import -- --all
```

`--dry-run` muestra lo que quedaría sin escribir; `--show-dropped` agrupa lo descartado por motivo.
Cada receta es `apps/cli/names/recipes/<id>.json` y escribe `apps/cli/names/worlds/<id>.json`:

```json
{
  "name": "Winds and weather",
  "lang": "en",
  "queries": ["rel_gen=wind", "rel_gen=storm"],
  "maxFreq": 3,
  "deny": ["Bagpipe", "Kazoo"]
}
```

| Campo | Qué hace | Por defecto |
| --- | --- | --- |
| `queries` | Consultas de Datamuse en orden. `rel_gen=X` trae «tipos de X»; `rel_trg=X`, palabras asociadas; `ml=X`, de significado parecido. `md` y `max` los pone el importador. | obligatorio |
| `maxFreq`, `minFreq` | Banda de frecuencia en apariciones por millón de palabras: arriba de `maxFreq` es demasiado común, abajo de `minFreq` suele ser taxonomía. | 5 y 0,01 |
| `syllables` | Rango de sílabas. | `[1, 3]` |
| `minLength`, `maxLength` | Largo de la palabra en letras. | 3 y 10 |
| `pos` | Categorías gramaticales que se aceptan (`n`, `v`, `adj`, `adv`). | `["n"]` |
| `deny` | Palabras revisadas a mano y rechazadas: otro sentido, duplicado de grafía, demasiado cerca de un nombre real o del juego. | `[]` |
| `perQuery` | Resultados pedidos por consulta. | 200 |
| `role` | `house` para un mundo de prefijos. | `word` |

Datamuse mezcla sentidos («wind» también trae instrumentos de viento), así que el flujo es: correr
con `--dry-run --show-dropped`, agregar a `deny` lo que no corresponde y recién después escribir.
