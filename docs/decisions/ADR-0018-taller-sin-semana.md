# ADR-0018 · El taller no gasta la semana

- **Estado:** aceptada por el dueño (decidida el 2026-10-29 como T4 de `docs/design/temporada-v3.md`;
  permiso para tocar `packages/sim/src/rulesets/` el 2026-11-28: «vamos con el permiso para tocar
  los archivos protegidos»).
- **Alcance:** la temporada del ruleset v3. v1 y v2 no cambian (B8: 0 bytes, `v1-invariance`, golden).
- **Relacionadas:** `docs/design/temporada-v3.md` (T4 «Taller», T3 «Límite honesto»), ADR-0006
  (temporada v2, el RNG por entrada), ADR-0011 (v3 sin desgaste: no hay qué reparar), ADR-0016.

## Contexto

Hoy el taller es una acción de la semana (`RunInput.kind: "workshop"`): cierra la semana, cuesta
5 de vigor (`fatigueCost.workshop`) y corta la racha de entrenamiento. Nadie va: en el playtest 1
el dueño nunca entró, y la jugadora de referencia aprende solo en semanas livianas porque «una
habilidad casi no paga la semana que reemplaza» (T3, aprender en cuanto alcanza bajaba la nota B
10-15 puntos). El dueño decidió que el taller sea un botón del menú de la semana que se entra y se
sale sin que cuente como semana.

## Decisión

1. **Una entrada nueva, aditiva: `workshop:visit`**, con `ops` de 1 a 8 operaciones limitadas a
   `equip-frame` y `learn-skill` (las dos secciones del taller v3 sin desgaste ni piezas) y sin
   `position`. Ningún campo se renombra.
2. **La visita no es una semana.** No cierra la semana (ni carrera, ni evento, ni cambio de turno),
   no cuesta vigor, no toca el ánimo ni el fallo y no sortea nada. Queda en el log del turno como una
   entrada propia (`input` = la visita, nota `log.workshop`), así la partida se reproduce igual.
3. **`inputsApplied` no cuenta visitas.** El RNG de cada entrada es `seed/inputsApplied` (ADR-0006):
   si la visita contara, cada sorteo de la semana (entrenamiento, evento, cuadrillas) dependería de
   cuántas veces entró al taller. Sin contarla, la semana sortea lo mismo con o sin visita, y la
   única diferencia es lo que la visita cambió (alas, habilidades).
4. **La racha salta la visita.** `trainingStreak` sigue de largo sobre una visita (como sobre la
   elección de un evento) en vez de cortarse: entrar al taller no es descansar.
5. **El `workshop` viejo se conserva** para reproducir partidas guardadas: v1 y v2 lo siguen usando y
   v3 lo sigue aceptando (las temporadas v3 grabadas antes de este cambio lo tienen).
6. **Una bandera, `season.workshopVisit`**: `false` en v1 (y v2, que hereda su temporada), `true` en
   v3. Con `false` la visita se rechaza con `InvalidInputError`. Con un evento pendiente se rechaza
   como hoy cualquier entrada que no sea `event:choose`; con la temporada terminada, también.
7. **Política (`apps/cli/src/policy.ts`).** En un ruleset con la bandera, `workshopVisit` emite una
   visita con las habilidades que paga (`skillsToLearn`) en vez de la semana de taller; la cuidadosa
   aprende apenas puede pagar. Ninguna política cambia de alas. Contra un bucle sin fin: solo visita
   si hay algo para aprender, y como mucho `MAX_VISITS_PER_TURN` veces por turno. En v1 y v2 la
   política no cambia.

## Qué se va a medir

Después de automatizar la baranda nueva de Exigente (otra rama), con `pnpm balance:barandas`
entero en las dos bases:

- habilidades aprendidas por temporada de cada política (meta de T3: 2-3 activas lo normal);
- B4 (métrica 7 por Falconess y brecha) en Normal y Exigente: aprender antes sube a la de
  referencia, y las rivales de T3 se calibraron con un taller que costaba la semana;
- que B8 siga en 0 bytes (v1, v2 y los interruptores de v3).

## Consecuencias

- La semana deja de depender de la visita: una partida con y sin visita sortea igual.
- Un consumidor del log que tome cada entrada con `input` como una semana tiene que saltar las
  visitas (la web y `race-view` todavía no las conocen; se adaptan en la segunda mitad del plan).
- `fatigueCost.workshop` queda para el `workshop` viejo.

## Alternativas descartadas

- **Contar la visita en `inputsApplied`:** la semana sortearía distinto según cuántas veces se
  entró, y entrar y salir cambiaría el resultado del entrenamiento.
- **Cambiar el `workshop` de v3 en el lugar:** rompería la reproducción de las temporadas v3 ya
  guardadas.
- **Una entrada por operación:** más entradas en el log sin ganar nada; una visita ya agrupa lo que
  se hizo de una vez.
