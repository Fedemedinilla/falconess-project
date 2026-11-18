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

#### El cuadro de la carrera de la paz (2026-11-17)

Pedido del dueño: abajo, la tierra en guerra y caos; el cielo también es caos, salvo un único agujero
de cielo azul con nubes blancas; las cinco Falconess suben desproporcionadas hacia ese agujero, y es
una **carrera**, no una subida de ángeles. Colores de cada bando, de las escuderías fundadoras:
Kōryū rojo y amarillo, Altair azul marino y cian, Boneyard marrón óxido y verde oliva, Steinhaus
gris pizarra y plateado, Lumière crema y dorado. Secreto (`docs/design/historia/secretos.md` S3): el
agujero de cielo celeste y blanco es la sexta; en el cuadro no hay ninguna figura más.

```text
A famous historic painting from a fictional world, painted in a high-budget anime style with the rich,
dramatic feel of a classic oil painting on canvas (visible brush strokes, deep contrast). Vertical 3:4 image.
No text, no letters, no numbers, no logos, no signature, no frame.

THE GROUND: a battlefield at war, seen from above and far away. Scorched earth, trenches and ruined walls of two
opposing sides, smoke columns, fires, broken war machines, cracked dry land. Tiny soldiers on both sides have
stopped fighting and look up.

THE SKY IS CHAOS TOO: a violent, impossible storm fills almost the whole sky: churning dark grey and bruised
red clouds, ash, lightning, swirling winds and dust. Only ONE single hole breaks through it, high in the upper
part of the image: a round opening of perfectly clear sky-blue sky with soft white clouds, sunlight pouring down
through it like a beam. It is the only calm, clean place in the whole painting.

THE RACE: exactly five young women with mechanical wings are RACING upward toward that hole of blue sky. This is
a fierce race, not an angelic ascension: they fly in a steep diagonal from the lower part of the image to the
hole, at different distances, in strong forced perspective, so they look out of proportion: the nearest racer
is huge and close to the viewer, the farthest one is small, almost reaching the hole. They lean forward, arms
tucked or reaching, elbows out, cutting in front of each other, one pushing past another, determined faces,
gritted teeth and competitive grins. Speed streaks and five twisted contrails, each in its racer's colors,
all aiming at the same point inside the blue hole. Each racer wears a messenger satchel strapped across her
body and mechanical wings in her side's colors: 1) glossy red with yellow, 2) navy blue with cyan, 3) rust
brown with olive green, 4) slate grey with silver, 5) cream with gold.

Avoid: halos, feathered or angel wings, glowing auras, calm or praying poses, symmetric formation, a sixth
flying figure or anything inside the blue hole besides sky and clouds, any text or logo, cleavage, suggestive
poses, chibi proportions.
```

Corrección (dueño, 2026-11-17: «no está mal, pero hay que hacerlo más painting»). En la misma
conversación, con la imagen adjunta:

```text
Repaint this exact image as a real fine-art oil painting, keeping the same composition, the same five racers,
their poses, colors and positions, the storm, the single hole of blue sky and the battlefield below.
Make it look like a large 19th-century romantic history painting hanging in a museum: thick visible impasto
brush strokes, loose painterly edges instead of clean outlines, no line art at all, layered glazes, soft
blending in the clouds and smoke, canvas texture visible everywhere, slightly aged varnish with warm, muted,
earthy tones and darker shadows. The faces and wings are painted with brush strokes, not drawn or cel-shaded.
Keep a hint of anime in the faces and proportions, but it must read first as an old oil painting, not as an
illustration or a comic. The blue hole stays the only clean, bright, luminous area. Exactly five racers;
nothing inside the blue hole besides sky and clouds. No text, no signature, no frame.
```

Segunda corrección (dueño, 2026-11-17: «sigue pareciendo una imagen»). Editar la imagen conserva
demasiado del dibujo; conviene **pedirla de nuevo en una conversación nueva**, con el material primero
y el contenido después, y sin la palabra «anime» (el cuadro es una pintura vieja del mundo, no una
ilustración del juego):

```text
Oil on canvas. A huge 19th-century romantic history painting, photographed straight on in a museum.
Thick impasto oil paint applied with wide brushes and a palette knife, every stroke visible, paint ridges
catching the light, raw canvas weave showing through in places. Loose and expressive: details are suggested
with a few strokes, not drawn; no outlines, no line art, no smooth digital shading. Old cracked varnish
(craquelure), warm amber tone, muted earthy colors, deep dark shadows. Vertical 3:4.

Subject: a battlefield of scorched earth, trenches, smoke and fires seen from above, where tiny soldiers of both
sides have stopped fighting and look up. The whole sky is a violent storm of dark grey and dull red clouds,
except one single round hole of clear blue sky with white clouds high up, the only bright and clean spot in the
painting, with light falling through it. Exactly five young women with mechanical wings race upward toward the
hole in a steep diagonal, in strong forced perspective (the nearest one huge, the farthest one small), leaning
forward and fighting for the lead, messenger bags across their bodies, wings in five colors: red and yellow;
navy and cyan; rust brown and olive; slate grey and silver; cream and gold. Their trails all aim at the hole.
Nothing inside the hole but sky and clouds.

Avoid: digital illustration look, comic or cartoon look, clean outlines, halos, angel or feathered wings,
glowing auras, a sixth figure, text, letters, signature, frame.
```

