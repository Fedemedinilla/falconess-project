# ADR-0009: Un efecto de vuelo para las pasivas (borrador v3)

- Estado: **borrador** (prototipo `.work/design7`, rama `race-v3-proto`); pendiente de que el dueño
  lo apruebe y de que el ruleset v3 deje de ser borrador.
- Fecha: 2026-11-09 (recorte por distancia: 2026-11-10)
- Alcance: schema (`skill`: `PassiveSkill.flight`, `SkillFlight.diveVPmDistance`; `race`: `RaceTraits.diveSkill`, evento `dive`:
  `skillMms`, `skillId`), content (`skills/talon-lock.json`), sim (`freezeEntry`, `planFlights`,
  el toque de la picada, el registro), docs.
- Contexto de diseño: decisión del dueño del 2026-11-09, opción 3 («subir lo débil con su propio
  kit»); medición en `.work/design7/measure/homes-final.md`.

## Contexto

En el borrador v3 Peregrina es la Falconess más floja (métrica 7: 64,9 % [61,9-67,8] en el arnés,
66 % en 4000 temporadas) y su meta difícil, la T46 (ridge, 3.ª o mejor), es un espejo de Remates
donde pierde contra rivales de más Agilidad. Su pasiva firma, «Garra fija» (`talon-lock`), habla el
vocabulario de v1: pulsos y bajadas en el suelo. En v3 la Remate vuela por encima de la Bajada de
la final y la pasiva casi no actúa. La Agilidad no es la perilla (dueño, ronda 5).

Cygames, cuando un estilo o una corredora quedan atrás, no baja a las otras: reescribe la única de
la débil (3.er aniversario: «KEEP IT REAL.», «ブレイクスルー») o le da habilidades propias (8 de
Oikomi). El dueño eligió ese camino: darle a «Garra fija» un efecto de vuelo, sin tocar la Agilidad
ni a las rivales.

El esquema de habilidades no tiene dónde decirlo: `RaceModifier` es la lista de efectos de v1 y v2,
y agregarle un miembro obliga a v1 y v2 a tener un manejador para él.

## Decisión

1. **Campo nuevo, opcional y solo de v3:** `PassiveSkill.flight` (`SkillFlight`):

   | Campo          | Tipo         | Significado                                                |
   | -------------- | ------------ | ---------------------------------------------------------- |
   | `diveFromBand` | entero 2-3   | la banda más baja desde la que actúa (2 = alta, 3 = techo) |
   | `diveVPm`      | entero 0-500 | ‰ de Δv que suma a una picada desde esa banda o más arriba |

   v1 y v2 no lo leen. v3 lo lee solo con la constante de vuelo `skillFlight` (`FLIGHT_OFF_HOMES`
   la apaga).
2. **Entra a la carrera como rasgo:** `freezeEntry` lo copia a `RaceTraits.diveSkill`
   (`{ fromBand, pm }`) solo si `skillFlight` está prendida y la pasiva lo trae. Sin él el rasgo no
   existe (no es `null`: el JSON de la entrada queda igual).
3. **La física:** `planFlights` multiplica el Δv de la picada de esas bandas por `(1000 + pm) / 1000`
   (una vez, sobre los mm/s, antes de pasar a vu). Todo lo demás de la picada (la parte que gana en
   el aire, el nervio, la línea ganada, el freno `kDecel`) actúa igual sobre ese Δv. No hay sorteos
   nuevos; nada lee la posición de otra corredora.
4. **El registro:** el evento `dive` suma dos campos opcionales, `skillMms` (la parte de `gainMms`
   que puso la pasiva) y `skillId` (la pasiva). Solo aparecen cuando una pasiva cambió esa picada,
   así que los registros de v1, v2 y de v3 con la perilla apagada no cambian. La vista puede
   mostrar «Garra fija» leyendo el registro, sin texto fijo.
5. **Contenido:** `talon-lock.json` suma `"flight": { "diveFromBand": 2, "diveVPm": 500 }`. Los
   modificadores de v1 no cambian.
