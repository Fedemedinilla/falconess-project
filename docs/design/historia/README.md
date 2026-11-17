# Mapa de la historia de Falconess

**Regla del dueño (2026-11-17): no se escribe nada de la historia ni ninguna escena sin haber leído
antes, enteras, las dos biblias:** `docs/design/biblia-escritura.md` (cómo se escriben escenas y
diálogos) y `docs/design/investigacion-personajes.md` (cómo se construye un personaje vivo). El elenco de los ejemplos de la biblia de escritura (Brisa,
Kes, Ilo, Ruth, Ferrán, las escuderías Pampero, Vértice y Halcón Norte) es inventado para el manual:
no es canon.

Decidido con el dueño el 2026-11-16 (opción A del traspaso `docs/handoff/mapa-de-historia.md`). En
vez de un único mapa dibujado, seis piezas unidas por ids estables de personajes y escenas. El canon
lo decide el dueño; cada dato lleva su estado: **decidido** (con fecha), **propuesta** o **abierto**.

| Pieza                   | Qué contiene                                                                                          | Dónde                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 0. Bandeja de ideas     | Resumen de cada sesión («Estado») y todo lo que cuente el dueño, tal cual, con su estado y su destino | `ideas.md`                                                    |
| 1. Biblia del mundo     | Qué es una Falconess, alas, escuelas, carreras, economía, prensa, tono, glosario                      | `docs/world.md`                                               |
| 2. Biblias de personaje | Ficha, voz, cómo llama a cada otro, qué sabe, qué recuerdan de ella las otras historias               | `personajes/<id>.md` → `docs/characters/<id>.md` al aprobarse |
| 3. Cronología           | El canon de todas en una sola línea de tiempo                                                         | `cronologia.md`                                               |
| 4. Relaciones           | Quién conoce a quién, rivalidades, mentoras, escuelas; cómo se llaman entre sí                        | `relaciones.md`                                               |
| 5. Mapa de escenas      | Una fila por escena o chat, hecha o planeada; grilla de 48 semanas y orden del Modo Historia          | `mapa-de-escenas.md`                                          |

Aparte, `historia-principal.md` (el esqueleto de la historia principal) y `secretos.md`: lo que el dueño sabe y los personajes todavía no, con cuándo se revela cada
cosa (decidido 2026-11-16).

Las crónicas de cada Falconess siguen en `docs/design/canon-<falconess>.md` (`docs/design/canon.md`).

Los borradores de `personajes/` pasan a `docs/characters/` (carpeta protegida) solo con el visto
bueno del dueño para cada archivo.
