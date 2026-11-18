# cap-03-altair

Borrador (2026-11-18), escrito con `docs/design/biblia-escritura.md` y `docs/design/investigacion-personajes.md`.
No es canon hasta que el dueño lo apruebe. Formato: `NOMBRE [expresión]: texto`, un renglón por globo; después
de `//`, la acción que sostiene la línea. Prototipo jugable: «Vuela Alto · Capítulos 2 a 4».

## Historia principal · Capítulo 3 · Pregunta doscientos doce

_Altair Systems_
### Escena 1 · Altair Systems

- **Objetivo:** Conseguir alas gratis.
- **Obstáculo:** Son gratis, pero hay que completar una evaluación.
- **Giro:** Doscientas doce preguntas.
- **Salida:** Aceptan, sin saber lo que les espera.
```text
[FONDO: altair]
[MÚSICA: electrónica suave, como de laboratorio]
[NARRACIÓN]: El hangar de Altair Systems es blanco, azul marino y silencio. Las pantallas muestran números que nadie mira.
[ENTRA: Nina, izquierda]
[ENTRA: Masaru, centro]
[GESTO: Susurra, aunque nadie le pidió silencio.]
MASARU [concentración]: ¿Por qué estoy susurrando?  // contagiándose del lugar
[GESTO: También susurra.]
NINA [concentración]: No sé. Pero yo también.  // acompañándolo
[ENTRA: Mujer del visor celeste, derecha]
[GESTO: Aparece detrás de ellos, con una tableta y un visor celeste.]
MUJER DEL VISOR CELESTE [concentración]: Bienvenidos a Altair Systems. Analista Quist. Detecté dos visitantes sin turno.  // registrándolos antes de saludarlos
[NOMBRE: Mujer del visor celeste → Quist]
[GESTO: Da un saltito.]
NINA [sorpresa]: ¡Perdón! Veníamos por unas alas. Básicas.  // disculpándose por existir
[GESTO: Desliza el dedo por la tableta.]
QUIST [calma]: Tenemos alas básicas. Sin costo. Para candidatas que completen la evaluación.  // ofreciendo con condiciones
MASARU [ganas]: ¿Sin costo? ¿Gratis de verdad?  // entusiasmándose antes de leer la letra chica
QUIST [calma]: Sin costo monetario.  // advirtiendo sin advertir
MASARU [sorpresa]: ¿Hay otro tipo de costo?  // oliendo la trampa
[GESTO: Gira la tableta: una barra de progreso en cero.]
QUIST [calma]: Doscientas doce preguntas. Empezamos.  // empezando sin pedir permiso
```
### Escena 2 · La evaluación

- **Objetivo:** Llegar al final del cuestionario.
- **Obstáculo:** Cada pregunta toca algo que no quieren decir.
- **Giro:** Las preguntas llegan a lo que cada uno esconde.
- **Salida:** Escapan.
```text
QUIST [concentración]: Pregunta uno. Nombre completo.  // midiendo
NINA [ganas]: ¡Nina!  // contestando de más
QUIST [concentración]: Completo.  // exigiendo precisión
NINA [en blanco]: …Ese es completo.  // sin saber qué más dar ([en blanco]: no entiende la pregunta)
QUIST [concentración]: Pregunta dos. Horas de sueño promedio.  // siguiendo
NINA [concentración]: ¿Contando las veces que me despierto a ensayar conversaciones?  // contestando con verdad de más
QUIST [calma]: Sí.  // anotando todo
NINA [en blanco]: …Pocas.  // dándose cuenta tarde de lo que dijo ([en blanco]: se arrepiente)
[NARRACIÓN]: Cuarenta minutos después. La barra de progreso marca cuatro por ciento.
QUIST [concentración]: Pregunta nueve. ¿Prefiere viento de frente o de cola? Justifique.  // siguiendo sin piedad
[GESTO: Mira un punto fijo en el techo.]
MASARU [cansancio]: Mi cerebro se apagó en la pregunta tres. Lo que queda es un protector de pantalla.  // confesando que se fue
[GESTO: Se ríe y se tapa la boca.]
NINA [alegría]: Perdón.  // riéndose sin querer
[GESTO: No se ríe.]
QUIST [calma]: Anotado: «protector de pantalla».  // registrándolo todo
QUIST [concentración]: Pregunta treinta y uno. Cantidad de amigos cercanos.  // tocando sin saberlo la herida
NINA [en blanco]: … [EFECTO: globo que tarda]  // quedándose sin aire ([en blanco]: la pregunta le pegó)
[GESTO: Mira a Masaru de reojo.]
NINA [concentración]: ¿Él cuenta?  // buscando una respuesta que no la deje sola
[GESTO: Se señala a sí mismo.]
MASARU [sorpresa]: ¿Yo cuento?  // sorprendiéndose de importar
QUIST [calma]: Necesito un número.  // pidiendo lo imposible
[GESTO: Levanta un dedo, despacio. Después, medio más.]
NINA [ganas]: Uno. …Uno y medio, con el viejo.  // eligiendo su número
[GESTO: Gira la tableta hacia Masaru.]
QUIST [concentración]: Pregunta treinta y dos, para el acompañante. ¿Ha terminado alguna carrera?  // tocando la herida de él
> [ELECCIÓN] Qué contesta Masaru
> [ACEPTAR] No.
> [RECHAZAR] Eso es privado.
> [DESVIAR] Defina «terminar».

(si ACEPTAR)
QUIST [calma]: Anotado.  // registrando sin juzgar
[GESTO: Abre la boca como para agregar algo. No agrega nada.]
MASARU [en blanco]: …  // callándose lo demás ([en blanco]: no quiere explicar)

(si RECHAZAR)
QUIST [concentración]: En Altair, «privado» es una categoría con su propio formulario.  // cerrando la salida
MASARU [fastidio]: ¿Cuántas preguntas tiene?  // temiendo la respuesta
QUIST [calma]: Cuarenta.  // contestando con exactitud

(si DESVIAR)
QUIST [concentración]: Llegar al final.  // definiendo sin ironía
MASARU [cansancio]: Ah. Entonces no.  // riéndose de sí mismo para no decir más
[GESTO: Le toca el codo.]
NINA [concentración]: Masaru.  // llamándolo en voz baja
[GESTO: Se levanta de golpe.]
MASARU [ganas]: Sí.  // entendiendo sin que le expliquen
NINA [ganas]: ¿Corremos?  // proponiendo la huida
MASARU [ganas]: Corremos.  // aceptando con alivio
[GESTO: Hace una reverencia mientras ya se va.]
NINA [alegría]: ¡Muchas gracias por las preguntas! ¡Eran muy buenas! ¡Perdón! [EFECTO: texto rápido]  // huyendo con buenos modales
[SFX: dos pares de zapatillas corriendo sobre piso brillante]
[SALE: Nina]
[SALE: Masaru]
[ILUSTRACIÓN] Nina y Masaru corren por un pasillo blanco interminable. Detrás de ellos, en una pantalla gigante, la barra de progreso: 4 %.
[GESTO: Sola, guarda la tableta.]
QUIST [calma]: Evaluación interrumpida en la pregunta treinta y dos. Resultado: interesantes. [EFECTO: frase clave]  // dejándolos en sus registros
```
