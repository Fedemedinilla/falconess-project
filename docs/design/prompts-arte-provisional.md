# Prompts del arte provisional (IA)

Arte provisional para dar forma a las tres corredoras del MVP (T15). No se publica ni se usa en
marketing, no se entrega a ilustradores como referencia y se reemplaza antes de lanzar. Base
elegida por el dueño: la Peregrina con el casco bajo el brazo («la más simpática e imponente»).

Cada prompt = bloque de estilo + bloque de la corredora + bloque de exclusiones, siempre en ese
orden y sin cambiar el estilo ni las exclusiones.

## Bloque de estilo (igual para todas)

```text
Anime gacha game character splash art, polished and clean. Full body, standing, 3/4 view, the whole figure
visible from head to boots, centered, about 80 % of the image height. Plain light grey background with a soft
floor shadow. Large expressive eyes, soft facial features, warm friendly charisma, confident and approachable.
Clean line art of even weight, soft cel shading with one shadow tone and gentle highlights, soft key light from
the upper left. An adult woman in her twenties with an athletic racer build. She wears a layered professional
racing suit with padding, panels and a high collar, fitted but not skin-tight. A compact mechanical wing frame
is mounted on her back, folded, with simple metal shapes.
```

## Bloque de exclusiones (igual para todas)

```text
Avoid: any text, letters, numbers, logos or sponsor names; cleavage, short skirts, bare midriff, skin-tight
bodysuit, suggestive pose; chibi proportions; western comic style; extra fingers; cropped feet; busy background.
```

## Peregrina (halcón peregrino · escuela Kōryū · Picada)

```text
Short layered slate blue-grey hair with a cream-blonde streak, a dark falcon "moustache" mark painted below each
eye. Red racing suit with angular yellow speed stripes, a visible zip collar, chest padding and a short racing
jacket tied at the waist, dark grey knee and shoulder pads, red racing boots.
She holds a red and dark grey racing helmet under one arm, the other hand on her hip. Bold, competitive,
charming grin, chin slightly raised.
```

## Cernícala (cernícalo · escuela Altair · Suspensión)

```text
Shoulder-length chestnut-rufous hair with small dark speckles like kestrel feathers, a soft fringe. Navy racing
suit with cyan tech panel lines and a short navy jacket, a translucent cyan visor worn over her eyes like glasses, with a small microphone. She holds a
slim data tablet against her chest with one arm and waves gently with the other hand. Warm, kind, clearly
visible smile, head slightly tilted.
```

## Caracara (carancho · escuela Boneyard · Rasante)

```text
Black hair in a high swept-back ponytail shaped like a crest, with cream streaks, warm orange-red marks below
the eyes. Olive green rally racing suit with rust-orange side panels and subtle barred stripes on the chest,
a cream scarf, brown gloves and laced olive boots. Aviator goggles resting on her head. She stands grounded
with one hand on her hip and the other giving a thumbs up. Adventurous, warm, open smile.
```

## Chibi (con el splash de cada una como imagen de referencia)

```text
Turn this exact character into a chibi SD game sprite, about 2.5 heads tall. Front view, neutral standing pose,
arms slightly away from the body, feet apart, the same hair, face marks, colors and outfit, simplified.
Keep the signature prop (helmet, tablet or goggles). Clean even outlines, flat cel shading with one shadow tone,
plain white background. No wings, no text, no logos.
```

Reglas para que salgan como un mismo juego: generar las tres en la misma herramienta y con la
misma configuración; si la herramienta acepta imagen de referencia de estilo, usar la Peregrina
elegida para las otras dos; descartar cualquier resultado con letras o logos.

Estado (2026-10-30): set provisional aprobado con estos prompts (segunda vuelta de Peregrina y
Cernícala). Siguiente paso: los chibis.

## Bustos de expresión de Peregrina (escenas de historia, 2026-11-12)

Para las escenas de diálogo: un retrato de la cintura para arriba por gesto, con las manos a la
vista, todos con el mismo encuadre para que se puedan cambiar uno por otro sin que la figura salte.
Cada gesto y pose sale de su personalidad: rápida, apurada, despreocupada, torpe, con cero
paciencia. Se generan **de a uno**, en la misma conversación de Gemini, adjuntando siempre el splash
aprobado de Peregrina como referencia. Se pide el **primero** («tranquila») y, cuando sale bien, se
usa ese retrato como referencia para todos los demás (así tampoco vuelven las alas).

