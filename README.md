# Falconess (nombre provisional)

Simulador de crianza con alas mecánicas: carreras todoterreno deterministas, sin pay-to-win.

- Diseño: `docs/BRIEF.md` · Plan: `docs/ROADMAP.md` · Fórmulas: `docs/formulas.md` · Decisiones: `docs/decisions/`
- Reglas para Claude Code: `CLAUDE.md`

## Empezar

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm content:validate
pnpm sim -- --seed 42 --falconess peregrina          # temporada con política fija, salida determinista
pnpm play -- --seed 42 --falconess cernicala         # temporada interactiva en texto (PT0)
pnpm sim:season-batch -- --runs 500                  # curva de stats y grades con la política de referencia
```

Falconess disponibles: `peregrina`, `cernicala`, `caracara`. Bastidores para `--hangar`:
`falke`, `erzherzog`, `sylphe`, `etoile`, `shiden`, `hayate`, `nimbus`, `horizon`, `mule`, `kite`,
`peregrina-signature`, `cernicala-signature`, `caracara-signature`.

## Estructura

```
packages/rng      PRNG determinista (xoshiro128**), streams, punto fijo
packages/schema   esquemas zod: la única definición de datos
packages/content  JSON validado del juego + textos (es)
packages/sim      núcleo puro: stats, temporada, (fase 2) motor de carrera
apps/cli          sim, play, season-batch, content-validate
```
