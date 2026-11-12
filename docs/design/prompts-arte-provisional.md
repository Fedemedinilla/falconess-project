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

Para las escenas de diálogo: un busto por gesto, todos con el mismo encuadre para que se puedan
cambiar uno por otro sin que la figura salte. Se generan **de a uno**, en la misma conversación de
Gemini, adjuntando siempre el splash aprobado de Peregrina como referencia. Se pide el **primero**
(«tranquila») y, cuando sale bien, se usa ese busto como segunda referencia para todos los demás.

Bloque base (se pega igual en cada pedido, cambiando solo la línea de la expresión):

```text
Use the attached image as a strict character reference: the exact same woman, Peregrina. Keep her face shape,
eye shape and color, the dark falcon "moustache" marks painted below each eye, her short layered slate
blue-grey hair with the cream-blonde streak, and her red racing suit with angular yellow stripes and zip
collar exactly as in the reference. Same anime gacha art style, clean line art, soft cel shading with one
shadow tone, soft key light from the upper left.

Visual-novel dialogue bust portrait: from the top of the head to the middle of the chest, facing the viewer in
a slight 3/4 turn, centered. Square image. The top of her hair sits about 8 % below the top edge and the
chest is cut by the bottom edge, at the same size and position in every image of this set. No helmet.
IMPORTANT: she is NOT wearing her mechanical wings in these portraits (she only puts them on to race).
Remove the wing frame and its back mount completely, even though the reference shows them: nothing
mechanical behind her shoulders or head, only her racing suit. Plain flat white background, no shadow,
no scenery.

Expression: [EXPRESIÓN]

Avoid: wings, wing frame, wing mount or any mechanical parts on her back or behind her shoulders; any
text, letters, numbers or logos; speech bubbles; extra characters; hands covering the face; cropped head;
different hair or outfit; chibi proportions; busy background.
```

Si igual aparecen las alas, corregir en la misma conversación con: «Remove the wings completely. She is
not wearing the wing frame, only her racing suit.»

Las expresiones, en orden de prioridad (las primeras seis alcanzan para el prólogo y las metas):

| #   | Archivo                      | [EXPRESIÓN]                                                                                                                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `peregrina-bust-calm.webp`   | Relaxed and carefree, a small easy confident smile, eyelids slightly lowered, as if nothing could ever go wrong.                                                    |
| 2   | `peregrina-bust-happy.webp`  | Bright happy grin showing teeth, eyes sparkling, eyebrows up, full of energy.                                                                                       |
| 3   | `peregrina-bust-eager.webp`  | Impatient and eager, leaning slightly forward, wide eyes, an excited open-mouth smile, one eyebrow raised, already thinking about the next race.                   |
| 4   | `peregrina-bust-bored.webp`  | Bored to death, half-closed eyes, cheek puffed, mouth flattened sideways, a tiny sweat drop, she cannot stand waiting.                                              |
| 5   | `peregrina-bust-annoyed.webp` | Annoyed and pouting, cheeks slightly puffed, eyebrows pulled down, small anime anger mark on her temple, comic rather than aggressive.                             |
| 6   | `peregrina-bust-surprised.webp` | Caught off guard, eyes wide open, small round open mouth, eyebrows high, a comic "huh?!" moment.                                                                |
| 7   | `peregrina-bust-focused.webp` | Determined and focused, steady sharp gaze straight ahead, mouth closed in a firm line, chin slightly down, a pilot before takeoff.                                 |
| 8   | `peregrina-bust-tired.webp`  | Exhausted after a long race, hair messy and damp with sweat, heavy eyelids, mouth slightly open catching her breath, flushed cheeks.                              |
| 9   | `peregrina-bust-sad.webp`    | Quietly sad, eyes looking down and slightly glossy, eyebrows raised in the middle, a small closed mouth, holding it in, no tears falling.                           |
| 10  | `peregrina-bust-blank.webp`  | Blank and lost: she does not understand what happened. Empty unfocused eyes looking slightly past the viewer, neutral open lips, no tears, no anger, no smile, pale. |

La 10 es la del final: es la expresión más importante de la historia (no llora, no se enfurece,
no lo entiende). Si sale con lágrimas o con tristeza marcada, pedir de nuevo con: «Less sad, more
empty and confused. Like her mind stopped.»

Si una sale con otro encuadre, corregir en la misma conversación con: «Same framing and size as the
first bust: top of the hair 8 % below the top edge, cut at mid-chest, centered.»
