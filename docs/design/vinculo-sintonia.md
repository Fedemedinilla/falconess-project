# Vínculo y sintonía con las cuadrillas (plan «3 + 1», dueño 2026-11-13)

Estado: **aplicado** con sintonía +25 % (ADR-0016, dueño 2026-11-13). Las grillas del prototipo
quedaron en la rama `bond-proto` (`.work/bond/`).

## 1. El problema

Hoy el bono de una cuadrilla (+15 %, Boneyard +20 %) está activo desde la semana 1 y el vínculo
solo sube la chance de que venga (+5 puntos cada 20 de vínculo). Medido: el vínculo vale 4-7 puntos
de stats en toda la temporada (0,2 %). En Umamusume es al revés: el vínculo con la carta se sube
para llegar al entrenamiento de amistad, que es lo que hace grande una temporada.

## 2. Las reglas propuestas

1. **Una cuadrilla, un entrenamiento (opción 3).** Cada semana, cada cuadrilla que viene se para
   en uno solo de sus entrenamientos (sorteado entre los de sus stats), y su retrato se ve en esa
   tarjeta antes de elegir (la tarjeta ya muestra el retrato y la barra de vínculo). Elegir dónde
   entrenar es elegir con quién.
2. **Sintonía (opción 1).** Una cuadrilla aporta poco hasta que el vínculo llega a 80; desde ahí
   entra en sintonía y su entrenamiento rinde mucho más. El vínculo sube al entrenar con ella y con
   la Salida.

| Perilla                           | Hoy                  | Propuesta                       |
| --------------------------------- | -------------------- | ------------------------------- |
| Chance de que venga una cuadrilla | 35 % (+5 cada 20)    | 50 % (+5 cada 20)               |
| Dónde se para                     | En todos los suyos   | En uno, sorteado                |
| Bono antes de la sintonía         | +15 % (Boneyard +20) | +10 %                           |
| Sintonía desde vínculo            | —                    | 80                              |
| Bono en sintonía                  | —                    | +25 % (medido +20 a +30)        |
| Vínculo por entrenar con ella     | +4                   | +14                             |
| Vínculo por la Salida             | +5                   | +10 (a la cuadrilla que elijas) |

El sorteo del entrenamiento usa su propio `Rng` (`${seed}/crew/${turn}/${cuadrilla}`): ningún
sorteo viejo se mueve.

## 3. Lo medido (Normal, 400 temporadas por caso, base de semillas `bq`)

Dos jugadoras: **atenta** (la de referencia de hoy: entrena su plan e ignora las cuadrillas) y
**sigue** (entrena con la cuadrilla cuando ese stat todavía le falta y rinde más, y la Salida va a
la cuadrilla más cerca de la sintonía).

| Caso         | Falconess | Stats atenta → sigue | Completa atenta → sigue | Sintonía (1.ª semana, % de entrenamientos) |
| ------------ | --------- | -------------------- | ----------------------- | ------------------------------------------ |
| Hoy          | Peregrina | 2749 → 2905          | 85 → 95 %               | —                                          |
| Hoy          | Cernícala | 2790 → 2868          | 78 → 82 %               | —                                          |
| Hoy          | Caracara  | 2813 → 2874          | 77 → 83 %               | —                                          |
| Sintonía +25 | Peregrina | 2632 → 2837          | 79 → 92 %               | semana 25, 16 %                            |
| Sintonía +25 | Cernícala | 2745 → 2853          | 75 → 81 %               | semana 25, 17 %                            |
| Sintonía +25 | Caracara  | 2713 → 2801          | 70 → 78 %               | semana 28, 11 %                            |
- **El bono de sintonía:** +20 % y +30 % separan ≈ 35 puntos de stats y 0-2 puntos de completar.
  No hace falta +40 % (dueño: «me parece mucho»).
- **Cuándo llega:** con +7 de vínculo y 35 % de presencia casi nunca se llegaba (semana 36-41, 0-3 %
  de los entrenamientos); con +14 y 50 %, a mitad de temporada, como en Umamusume.
- **Balance:** quien sigue a las cuadrillas queda cerca de hoy (Peregrina −3, Cernícala −1, Caracara
  −5 puntos de completar); quien las ignora pierde 4-7 puntos. Exigente sin cajas, igual de duro que
  hoy (sigue: Cernícala 41 %, Caracara 34 %).
- **Hallazgo:** ya hoy seguir a las cuadrillas suma 6-10 puntos de completar, pero la política de
  referencia del balance las ignora. Con la propuesta, la de referencia tendría que seguirlas
  (cambia la base de la métrica 7 y de B4: necesita ADR).

Archivos: `.work/bond/` en la rama `bond-proto` (grillas `grid-normal`, `grid2-normal`,
`conf-normal`, `conf-exigente`).

## 4. Pasos para aplicarlo (con aprobación del dueño)

1. **Sim (v3):** `crewSync` en las constantes de temporada (`rulesets/`, protegido) y las tres
   perillas de vínculo y presencia; test de invariancia v1/v2 y golden.
2. **Política de referencia:** la atenta sigue a las cuadrillas; ADR con el antes/después de la
   métrica 7 y las barandas.
3. **Pantalla:** el retrato en la tarjeta ya está; falta el marco dorado en sintonía, la marca 80 en
   la barra de vínculo, el efecto «¡SINTONÍA!» al llegar y en el resultado del entrenamiento, y
   elegir la cuadrilla en la Salida.
4. **Partidas guardadas:** una temporada v3 en curso se reproduce con las reglas nuevas al recargar
   y puede cambiar; avisar a los testers o aplicarlo desde la próxima temporada.
5. **Balance final:** lote de 500 por Falconess en dos bases, Normal y Exigente con cajas, y las
   barandas B1-B8.
