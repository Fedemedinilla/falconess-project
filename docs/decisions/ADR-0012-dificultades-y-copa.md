# ADR-0012 · Dificultades Normal y Exigente, y la Copa

- **Estado:** aceptada por el dueño (2026-11-11).
- **Alcance:** temporada del ruleset v3. v1 y v2 no cambian (B8).
- **Relacionadas:** ADR-0010 (barandas), ADR-0011 (carrera v3).

## Contexto

El dueño jugó una temporada de Cernícala y la pasó sin riesgo: primera en las cuatro metas, nota S.
Repetida 300 veces con sus stats, pasaba cada meta en el 99-100 % de las carreras. La medida mostró
por qué no alcanza con subir las metas: en la v3, 20 % más de stats lleva una final de 20-40 % de
victorias a 75-90 %. Una sola dificultad no puede ser justa para la jugadora atenta (la referencia
de B4) y para un jugador que optimiza como el dueño.

El dueño pidió dos dificultades con la idea de Star Savior: cada dificultad pone un **tope de stats**,
así que no conviene farmear la fácil sino subir de nivel. También pidió que la final de la difícil
sea una copa, al estilo de la URA, contra una rival que se arme sobre su propia Falconess.

## Decisión

1. **Dos dificultades**, elegidas al empezar la temporada (`start.difficulty`, opcional; si falta
   es Normal, así que todo guardado anterior se repite igual).

   |               | Normal                                 | Exigente                                                  |
   | ------------- | -------------------------------------- | --------------------------------------------------------- |
   | Tope por stat | 900                                    | 1200 (`statMax`; más alto cambiaría la carrera congelada) |
   | Caja negra    | hasta 2★ (la 3★ pide una stat ≥ 1000)  | hasta 3★                                                  |
   | Metas         | las de `calendars/v3.json` → `goals`   | `exigenteGoals`: escalera en su zona de confort y la Copa |
   | Baranda       | B4 con la jugadora atenta, sin cambios | E1 (abajo)                                                |

2. **La escalera de Exigente**, en las pistas donde rinde mejor cada una (medidas con stats
   parejas):

   |           | S12               | S24             | S36          | S44 Clasificatoria | S46 Semifinal | S48 Final          |
   | --------- | ----------------- | --------------- | ------------ | ------------------ | ------------- | ------------------ |
   | Peregrina | Sprint 5.º        | Escalera 4.º    | Sprint 3.º   | Escalera 4.º       | Escalera 3.º  | Sprint, ganar      |
   | Cernícala | Mirador 5.º       | Escalera 4.º    | Circuito 3.º | Mirador 4.º        | Circuito 3.º  | Escalera, ganar    |
   | Caracara  | Cielo abierto 5.º | Pista larga 4.º | Travesía 3.º | Cielo abierto 4.º  | Travesía 3.º  | Pista larga, ganar |

   Caracara corre las pistas largas por identidad (es fuerte en casi todas).

3. **Gerifalte, la rival de la Copa**, corre en la semifinal y en la final (`mirrorRival`). Toma el
   carril y las alas de `rival-1`, así que los sorteos del resto del campo no cambian. Se arma sobre
   la jugadora:
   - su total de stats es el total medio del campo × 0,95, más el 80 % de lo que la jugadora tenga
     por encima de eso (`mirrorRival: { floorPm: 950, excessPm: 800 }`);
   - lo reparte en las mismas proporciones que la jugadora;
   - tiene sus letras, corre en su misma posición y conoce sus habilidades genéricas;
   - no tiene sus habilidades únicas ni su pasiva de firma: no es la Falconess de nadie.

   No sortea nada: misma semilla y mismas entradas, misma Gerifalte. El nombre en pantalla es
   «Gerifalte» y no «némesis» por la patente del Nemesis System (T20).

4. **Baranda E1 (Exigente):** a nivel del dueño (jugadora atenta con stats × 1,2) entre el 55 y el
   85 % de las temporadas pasan todas las metas, en cada Falconess. Se mide con
   `.work/play1/zz-cup.ts` hasta que entre a `pnpm balance:barandas`.

## Medida (60 temporadas por Falconess, 2 semillas de carrera)

| Pasan todas las metas | Atenta | Nivel del dueño (× 1,2)  | Muy fuerte (× 1,4) |
| --------------------- | ------ | ------------------------ | ------------------ |
| Peregrina             | 10 %   | 70 % (final ganada 77 %) | 89 %               |
| Cernícala             | 14 %   | 66 % (68 %)              | 82 %               |
| Caracara              | 8 %    | 63 % (65 %)              | 86 %               |

Gerifalte llega delante de la jugadora en el 24-26 % de las Copas al nivel del dueño y en el 11-15 %
a × 1,4. Con 50 % del excedente (en vez de 80 %), a × 1,4 se ganaba el 90-96 %: no había desafío.
Con 100 % la final sería una moneda que no se entrena: se descartó.

## Consecuencias

- Exigente no es para la jugadora atenta (pasa 8-14 %): es el paso siguiente.
- Normal no cambia para la atenta (termina con su mejor stat cerca de 700, lejos del tope). B4 se
  vuelve a medir con el tope puesto.
- Hoy el tope de 900 casi no frena en una sola temporada: la mejor stat del dueño fue 841. Empieza a
  pesar cuando la herencia acumula stats entre temporadas.
- Gerifalte sigue de cerca a quien se hace más fuerte, pero entrenar sigue pagando: a × 1,4 todavía
  pierde 1 final de cada 6 a 9.
- Pendiente: llevar E1 a `pnpm balance:barandas` y hacer que la política de referencia de Exigente
  se acerque al dueño (las dos jugadoras «expertas» probadas no lo lograron: la diferencia del dueño
  viene de un uso más equilibrado del Simulador).
