# Traspaso: generador de nombres compuestos

Para una sesión nueva de Claude Code en este repositorio (`falconess`, rama de trabajo
`playtest-ui`). Escrito el 2026-11-11 al cerrar otra sesión.

## Qué es el proyecto (en tres líneas)

Falconess es un juego de crianza estilo Umamusume Pretty Derby: el jugador entrena durante 48
semanas a una corredora adulta con alas mecánicas (una «Falconess») y la hace correr carreras
deterministas. Monorepo pnpm en TypeScript; leer `CLAUDE.md` (reglas no negociables) antes de tocar
nada. El dueño es hispanohablante: hablarle en español.

## El pedido del dueño

Las Falconess dejan de llamarse por su especie (hoy: Peregrina, Cernícala, Caracara y las rivales
Gerifalte, Esmerejona, Aguilucha). El dueño quiere **nombres compuestos y más reconocibles**, como
los de Umamusume: _Super Creek, Special Week, Nishino Flower, Silence Suzuka, Gold Ship, Tokai
Teio, Rice Shower, Twin Turbo_.

La tarea de esta sesión: **un programa básico que genere nombres de dos palabras juntando dos
mundos en uno.** Cada mundo es una lista de palabras; el nombre sale de tomar una de cada mundo.
**Qué mundos y universos se usan todavía no está decidido**: el dueño lo define después. El programa
tiene que dejar que se carguen y se cambien sin tocar código.

## Qué hacen bien los nombres de Umamusume (para orientar el diseño)

Son nombres reales de caballos de carreras japoneses, y por eso siguen patrones que conviene
copiar como forma, no como contenido:

- **Dos piezas de mundos distintos que juntas suenan a una identidad:** «Special» + «Week»,
  «Rice» + «Shower», «Gold» + «Ship». Ninguna de las dos piezas sola describe a la corredora.
- **Prefijo de familia o de criador (冠名):** Mejiro, Sakura, Nishino, Tokai, Symboli, Satono,
  Matikane. En Falconess podría ser la escuela o el fabricante (Kōryū, Steinhaus, Lumière, Altair,
  Boneyard): dejar la puerta abierta para un «mundo» que funcione como apellido.
- **Cortos y pronunciables:** el registro japonés limita los nombres a 9 caracteres en katakana;
  en la práctica, dos palabras de 1-3 sílabas cada una.
- **Ritmo:** casi siempre un primer elemento corto o fuerte y un segundo que cierra
  (_Twin Turbo_, _Gold Ship_).

## Lo que pido que haga la primera versión

1. **Mundos como datos.** Cada mundo es un archivo (JSON o texto, una palabra por línea) con
   nombre, idioma y palabras. Agregar un mundo es agregar un archivo.
2. **Generar pares.** Elegir dos mundos (o «cualquiera con cualquiera») y sacar N nombres.
3. **Reproducible.** Con la misma semilla, los mismos nombres. El repo ya tiene un PRNG
   determinista en `packages/rng` (`new Rng(seed)`, streams); usarlo en vez de `Math.random`.
4. **Filtros simples:** largo máximo (en caracteres y en palabras), sin repetir una palabra en el
   mismo nombre, sin nombres ya existentes en una lista de excluidos, y opción de orden fijo (mundo A
   primero) o libre.
5. **Salida cómoda para elegir:** lista en la terminal y, opcional, un archivo (CSV o Markdown) para
   marcar favoritos.
6. **Tests** de lo determinista (misma semilla → misma lista) y de los filtros.

No hace falta interfaz web ni IA en la primera versión. Si después se quiere sumar un modelo de
lenguaje para proponer palabras de un mundo, va como paso aparte y con el permiso del dueño.

## Dónde ponerlo y reglas del repo que aplican

- Herramienta de desarrollo, no parte del juego: por ejemplo `apps/cli/src/names.ts` con un script
  `pnpm names -- --a <mundo> --b <mundo> --n 30 --seed 1`, y los mundos en una carpeta de datos
  propia (por ejemplo `apps/cli/names/worlds/`). Proponerle al dueño la ubicación antes de crear
  carpetas nuevas en la raíz.
- **No tocar** `packages/sim`, `packages/schema`, `packages/content` ni los rulesets: renombrar las
  Falconess del juego es otra tarea, con su ADR, cuando el dueño elija los nombres.
- Prohibido `any`, `as unknown as` y `// @ts-ignore`. Antes de cada commit:
  `pnpm typecheck && pnpm test` y `npx biome check` sobre lo tocado. Nunca `biome --write` sobre
  `docs/`.
- Nunca `git stash` (usar commits WIP). Commits pequeños, en imperativo, con la identidad
  configurada del entorno.
- Al terminar, agregar una línea a «Lecciones aprendidas» de `CLAUDE.md` y documentar el comando en
  `docs/commands.md`.

## Preguntas abiertas para el dueño (hacerlas al empezar)

1. ¿Qué mundos quiere probar primero? (Si todavía no los tiene, armar dos o tres de ejemplo
   claramente marcados como provisorios.)
2. ¿En qué idioma van los nombres? Los de Umamusume son en inglés o japonés romanizado, aunque el
   juego esté en español.
3. ¿Quiere un tercer «mundo» opcional de apellido o casa (escuela, fabricante)?
