# ADR-0013 · Herencia con suerte: cajas sorteadas e inspiraciones

- **Estado:** aceptada por el dueño (2026-11-11).
- **Alcance:** temporada del ruleset v3. v1 y v2 no cambian (B8).
- **Relacionadas:** ADR-0012 (Normal, Exigente y la Copa).

## Contexto

El dueño quiere que Exigente se pueda completar gracias a la herencia: primero se juega Normal para
sacar una buena caja negra, y después se usa para intentar sacar una mejor en Exigente. La herencia
tiene que ser lo que lleva Exigente de «súper difícil» a «difícil pero manejable».

Hasta ahora la herencia no estaba en el juego del celular, y en el motor una caja daba +7 por
estrella a una stat al empezar: nada. Sumar mucho solo al empezar tampoco alcanza, porque la stat
entra antes en el rendimiento decreciente (+160 de Agilidad de entrada llevaba a la atenta de
10 a 25-30 % y no subía más).

El dueño pidió dos cajas, las inspiraciones de S24 y S40 además de la inicial, y azar «en las
inspiraciones, en las cajas, en sus stats y estrellas».

## Decisión

1. **Dos padres.** Al elegir corredora se eligen hasta 2 cajas de las que dejó este navegador
   (cualquier Falconess, nunca la misma dos veces). El segundo lugar es opcional.
2. **La caja se sortea al terminar la temporada** (`rollBoxStat`,
   `Rng(${seed}/box/${inputsHash})`): misma temporada, misma caja.
   - La stat sale entre las cinco, cada una con peso «lo que tiene por encima de 400» (al menos 1).
     La mejor stat es la más probable, no la única.
   - Las estrellas salen según el valor de esa stat:

     | Valor   | 1★    | 2★   | 3★   |
     | ------- | ----- | ---- | ---- |
     | < 600   | 100 % |      |      |
     | 600-799 | 70 %  | 30 % |      |
     | 800-999 | 25 %  | 75 % |      |
     | ≥ 1000  |       | 50 % | 50 % |

   - Con el tope de Normal (900) una caja de Normal nunca tiene 3★: las 3★ salen solo de Exigente.
3. **Al empezar, siempre:** cada caja suma `estrellas × 20` a su stat (`statInheritPerStar` de v3,
   antes 7). La letra de posición se hereda como antes (con su chance por estrellas).
4. **Inspiraciones en las semanas 24 y 40** (al empezar la semana): cada caja inspira con chance
   65 / 80 / 90 % según tenga 1★, 2★ o 3★, y suma `estrellas × 20` otra vez a su stat (hasta el tope
   de la dificultad). Sorteo propio, `Rng(${seed}/inspiration/${turn})`, una tirada por caja en
   orden: ningún otro sorteo de la temporada se mueve. «Lo que pasó» lo anota
   (`log.inherit.inspiration.<stat>`, o `log.inherit.none` si ninguna inspiró).
5. El estado guarda los factores de stat de los padres (`inheritance`), solo en v3 y solo si hay
   padres: una temporada sin padres queda igual byte a byte.

## Medida

Ver la tabla en el informe al dueño (`.work/play1/inh-calib.txt`, 60 temporadas por fila, 2 semillas
de carrera, Exigente). Sin cajas la atenta pasa 9-14 %; con dos cajas de 2★ la herencia la lleva a
«difícil pero manejable», y al nivel del dueño la Copa sigue sin ser segura.

## Consecuencias

- Normal es la fábrica de cajas; las 3★ solo salen de Exigente: el escalón siguiente.
- Una caja buena no es segura: la stat y las estrellas se sortean, y las inspiraciones pueden no
  llegar. Lo que se controla es especializar la temporada (una stat alta pesa más en el sorteo).
- Gerifalte copia las stats de la jugadora, herencia incluida: la herencia ayuda más en las metas
  de la escalera que contra ella.
- Pendiente: los factores de habilidad y de afinidad de la caja todavía no hacen nada en la
  temporada.
