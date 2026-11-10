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

## Música de fondo del juego (loops de menú y pantallas)

Suno tiende a meter batería, crescendos y un estribillo, y el tema deja de ser de fondo. Para
evitarlo hay que atacar los tres campos a la vez: el estilo, las exclusiones y la letra.

### Reglas que funcionan

- **Primero la palabra «instrumental» y «background»** en el estilo: lo primero pesa más.
- **Pedir lo que no cambia:** «steady dynamics», «no build-up», «loopable», «sparse». Suno sigue
  mejor una descripción de quietud que una prohibición sola.
- **Sin batería en el estilo, y además excluirla.** Si hace falta pulso, pedir «soft pulse» o
  «light shaker», nunca «drums» ni «beat».
- **BPM moderado y fijo** (85-110): con BPM altos Suno agrega batería sola.
- **La letra manda la forma.** Usar solo marcas de estructura instrumentales y repetitivas (abajo).
  Sin `[Chorus]` ni `[Drop]`: invitan a subir la intensidad.
- **Para la versión «Menú» de un tema que ya tenés**, usar la función de Suno que rehace una canción
  existente en otro estilo (Cover / Remix, según la versión de Suno): conserva la melodía del Main
  Theme y cambia la producción con el estilo de abajo. Si no está disponible, describir la melodía
  en el estilo («melodic motif from the main theme, played softly on piano and strings»).
- **Style Influence** alto (si tu versión lo tiene): más apego al estilo escrito.
- Generar 3-4 y quedarse con la más pareja de principio a fin.

### Exclusiones base de fondo (Exclude Styles)

```
drums, drum kit, heavy percussion, breakbeat, trap, dubstep, EDM drop, build-up, crescendo,
climax, epic, aggressive, distorted guitar, guitar solo, vocals, choir, rap, spoken word, fast
tempo, double-time, lo-fi hiss
```

### Letra (campo Lyrics) para cualquier loop

```
[Instrumental]
[Intro: soft]
[Loop A: calm, steady]
[Loop B: same energy, variation]
[Loop A: calm, steady]
[Outro: soft, seamless to start]
```

### Estilos por pantalla

**Menú (versión tranquila del Main Theme)**

```
instrumental, background music, anime game menu theme, calm and confident, sparse arrangement,
soft piano motif, warm string pads, light synth arpeggio, subtle airy texture, steady dynamics, no
build-up, loopable, wide soft mix, 95 BPM
```

**Entrenamiento (con algo de pulso, sin batería)**

```
instrumental, background music, anime training theme, light and optimistic, soft pulse, plucked
synth, clean muted guitar, gentle bass, light shaker, steady dynamics, no build-up, loopable,
105 BPM
```

**Taller (mecánico y tranquilo)**

```
instrumental, background music, anime garage ambience, relaxed, soft metallic textures, mellow
electric piano, warm bass, gentle mechanical clicks, steady dynamics, no build-up, loopable,
90 BPM
```

**Previa de carrera (tensión baja, sin explotar)**

```
instrumental, background music, cinematic anticipation, restrained tension, low string ostinato,
soft synth pad, distant brass swell, steady dynamics, no drop, no climax, loopable, 100 BPM
```

**Resultado / fin de temporada (cálido)**

```
instrumental, background music, anime ending ambience, warm and reflective, soft piano, gentle
strings, airy pad, steady dynamics, no build-up, loopable, 85 BPM
```

Si una versión sigue saliendo con batería: sacar el BPM del estilo, agregar `ambient` después de
`background music` y repetir `no drums` al final del estilo.

## Sonido propio: Future Funk + Nu Metal (de fondo)

Idea del dueño: en vez del Future Funk que usan muchos juegos así, una mezcla propia de Future Funk
y Nu Metal. El problema: la palabra «nu metal» arrastra batería pesada, doble bombo, quiebres y
gritos. La solución es **no nombrar el género Nu Metal**, sino pedir sus **texturas**, bajas en la
mezcla, y dejar que el Future Funk ponga el groove.

- **Del Future Funk:** groove de city pop y disco filtrado, bajo funky, pads con filtro que abre y
  cierra, compresión con bombeo (sidechain) suave, Rhodes, brillo de los 80.
- **Del Nu Metal (solo textura):** guitarra de 7 cuerdas afinada grave pero limpia o con palm mute
  bajo en la mezcla, rayones de vinilo (scratches) del DJ, ambiente oscuro, bajo con algo de
  distorsión. Nada de gritos, doble bombo ni quiebres.

### Menú (fondo)

```
instrumental, background music, future funk, nu-metal textures, laid-back groove, filtered disco
chords, funky slap bass, low-tuned 7-string guitar played clean and palm-muted, low in the mix,
vinyl scratches, warm rhodes, soft sidechain pump, light four-on-the-floor kick low in the mix,
steady dynamics, no build-up, loopable, 104 BPM
```

### Entrenamiento (un poco más de energía)

```
instrumental, background music, future funk, nu-metal textures, groovy and confident, chopped
filtered disco loop, slap bass, palm-muted drop-tuned guitar chugs low in the mix, turntable
scratches, bright synth stabs, soft four-on-the-floor kick, steady dynamics, no breakdown,
loopable, 112 BPM
```

### Taller (oscuro y tranquilo)

```
instrumental, background music, future funk, dark nu-metal ambience, slow groove, filtered rhodes
chords, deep bass, clean low-tuned guitar harmonics, distant vinyl scratches, mechanical textures,
steady dynamics, no build-up, loopable, 96 BPM
```

### Exclusiones para esta mezcla (Exclude Styles)

```
screaming, growl, harsh vocals, rap, vocals, double kick, blast beat, breakdown, mosh, heavy
drums, loud crash cymbals, metalcore, build-up, crescendo, climax, EDM drop, guitar solo,
distorted lead guitar, fast tempo
```

### Letra (Lyrics)

```
[Instrumental]
[Intro: filtered, soft]
[Groove A: laid-back, steady]
[Groove B: same energy, guitar texture]
[Groove A: laid-back, steady]
[Outro: filtered, seamless to start]
```

**Si igual sale demasiado pesado:** sacar `nu-metal textures` y dejar solo los instrumentos
(`low-tuned 7-string guitar played clean`, `vinyl scratches`), agregar `lounge` después de
`future funk` y repetir `no heavy drums` al final. **Si queda sin carácter metal:** subir la guitarra
de a una palabra (`palm-muted drop-tuned guitar chugs`) en vez de volver a nombrar el género.
