# Eventos en pausa y chatarra fuera (dueño, 2026-11-13)

El dueño sacó la chatarra del juego y puso en pausa los eventos de la temporada para reformularlos
y mejorarlos. Todo esto vale para la v3 (las temporadas nuevas); v1 y v2 quedan iguales, porque
tienen partidas y pruebas grabadas.

## Chatarra

- En la v3 las carreras ya no dan chatarra (`season/goals.ts`) y ningún evento la da ni la cobra.
  Nada de la v3 la gastaba: el re-sorteo de rasgos no está en el juego del celular.
- «Lo que pasó» ya no muestra «Chatarra»: solo aparece cuando cambia, y en la v3 no cambia.
- Un test lo vigila (`v3.test.ts`, «no scrap in v3»).

## Eventos

Ningún evento sale en la v3 (cada archivo lleva `rulesets` sin `v3`).

**Quitados** (daban chatarra):

- `boneyard-botch-1` (cuadrilla Boneyard)
- `sponsor-photo` (al azar)
- `caracara-scrap-run` (historia de Caracara, escrito a mano: **espera la aprobación del dueño**)

**En pausa** (para reformular):

- Cuadrillas: `altair-contract-1`, `koryu-data-session-1`, `lumiere-calibration-1`,
  `steinhaus-maintenance-1`.
- Resultado de carrera: `hard-loss`, `podium-interview`.
- Al azar: `sandstorm-week`.
- De suerte (se aplicaban solos): `luck-fan-letter`, `luck-head-cold`, `luck-long-sleep`,
  `luck-lost-goggles`, `luck-radio-critic`, `luck-rival-smile`, `luck-sky-gust`,
  `luck-stormy-night`, `luck-tailwind`, `luck-veteran-visit`, `luck-caracara-finger`,
  `luck-caracara-hammock`, `luck-cernicala-feather`, `luck-cernicala-notebook`,
  `luck-peregrina-late-replay`, `luck-peregrina-thermal`.
- De historia, escritos a mano (**esperan la aprobación del dueño** para tocar sus archivos):
  `caracara-ground-truth`, `cernicala-chart`, `cernicala-stillness`, `peregrina-first-dive`,
  `peregrina-speed-doubt`.

## Efecto en el balance (500 temporadas, política de referencia, Normal)

Muchos eventos de suerte eran malos (resfríos, noches sin dormir, lesiones), así que sin eventos la
temporada es más fácil:

| Falconess | Completa (antes → ahora) | B o mejor (antes → ahora) |
| --------- | ------------------------ | ------------------------- |
| Caracara  | 63 % → 75 %              | 63 % → 74 %               |
| Cernícala | 68 % → 77 %              | 68 % → 77 %               |
| Peregrina | 72 % → 84 %              | 72 % → 84 %               |

Al volver los eventos reformulados, medir de nuevo con el lote y las barandas.
