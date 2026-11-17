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

Escala (dueño, 2026-11-12): no es una pista de autos ni de caballos. Una Falconess corre y vuela
muchísimo más rápido, así que la pista es enorme: kilómetros de largo, ancha como un valle, con
espacio vertical para volar por bandas de altura. Los dos prompts de pista llevan este bloque de
escala después del de estilo:

```text
SCALE IS ESSENTIAL: this is not a car circuit and not a horse track. It is a racecourse for winged racers who
run and fly far faster than any car, so everything is huge. The course is kilometers long and as wide as a
valley, a broad band of packed earth and grass with no asphalt, no curbs, no tire marks and no fences close to
the camera. It stretches all the way to the horizon, over hills, ramps and long descents, and it has vertical
room: very tall slim marker pylons and floating ring gates high in the air mark the flight bands above the
ground. People, flags and stands look tiny because of the distance.
```

### 1. La pista antes de la carrera

```text
The vast open-field racecourse for winged racers on a bright late-afternoon before a race. Low camera angle
close to the ground, ultra-wide lens, strong perspective: the immense course sweeps away from the viewer in a
long curve across a wide valley, rising over a giant ramp-like hill and dropping into a long descent, then
disappearing toward the horizon. Tall marker pylons and floating ring gates high above the course mark the
flight lanes. A huge grandstand packed with a cheering crowd sits far, far away on a hillside, small in the
frame, colorful flags and banners waving. A few winged racers warming up in the distance are tiny silhouettes
with mechanical wings, some gliding high above the track. Enormous sky with towering clouds lit warm gold, long
shadows, light dust catching the sun, shallow depth of field with the foreground grass slightly blurred. A sense
of anticipation and of breathtaking scale.
```

### 2. La línea de llegada

