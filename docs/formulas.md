# Fórmulas y constantes

Cada fórmula se documenta aquí **antes** de implementarse: intención, expresión, unidades, rango
esperado y constante(s) implicadas. Las constantes viven en `packages/sim/src/rulesets/v1/constants.ts`
y solo cambian con un reporte de `pnpm sim:batch` adjunto al PR.

Convención de unidades dentro del motor: enteros, escala 1000 (`1 m = 1000`, `1 m/s = 1000`),
multiplicadores en per-mille (`1000 = ×1.0`). Redondeo: floor, salvo que se diga otra cosa.

## Temporada

### Stats efectivas

Intención: una sola conversión de stats base a stats "del día" antes de entrenar o correr.
`S_eff = floor(S_base × m_mood × a_aptitud / 1000 / 1000)` con `m_mood ∈ {1100,1050,1000,980,950}`
para ánimo +2…−2 y `a_aptitud` por letra S…G = 1100, 1050, 1000, 950, 900, 850, 800, 700.
La aptitud de bioma multiplica `agility`; la de estilo multiplica `intelligence`. Rango: 1–1320.

### Ganancia de entrenamiento

Intención: el nivel de pista (1–5) fija la base, el ánimo y las cuadrillas presentes la escalan.
`gain = floor(base[level] × (1000 + Σ crewBonus) × m_mood × (1000 + growth) / 10^9)`, un solo
redondeo al final, con `base = [44, 52, 60, 68, 76]` (el brief proponía 8–14; con 48 turnos esa
base deja la temporada en ~135 por stat, lejos del objetivo 550–800, así que se recalibró en la
primera pasada y queda pendiente de `sim:season-batch` con el motor real) y `growth` el multiplicador
de la Falconess para esa stat (0–300 per-mille); nivel de pista = `1 + floor(usos / 4)`, máximo 5.
Cada entrenamiento simple sube además una stat secundaria al 50 % (`agility→technique`,
`stamina→courage`, `technique→agility`, `simulator→technique`); `risk-flight` da `courage ×1.5` y
`agility ×0.5`; `simulator` da `intelligence` y +5 puntos de habilidad. Rango por sesión: 5–30.

### Fallo de entrenamiento

`p_fail = 50 + floor(fatigue / 4)` per-mille para entrenamientos simples; `risk-flight` 120 con 30
de fallo grave (lesión: 2 turnos). Fallo = −(gain/2) en la stat y ánimo −1.

### Fatiga

Costos: entrenamientos simples +20, `risk-flight` +30, `simulator` +10, `workshop` +5, `rest` −40,
`outing` −10. `fatigue ≥ 80` fuerza `rest`. Rango 0–100.

### Cuadrillas en el hangar

Cada turno, cada fabricante del hangar aparece en los entrenamientos de sus stats con probabilidad
`350 + 50 × bondLevel` per-mille, `bondLevel = floor(bond / 20)`, bond 0–100.

## Carrera

(Se completa en la fase 2: `v_cruise`, `accel`, `hp_drain`, `f_seg`, boost, calor, pulsos, salto,
fatiga final, sprint final, activación de habilidades. Ver BRIEF §6.)

## Constantes v1 (valores iniciales, BRIEF §6)

| Constante       | Valor     | Intención                                        |
| --------------- | --------- | ------------------------------------------------ |
| `k_a`           | 0.35      | Cuánto pesa `agility` en la velocidad de crucero |
| `k_acc`         | 0.40 m/s² | Aceleración base                                 |
| `k_hp`          | 1.0       | Drenaje de hp por tick a velocidad base          |
| `k_s`           | 1.2       | Cuánto reduce `stamina` el drenaje               |
| `k_boost`       | 3.0 m/s   | Velocidad extra con boost                        |
| `k_e`           | 1.0       | Energía por tick de boost                        |
| `k_h`           | 2.0       | Calor por tick de boost                          |
| `k_cool`        | 1.0       | Enfriamiento por tick sin boost                  |
| `k_crash`       | 25        | Daño a durabilidad por salto fallido             |
| `k_jumpPenalty` | 20 ticks  | Ticks perdidos por salto fallido                 |