Bloque base (se pega igual en cada pedido, cambiando solo la línea de la expresión):

```text
Use the attached image as a strict character reference: the exact same woman, Peregrina. Keep her face shape,
eye shape and color, the dark falcon "moustache" marks painted below each eye, her short layered slate
blue-grey hair with the cream-blonde streak, and her red racing suit with angular yellow stripes and zip
collar exactly as in the reference. Same anime gacha art style, clean line art, soft cel shading with one
shadow tone, soft key light from the upper left.

Visual-novel character portrait, waist-up: from the top of the head down to the hips, so her arms and hands
are clearly visible and expressive. Facing the viewer in a slight 3/4 turn, centered. Portrait image, 3:4.
The top of her hair sits about 6 % below the top edge and the hips are cut by the bottom edge, at the same
size and position in every image of this set. Her hands stay inside the image. No helmet.
IMPORTANT: she is NOT wearing her mechanical wings in these portraits (she only puts them on to race).
Remove the wing frame and its back mount completely, even though the reference shows them: nothing
mechanical behind her shoulders or head, only her racing suit. Plain flat white background, no shadow,
no scenery.

Her personality shows in her body language: fast, restless, carefree and a bit clumsy, zero patience,
always looks like she is about to run somewhere.

Expression and pose: [EXPRESIÓN Y POSE]

Avoid: wings, wing frame, wing mount or any mechanical parts on her back or behind her shoulders; hands
covering her face; extra fingers or extra hands; cropped hands; any text, letters, numbers or logos;
speech bubbles; extra characters; cropped head; different hair or outfit; chibi proportions; busy
background.
```

Si igual aparecen las alas, corregir en la misma conversación con: «Remove the wings completely. She is
not wearing the wing frame, only her racing suit.»

Las expresiones con su pose, en orden de prioridad (las primeras seis alcanzan para el prólogo y las
metas):

| #   | Archivo                         | [EXPRESIÓN Y POSE]                                                                                                                                                                                                                                               |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `peregrina-pose-calm.webp`      | Relaxed and carefree, a small easy confident smile, eyelids slightly lowered. One hand casually behind her head, the other on her hip, weight on one leg, as if nothing could ever go wrong.                                                                     |
| 2   | `peregrina-pose-happy.webp`     | Bright happy grin showing teeth, eyes sparkling. A big thumbs-up toward the viewer with one hand, the other fist pumped at her side, full of energy.                                                                                                             |
| 3   | `peregrina-pose-eager.webp`     | Impatient and eager, leaning forward toward the viewer, wide eyes, excited open-mouth smile. Both hands in fists close to her chest, bouncing on her toes, ready to run to the next race right now.                                                              |
| 4   | `peregrina-pose-bored.webp`     | Bored to death, half-closed eyes, cheek puffed, mouth flattened sideways, a tiny sweat drop. Slumped shoulders, chin resting on one hand, the other hand drumming its fingers in the air, she cannot stand waiting.                                              |
| 5   | `peregrina-pose-annoyed.webp`   | Annoyed and pouting, cheeks puffed, eyebrows pulled down, small anime anger mark on her temple. Arms crossed tight over her chest, looking a little to the side, comic rather than aggressive.                                                                   |
| 6   | `peregrina-pose-surprised.webp` | Caught off guard, eyes wide open, small round open mouth, eyebrows high. Both hands up at shoulder height with fingers spread, leaning back a little, a clumsy comic "huh?!" moment.                                                                             |
| 7   | `peregrina-pose-focused.webp`   | Determined and focused, steady sharp gaze straight ahead, mouth closed in a firm line. Pulling on a racing glove with one hand, the other tugging the glove's cuff tight, a pilot right before takeoff.                                                          |
| 8   | `peregrina-pose-tired.webp`     | Exhausted after a long race, hair messy and damp with sweat, heavy eyelids, mouth open catching her breath, flushed cheeks. Shoulders dropped, one hand on her knee bending forward, the other wiping her forehead.                                              |
| 9   | `peregrina-pose-sad.webp`       | Quietly sad, eyes looking down and slightly glossy, eyebrows raised in the middle, small closed mouth, holding it in, no tears. Hands loosely clasped in front of her, shoulders drawn in, smaller than usual.                                                   |
| 10  | `peregrina-pose-blank.webp`     | Blank and lost: she does not understand what happened. Empty unfocused eyes looking past the viewer, lips slightly open, pale, no tears, no anger, no smile. Arms hanging limp at her sides, hands open and still, standing completely still for the first time. |