Resultado (2026-11-17): con el prompt «óleo primero» sale como pintura de museo. Queda una
corrección posible, en la misma conversación y con la imagen adjunta, si las alas de atrás salen de
plumas (parecen ángeles):

```text
Keep this exact painting, its brushwork, composition and colors. Change only the wings of all five women:
every pair must be clearly mechanical, like the red and yellow pair in front: metal frame, gears and joints,
rigid panels instead of feathers. No feathered wings anywhere. The small cream and gold racer near the hole
must look like a racer leaning forward and fighting for the lead, not an angel.
```

**Espejar personajes (2026-11-17):** el juego puede dar vuelta una imagen para que mire al otro lado.
Las hojas de personaje miran hacia la izquierda; en el escenario, quien está a la izquierda se espeja
para mirar al centro. Cuidado con lo que no es simétrico: el lado del broche de pelo, el lado de la
mochila y, sobre todo, el hombro derecho de la veterana (si se espeja, pasa a ser el izquierdo).

## Las alas de Peregrina, rediseñadas (2026-11-17)

Pedido del dueño: sacarle a la Peregrina aprobada las alas grises simples y darle unas alas mucho más
tecnológicas y diseñadas, como las del fondo del hangar de Kōryū: un objeto real y funcional, con
propulsor atrás y alas flexibles y futuristas. El diseño sale de lo que ya dice el juego: Kōryū
impulsa **en ráfagas** (regla `pulse`, `docs/BRIEF.md` §7) y Peregrina es de **picada** (`dive`). En
Gemini, adjuntar la imagen de Peregrina y, como referencia de estilo de las alas, el fondo del hangar
de Kōryū.

```text
Edit the first attached image. Keep this exact character unchanged: same face, hair, falcon marks under
the eyes, smile, pose, red and yellow racing suit, jacket tied at the waist, knee pads, boots, the helmet
under her arm, the art style, line work, shading and the plain background. Change ONLY the wings.

Remove the current plain grey metal wings completely and replace them with a new pair of high-tech racing
wings, designed like a real, functional piece of racing equipment from Kōryū Racing (the second attached
image shows the team's style: glossy racing red with gold-yellow accents, sharp and elegant).

Design of the new wings:
- A compact back unit (the "core") strapped to her back with a harness over the shoulders and around the
  chest: a slim, aerodynamic red shell with dark graphite panels, small heat vents and a row of tiny
  amber status lights (no text).
- At the bottom of the core, pointing down and back, a PULSE THRUSTER: two short round nozzles with
  layered rings, built to fire in short bursts, a faint orange glow deep inside the nozzles.
- From the top of the core, two articulated arms with visible hinges, pistons and cable routing, folding
  like a falcon's wing shoulder.
- The wing surface is made of long, thin, overlapping blades of flexible composite, slightly curved, each
  one able to bend and slide over the next, shaped like the primary feathers of a falcon but clearly
  engineered: glossy red on top, dark graphite underneath, thin gold-yellow edges, small slots between the
  blades for airflow.
- Swept-back, pointed silhouette made for diving at high speed. The wings are half open, angled up and
  back behind her, wider than her shoulders but not covering her body or her face.
- Materials read as real: painted metal, carbon fiber weave, rubber seals, small scratches and wear from
  racing. No feathers, no angel look, no glow except inside the thrusters.

No text, no letters, no numbers, no logos.
```

Si cambia algo de la corredora: «Keep the character exactly as in the first image. Only the wings
change.» Si las alas salen de plumas: «The wings must be mechanical blades of composite and metal, not
feathers.»

Segunda vuelta (2026-11-17): con la imagen vertical (1:2) las alas salen muy chicas, porque no hay
lugar a los costados. Se agranda el lienzo a 16:10 con la corredora centrada y del mismo tamaño (fondo
liso a los costados) y se adjunta esa imagen con:

```text
Keep this exact character, pose, outfit and art style, centered and at the same size. Use the empty
space on both sides: open her wings WIDE and majestic, fully spread to the left and right, with a total
wingspan about two and a half times her height, the long red composite blades fanned out and clearly
separated, the tips reaching near the left and right edges of the image. Keep the same wing design:
red back core with harness, articulated arms with hinges and pistons, flexible overlapping blades with
gold edges and graphite undersides, and the pulse thruster nozzles at the bottom of the core with a
faint orange glow. Keep the plain background. No feathers, no text.
```