```text
The finish of the vast open-field racecourse for winged racers. Dynamic three-quarter camera angle, standing
just past the finish line on the ground and looking back along an immense final straight that runs for
kilometers toward the horizon. The finish gate is gigantic: two very tall towers joined high in the sky by a
wide arch with checkered patterns and timing lights (no readable text), tall enough for racers to fly through.
A grandstand full of people stretches along the straight far in the background, confetti and streamers drifting
in the air, camera flashes sparkling in the crowd. Long scorched streaks in the grass from wing blasts and dust
still hanging in the air, no tire marks. Golden-hour backlight with lens flare through the arch, light haze,
crisp foreground edge and softly blurred distance. Feels like the moment right after a big win.
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

## Historia principal: Vuela Alto (2026-11-17)

Pedido del dueño: personajes y fondos para ver la escena del capítulo 1 «en su esplendor», con
Gemini. Estilo anime marcado. Cada personaje viene en una **hoja de personaje** con dos atuendos
lado a lado (ropa casual a la izquierda, ropa oficial de Vuela Alto a la derecha), **sin alas**. Los
nombres de personajes de otras obras que usó el dueño como referencia no van en los prompts: se
describe el arquetipo con rasgos propios, para no copiar a nadie.

Orden sugerido: generar primero la protagonista; cuando salga bien, adjuntarla como referencia de
estilo y escala en los pedidos siguientes («same art style and same scale as the attached image»).
Alturas relativas, para que el escenario no salte: el viejo ≈ 140 cm, la protagonista ≈ 155 cm, la
veterana ≈ 170 cm, el entrenador ≈ 180 cm (encorvado).

### Bloque de estilo de personajes (igual para todos, va primero)

```text
Japanese anime gacha game character reference sheet, high-budget anime style, polished and clean. Two full-body
views of the SAME character side by side on one image: on the left in her or his casual clothes, on the right
in the official Vuela Alto team outfit. Both standing, 3/4 view, the whole figure visible from head to shoes,
same height and same scale in both views. Plain flat light grey background with a soft floor shadow, nothing
else. Large expressive anime eyes, clean line art of even weight, soft cel shading with one shadow tone and
gentle highlights, soft key light from the upper left. Vuela Alto team colors: sky blue (celeste) and white.
IMPORTANT: NO WINGS. No mechanical wing frame, no wing mount, nothing on the back.
```

### Bloque de exclusiones (igual para todos, va al final)

```text
Avoid: any wings or mechanical parts on the back; any text, letters, numbers, logos or brand names; cleavage,
short skirts, bare midriff, skin-tight clothes, suggestive pose; chibi proportions; western comic style; extra
fingers; cropped feet; busy background; a second different character.
```

### La protagonista

```text
A young adult woman in her early twenties, noticeably SHORTER than average (about 155 cm), slim. Friendly,
hopeful and eager face: bright warm eyes wide open, a small nervous smile, eyebrows slightly raised as if she
is excited and a little scared at the same time. Clumsy, anxious body language: shoulders a bit raised, one
hand fidgeting with her sleeve or her hair. Shoulder-length soft brown hair with a slightly messy fringe and
one stubborn strand sticking up, a simple hair clip. She looks like a cheerful newcomer from a small town who
has never been inside a racing team.
LEFT, casual clothes in white and silver: an oversized white hoodie with silver zipper and silver drawstrings,
light grey-silver cargo pants rolled at the ankles, worn white sneakers, a small silver pendant.
RIGHT, official Vuela Alto outfit: she is the team's new janitor, not a racer. A sky-blue work coverall with
white panels on the shoulders and white cuffs, a little too big for her, sleeves rolled up, a white cap with a
sky-blue brim, yellow rubber gloves tucked in the belt, a cleaning rag hanging from the back pocket. She holds
a broom with both hands, proudly, as if it were a trophy.
```

### La veterana

```text
An adult woman in her late twenties (about five years older than the newcomer), tall (about 170 cm), lean
athletic racer build, good posture that sags a little when nobody is looking. Tired, bored, emotionally
defeated expression: half-lidded eyes with faint dark circles, a flat mouth, but her eyes glance slightly
upward, toward the sky, with a trace of longing: she still loves to fly. Long ash-grey hair tied in a low,
loose ponytail with a few strands falling on her face. She subtly favors her right shoulder.
LEFT, casual clothes in muted charcoal and deep green: a faded charcoal bomber jacket over a dark green
t-shirt, dark jeans, scuffed boots, a thin scarf. Hands in her pockets.
RIGHT, official Vuela Alto outfit: a sky-blue and white racing suit with a high collar and white side panels,
clearly old and well used: faded color, a few careful patches and re-stitched seams, scuffed knee pads. She
holds a worn racing helmet in sky blue and white loosely at her side. Proud but tired posture.
```

### El entrenador

```text
An adult man in his mid twenties, tall (about 180 cm) but slouching, lanky. Extremely casual to the point of
sloppy: messy unbrushed dark hair sticking out in every direction, light stubble, sleepy and aimless
half-smile, the look of someone without a job and without a plan. Slightly lost but kind eyes. He carries a
brand-new notebook that clearly does not match the rest of him.
LEFT, casual clothes in orange and white: a wrinkled orange hoodie with the hood half twisted, a white t-shirt
with a small stain showing underneath, loose white track pants, untied orange sneakers, a backpack hanging from
one shoulder.
RIGHT, official Vuela Alto outfit: a sky-blue and white team staff jacket that is a size too big, worn open
over his orange hoodie, a white staff lanyard with a blank card, the new notebook and a pen behind his ear.
He stands a bit awkwardly, as if he does not know where to put his hands.
```

### El viejo

```text
A very old man, VERY SHORT (about 140 cm), small and wiry, slightly hunched. Bald on top with a fringe of white
hair on the sides, big bushy white eyebrows that hide his eyes, and a long thin white moustache. Calm,
half-asleep expression, eyes almost closed, but a tiny knowing smile: he sees everything. Hands folded behind
his back.
LEFT, casual clothes in black and sky blue, old-fashioned: clothes that were very stylish decades ago and are
completely out of place today: a black suit jacket with very wide lapels, a sky-blue shirt with a big pointed
collar open over the jacket, high-waisted flared black trousers, polished two-tone black and sky-blue shoes,
a narrow black hat with a sky-blue band. He looks stuck in a past era, and proud of it.
RIGHT, official Vuela Alto outfit: a vintage sky-blue and white coach jacket from the team's early days, with
an old-fashioned cut and faded colors, over the same flared black trousers; a whistle on a cord around his neck
and a folded wooden folding chair under one arm.
```

### Fondos del hangar de Vuela Alto (para el Modo Historia)

El escenario del Modo Historia es una franja ancha arriba de la pantalla, no un fondo vertical:
estos fondos van en **16:9**, con lo importante en el centro (se recorta a los costados).

Bloque común:

```text
Anime gacha game background art, painted, polished and cinematic, in the style of a high-budget anime.
Horizontal 16:9 image, the important details in the central area. Clean shapes, soft cel-shaded painting with
rich light and atmosphere. No characters at all. No text, no letters, no numbers, no logos, no real brands,
no watermark.
```

#### El hangar de Vuela Alto, de día

```text
Inside the hangar of Vuela Alto, an old racing team for winged racers that has seen better days. A huge
arched hangar built for thirty people, now almost empty. Curved roof with exposed steel ribs, sky-blue and
white paint peeling off the walls, a faded sky-blue and white banner hanging crooked from the roof (no
letters). In the center, one single pair of sky-blue and white mechanical racing wings mounted on a work stand,
carefully maintained, the only shiny thing in the room. Next to it, a tool cart and a small red metal drawer
cabinet. On the wall above the red cabinet, a framed painting with an ornate golden frame: five tiny winged
figures in different colors rising toward bright clouds in a big blue sky. In a corner, an old wooden folding
chair. Dust floating in the air. The giant sliding door is half open at the back and shows a wide green plain
under a clear blue sky with white clouds, grass that grew back over what used to be desert, a rusted piece of
old machinery half buried in the grass far away. Bright morning sunlight pouring through the door and through
high windows in long beams. Camera at chest height, wide lens, gentle perspective toward the door. Quiet,
nostalgic, a little sad, but hopeful.
```

#### El hangar de Vuela Alto, de noche

```text
The same hangar of Vuela Alto at night, same layout and same camera as by day: arched roof with steel ribs,
peeling sky-blue and white walls, the crooked banner, the single pair of sky-blue and white racing wings on its
work stand in the center, the tool cart, the small red drawer cabinet, the framed painting of five winged
figures rising toward the clouds above it, and the old wooden folding chair in the corner. Only one warm work
lamp is on, hanging low over the wings, making a small island of yellow light; the rest of the hangar is in
cool blue shadow. Through the half-open sliding door, a night sky full of stars over the dark plain and a pale
moon, a faint breeze moving the grass. A few moths around the lamp. Calm, intimate, lonely, the feeling that
someone is still working late.
```

#### El hangar de Vuela Alto, desde afuera (2026-11-17)

El cartel va **en blanco** a propósito: el juego escribe encima «VUELA ALTO», que es el nombre
en castellano y no se traduce en ningún idioma (como Kōryū Racing o Lumière Aéronef). Así las letras
salen bien (Gemini suele escribirlas mal) y, si una escena quiere el cartel con una letra caída
(«VUELA AL O», texto de ejemplo del prototipo), se dibuja encima sin pedir otra imagen.

```text
Anime gacha game background art, painted, polished and cinematic, in the style of a high-budget anime.
Horizontal 16:9 image, the important details in the central area. Clean shapes, soft cel-shaded painting with
rich light and atmosphere. No characters at all. No text, no letters, no numbers, no logos, no real brands,
no watermark.