La 10 es la del final: es la pose más importante de la historia (no llora, no se enfurece, no lo
entiende, y por primera vez está quieta). Si sale con lágrimas o con tristeza marcada, pedir de nuevo
con: «Less sad, more empty and confused. Like her mind stopped. Completely still.»

Si una sale con otro encuadre, corregir en la misma conversación con: «Same framing and size as the
first portrait: waist-up, top of the hair 6 % below the top edge, cut at the hips, centered, hands
inside the image.»

## Fondos de las escenas comunes (2026-11-12)

Fondos para el cuadro de diálogo de las escenas. Van a pantalla completa en el celular, con el
cuadro de diálogo tapando el tercio de abajo y el retrato de la Falconess encima: por eso **sin
personajes en primer plano** y con lo interesante en la mitad de arriba. Formato vertical 9:16.
Bloque común de estilo, igual en los tres (se pega primero):

```text
Anime gacha game background art, painted, polished and cinematic, in the style of a high-budget sports anime.
Vertical 9:16 mobile background. Clean shapes, soft cel-shaded painting with rich light and atmosphere.
No main character in the foreground: the lower third stays calm and simple (a dialogue box will cover it),
the most interesting detail sits in the middle and upper part of the image. No text, no letters, no numbers,
no logos, no real brands, no watermark.
```

### 1. La pista antes de la carrera

```text
An open-field off-road racing track for winged racers on a bright late-afternoon before a race. Low camera angle
close to the ground, wide lens, strong perspective: the dirt-and-grass track curves away from the viewer toward a
huge grandstand packed with a cheering crowd in the far distance, colorful flags and banners waving. Rolling hills
with a big ramp-like jump and a steep descent along the course. A few small winged racers warming up far away,
tiny silhouettes with mechanical wings, some gliding low over the track. Dramatic sky with tall clouds lit warm
gold, long shadows, light dust in the air catching the sun, shallow depth of field with the foreground grass
slightly blurred. Sense of anticipation and scale.
```

### 2. La línea de llegada

```text
The finish line of an open-field off-road racing track for winged racers. Dynamic three-quarter camera angle,
standing just past the finish line looking back along the final straight, the finish gantry towering overhead in
the upper part of the image with checkered patterns and timing lights (no readable text). A grandstand full of
people far in the background, confetti and streamers drifting in the air, camera flashes sparkling in the crowd.
The track surface shows fresh tire-like skid marks and wing-blast streaks in the dirt. Golden-hour backlight with
lens flare through the gantry, light haze, crisp foreground edge and softly blurred distance. Feels like the
moment right after a big win.
```

### 3. El hangar de Kōryū

```text
Inside the racing hangar of Kōryū Racing, a proud, aggressive, sporty racing school with a strong identity in
glossy racing red with sharp yellow accents (inspired by the elegance of a classic Italian racing team, but
original: no real brand, no prancing horse, no car). High ceiling with exposed steel trusses painted red, rows of
warm spotlights, a polished dark floor reflecting the red and yellow. In the middle distance, a pair of sleek
red-and-yellow mechanical racing wings mounted on a work stand with panels open, tools and cables around it.
Mechanics in red jumpsuits with yellow stripes working at the far end: one under a hoist, one checking a
tablet, one carrying a wing panel, small and out of focus. Trophy shelf with gleaming cups along one wall, red
banners with an abstract yellow falcon-wing emblem (no letters), a big open hangar door at the back showing the
track and the sky. Camera at chest height with a slight low angle and a wide lens, strong leading lines from the
floor markings toward the open door. Warm, energetic, competitive atmosphere.
```

Si Gemini mete letras o logos, corregir en la misma conversación con: «Remove every letter, number and
logo. Keep everything else.» Si mete un personaje grande en primer plano: «No characters in the
foreground, only small figures in the distance.»
