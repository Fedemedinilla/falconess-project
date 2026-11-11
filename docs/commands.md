# Comandos

Comandos de desarrollo. Los del juego (`pnpm sim`, `pnpm play`, etc.) están listados en `CLAUDE.md`.

## `pnpm names`: generador de nombres compuestos

Herramienta de desarrollo, no parte del juego. Junta una palabra de un «mundo» A con una de un mundo
B («Special» + «Week»), y opcionalmente antepone una palabra de un mundo «casa» (escuela o fabricante,
como «Mejiro» en Umamusume). Código: `apps/cli/src/names.ts` y `apps/cli/src/names/`.

```bash
pnpm names -- --list
pnpm names -- --a sky --b forge --n 30 --seed 1
pnpm names -- --n 30 --seed 1 --order free --out names.csv
pnpm names -- --a bloom --b any --house makers --n 20 --seed 7 --out names.md
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
| `--exclude` | Archivo de excluidos; `none` lo desactiva. | `apps/cli/names/excluded.txt` |
| `--worlds` | Carpeta de mundos. | `apps/cli/names/worlds/` |
| `--out` | Además de la terminal, escribe `.csv` (columna `favorite` vacía) o `.md` (lista con `[ ]`). | sin archivo |

Filtros que siempre aplican: no repite una palabra dentro del mismo nombre ni un nombre en la lista,
sin distinguir mayúsculas ni acentos. Si los filtros son muy estrictos, devuelve los que encontró y lo
avisa por stderr.

### Mundos

Un mundo es un archivo `apps/cli/names/worlds/<id>.json`; el id es el nombre del archivo. Agregar un
mundo es agregar un archivo:

```json
{
  "name": "Sky and weather",
  "lang": "en",
  "role": "word",
  "provisional": true,
  "words": ["Storm", "Gale", "Cloud"]
}
```

`role` es `word` (por defecto) o `house`; los mundos `house` no entran en el «cualquiera con
cualquiera». No se aceptan palabras repetidas ni campos desconocidos. Los mundos `sky`, `forge` y
`bloom` son ejemplos provisorios; `makers` usa los cinco fabricantes de `docs/BRIEF.md`.

### Excluidos

`apps/cli/names/excluded.txt`: una entrada por línea, `#` para comentarios. Una entrada de una sola
palabra prohíbe esa palabra en cualquier nombre; una de varias palabras prohíbe ese nombre exacto.
