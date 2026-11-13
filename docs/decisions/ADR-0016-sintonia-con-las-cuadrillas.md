# ADR-0016 · Sintonía con las cuadrillas («3 + 1»)

- **Estado:** aceptada por el dueño (2026-11-13: «Aprobado, aplicalo con +25 %»).
- **Alcance:** la temporada del ruleset v3. v1 y v2 no cambian (B8: 0 bytes).
- **Relacionadas:** `docs/design/vinculo-sintonia.md` (el plan y las grillas), ADR-0006 (temporada
  v2), ADR-0014 (categorías: las metas de cada Falconess son suyas).

## Contexto

El bono de una cuadrilla (+15 %, Boneyard +20 %) estaba activo desde la semana 1 y el vínculo solo
subía la chance de que viniera. Medido: el vínculo valía 4-7 puntos de stats en una temporada
(0,2 %). En Umamusume el vínculo con una carta se sube para llegar al entrenamiento de amistad, que
es lo que hace grande una temporada; el dueño pidió ese ciclo.

## Decisión

1. **Una cuadrilla, un entrenamiento.** La que viene se para en uno solo de sus entrenamientos,
   sorteado con su propio `Rng(${seed}/crew/${turn}/${cuadrilla})`, y se ve antes de elegir.
2. **Sintonía.** `crewSync = { basePm: 100, minBond: 80, syncPm: 250 }`: +10 % hasta vínculo 80,
   +25 % desde 80. El `trainingBonus` de cada fabricante queda para v1/v2.
3. **Vínculo y presencia.** `crewPresenceBase` 350 → 500 (+50 por nivel, igual), `bondPerTraining`
   4 → 14, `bondPerOuting` 5 → 10; la Salida va con la cuadrilla que elige el jugador.
4. **La jugadora de referencia sigue a sus cuadrillas** (`crewTraining`, `outingInput` en
   `apps/cli/src/policy.ts`), solo en rulesets con `crewSync`: deja su plan por el entrenamiento de
   una cuadrilla cuando ese stat todavía le falta y rinde claramente más (su plan cuenta +10 %; una
   cuadrilla todavía sin sintonía, +12 %, porque el vínculo es una inversión).
5. **Peregrina, con sus propias metas.** Sus cuadrillas entrenan justo sus stats (Agilidad y
   Técnica) y la sintonía la subió de 82 a 91 % (B4 fallaba: brecha 14,9 / 17,5). Como en ADR-0014,
   se corrige con sus metas: `fieldPm` de sus cuatro metas con categoría en Normal +50 ‰
   (650 → 700, 800 → 850). Exigente y las otras dos no cambian.

## Medida

Jugadora de referencia, Normal (`.work/bond`, `.work/grades/pere-sync.ts`):

|           | Antes | Con sintonía | Con sintonía y metas de Peregrina +50 |
| --------- | ----- | ------------ | ------------------------------------- |
| Peregrina | 82 %  | 91-92 %      | 82-83 %                               |
| Cernícala | 76 %  | 76-78 %      | igual                                 |
| Caracara  | 74 %  | 73-77 %      | igual                                 |

La sintonía llega en la semana 25-28 y está en el 11-17 % de los entrenamientos de quien sigue a
sus cuadrillas. Entre +20 % y +30 % de sintonía hay ≈ 35 puntos de stats y 0-2 de completar: no hacía
falta +40 %.

Barandas (`pnpm balance:barandas`, dos bases, 1000 temporadas por Falconess y base):

|                       | Antes (dd1d9c8)     | Sintonía sola           | Sintonía + metas de Peregrina  |
| --------------------- | ------------------- | ----------------------- | ------------------------------ |
| B4 métrica 7 (v3a)    | 82 / 76 / 74 %      | 91,5 / 77,6 / 76,6 %    | 82,1 / 77,6 / 76,6 %           |
| B4 brecha (v3a / v3b) | 10,7 / 9,4 (frágil) | 14,9 / 17,5 (**falla**) | 5,5 / 8,0 (pasa)               |
| Veredicto             | PASA                | FALLA (B4)              | **PASA** · frágiles B2, B3, B7 |

B1-B3, B5, B6 y B8 dan lo mismo que antes (la carrera no cambió; B8 0 bytes); B7 es ruido de la
máquina (p95 3,79 ms).

## Consecuencias

- Una temporada v3 empezada antes de este cambio se reproduce con las reglas nuevas al recargar y
  puede cambiar (como pasó con las categorías y Milana).
- Los eventos de cuadrilla (los que pedían vínculo mínimo) siguen en pausa; al reformularlos, el
  vínculo puede ser su llave (opción 5 del plan).
- El factor `frameAffinity` de la caja negra se guarda pero nunca tuvo efecto (el BRIEF le asigna
  «+10 % aparición de su cuadrilla»): queda como candidato para conectar la herencia con el vínculo.
