# cap-06-koryu

Borrador (2026-11-18), escrito con `docs/design/biblia-escritura.md` y `docs/design/investigacion-personajes.md`.
No es canon hasta que el dueño lo apruebe. Formato: `NOMBRE [expresión]: texto`, un renglón por globo; después
de `//`, la acción que sostiene la línea. Prototipo jugable: «Vuela Alto · Capítulos 2 a 6».

## Historia principal · Capítulo 6 · Firma en la frente

_Kōryū Racing_
### Escena 1 · El cometa

- **Objetivo:** Volver a casa con el chip.
- **Obstáculo:** Nina no puede dejar de mirar el chip, y la avenida sigue.
- **Giro:** Algo rojo los atropella y sale corriendo.
- **Salida:** Tienen que pasar por Kōryū para llegar a Vuela Alto.
```text
[FONDO: calle]
[ENTRA: Nina, izquierda]
[ENTRA: Masaru, centro]
[GESTO: Camina con el chip en la palma abierta, como si fuera agua.]
NINA [concentración]: No me dijo su nombre.  // pensando en la de los lentes
MASARU [cansancio]: Nadie nos dice su nombre. Me lo empiezo a tomar personal.  // sumando la lista del día
NINA [calma]: Me miró como mira el viejo antes de decir que no.  // comparando lo único que conoce
[GESTO: Da vuelta el cuaderno. Dice «QUIZÁS», subrayado tres veces.]
MASARU [concentración]: Pero dijo «quizás». El viejo nunca dijo «quizás». Lo anoté.  // mostrando la evidencia
[SFX: un zumbido que crece desde la esquina, como un auto sin motor]
[EFECTO: temblor]
[MÚSICA: tema de chiste épico]
[ENTRA: Chica de rojo, derecha]
[GESTO: Aparece una mancha roja, se lleva puesto el carrito y caen los tres.]
CHICA DE ROJO [fastidio]: ¡&%@#! [EFECTO: sacudida]  // chocando con todo a la vez
NINA [sorpresa]: ¡El chip! ¿Dónde está el—? …Ah. En mi mano. [EFECTO: texto rápido]  // rescatando lo único que importa
[GESTO: Los mira desde el suelo, despeinada, con un ojo cerrado.]
CHICA DE ROJO [sorpresa]: Mameluco celeste. Alas de chatarra.  // reconociéndolos desde el piso
CHICA DE ROJO [en blanco]: No. No, no, no.  // dándose cuenta de que llega tarde
[SALE: Chica de rojo]
[GESTO: Sigue sentado en la vereda, con el cuaderno abierto en la cara.]
MASARU [en blanco]: ¿Eso era una persona?  // procesando lo que pasó
NINA [concentración]: Corría para el mismo lado que nosotros.  // mirando hacia donde se fue
MASARU [cansancio]: Para el mismo lado, pero a otra velocidad. Como todo el mundo hoy.  // levantándose de a partes
```
### Escena 2 · La señorita

- **Objetivo:** Pasar por delante de Kōryū sin que nadie los mire.
- **Obstáculo:** Ishida los está esperando en la vereda.
- **Giro:** «La señorita» quiere verlos, y ellos no saben quién es.
- **Salida:** Entran con el carrito en brazos.
```text
[FONDO: koryu-ext]
[ENTRA: Hombre de guantes blancos, derecha]
[GESTO: Espera al final de la alfombra roja, con las manos detrás de la espalda.]
HOMBRE DE GUANTES BLANCOS [calma]: Buenas tardes. La señorita los está esperando.  // recibiéndolos como a invitados
MASARU [sorpresa]: ¿Qué señorita?  // preguntando lo obvio
HOMBRE DE GUANTES BLANCOS [en blanco]: La señorita. [EFECTO: globo que tarda]  // repitiendo lo que no necesita explicación
[GESTO: Se endereza, por si es una entrevista.]
NINA [concentración]: ¿La que contrata a la gente de limpieza?  // buscando la única señorita que se le ocurre
HOMBRE DE GUANTES BLANCOS [calma]: Pasen, por favor. El carrito, en brazos. Las ruedas no pisan la alfombra.  // cuidando la alfombra antes que nada
MASARU [cansancio]: En teoría, las ruedas existen para no llevar las cosas en brazos.  // protestando mientras levanta el carrito
[SALE: Hombre de guantes blancos]
```
### Escena 3 · Unos fans

