# ADR-0014 · Categorías de carrera (G3, G2, G1) y las metas de Peregrina

- **Estado:** aceptada por el dueño (2026-11-13).
- **Alcance:** temporada del ruleset v3 (calendario `calendars/v3.json`). v1 y v2 no cambian.
- **Relacionadas:** ADR-0010 (barandas), ADR-0012 (dificultades y Copa), `docs/design/historia-peregrina.md`.

## Contexto

La historia de Peregrina (Ícaro sin culpa) pide cuatro victorias seguidas y después una Larga que
solo tiene que correr y que pierde. Con las metas que tenía (6.º, 6.º, 5.º y 4.º puesto, semanas 12,
24, 36 y 46) la temporada terminaba dos semanas después de la cima, la invitación a la Larga llegaba
con la temporada ya cerrada y la Larga no existía. Pedirle cuatro victorias con esos campos daba
3 % de temporadas invictas: el campo rival de una meta dependía solo de su semana.

El dueño pidió hacer lo que hace Umamusume con las velocistas puras (Sakura Bakushin O, Nishino
Flower) y con las de arena: sus temporadas corren carreras de menor categoría (G3, G2), pensadas para
lo que ellas son, y por eso ganan casi todo y se sienten invencibles.

## Decisión

1. **Categoría por meta.** `SeasonGoal` suma dos campos opcionales:
   - `grade` (`g3` | `g2` | `g1`): la etiqueta en pantalla, en la tarjeta de la meta y en el botón de
     la semana de carrera.
   - `fieldPm`: el campo de esa categoría, la media de la curva de rivales × este ‰
     (`generateField`). Sin el campo, el campo rival es el de antes: ningún sorteo se mueve (los
     golden y `v1-invariance` pasan sin regrabar).
     Es una palanca de contenido (calendario y metas, ADR-0010): el motor de carrera no cambia.
2. **«Correr».** Una meta con `minPlace` 8 se cumple con cualquier puesto; en pantalla dice
   «Correr».
3. **Metas de Peregrina.**

| Semana | Pista           | Normal             | Exigente                                 |
| ------ | --------------- | ------------------ | ---------------------------------------- |
| 10     | Sprint          | Ganar · G3 (650)   | Ganar · G2 (850)                         |
| 20     | Mirador (Milla) | Ganar · G3 (650)   | Ganar · G2 (850)                         |
| 30     | Sprint          | Ganar · G2 (800)   | Ganar · G2 (850)                         |
| 40     | Mirador (Milla) | Ganar · G2 (800)   | Ganar · G2 (850)                         |
| 48     | Cruce (Larga)   | Correr · G1 (1100) | Copa, final contra Gerifalte · G1 (1000) |
4. **Escenas.** El disparador `goal-after` suma `placed` (la cumplió sin ganar). La invitación pasa a
   la meta 4; la Larga tiene su escena previa y dos finales (pierde o gana).

## Medida

Política de referencia, 500 temporadas, bases `batch` y `alt1` (`pnpm sim:season-batch`):

| Peregrina, Normal                     | Antes | Ahora       |
| ------------------------------------- | ----- | ----------- |
| Completa la temporada                 | 64 %  | 72 % · 72 % |
| Gana cada victoria (de las que llega) | —     | 83-100 %    |
| Llega a la Larga con las cuatro       | —     | 72 % · 72 % |
| Gana la Larga                         | —     | 13 % · 9 %  |
| Nota ≥ B                              | 64 %  | 72 % · 72 % |

Exigente (método de ADR-0012, `.work/grades/tune.ts`, 200 temporadas, dos bases): pasa todas las
metas el 66 % · 66 % al nivel del dueño (× 1,2; baranda E1: 55-85 %) y el 6 % · 12 % la jugadora
atenta (antes 10 %).

**La temporada de cada Falconess es suya (dueño, 2026-11-13).** Este cambio no toca nada que vean
las otras: las metas de Cernícala y Caracara no cambian (su lote da lo mismo que antes: 68 % y 63 %),
el calendario compartido tampoco (pistas del mes y ofertas), y las letras de cada pista quedan como
estaban. Una meta con categoría es una carrera de la historia de una sola Falconess, así que
`content:track-demands` no la usa como semana de referencia; el Sprint y el Mirador conservan la
semana que les daban las metas viejas de Peregrina (36 y 46). Un test lo vigila: solo las metas de
Peregrina llevan categoría.

**Barandas (ADR-0010, `pnpm balance:barandas`, bases v3a y v3b):** con la segunda victoria en la
Escalera, B3 fallaba por 0,1 punto (Acecho a 750: 28,1 %), porque sumaba peso a dos casas del Acecho.
Se corrigió con las metas de Peregrina, sin tocar el calendario compartido: su segunda victoria es en
el Mirador (también Milla), así sus metas pesan como antes y solo se suma la Larga. B3 queda en 27,9 %
(frágil, como antes con 27,7 %) y el veredicto es **PASA** (frágiles B2, B3 y B4, como antes; B8 sin
mover un byte).

## Consecuencias

- Peregrina se siente invicta como Bakushin: gana el 80 % de sus carreras de meta (antes 40 %).
- Una Falconess de pistas raras (arena) puede tener metas más pocas y a su medida, y la categoría
  ajusta lo difícil sin tocar a las demás.
- Las otras dos Falconess no cambian.
