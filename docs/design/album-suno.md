# Álbum Falconess en Suno (borrador, 2026-11-04)

Música para el juego, generada con Suno. Mezcla pedida por el dueño: anime, dinámico, velocidad,
altura y acción. Tono T17: cool y con filo, no kawaii. Este archivo guarda los prompts para
regenerar o variar cada tema.

## Cómo usar los campos de Suno

- **Style of Music** (descripción de estilo): etiquetas cortas separadas por comas, en inglés.
  Primero el género, después el ánimo, los instrumentos, la voz y la producción: las primeras
  palabras pesan más. Sin frases ni contradicciones («calm aggressive»). En v4.5 o más nuevo
  caben ≈ 1000 caracteres; en v4 y anteriores, ≈ 200. Conviene usar la mitad.
- **Exclude Styles**: etiquetas de lo que no querés. Suno lo respeta a medias; igual ayuda.
- **Lyrics**: solo letra y marcas de estructura (`[Intro]`, `[Chorus]`, `[Instrumental]`).
  Los instrumentales van con `[Instrumental]` o el interruptor de instrumental.
- Generar 3-4 veces por tema y quedarse con la mejor; variar una etiqueta por vez.

## Base del álbum (pegar al principio de cada estilo)

```
anime opening, J-rock, orchestral hybrid, high energy, driving double-time drums, soaring strings,
distorted electric guitar riffs, synth arpeggios, brass stabs, wide cinematic mix, 160-180 BPM
```

## Exclusiones base (pegar en Exclude Styles de todos)

```
lo-fi, chill, acoustic ballad, country, reggaeton, trap, jazz lounge, kawaii, cute, chiptune, 8-bit,
children's, muddy, lo-fi hiss, slow tempo, ambient drone, spoken word
```

## Temas

| #   | Tema             | Momento del juego              | Voz                      |
| --- | ---------------- | ------------------------------ | ------------------------ |
| 1   | Ala firma        | Título / opening               | Femenina, japonés        |
| 2   | Hangar           | Menú de temporada              | Instrumental             |
| 3   | Cien semanas     | Entrenamiento                  | Instrumental             |
| 4   | Línea de largada | Previa de carrera              | Instrumental             |
| 5   | Despegue         | Carrera, despegue y vuelo alto | Instrumental             |
| 6   | Gran picada      | Carrera, picada final          | Instrumental             |
| 7   | A fondo          | Últimos 60 m                   | Instrumental             |
| 8   | Taller           | Taller                         | Instrumental             |
| 9   | Techo del mundo  | Vuelo largo, pista larga       | Femenina, inglés/japonés |
| 10  | La bajaron       | Derrota                        | Instrumental             |
| 11  | Primera          | Victoria                       | Femenina                 |
| 12  | La veterana      | Herencia / créditos            | Femenina, español        |

### 1 · Ala firma (opening)

Style:

```
anime opening, J-rock, orchestral hybrid, high energy, female Japanese vocals, powerful belting,
driving double-time drums, soaring strings, distorted electric guitar riffs, synth arpeggios, brass
stabs, key change before final chorus, wide cinematic mix, 175 BPM
```

Exclude: base + `male vocals, rap`.

### 2 · Hangar (menú)

Style:

```
anime soundtrack, electronic rock, mid energy, instrumental, confident groove, clean electric guitar
melody, synth pads, punchy drums, metallic percussion, loopable, warm cinematic mix, 120 BPM
```

Exclude: base + `vocals, big climax`.

### 3 · Cien semanas (entrenamiento)

Style:

```
anime training montage, J-rock, upbeat, instrumental, bright guitar riff, funky bass, tight drums,
hand claps, synth lead hook, optimistic, loopable, 140 BPM
```

Exclude: base + `vocals, orchestral, dark`.

### 4 · Línea de largada (previa)

Style:

```
cinematic anime tension, orchestral hybrid, instrumental, building intensity, low string ostinato,
taiko drums, rising synth riser, brass swells, ticking percussion, no drop, 128 BPM
```

Exclude: base + `vocals, guitar solo, resolution`.

### 5 · Despegue (vuelo alto)

Style:

```
anime action, orchestral J-rock, soaring, instrumental, huge brass fanfare, sweeping strings, fast
guitar arpeggios, double-time drums, wide stereo, sense of altitude and open sky, triumphant,
170 BPM
```

Exclude: base + `vocals, heavy breakdown`.

### 6 · Gran picada (picada)

Style:

```
anime action, speedcore-influenced J-rock, aggressive, instrumental, fast palm-muted guitar,
blast-beat drums, screaming synth lead, descending string runs, sub-bass drops, adrenaline, 185 BPM
```

Exclude: base + `vocals, orchestral ballad, breakdown with silence`.

### 7 · A fondo (últimos 60 m)

Style:

```
anime final sprint, J-rock, maximum intensity, instrumental, relentless double-time drums, unison
guitar and strings, brass hits on every beat, rising key modulation, short, explosive ending, 180 BPM
```

Exclude: base + `vocals, intro, fade out`.

### 8 · Taller

Style:

```
anime garage theme, industrial electronic rock, mid energy, instrumental, mechanical percussion,
metallic hits, bass synth groove, clean guitar, wrench and gear rhythms, cool, loopable, 110 BPM
```

Exclude: base + `vocals, strings, epic`.

### 9 · Techo del mundo (vuelo largo)

Style:

```
anime insert song, cinematic J-pop rock, uplifting, female vocals, ethereal verse, powerful chorus,
piano intro, soaring strings, electric guitar, steady drums, sense of flight and altitude, wide
reverb, 150 BPM
```

Exclude: base + `male vocals, aggressive, screaming`.

### 10 · La bajaron (derrota)

Style:

```
anime bittersweet theme, orchestral rock, melancholic but dignified, instrumental, solo electric
guitar melody, cello, soft drums, slow build to a determined ending, 90 BPM
```

Exclude: base + `vocals, happy, upbeat`.

### 11 · Primera (victoria)

Style:

```
anime victory theme, J-rock, euphoric, female vocals, gang vocals in chorus, bright guitar riff,
brass fanfare, driving drums, hand claps, short, celebratory, 165 BPM
```

Exclude: base + `melancholic, slow`.

### 12 · La veterana (créditos)

Style:

```
anime ending theme, orchestral rock ballad, emotional, female Spanish vocals, warm, piano and
strings intro, building to full band, electric guitar solo, hopeful, 100 BPM
```

Exclude: base + `aggressive, fast, screaming`.

## Notas

- Todos los nombres de tema son provisionales y siguen los momentos del juego (T16, T21, T23).
- Si Suno mete voces en un instrumental, agregar `instrumental` al principio del estilo y
  `[Instrumental]` en la letra.
- Si el resultado suena genérico, bajar etiquetas: quedarse con género, ánimo, 2-3 instrumentos y
  BPM.