- **Objetivo:** Que la señorita les dé el casco sin que parezca que corrió.
- **Obstáculo:** Está sin aire y no sabe actuar.
- **Giro:** Elige el casco más viejo, y lo firma.
- **Salida:** Salen con casco, fotos firmadas y una gorra, sin saber quién era.
```text
[FONDO: koryu]
[MÚSICA: la orquesta, detrás de la puerta dorada]
[ENTRA: Chica de rojo, derecha]
[GESTO: Posa con las manos en la cintura. Le sube y le baja el pecho.]
CHICA DE ROJO [alegría]: ¡Oh! ¡Qué sorpresa! ¡Unos fans!  // fingiendo que estaba ahí desde siempre
NINA [sorpresa]: Es la del póster. [EFECTO: susurro]  // reconociéndola recién ahora
MASARU [concentración]: Es la de la vereda.  // reconociéndola por otro lado
[GESTO: Se seca la frente con el dorso del guante, rápido.]
CHICA DE ROJO [ganas]: Estuve acá… toda la tarde. Tranquila. Posando.  // mintiendo entre respiraciones
> [ELECCIÓN] Qué le dice Masaru
> [ACEPTAR] Sí. Fans. Muy fans.
> [RECHAZAR] No sabemos quién eres.
> [DESVIAR] ¿Estás bien? Respiras como si hubieras corrido.

(si ACEPTAR)
CHICA DE ROJO [alegría]: ¡Confirmado! Se nota en los ojos. Siempre se nota.  // recibiendo lo que esperaba

(si RECHAZAR)
CHICA DE ROJO [en blanco]: …  // no pudiendo procesarlo
CHICA DE ROJO [alegría]: ¡Qué chiste tan bueno! Ishida, anota ese chiste.  // convirtiéndolo en algo posible

(si DESVIAR)
CHICA DE ROJO [fastidio]: ¿Correr? Negativo. Respiro así. Es mi estilo.  // negando lo evidente con jerga de piloto
[GESTO: Chasquea los dedos hacia la puerta dorada.]
CHICA DE ROJO [ganas]: Bueno. Ishida.  // dando la orden
HOMBRE DE GUANTES BLANCOS [calma]: Señorita.  // obedeciendo desde algún lugar fuera de vista
[SFX: tres aplausos con ritmo; detrás de la puerta dorada, la orquesta sube]
[NARRACIÓN]: Entran cuatro personas de rojo, cada una con un casco distinto en las manos. Se ponen en fila, sin una palabra.
[GESTO: Mira un casco. Mira a Nina. Mira otro casco. Mira a Nina.]
CHICA DE ROJO [concentración]: …  // eligiendo con los ojos ([concentración]: compara cada casco con la cabeza de Nina)
[GESTO: Hace un marco con los dedos alrededor de la cabeza de Nina.]
CHICA DE ROJO [concentración]: Ninguno. Ninguno es.  // descartando el lujo entero
[GESTO: Sale disparada hacia un mueble del fondo.]
CHICA DE ROJO [ganas]: ¡Ya sé!  // decidiendo de golpe
NINA [en blanco]: ¿Me midió la cabeza con los dedos?  // procesando el trámite
[GESTO: Vuelve con un casco blanco, viejo, con rayones de muchos vuelos.]
CHICA DE ROJO [alegría]: Este.  // ofreciendo su elección
HOMBRE DE GUANTES BLANCOS [concentración]: Señorita. Ese casco no sale de ese cajón. A su entrenador esto no le va a gustar.  // advirtiendo con respeto
CHICA DE ROJO [aburrimiento]: Pfff. No es mi papá.  // despachando la advertencia
[SFX: el chillido de un marcador sobre plástico]
[ILUSTRACIÓN] Peregrina firma el casco blanco con un marcador rojo, en la frente, la lengua afuera de concentración. Nina lo sostiene con los dos brazos y los ojos muy abiertos.
NINA [en blanco]: …Gracias. [EFECTO: globo que tarda]  // agradeciendo sin entender ([en blanco]: no sabe qué acaba de recibir)
CHICA DE ROJO [alegría]: De nada, mi fan. Ahora, lo más importante. El desayuno.  // pasando al modo cartel
CHICA DE ROJO [ganas]: Fruta, proteína, y llegar primera a la mesa. Segundo: nunca camines si puedes correr. Tercero— [EFECTO: texto rápido]  // recitando su propio comercial
[GESTO: Tose una sola vez, desde la puerta.]
HOMBRE DE GUANTES BLANCOS [concentración]: Ejem.  // frenándola con una tos
[GESTO: Les da dos fotos firmadas y le pone una gorra de Kōryū a Masaru.]
CHICA DE ROJO [calma]: …Eso es todo por hoy. Lo demás está en las fotos.  // aterrizando el discurso
MASARU [sorpresa]: ¿La gorra es para mí?  // sin saber si es un regalo o un uniforme
CHICA DE ROJO [alegría]: Para que te vean llegar. Siempre hay que ver llegar a alguien. [EFECTO: frase clave]  // dándole su filosofía en una frase
[SALE: Chica de rojo]
```
### Escena 4 · Casa

- **Objetivo:** Llegar a Vuela Alto.
- **Obstáculo:** No entienden nada de lo que pasó.
- **Giro:** La radio dice lo que ellos no saben.
- **Salida:** Mañana a las seis.
```text
[FONDO: exterior]
[MÚSICA: tema de Vuela Alto]
[GESTO: Tiene la gorra puesta. No se la sacó.]
MASARU [en blanco]: ¿Qué acaba de pasar?  // intentando resumir el día
NINA [concentración]: Nos dieron alas. Un chip. Un casco. Y fotos.  // contando lo que tiene en los brazos
MASARU [concentración]: ¿De quién son las fotos?  // mirando la firma
NINA [en blanco]: Dice… «¡Vuela!». Y un garabato. Y un dibujito de un ala.  // leyendo lo que no se puede leer
[NARRACIÓN]: En la radio de un auto que pasa, alguien anuncia el entrenamiento abierto de Caracara, de Boneyard Works, mañana a las seis.
NINA [ganas]: Mañana a las seis empiezo a *volar*. [EFECTO: énfasis]  // decidiendo
MASARU [cansancio]: Mañana a las seis yo duermo.  // cerrando con su verdad
```
