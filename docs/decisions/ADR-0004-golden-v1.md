# ADR-0004: Fijar los golden v1 del motor de carrera

- Estado: aceptado
- Fecha: 2026-10-28
- Alcance: sim, proceso

## Contexto

BRIEF §12 y `docs/race-engine.md` §24.3 piden logs de referencia por semilla, idénticos byte a byte,
para que cualquier cambio del motor, de las reglas o del contenido que mueva un resultado sea
visible y deliberado. El motor v1 reproduce el prototipo de la especificación (28 080 de 28 172
escenarios antes de D50, 100 % después) y tiene integradas las decisiones D50-D55 (ADR-0003).

## Decisión

Se generan y versionan doce logs completos en `tests/golden/v1/` con `pnpm golden:update -- --yes`:
- g01-g03: campo genérico de ocho bastidores reales en las tres pistas del desierto;
- g04-g09: campos de temporada de `generateField` en los turnos 24 y 46 (Caracara, Peregrina y
  Cernícala alrededor de su bastidor);
- g10-g12: campos de borde (licencia de sobrecalentamiento, pulsos, lucky-bolt, inmunidad).

La generación se corrió dos veces con salida idéntica. `pnpm test:golden` los compara con JSON
canónico. Un salto fallido forzado (§24.3 d) no es construible con el contenido v1 (la reserva de
salto siempre alcanza); queda cubierto por tests unitarios del motor.

## Consecuencias

Regenerar estos archivos es una decisión: cualquier PR que los cambie trae una línea de ADR con qué
cambió y por qué los nuevos logs son correctos. Un cambio de `FIELD` o de `generateField` mueve
g04-g09. Los archivos pesan ≈ 1,5 MB en total.