6. **Recorte por distancia (dueño 2026-11-09, `trim-final.md`):** `SkillFlight` suma un campo
   opcional, `diveVPmDistance` (‰ por distancia de carrera: `sprint`, `mile`, `medium`, `long`,
   cada uno 0-500). Con la constante de vuelo `skillFlightDistance` prendida, `freezeEntry` copia al
   rasgo el ‰ de la distancia de la pista (la misma regla de longitud que las letras de distancia);
   sin ella, `diveVPm` en todas (`FLIGHT_OFF_TRIM`, las casas de 5f470a2 byte a byte, `INV-14`).
   Garra fija: Sprint 100, Milla 250, Media 500, Larga 500. El rasgo de la entrada ya dice el ‰ de
   esa carrera, así que el registro y la vista lo leen sin saber la distancia.

## Consecuencias

- Peregrina, 4000 temporadas por punto (dos bases): métrica 7 66,0 → 71,8 % [70,3-73,1]; fallas en
  la T46 713 → 588. Las otras dos no cambian (las rivales no tienen pasiva). Ver
  `homes-final.md` para el arnés completo.
- **Inflación:** es un bono, no un ajuste neutro. Una picada de Peregrina desde el techo gana la
  mitad más de Δv (≈ 2,25 veces los metros nominales del empuje). Si cada Falconess floja recibe su
  bono, el techo de lo que una pasiva hace en el aire sube con cada una (lo que el informe sobre
  Cygames llama inflación). Antes de dar el segundo, medir las tres juntas y fijar un tope común
  (por ejemplo, ningún efecto de vuelo de pasiva vale más de X m pareados en su pista más fuerte).
- Medido (`homes-final.md`, Desbalances): en un espejo de 8 Remates a 600, Peregrina gana sprint 11,8 → 25,6 %, Milla
  +8-9 puntos, Media +7, Larga +2. En el caso del dueño (Sprint, 1500 carreras por par) la Caracara B gana 35,6 → 14,5 %
  contra la Peregrina de su Agilidad con poca Resistencia. **Resuelto con el punto 6** (recorte por distancia, como
  las condiciones de distancia de las habilidades de Umamusume y la lección 1 del informe: sin gacha se puede bajar con
  nota de cambio): ver `trim-final.md`.
- Nota de cambio (para el jugador): «Garra fija: bajamos el bono de la picada desde arriba a +10 % en el Sprint y +25 % en
  la Milla (sigue +50 % en la Media y la Larga), porque en las pistas cortas la picada ya valía más y la pasiva le ganaba
  carreras a la que había puesto Resistencia».
- Los campos de prueba del arnés (fixtures neutras) no tienen pasiva: las tablas de posiciones no
  cambian con este ADR.
- Golden v1/v2 y `v1-invariance` sin cambios. `INV-13` (`homes/inv13.ts`) prueba que con
  `FLIGHT_OFF_HOMES` el v3 es el pulido de balance (6e98e90) byte a byte, con una parte que corre a
  Peregrina con su pasiva en registros full.
- Queda abierta la puerta para que otras pasivas tengan efectos de vuelo (otro campo opcional de
  `SkillFlight`), siempre detrás de su perilla.

## Alternativas descartadas

- **Un miembro nuevo de `RaceModifier`:** obliga a v1 y v2 a manejarlo y mezcla el vocabulario
  del suelo con el del aire.
- **Solo desde el techo (`diveFromBand` 3):** con +500 ‰ daba 70,5 % [69,1-71,9]; desde la banda alta
  también cuentan sus picadas tras una línea perdida en el techo, y la cota de Wilson queda en 70,3.
- **Bonos más chicos (+150 / +300 ‰ desde el techo):** 67,0 y 68,2 %: no llegan al 70.
- **Tocar la Agilidad de Peregrina o de sus rivales:** el dueño la sacó como perilla (ronda 5).
