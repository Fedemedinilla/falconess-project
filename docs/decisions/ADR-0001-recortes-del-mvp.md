# ADR-0001: Recortar gacha y multiplayer del MVP conservando sus bases

- Estado: aceptado
- Fecha: 2026-10-27
- Alcance: proceso, schema

## Contexto

BRIEF §9 pide el gacha completo en v0 sobre moneda ganada y §10 la preparación para multiplayer.
El objetivo del MVP (ROADMAP §4, PT3) es saber si un tester quiere una segunda temporada. Ni el
gacha ni las ligas aportan a esa pregunta y ambos consumen semanas. El dueño del proyecto pidió
concentrar el esfuerzo en la variedad del dominio (Falconess, stats, marcas, estilos, bastidores,
piezas) y dejar la puerta abierta a lo recortado.

## Decisión

1. Gacha: queda fuera del MVP. Se conservan el esquema `GachaPool`, un `content/gacha.json`
   validado y las monedas (`feathers`, `scrap`) en `SeasonState`. No se implementa tirada ni pantalla.
2. Multiplayer: queda fuera del MVP. Se conservan las cinco decisiones de arquitectura de BRIEF §10
   (sim pura, semilla + inputs, `rulesetVersion`, `Build` exportable, presentación que solo lee logs).
   La verificación Node = Deno pasa a opcional.
3. Pruebas jugables en texto desde `apps/cli` antes de la interfaz (PT0 en D7, PT1 en D14).
4. Generador con IA solo para eventos; habilidades y peculiaridades del MVP se escriben a mano.
5. Evaluación de voz obligatoria solo para Peregrina antes de PT3.

## Consecuencias

Reincorporar el gacha es agregar `rollGacha` en `sim` y una pantalla; reincorporar ligas es una
Edge Function que importa `@falconess/sim`. Ninguna de las dos toca el núcleo. El hangar del MVP se
arma con los seis bastidores desbloqueados desde el inicio.

## Alternativas descartadas

Implementar el gacha "porque es configuración": era código, pantalla y balance de economía que PT3
no puede evaluar.
