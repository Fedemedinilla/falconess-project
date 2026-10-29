# Guía «Cómo se juega»

`falconess-como-se-juega.pdf` es una guía corta de las mecánicas para quien juega por primera vez.
Describe el juego como está planeado para la 1.0, con las reglas de la temporada v2 (ADR-0006), y
esconde los números a propósito. Si cambian las reglas que cuenta, se actualiza el texto en
`build.py` y se vuelve a generar.

## Generarla

Necesita Python 3 con `reportlab`, `fontTools` y `brotli`.

```sh
cd docs/tutorial
python3 fonts.py                              # baja Barlow y Barlow Condensed a fonts/
python3 build.py falconess-como-se-juega.pdf
```

Las fuentes son Barlow y Barlow Condensed (SIL Open Font License 1.1), de Google Fonts.
`fonts.py` junta los subconjuntos latin y latin-ext de cada estilo para que entren la ō y la ū de
Kōryū. La carpeta `fonts/` no se versiona.