Tercera vuelta (2026-11-17): alas bien abiertas. El dueño pide sacar el buzo atado a la cintura y
llevar más el estilo de Kōryū: «japonés deportivo Ferrari».

```text
Keep this exact character, face, hair, falcon marks, smile, pose, helmet, the wide-open wings and the
plain background. Make these changes only:
1) Remove the red jacket tied around her waist completely; show the racing suit underneath.
2) Restyle her racing suit and wings in the identity of Kōryū Racing: a luxurious, sporty Japanese racing
team with the elegance of a classic Italian racing house, but original (no real brand, no horse, no
logos, no letters). Deep glossy racing red with a lacquer-like finish (like urushi lacquer on a
sports car), clean tailored lines, black graphite carbon panels, very thin gold-leaf pinstripes used
sparingly. The suit is a premium motorsport suit, fitted and tailored, with a high mandarin collar,
quilted shoulder panels, slim gold accents along the arms and legs and polished red boots. The wings
keep their shape and size but look like a precision-crafted Japanese machine: blades with sharp,
katana-like edges, gold edging, carbon undersides, flawless red lacquer, and the same pulse thruster
at the bottom of the back unit. A small abstract gold falcon-wing crest on the chest and on the back
unit, with no letters.
No text, no letters, no numbers, no real logos.
```

Cuarta vuelta (2026-11-17): la edición dejó el traje como de látex brillante y perdió el amarillo de
Kōryū. El dueño propone empezar una conversación nueva de Gemini. Prompt completo, desde cero,
adjuntando **solo** la Peregrina aprobada original como referencia de cara y pelo:

```text
Use the attached image only as a reference for her face, hair and the dark falcon marks under her eyes.
Create a new image of the same woman.

Japanese anime gacha game character splash art, high-budget anime style, polished and clean. Wide 16:10
image. Full body, standing, 3/4 view, centered, the whole figure visible from head to boots, about 75 %
of the image height, with her wings fully spread to both sides. Plain flat off-white background with a
soft floor shadow. Clean line art, soft cel shading with one shadow tone, soft key light from the upper
left.

Peregrina, the star racer of Kōryū Racing: an adult woman in her twenties, athletic racer build,
confident and charming. Short layered slate blue-grey hair with a cream-blonde streak, dark falcon
"moustache" marks painted below each eye, a bold competitive grin, chin slightly raised, one hand on her
hip, a red and graphite racing helmet under the other arm.

Kōryū Racing style: a sporty Japanese racing house with the luxury and elegance of a classic Italian
racing team, but original (no real brand, no horse). Signature colors: deep racing red and bright golden
yellow, with graphite black.
Racing suit: a tailored premium motorsport suit in MATTE technical fabric (not shiny, not latex, not
skin-tight), deep racing red, with a high mandarin collar, quilted shoulder panels, angular golden-yellow
speed stripes along the arms and legs, graphite knee and elbow pads, red racing boots, a small abstract
golden-yellow falcon-wing crest on the chest (no letters).

Wings: a real, functional piece of racing equipment. A compact red back unit strapped with a harness over
the shoulders and chest, with heat vents and tiny amber status lights; at its base, a pulse thruster
with two short ringed nozzles and a faint orange glow. Two articulated arms with hinges, pistons and
cables. The wing surfaces are long, flexible, overlapping blades of composite with sharp, katana-like
edges: glossy lacquered red on top (only the wings and hard parts are glossy), graphite carbon
underneath, thin golden-yellow edges. Fully spread, wide and majestic, wingspan about two and a half
times her height, tips near the left and right edges of the image. Precision-crafted, elegant, fast.

Avoid: feathers, angel look, latex or shiny bodysuit, skin-tight clothes, cleavage, a jacket tied at
the waist, any text, letters, numbers or logos, chibi proportions, western comic style, extra fingers,
cropped feet, busy background.
```

Quinta vuelta (2026-11-17): «cada vez más feas las alas». Las palabras «blades» y «katana-like»
hicieron que Gemini dibujara espadas sueltas en un esqueleto de brazos. Las mejores alas fueron las de
la segunda vuelta (abiertas, láminas superpuestas como plumas de halcón). Camino: partir de **esa**
imagen y cambiar solo el traje, con las alas bloqueadas:

```text
Edit the attached image. Do NOT change the wings at all: keep their exact shape, size, colors,
position and every detail. Do not change her face, hair, pose, helmet or the background either.
Change only her clothes:
1) Remove the red jacket tied around her waist completely.
2) Her racing suit becomes a tailored premium motorsport suit in MATTE technical fabric (not shiny,
not latex, not skin-tight): deep racing red, high mandarin collar, quilted shoulder panels, angular
bright golden-yellow speed stripes along the arms and legs, graphite knee and elbow pads, red racing
boots, and a small abstract golden-yellow falcon-wing crest on the chest (no letters). The style of a
luxurious, sporty Japanese racing team.
No text, no letters, no numbers, no logos.
```

