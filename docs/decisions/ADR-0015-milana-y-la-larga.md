# ADR-0015 · Milana y un campo de fondistas en la Larga de Peregrina

- **Estado:** aceptada por el dueño (2026-11-13).
- **Alcance:** la meta de la semana 48 de Peregrina (ruleset v3). Ninguna otra meta ni Falconess
  cambia.
- **Relacionadas:** ADR-0012 (Exigente y la Copa), ADR-0013 (herencia), ADR-0014 (categorías),
  `docs/design/historia-peregrina.md`.

## Contexto

El dueño jugó la temporada de Peregrina en Exigente con dos cajas buenas (Resistencia 2★ cada una)
y la final de la Larga le resultó muy fácil: reproducida con su semilla y 200 semillas de carrera,
la ganaba el 84 %. Milana, la rival de la historia, no corría: en la carrera estaban Gerifalte (su
espejo) y rivales genéricas armadas para cualquier distancia, con 400-620 de Resistencia. Nadie
castigaba a una velocista en 3600 m.

El dueño pidió que Milana corra la Larga y que todas las demás también sean de resistencia: la
única velocista fuera de lugar es Peregrina.

## Decisión

1. **Campo de especialistas** (`SeasonGoal.field`): las rivales de esa meta reparten sus stats con
   otras proporciones (Agi 250, Res 300, Téc 150, Cor 140, Int 160 ‰) y tienen la letra A en la
   distancia. Ningún sorteo se mueve: los carriles y las alas del campo quedan iguales.
2. **Rival con nombre** (`SeasonGoal.namedRival`): Milana ocupa el carril y las alas de la primera
   rival libre. Se arma sobre el nivel del jugador, como Gerifalte: su total es el total medio del
   campo en esa semana × `floorPm` (1150 ‰), más el 80 % de lo que el jugador tenga por encima. Lo
   reparte a su manera (Agi 250, Res 340, Téc 130, Cor 110, Int 170 ‰), corre en Acecho (A), Larga A,
   y sabe Segundo aire, Pulmones de colina y Último aliento. En pantalla se llama «Milana»
   (`speaker.milana`) y la tarjeta previa avisa que corre ella y que todo el campo es de
   resistencia.
3. **Las dos dificultades corren la misma Larga** (campo G1 al 900 ‰ y la misma Milana). En Normal
   la meta es «Correr»; en Exigente es la final de la Copa y hay que ganarla. Gerifalte deja de
   correr la final de Peregrina (queda para las Copas de las otras).

## Medida

Semana 48 real de temporadas jugadas (`.work/grades/milana.ts`, dos carreras por temporada):

| Quién                                   | Le gana a Milana  | Milana gana |
| --------------------------------------- | ----------------- | ----------- |
| Normal, jugadora atenta                 | 1 %               | 81 %        |
| Normal, nivel del dueño (× 1,2)         | 26 %              | 62 %        |
| Exigente, atenta con dos cajas buenas   | 3-6 %             | 76-78 %     |
| Exigente, nivel del dueño con dos cajas | 61-64 %           | 33-35 %     |
| La partida del dueño (semilla 169342)   | 65 % (antes 84 %) | 30 %        |
| Exigente, nivel del dueño sin cajas     | 31-33 %           | 56-57 %     |

Lo canónico (pierde) es lo común; ganarle pide mucha Resistencia, o en Exigente la herencia.

**Baranda E1 (ADR-0012).** Sin cajas, al nivel del dueño, Exigente ya no llega al 55 % de temporadas
completas: la final contra Milana se gana un tercio de las veces. Para Peregrina, E1 se mide con dos
cajas buenas, como lo pide ADR-0013 («la herencia lleva Exigente de súper difícil a difícil pero
manejable»): ahí la final se gana el 61-64 % y la temporada entera queda dentro del rango. Las otras
dos Falconess siguen midiéndose como antes.

## Consecuencias

- Una Falconess de la historia puede correr en la carrera de verdad sin ser jugable: el mismo
  mecanismo sirve para las rivales de las historias de Cernícala y Caracara.
- Un campo de especialistas hace que una carrera fuera del terreno de una Falconess se sienta así.
