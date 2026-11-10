# ADR-0010 · Barandas de balance y motor congelado

- **Estado:** aceptada por el dueño (2026-11-10).
- **Alcance:** carrera v3 (`race-v3-proto` hasta que entre al juego) y todo cambio de balance
  posterior.
- **Documento de diseño:** `docs/design/barandas-balance.md` (definición completa de cada baranda,
  cómo se mide y qué palanca usar).

## Contexto

En el prototipo de la carrera v3 cada desbalance se corrigió agregando o cambiando reglas del motor.
Cada regla movía a las demás y aparecían desbalances nuevos. Se medía contra 64 criterios propios,
muchos tan finos que se cumplían sin mejorar el juego. El informe sobre cómo equilibra Cygames
(`docs/design/research-balance-umamusume.md`) muestra la práctica contraria: reglas de carrera
estables, balance con contenido y rotación de pistas, desbalance local aceptado.

## Decisión

1. **Motor congelado.** La etapa 1 de la carrera v3 queda fija. Solo se corrigen errores (la conducta
   contradice la regla escrita). Ninguna regla de motor se agrega o se cambia para mover un número de
   balance.
2. **Ocho barandas, duras y sin cambio de umbral:**

   | #   | Baranda                  | Umbral                                                                            |
   | --- | ------------------------ | --------------------------------------------------------------------------------- |
   | B1  | Piso y techo por pista   | Ninguna posición < 15 % ni > 40 % (campo parejo, 9 pistas × 4 niveles, dos bases) |
   | B2  | Cada posición tiene casa | ≥ 1 pista por nivel donde es la mejor o queda a ≤ 2 puntos                        |
   | B3  | Reparto del calendario   | Cada posición entre 22 y 28 % a 450, 600 y 750                                    |
   | B4  | Falconess parejas        | Cada una ≥ 60 % (cota de Wilson) y ≤ 12 puntos entre la mejor y la peor           |
   | B5  | Agilidad como pilar      | +100 de Agilidad vale más que +100 de cualquier otra stat en todas las pistas     |
   | B6  | Azar acotado             | σ de una misma build ≤ 1,05 × la de v2 en cada pista                              |
   | B7  | Rendimiento              | `pnpm bench` p95 < 5 ms                                                           |
   | B8  | Lo viejo no se mueve     | v1, v2 y cada interruptor apagado: 0 bytes de diferencia                          |

   Un cambio de balance entra solo si pasan las ocho en las dos bases de semillas. Lo frágil (el
   intervalo cruza el umbral) se anota y no bloquea.
3. **Cuatro palancas de contenido, una por cambio**, de la más barata a la más cara: pistas y
   calendario, letras, crecimiento, kit (habilidad única o pasiva). Cada cambio lleva una nota de
   cambio de una línea para el jugador.
4. **Los demás criterios del prototipo pasan a informe**: se calculan y se publican, no bloquean.

## Consecuencias

- El trabajo de balance deja de perseguir celdas sueltas y se concentra en el conjunto (temporada y
  calendario).
- Un desbalance local que no rompe B1 es diseño, no error: es la «casa» de una posición.
- Cambiar un umbral de este ADR requiere un ADR nuevo con la decisión del dueño.
- Cuando la carrera v3 entre al juego, `pnpm sim:batch` y `pnpm sim:season-batch` reportan las ocho
  barandas, y CI falla si alguna no pasa.