The outside of the Vuela Alto hangar, an old racing team for winged racers that has seen better days. A big
arched hangar made of corrugated metal stands alone at the edge of a vast green plain. The walls are painted
in sky-blue and white horizontal bands, faded and peeling, with rust streaks running down from the bolts.
Above the big sliding door hangs a long rectangular sign board, completely blank and empty: pale white paint
with a sky-blue border, a few rusty screw holes and one darker, cleaner rectangle where a missing piece used
to be. The sliding door is half open and dark inside. A crooked sky-blue and white windsock on a pole beside
the hangar, a gravel path leading to the door with grass growing through it, a rusty piece of old machinery
half buried in the tall grass in the distance. The plain is green and wild, grass that grew back over what
used to be desert, gentle hills on the horizon. Huge clear blue sky with soft white clouds, bright morning
sun. Camera at standing height on the path, slightly low angle, the hangar centered and filling the middle of
the image. Quiet, a little forgotten, but bright and hopeful.
```

Si un fondo sale con personajes: «No characters at all, keep everything else.» Si sale vertical o
cortado: «Make it horizontal 16:9 and keep the wings in the center.» Si el cartel sale con letras:
«Make the sign board completely blank. Keep everything else.»

**Espejar personajes (2026-11-17):** el juego puede dar vuelta una imagen para que mire al otro lado.
Las hojas de personaje miran hacia la izquierda; en el escenario, quien está a la izquierda se espeja
para mirar al centro. Cuidado con lo que no es simétrico: el lado del broche de pelo, el lado de la
mochila y, sobre todo, el hombro derecho de la veterana (si se espeja, pasa a ser el izquierdo).