Si en el futuro hay que describir alas desde cero, evitar «blades» y «katana»: pedir una silueta
continua de ala de halcón, con paneles que se superponen sin huecos, y un borde de ataque liso que
esconde el mecanismo.

## Capítulos 2 a 4: las escuderías por dentro (2026-11-18)

El hangar de Kōryū ya está (imagen del dueño, 2026-11-18). Los otros dos usan el bloque común de los
fondos de Vuela Alto (16:9, sin personajes) y van después de él.

### El hangar de Altair Systems

```text
Inside the hangar of Altair Systems, a high-tech racing team for winged racers that looks like a laboratory.
Everything is white, navy blue and soft cyan, spotless and silent. A glossy white floor that reflects the
ceiling lights like water, long rows of cold white light panels, a very high ceiling. In the middle distance,
sleek navy-and-cyan mechanical racing wings floating inside glass display cases, each one scanned by thin cyan
light lines. On one side, a simple metal rack with plain white basic training wings hanging in a neat row,
each with a small blank tag. Big wall screens showing abstract graphs, curves and wireframe wings, with no
readable text or numbers. A small white desk with two lonely white chairs in front of it, far too clean, like
a waiting room. At the back, a long white corridor that goes on and on into the distance. Tiny staff in white
coats with navy collars, small and far away, looking at tablets. Camera at chest height, wide lens, perfectly
symmetrical composition. Calm, elegant, a little intimidating, like an exam room.
```

### El taller de Boneyard Works

```text
Inside the workshop of Boneyard Works, a racing team for winged racers that builds its wings from salvaged
parts, and feels like a big family home. A tall old hangar with warm wooden beams and a few skylights; golden
afternoon sunbeams fall softly across the room. Workbenches everywhere, each one different and clearly loved,
covered in neat tools, bolts in glass jars and half-finished wing parts. Scrap is everywhere too, but sorted
and cared for: shelves of old propellers, wheels and colorful metal sheets labeled by color, like a
treasure collection. Team colors olive green and warm rust orange, on hand-painted banners with an abstract
wing emblem (no letters) and on mismatched tool chests. Cozy details: warm string lights hanging between the
beams, potted plants on the windowsills, a corner with a big shared table, mismatched chairs, mugs and a
kettle, a sofa made from an old vehicle seat with a blanket, photos and drawings pinned on a corkboard (no
readable text). An old radio on a shelf. In the background, one pair of olive-and-rust racing wings hangs
under a tarp, half visible, like a secret. A wide open door lets in green light from outside. Camera at chest
height, wide lens. Warm, welcoming and lived-in: a messy but happy workshop where everyone is family.
```

### Personajes de apoyo (una sola vista)

Van con el bloque de exclusiones de personajes al final, y en vez del bloque de estilo de dos
atuendos llevan este, que pide una sola vista:

```text
Japanese anime gacha game character reference sheet, high-budget anime style, polished and clean. One
full-body view of a single character, standing, 3/4 view, the whole figure visible from head to shoes. Plain
flat light grey background with a soft floor shadow, nothing else. Large expressive anime eyes, clean line art
of even weight, soft cel shading with one shadow tone and gentle highlights, soft key light from the upper
left. IMPORTANT: NO WINGS. Same art style and same scale as the attached image.
```

#### Ishida, asesor de Kōryū (el de las alas carísimas)

```text
A man in his fifties, tall (about 178 cm) and slim, perfect upright posture, like a maître d' at the most
expensive restaurant in the world. Black hair slicked back with elegant grey temples, a neatly trimmed thin
moustache, narrow calm eyes and a polite smile that is only one millimeter wide: he is selling without
selling. Hands folded behind his back. He wears a tailored deep racing-red three-piece suit with thin black
pinstripes, a black shirt, a glossy yellow tie and a small golden wing pin on the lapel (no letters), a red
pocket square, immaculate WHITE GLOVES, and polished black shoes. Everything about him shines a little.
```

#### Quist, analista de Altair (la del cuestionario)

```text
A woman in her thirties, about 172 cm, very straight posture, completely expressionless face: not cold, just
always measuring. Pale ash-blonde hair pulled back in a tight low bun, not a single loose strand. A translucent
cyan visor worn over her eyes like glasses, with faint light lines on the lens. She wears a long white lab-style
coat with a high navy collar and thin cyan piping, a navy turtleneck, slim navy trousers and white shoes. She
holds a large data tablet at chest height with one hand and her other index finger is about to tap it. A small
cyan earpiece in one ear. She looks like she already knows how many questions are left.
```
