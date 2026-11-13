# Falconess (nombre provisional): informe técnico para Claude Code

Oct 27, 2026 · @Federico Medinilla

## 1. Resumen del proyecto y alcance

Falconess es un simulador de crianza (raising sim) estilo Umamusume: el jugador entrena a una corredora adulta con alas mecánicas desmontables durante una temporada de 48 turnos y la lleva a carreras todoterreno que se simulan de forma determinista y se reproducen en pantalla sin interacción. Este documento está pensado para exportarse a Markdown dentro del repositorio (`docs/BRIEF.md`) y servir de fuente de verdad para Claude Code; por eso toda estructura se expresa en texto y los identificadores de código van en inglés.

**Nombre provisional:** el repositorio se llama `falconess`; el nombre comercial se decide después y no debe aparecer hardcodeado en código ni en claves de guardado.

**Cuatro pilares que todo cambio debe respetar:**

1. Waifu-factible: elenco de seis Falconess adultas basadas en especies reales de rapaces; el arte de personajes es escaso y caro, el arte de alas es modular y barato.
2. Gacha sin pay-to-win: dos pools (personajes y bastidores), piezas sueltas nunca en gacha, bastidor genérico al 85–90 % del firma, ligas con clase de equipo igualado.
3. Simulación con builds únicas: 5 stats de Falconess, 4 stats de alas, 1 regla por fabricante, 3 presupuestos en carrera (resistencia física, energía, calor) más durabilidad.
4. Gameplay de menús y carrera visible no interactiva: el jugador decide en paneles; la carrera es un log reproducido por Phaser.

**Alcance del MVP (día 30):** 3 Falconess (Peregrina, Cernícala, Caracara), 3 pistas (sin biomas: mismo terreno y mismo clima, ADR-0007), 4 bastidores gacha (uno por fabricante) + 2 Boneyard, 8 piezas, 15 habilidades, 40 eventos, 1 temporada completa jugable en navegador, publicada en itch.io con arte provisional.

**Pistas abstractas (ADR-0007, 2026-10-31):** una pista no conoce biomas ni clima. Solo sabe qué rasgos tiene: Salto (`jump`), Terreno líquido (`water`), Colina (`climb`), Bajada (`descent`), curvas (`curves`), llano (`flat`) y pasillo (`canyon`, hoy sin efecto propio). La piel visual puede cambiar por pista (una colina puede ser una montaña, un edificio o una duna); las reglas no lo leen. No hay viento. Los biomas se agregarán después solo si hacen falta.

**Fuera de alcance en v0:** dinero real, multiplayer, audio final, localización (pero las claves de texto se externalizan desde el día 1), Claude en runtime, build de escritorio.

**Orden de construcción obligatorio:** núcleo de simulación con pruebas → motor de carrera y simulador por lotes → esquemas y contenido → interfaz. No se escribe interfaz hasta que `pnpm sim -- --seed 42` produce el mismo log en dos ejecuciones.

## 2. Arquitectura no negociable

La regla central: **la simulación es una función pura** `simulateRace(ruleset, entries, course, seed) → RaceLog` y `advanceSeason(ruleset, state, action, seed) → state'`. Nada en `packages/sim` importa DOM, `Date`, `Math.random`, Phaser, React ni Supabase. Todo lo demás consume el estado o el log.

```
falconess/
├─ packages/
│  ├─ sim/        # Núcleo puro: stats, entrenamiento, motor de carrera, herencia. Cero dependencias.
│  ├─ schema/     # Esquemas zod de contenido, estado, saves y formatos de intercambio. Exporta tipos.
│  ├─ content/    # JSON validado: falconess/, frames/, parts/, manufacturers/, skills/, events/, courses/, text/es.json
│  ├─ rng/        # PRNG determinista (xoshiro128**), streams por subsistema, utilidades de punto fijo.
│  └─ ui-kit/     # Componentes React reutilizables (tablas de stats, gráficos uPlot, calendario). Sin lógica de juego.
├─ apps/
│  ├─ web/        # Vite + React. Paneles, hangar, pre-carrera; monta la escena Phaser del log.
│  └─ cli/        # `pnpm sim`, `pnpm sim:batch`, `pnpm content:validate`, `pnpm content:gen`.
├─ tools/
│  ├─ generators/ # Agentes Claude que producen contenido validado con packages/schema.
│  ├─ evals/      # Evaluación de voz por personaje (pass rate) y golden situations.
│  └─ prompts/    # Prompts versionados de generadores y jueces.
├─ supabase/      # Migraciones, políticas RLS, Edge Functions (fase multiplayer).
├─ docs/          # BRIEF.md (este documento), formulas.md, characters/<id>.md, decisions/ADR-*.md
├─ tests/golden/  # Logs de referencia por semilla y versión de reglas.
└─ CLAUDE.md
```

**Reglas de determinismo (se verifican con tests, no con buena voluntad):**

1. Toda aleatoriedad pasa por `rng.next(stream)`; los streams son `training`, `events`, `race`, `gacha`, `quirks`. Un cambio en la interfaz nunca altera un resultado.
2. Aritmética de carrera en enteros con escala fija (`1 m = 1000 unidades`, `1 m/s = 1000 unidades`). Prohibidos `Math.pow`, `Math.sin` y divisiones flotantes en `packages/sim`; se usan tablas y multiplicaciones enteras con redondeo definido.
3. Un run se guarda como semilla + lista de inputs (`RunInput[]`), nunca como snapshots de estado. El estado se reconstruye reproduciendo; es la base del replay, del anti-cheat y del intercambio.
4. Todo contenido y todo estado lleva `rulesetVersion`. El motor conserva las reglas antiguas por versión en `packages/sim/rulesets/`.
5. La presentación (`apps/web`, Phaser) lee el `RaceLog` y no recalcula nada; si necesita un dato que no está en el log, el log se amplía.
6. Los textos visibles viven en `packages/content/text/<lang>.json` con claves; el código nunca contiene prosa de juego.

**Flujo de datos:** `content/*.json` → `schema` (validación en build y en carga) → `sim` (estado y log) → `apps/web` (paneles) y escena Phaser (reproducción). En multiplayer, el cliente envía `Build` + `RunInput[]` y la Edge Function ejecuta el mismo `packages/sim` con la semilla del servidor.

## 3. Stack técnico y herramientas

Todo en TypeScript estricto; no se agrega ningún lenguaje ni runtime adicional. Claude Code debe verificar versiones exactas con `pnpm view <paquete> version` antes de fijarlas en `package.json`; las de abajo son las esperadas a octubre de 2026 y pueden haber cambiado.

| Capa                | Herramienta                                                | Uso                                                                       | Notas                                                                                |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Runtime             | Node LTS vigente + pnpm workspaces                         | Monorepo                                                                  | `engines` fijado; `.nvmrc`                                                           |
| Lenguaje            | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess` | Todo el código                                                            | Prohibido `any`; `unknown` + narrowing                                               |
| Validación          | zod (última mayor estable)                                 | Contenido, estado, saves, API                                             | Un esquema = una fuente de verdad; tipos inferidos con `z.infer`                     |
| Pruebas             | Vitest + fast-check                                        | Unitarias, propiedades, golden                                            | `vitest related` en hooks                                                            |
| E2E                 | Playwright                                                 | Flujos de interfaz                                                        | Solo desde la semana 4                                                               |
| Lint/formato        | Biome (o ESLint + Prettier si Biome no cubre algo)         | Calidad                                                                   | Regla custom: prohibir `Math.random` y `Date` en `packages/sim`                      |
| Interfaz            | Vite + React 19 + CSS Modules                              | Paneles, hangar, calendario                                               | Sin librería de estado global: estado del juego vive en `sim`, React solo lo refleja |
| Gráficos            | uPlot                                                      | Curvas de velocidad, energía y calor                                      | Canvas, liviano                                                                      |
| Escena de carrera   | Phaser 4.x (versión estable vigente)                       | Reproducción del `RaceLog`                                                | Instalar sus skills oficiales en `.claude/skills/`                                   |
| CLI                 | tsx                                                        | `apps/cli`                                                                | Scripts de simulación y contenido                                                    |
| Backend (fase 2)    | Supabase (Auth, Postgres + RLS, Edge Functions en Deno)    | Saves, ligas, intercambio                                                 | `packages/sim` debe compilar para Deno sin cambios                                   |
| Hosting             | Vercel (web)                                               | Despliegue de `apps/web`                                                  | Preview por PR                                                                       |
| CI                  | GitHub Actions                                             | `typecheck`, `test`, `content:validate`, `sim:batch` con reporte en el PR | Claude Code en modo `-p` para el reporte de balance                                  |
| IA en desarrollo    | Anthropic SDK (TypeScript) con salidas estructuradas       | `tools/generators`, `tools/evals`                                         | Esquema zod → JSON Schema; Batch API para lotes grandes                              |
| Escritorio (fase 3) | Tauri o Electron, a decidir                                | Build para Steam                                                          | Evaluar Steamworks desde webview antes de elegir                                     |

**Scripts raíz esperados:** `pnpm typecheck`, `pnpm test`, `pnpm test:golden`, `pnpm content:validate`, `pnpm content:gen -- <tipo>`, `pnpm sim -- --seed <n> --falconess <id> --frame <id> --course <id>`, `pnpm sim:batch -- --runs 10000 --report out/balance.json`, `pnpm evals:voice -- <falconessId>`, `pnpm dev` (web).

## 4. Modelo de dominio y esquemas zod

Once entidades, todas con `id` tipo slug (`kebab-case`), `version` y validación zod en `packages/schema`. Los esquemas de abajo son el punto de partida; Claude Code los completa, pero no cambia nombres de campo sin un ADR en `docs/decisions/`.

| Entidad              | Archivo de contenido              | Rol                                                                                                                                      |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Falconess`          | `content/falconess/<id>.json`     | Personaje: stats base, crecimiento, aptitudes por posición, posición preferida, habilidades únicas, patrocinador, objetivos de temporada |
| `Manufacturer`       | `content/manufacturers/<id>.json` | Regla mecánica (`rule`), paleta, cuadrilla, pistas casa y débil                                                                          |
| `Frame` (bastidor)   | `content/frames/<id>.json`        | Stats de alas, estilo, fabricante, pasivo, rareza, `signatureOf?`                                                                        |
| `Part` (pieza)       | `content/parts/<id>.json`         | Tipo (`turbine`, `battery`, `stabilizer`, `firmware`), fabricante, modificadores                                                         |
| `Quirk`              | `content/quirks.json`             | Peculiaridades sorteables de Boneyard                                                                                                    |
| `Skill`              | `content/skills/<id>.json`        | Condición de activación, efecto, duración, costo                                                                                         |
| `Event`              | `content/events/<id>.json`        | Evento de entrenamiento: condiciones, opciones, efectos, claves de texto                                                                 |
| `Course` + `Segment` | `content/courses/<id>.json`       | Longitud, rasgos, lista de segmentos tipados                                                                                             |
| `Crew`               | dentro de `Manufacturer`          | Cuadrilla: bonificaciones de entrenamiento y eventos propios                                                                             |
| `SeasonState`        | runtime y save                    | Estado de una crianza en curso                                                                                                           |
| `BlackBox`           | save e intercambio                | Herencia: factores azules, rojos y verdes                                                                                                |
| `Build`              | intercambio y ligas               | Falconess final + bastidor + piezas + habilidades, firmable                                                                              |

```ts
// packages/schema/src/core.ts (extracto inicial)
import { z } from "zod";

export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const Stat = z.number().int().min(1).max(1200);
export const Aptitude = z.enum(["S", "A", "B", "C", "D", "E", "F", "G"]);
export const Style = z.enum(["dive", "hover", "glide", "ground"]); // Picada, Suspensión, Planeo, Rasante
export const Position = z.enum(["lead", "pack", "stalk", "closer"]); // Punta, Pelotón, Acecho, Remate (ADR-0008)
export const SegmentType = z.enum([
  "flat",
  "climb",
  "descent",
  "jump",
  "water",
  "canyon",
  "curves",
]);

export const FalconessStats = z.object({
  agility: Stat,
  stamina: Stat,
  technique: Stat,
  courage: Stat,
  intelligence: Stat,
});

export const Falconess = z.object({
  id: Slug,
  version: z.number().int(),
  species: z.string(),
  baseStats: FalconessStats,
  growth: z.record(
    z.enum(["agility", "stamina", "technique", "courage", "intelligence"]),
    z.number().min(0).max(0.3),
  ),
  positionAptitude: z.record(Position, Aptitude), // ADR-0008: la letra es de la posición
  preferredPosition: Position,
  uniqueSkills: z.array(Slug).max(2),
  sponsor: Slug, // manufacturer id
  seasonGoals: z.array(
    z.object({ turn: z.number().int(), courseId: Slug, minPlace: z.number().int() }),
  ),
  textKey: z.string(),
});

export const FrameStats = z.object({
  powerToWeight: z.number().min(0.5).max(1.6), // multiplicador
  energy: z.number().int().min(40).max(140), // unidades de boost
  dissipation: z.number().int().min(30).max(100), // umbral de calor
  durability: z.number().int().min(50).max(200),
});

export const Frame = z.object({
  id: Slug,
  version: z.number().int(),
  manufacturer: Slug,
  style: Style,
  rarity: z.enum(["R", "SR", "SSR"]),
  stats: FrameStats,
  passive: Slug, // skill id de efecto pasivo
  signatureOf: Slug.optional(), // falconess id si es alas firma
  quirkSlots: z.number().int().min(0).max(2),
});

export const Part = z.object({
  id: Slug,
  type: z.enum(["turbine", "battery", "stabilizer", "firmware"]),
  manufacturer: Slug,
  mods: z.object({
    powerToWeight: z.number().default(0),
    energy: z.number().int().default(0),
    dissipation: z.number().int().default(0),
    durability: z.number().int().default(0),
    skillSlots: z.number().int().default(0),
  }),
});

export const Skill = z.object({
  id: Slug,
  trigger: z.object({
    phase: z.enum(["start", "middle", "final", "any"]).default("any"),
    segment: SegmentType.optional(),
    positionRange: z.tuple([z.number(), z.number()]).optional(),
    heatAbove: z.number().optional(),
    energyBelow: z.number().optional(),
    once: z.boolean().default(true),
  }),
  effect: z.object({
    speed: z.number().default(0),
    accel: z.number().default(0),
    energyRefund: z.number().default(0),
    heatCool: z.number().default(0),
    durabilityGuard: z.boolean().default(false),
    durationTicks: z.number().int().default(0),
  }),
  activationBase: z.number().min(0).max(1).default(1), // 1 = usa la fórmula de Inteligencia
});

export const Build = z.object({
  rulesetVersion: z.string(),
  falconessId: Slug,
  finalStats: FalconessStats,
  positionAptitude: z.record(Position, Aptitude),
  frameId: Slug,
  parts: z.array(Slug).max(4),
  quirks: z.array(Slug).max(2),
  skills: z.array(Slug),
  seed: z.string(),
  inputs: z.array(z.unknown()), // RunInput[] para reproducir la crianza
  hash: z.string(),
  signature: z.string().optional(), // firma del servidor en ligas
});
```

**Reglas de esquema:** `content:validate` falla el build si un JSON no pasa; los `textKey` deben existir en `text/es.json`; toda referencia por id se resuelve en un índice cargado una sola vez (`loadContent()`), y un id inexistente es error de build, no de runtime.

## 5. Stats, recursos, estilos, posiciones y aptitudes

Cinco stats de Falconess (1–1200, como Umamusume), cuatro stats de alas que solo multiplican o presupuestan, y tres recursos que se consumen en carrera más la durabilidad. Cada stat de alas tiene una stat "dueña" para que el jugador sepa qué entrenar.

**Ruleset v3 (ADR-0011, carrera con vuelo, el que juegan las temporadas nuevas):** las alas pierden sus stats y sus reglas de fabricante. Todas corren con el mismo perfil (PW 1,0, energía 100, disipación 60); el estilo queda como gesto de despegue (Lanza, Columna, Rampa, Turbina). Las alas no se gastan ni se rompen: no hay desgaste ni reparación, y la durabilidad no cuenta en carrera. Piezas y peculiaridades no tienen efecto en carrera. La pasiva firma es de la Falconess (`Falconess.passive`) y corre con ella en cualquier ala. Lo que sigue en esta sección vale para v1 y v2, que se conservan.

| Stat de Falconess | Gobierna en carrera                                                                                   | Gobierna en entrenamiento            |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `agility`         | Velocidad de crucero; penalización en `curves`                                                        | —                                    |
| `stamina`         | Reserva física (HP)                                                                                   | Reduce el desgaste por entrenamiento |
| `technique`       | Aceleración; éxito en `jump`; eficiencia en obstáculos                                                | Mejora el taller (tuning)            |
| `courage`         | Reduce la penalización de fatiga en fase final; eleva la tolerancia al calor antes de cortar el boost | Permite "vuelo de riesgo"            |
| `intelligence`    | Probabilidad de activar habilidades; decisión de boost y de pulsos; posicionamiento                   | Simulador                            |

| Stat de alas    | Tipo                  | Stat dueña              | Efecto                                           |
| --------------- | --------------------- | ----------------------- | ------------------------------------------------ |
| `powerToWeight` | Multiplicador 0,5–1,6 | `agility` y `technique` | Escala crucero y aceleración                     |
| `energy`        | Presupuesto 40–140    | `intelligence`          | Unidades de boost y sustentación disponibles     |
| `dissipation`   | Umbral 30–100         | `courage`               | Calor tolerable antes de penalización            |
| `durability`    | Presupuesto 50–200    | `technique`             | Daño absorbible por saltos fallidos y obstáculos |

**Recursos en carrera:** `hp` (física; se agota → velocidad cae a mínimo), `energy` (boost; se agota → sin boost), `heat` (sube con boost, baja sin boost; sobre `dissipation` → penalización de velocidad y daño), `durability` (si llega a 0, `powerToWeight` se reduce un 25 % el resto de la carrera).

**Estilos (`Style`) y posiciones (`Position`).** Desde ADR-0008 el estilo es de las **alas** y pone su física; la **posición** se elige antes de cada carrera y decide cómo administra la energía. Cada estilo trae su posición por defecto, que es el comportamiento que tenía antes: con ella la carrera sale idéntica.

| Estilo (alas)        | Física de las alas (sigue en cualquier posición)                                             | Posición por defecto |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------- |
| `dive` (Picada)      | Empuje × 1,4 en descensos y en el sprint final                                               | Remate               |
| `hover` (Suspensión) | Rebufo en el pelotón medio (fase media)                                                      | Acecho               |
| `glide` (Planeo)     | Aceleración × 1,1 en la salida; crucero eficiente mientras lidera                            | Punta                |
| `ground` (Rasante)   | Evita `jump` por rutas de suelo más largas, sin despegue ni aterrizaje; resiste daño (× 0,5) | Pelotón              |

| Posición          | Cómo administra la energía (controlador)                                                   | Fase donde brilla      |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| `lead` (Punta)    | Gasta en la salida y la fase media para tomar la punta mientras le queda más del 60 %      | Salida y media         |
| `pack` (Pelotón)  | Ritmo parejo (60 % del tanque menos los saltos) hasta la final; ahí sprinta como todas     | Constante              |
| `stalk` (Acecho)  | En el pelotón medio, recupera si queda atrás (guarda el 50 %); ataca al 70 % del recorrido | Media y ataque al 70 % |
| `closer` (Remate) | Conserva energía y hp; gasta en los descensos y en el sprint final (guarda el 50 %)        | Final                  |

Las rivales corren en la posición de sus alas (ADR-0008, por ahora). El jugador la elige en la semana de carrera (si no elige, corre en la de sus alas).

**Aptitudes:** multiplicadores por letra de **posición**: S 1,10 · A 1,05 · B 1,00 · C 0,95 · D 0,90 · E 0,85 · F 0,80 · G 0,70. La letra de la posición elegida multiplica `intelligence` efectiva (peor posición = peores decisiones de boost); las alas no tienen letra (ADR-0008: cada letra de estilo pasó a la posición por defecto de ese estilo). `agility` no lleva letra (ADR-0007 quitó la aptitud de bioma). Es la misma lógica que la aptitud de distancia y de estilo de carrera en Umamusume, reconstruida por la comunidad.

**Distancias (ruleset v3, ADR-0011):** cuatro distancias por el largo de la pista (Sprint ≤ 1400 m, Milla ≤ 1800 m, Media ≤ 2400 m, Larga) y una letra por distancia para cada Falconess, en escalera (Peregrina A-A-B-C, Cernícala C-B-A-B, Caracara C-C-B-A). La letra actúa en el vuelo (B es el cero, A +3 %, C −3 %); las rivales son B. La caja negra sube como máximo una letra de distancia, hasta B. Nueve pistas en el catálogo v3 (Sprint; Escalera, Mirador; Pista de saltos, Circuito, Escapada; Cielo abierto, Pista larga, Travesía) y un calendario con pista del mes (`packages/content/calendars/v3.json`).

**Ánimo:** cinco niveles que multiplican todas las stats efectivas: 1,10 / 1,05 / 1,00 / 0,98 / 0,95.

**Stats efectivas en carrera (cálculo único al inicio, en enteros):**

```latex
S_{eff} = \lfloor S_{base} \cdot m_{animo} \cdot a_{posicion} \rfloor
```

Las stats efectivas y las de alas se congelan en `RaceEntry` antes del primer tick; el motor nunca vuelve a leer el contenido durante la carrera.

## 6. Motor de carrera: especificación y fórmulas iniciales

La carrera avanza en ticks fijos de 1/15 s sobre una pista unidimensional dividida en segmentos; cada corredora es un controlador determinista que decide boost, pulsos y saltos según su estilo e Inteligencia. Las constantes `k` de abajo son valores iniciales para el simulador por lotes; se ajustan con datos, nunca a mano en el código (viven en `packages/sim/rulesets/v1/constants.ts` con su intención documentada en `docs/formulas.md`).

**Fases:** salida (0–1/6 de la distancia), media (1/6–2/3), final (2/3–meta). Los segmentos se superponen a las fases: una pista es `Segment[]` con `type`, `length`, y parámetros (`grade` para `climb`/`descent`, `liftRequired` para `jump`, `drag` para `water`, `wind` para `canyon`, `radius` para `curves`).

**Velocidad base de la pista** (referencia para todas): `v_base = 20 m/s`. Todas las unidades internas van multiplicadas por 1000 y se operan en enteros.

```latex
v_{cruise} = v_{base} \cdot \left(1 + k_a \cdot \frac{A_{eff}}{1200}\right) \cdot PW \cdot f_{seg}
```

```latex
accel = k_{acc} \cdot \left(0.5 + \frac{T_{eff}}{1200}\right) \cdot PW \cdot f_{seg}
```

```latex
hp_{drain/tick} = k_{hp} \cdot \left(\frac{v}{v_{base}}\right)^{2} \cdot \frac{1}{1 + k_s \cdot \frac{St_{eff}}{1200}}
```

`f_seg` es un multiplicador por tipo de segmento (`flat` 1,00; `climb` 1 − 0,15·grade; `descent` 1 + 0,10·grade; `water` 1 − drag; `canyon` 1,00 (sin viento, ADR-0007); `curves` 1 − 0,20·(1 − A\_eff/1200)). El cuadrado se calcula como producto entero; no se usa `Math.pow`.

**Boost:** mientras está activo, `v += k_boost · PW`, `energy −= k_e` por tick y `heat += k_h` por tick. Sin boost, `heat −= k_cool` por tick. Si `heat > dissipation`: velocidad × 0,92 y `durability −= 1` por tick (regla Steinhaus: sin penalización de velocidad, pero `durability −= 2`).

**Pulsos (regla Kōryū):** el boost se emite en ráfagas de 12 ticks con enfriamiento de 30 ticks; cada ráfaga rinde `1,35 × k_boost` y cuesta `1,20 × k_e`. La decisión de disparar es del controlador: dispara si `energy ≥ costo de ráfaga` y `heat + calor de ráfaga ≤ dissipation × tolerancia`, donde `tolerancia = 1 + 0,3 · C_eff/1200`. La Inteligencia decide, no el jugador.

**Salto:** al entrar en `jump`, `lift = energyAvailable_momentáneo × (0,5 + T_eff/1200)`. Si `lift ≥ liftRequired`: cruza en `length / v_cruise` ticks y gasta `liftRequired` de energía. Si no: `durability −= k_crash`, `v = 0,4 · v` y pierde `k_jumpPenalty` ticks. El estilo `ground` evita el salto por una ruta `1,25 × length` sin costo de energía ni daño.

**Fatiga final:** al entrar en fase final, `hp_drain` se multiplica por `1,5 − 0,4 · C_eff/1200` (el Coraje es el Guts de Umamusume).

**Sprint final (misma lógica reconstruida de Umamusume):** al entrar en fase final, el controlador calcula la velocidad de boost sostenido que deja `energy = 0` exactamente 60 m antes de la meta. Si la energía no alcanza para toda la fase, prueba candidatos reduciendo la velocidad de a 0,1 m/s y elige el que minimiza el tiempo estimado total. Se calcula una sola vez por carrera y se recalcula solo si una habilidad devuelve energía.

**Activación de habilidades:** cada habilidad se evalúa en los ticks donde su `trigger` se cumple; la probabilidad por evaluación es `max(1 − 90/I_eff, 0,2)` (fórmula reconstruida por la comunidad de Umamusume), con `once: true` por defecto. Si `activationBase < 1`, se multiplica. Se usa `rng.next("race")` en orden determinista: por tick, por corredora en orden de `laneIndex`, por habilidad en orden de id.

**Pelotón:** en v0 la pista es unidimensional sin bloqueos; la posición solo afecta a `positionRange` de los triggers y al bono de regeneración de `hover`. Los bloqueos y carriles son una extensión de v1 y se registran como decisión abierta; cuando lleguen, la pérdida por carril exterior será `1,25 m` por carril (dato comunitario de Umamusume) como primera aproximación.

**Pseudocódigo del tick:**

```ts
for (tick = 0; !allFinished; tick++) {
  for (const e of entries.sortedByLane()) {
    const seg = course.segmentAt(e.pos);
    e.controller.decide(e, seg, phase(e.pos), rng); // boost on/off, pulso, salto
    applySkills(e, seg, tick, rng); // evalúa triggers, aplica efectos activos
    const target = cruiseSpeed(e, seg) + boostBonus(e) + skillSpeed(e);
    e.v = approach(e.v, target, accel(e, seg)); // acelera o frena hacia target
    e.v = applyHeatPenalty(e, e.v);
    drainResources(e); // hp, energy, heat, durability
    e.pos += e.v / TICKS_PER_SECOND;
    if (seg.type === "jump" && enteredNow(e, seg)) resolveJump(e, seg);
  }
  log.sample(tick, entries); // cada tick en el primer segundo y en los últimos 25 m; cada 15 ticks en el resto
}
```

**Salida (`RaceLog`):** `rulesetVersion`, `seed`, `courseId`, `entries[]` (build congelada), `frames[]` muestreados con `pos`, `v`, `hp`, `energy`, `heat`, `durability`, `boostOn`, eventos (`skill`, `pulse`, `jumpOk`, `jumpFail`, `overheat`, `finish`) y `result[]` con tiempo final en ticks y márgenes en milímetros. El muestreo copia el de Umamusume (denso al inicio y al final) para que la reproducción y las curvas de uPlot salgan del mismo log.

**Constantes iniciales (`v1/constants.ts`):** `k_a` 0,35 · `k_acc` 0,40 m/s² · `k_hp` 1,0 · `k_s` 1,2 · `k_boost` 3,0 m/s · `k_e` 1,0 · `k_h` 2,0 · `k_cool` 1,0 · `k_crash` 25 · `k_jumpPenalty` 20 ticks. Son suposiciones para arrancar el lote; el criterio de aceptación está en la sección 12.

## 7. Fabricantes, bastidores y piezas: datos iniciales

Cinco fabricantes, cada uno con una regla mecánica implementada como `ManufacturerRule` en `packages/sim/rules/`, no como bonificación numérica. Cuatro están en el gacha; Boneyard provee los bastidores iniciales, todas las piezas y las peculiaridades re-sorteables.

| id          | Nombre             | Regla (`rule`)                                                                                            | Cuadrilla: stats que refuerza                                              | Pistas casa           | Pistas débiles    | Patrocina           |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- | ----------------- | ------------------- |
| `steinhaus` | Steinhaus Aerowerk | `mass-thrust`: sin penalización de velocidad por calor; calor excedente drena `durability` ×2             | `stamina`, `courage`; evento "mantenimiento" repara durabilidad            | —                     | —                 | Gerifalte           |
| `lumiere`   | Lumière Aéronef    | `regen`: `energy += 0,5` por tick sin boost; capacidad baja                                               | `technique`, `agility`; evento "calibración" sube aptitud de estilo        | —                     | pistas con `jump` | Esmerejona          |
| `koryu`     | Kōryū Racing       | `pulse`: boost en ráfagas (sección 6)                                                                     | `agility`, `intelligence`; evento "sesión de datos" con riesgo de ánimo    | descensos             | `water`           | Peregrina           |
| `altair`    | Altair Systems     | `telemetry`: `heat` nunca supera `dissipation`; activación de habilidades +15 %; `powerToWeight` tope 1,1 | `intelligence`; evento "contrato" (dinero por correr una carrera impuesta) | pistas largas         | sprints cortos    | Cernícala           |
| `boneyard`  | Boneyard Works     | `repairable`: `durability += 2` por segmento `flat`; 2 ranuras de peculiaridad                            | `courage`, `technique`; evento "chapuza" de alta varianza                  | pistas con obstáculos | velocidad pura    | Caracara, Aguilucha |

**Bastidores iniciales (`content/frames/`):** valores numéricos derivados de la escala MB/B/M/A/MA del diseño: `powerToWeight` 0,7 / 0,85 / 1,0 / 1,2 / 1,4; `energy` 60 / 80 / 100 / 120; `dissipation` 45 / 60 / 80; `durability` 60 / 80 / 100 / 140 / 180.

| id          | Fabricante | Estilo | PW   | energy | dissip. | durab. | Pasivo (`passive`)                                                                          | Rareza |
| ----------- | ---------- | ------ | ---- | ------ | ------- | ------ | ------------------------------------------------------------------------------------------- | ------ |
| `falke`     | steinhaus  | glide  | 1,0  | 120    | 45      | 140    | `no-climb-loss`: `f_seg` de `climb` = 1,0                                                   | SR     |
| `erzherzog` | steinhaus  | ground | 1,0  | 100    | 45      | 140    | `obstacle-armor`: obstáculos cuestan tiempo, no durabilidad                                 | SSR    |
| `sylphe`    | lumiere    | hover  | 1,2  | 60     | 80      | 80     | `pack-regen`: regen ×2 en pelotón medio                                                     | SR     |
| `etoile`    | lumiere    | dive   | 1,4  | 60     | 80      | 60     | `free-first-pulse`: el primer boost en `descent` no gasta energía                           | SSR    |
| `shiden`    | koryu      | dive   | 1,4  | 100    | 60      | 100    | `third-pulse`: la 3.ª ráfaga consecutiva +accel 20 %                                        | SSR    |
| `hayate`    | koryu      | ground | 1,2  | 100    | 60      | 60     | `flat-cooldown`: ráfagas en `flat` reducen enfriamiento a 20 ticks                          | SR     |
| `nimbus`    | altair     | hover  | 0,85 | 120    | 80      | 100    | `mid-activation`: +activación de habilidades en fase media                                  | SR     |
| `horizon`   | altair     | glide  | 1,0  | 140    | 80      | 100    | `heat-to-energy`: al entrar en fase final, `heat` acumulado se convierte en energía al 50 % | SSR    |
| `mule`      | boneyard   | ground | 0,7  | 100    | 45      | 180    | 2 peculiaridades sorteadas                                                                  | R      |
| `kite`      | boneyard   | glide  | 0,7  | 100    | 45      | 180    | 2 peculiaridades sorteadas                                                                  | R      |

Las alas firma del MVP (`peregrina-signature` por Kōryū, `cernicala-signature` por Altair, `caracara-signature` por Boneyard) copian las stats del bastidor genérico de su estilo y solo cambian el `passive`. El simulador verifica que el genérico rinde entre el 85 % y el 90 % de la firma en tasa de victoria (sección 12).

En v3 (ADR-0011) las alas firma valen por identidad y acabados, no por rendimiento: la pasiva pasó a la Falconess y la regla 85-90 % de abajo (invariante 2) solo aplica a v1 y v2.

**Piezas (`content/parts/`):** cuatro tipos por cinco fabricantes; cada pieza aplica `mods` y, visualmente, lleva la paleta de su marca. Valores de arranque: turbina `powerToWeight +0,1 / dissipation −10` (Steinhaus) o `powerToWeight +0,05 / dissipation +10` (Lumière); batería `energy +20`; estabilizadores `durability +20` o reducción de penalización en `curves`; firmware `skillSlots +1` (Altair) o `intelligence efectiva +30`. Máximo una pieza por tipo y cuatro por build.

**Peculiaridades Boneyard (`content/quirks.json`, 12 iniciales):** `cheap-fuel` (energy +15, dissipation −10), `loose-rivets` (durability −20, PW +0,1), `old-radio` (activación +10 % en fase media), `patched-tank` (energy −10, durability +40), `hot-head` (sin penalización de calor en los primeros 300 m), `mud-runner` (`water` sin penalización), `thin-air` (`climb` +5 %, `descent` −5 %), `heavy-paint` (PW −0,05, durability +25), `lucky-bolt` (una habilidad aleatoria gana `activationBase` 1,0), `stutter` (ráfagas no disponibles), `glider-tape` (`jump` +10 % lift), `scrap-heart` (regen +0,25 por tick). Re-sorteo: cuesta `chatarra` (moneda de crafteo) con precio creciente por bastidor y se reinicia cada temporada; usa el stream `quirks`.

## 8. Loop de crianza: temporada, acciones, hangar, eventos y caja negra

Una temporada son 48 turnos (semanas); cada turno el jugador elige una acción, puede ocurrir un evento, y en los turnos con carrera objetivo se corre la carrera. El estado completo es `SeasonState` y cada decisión es un `RunInput` que se registra; `advanceSeason` es pura y determinista por semilla.

**Acciones por turno (`RunInput.kind`):**

| Acción              | Efecto principal                                                                                      | Costo de `fatigue` | Riesgo (stream `training`)                             |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| `train:agility`     | +agility (base 8–14 según nivel de pista 1–5)                                                         | +20                | Fallo 5 % + fatiga/4; fallo = −stat y ánimo −1         |
| `train:stamina`     | +stamina                                                                                              | +20                | Igual                                                  |
| `train:technique`   | +technique, +progreso de taller                                                                       | +20                | Igual                                                  |
| `train:risk-flight` | +courage ×1,5; +agility ×0,5                                                                          | +30                | Fallo 12 %; fallo grave 3 % = lesión (pierde 2 turnos) |
| `train:simulator`   | +intelligence; +5 puntos de habilidad                                                                 | +10                | Sin fallo                                              |
| `workshop`          | Instala o cambia bastidor y piezas; repara `durability`; re-sortea peculiaridades (cuesta `chatarra`) | +5                 | Sin fallo                                              |
| `rest`              | fatiga −40; ánimo +0 o +1 (50 %)                                                                      | —                  | —                                                      |
| `outing`            | ánimo +1 fijo; vínculo con cuadrilla +5                                                               | fatiga −10         | —                                                      |

En v3 (ADR-0011) el taller no repara (no hay desgaste): queda para habilidades y para cambiar de alas. La chatarra pierde su uso principal; su nuevo uso está pendiente (T18).

La ganancia real = base × (1 + bonificaciones de cuadrilla presentes) × multiplicador de ánimo, redondeada hacia abajo; `fatigue ≥ 80` fuerza el descanso (ruleset v1; desde el ruleset v2, ADR-0006, la barra se muestra como Vigor = 100 − fatiga, no hay descanso forzado y el fallo sube con poco vigor). Los números son iniciales y los ajusta el simulador por lotes contra la curva objetivo: una Falconess entrenada con criterio termina la temporada con stats entre 550 y 800, y una build perfecta roza 1000 en dos stats.

**Hangar (reemplaza a las support cards):** antes de la temporada el jugador elige hasta 4 bastidores para el hangar. Cada turno, la cuadrilla de cada fabricante presente aparece en los entrenamientos de sus stats con probabilidad base 35 % (+5 % por nivel de vínculo); su presencia aporta la bonificación de la tabla de fabricantes y habilita sus eventos. En la pre-carrera se equipa uno de los cuatro. Regla de diseño: un hangar con cuatro fabricantes distintos cubre más stats pero reparte el vínculo; uno mono-marca concentra eventos. Es el deck-building. **Desde el ruleset v3 (ADR-0016):** la cuadrilla que viene se para en uno solo de sus entrenamientos (visible antes de elegir), aporta poco (+10 %) hasta vínculo 80 y desde ahí entra en **sintonía** (+25 %), como el entrenamiento de amistad de Umamusume; la Salida se hace con la cuadrilla que elija el jugador.

**Eventos (`content/events/`, 40 en el MVP):**

```json
{
  "id": "koryu-data-session-1",
  "source": { "kind": "crew", "manufacturer": "koryu", "minBond": 20 },
  "conditions": { "turnRange": [8, 40], "maxOccurrences": 1, "requires": [] },
  "weight": 10,
  "options": [
    { "textKey": "ev.koryu.data1.optA", "effects": { "intelligence": 12, "mood": -1 } },
    {
      "textKey": "ev.koryu.data1.optB",
      "effects": { "agility": 6, "bond": { "koryu": 5 } },
      "chance": [{ "p": 0.7, "effects": { "mood": 1 } }, { "p": 0.3, "effects": { "fatigue": 15 } }]
    }
  ]
}
```

Fuentes de eventos: `crew`, `falconess` (historia personal, escritos a mano), `random`, `race-result`. Selección por peso con `rng.next("events")`; los eventos de historia tienen `weight: null` y turno fijo. Las escenas clave de cada Falconess son texto escrito a mano y se marcan `handwritten: true`; los generadores no pueden tocarlas.

**Carreras objetivo:** cada Falconess tiene `seasonGoals` (turno, pista, puesto mínimo). No alcanzar un objetivo termina la temporada en ese punto con evaluación parcial. La evaluación final (`grade`) es una función de stats finales, resultados y habilidades, en escala G–SS, y determina la calidad de la caja negra.

**Caja negra (`BlackBox`):** al cerrar la temporada se generan factores, en el estilo de los tres colores de Umamusume:

| Factor            | Origen                                            | Rango      | Efecto al heredar                                |
| ----------------- | ------------------------------------------------- | ---------- | ------------------------------------------------ |
| `stat` (azul)     | La stat más alta; ★1–3 según umbral 600/800/1000  | 1 por caja | +stat base ×★×7 al inicio                        |
| `aptitude` (rojo) | Mejor aptitud de posición (ADR-0008)              | 1 por caja | Sube una letra con probabilidad 30/55/80 % por ★ |
| `skill` (verde)   | Hasta 3 habilidades aprendidas                    | 0–3        | Posibilidad de aprender con descuento            |
| `frameAffinity`   | Fabricante del bastidor equipado en más victorias | 1          | +10 % aparición de su cuadrilla                  |

Una crianza nueva elige dos cajas negras (propias o intercambiadas) como "padres". La herencia se resuelve una sola vez con `rng.next("training")` al turno 0 y el resultado queda en los `RunInput` iniciales, así que un run heredado también se reproduce desde su semilla.

## 9. Gacha, economía interna y reglas anti pay-to-win

En v0 no existe dinero real: el gacha se implementa completo (pools, tasas, pity, animación) sobre moneda ganada jugando, de modo que activar pagos más adelante sea un cambio de configuración y no de código. Las reglas anti pay-to-win son invariantes verificadas por tests, no políticas.

**Monedas:**

| Moneda              | Se obtiene                                                        | Se gasta en                                  |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `feathers` (plumas) | Fin de temporada según `grade`, logros, misiones diarias          | Tiradas en ambos pools                       |
| `scrap` (chatarra)  | Carreras, desguace de bastidores repetidos                        | Piezas, crafteo, re-sorteo de peculiaridades |
| `premium`           | Reservada; deshabilitada en v0 (`economy.premiumEnabled = false`) | Equivalente a plumas, nunca a chatarra       |

**Pools y tasas iniciales (`content/gacha.json`):**

| Pool        | Rarezas                                                                      | Tasa por tirada   | Pity                                                                        | Garantía |
| ----------- | ---------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- | -------- |
| `falconess` | SSR (traje de liga) 0,8 % · SR (traje de taller) 6 % · R (traje base) 93,2 % | Garantía SSR a 90 | 50/50 con la Falconess del banner; segunda SSR garantizada es la del banner |          |
| `frames`    | SSR 1,0 % · SR 10 % · R 89 %                                                 | Garantía SSR a 80 | Selector: el jugador marca 2 bastidores; la SSR garantizada es uno de ellos |          |

Los repetidos de Falconess suben un nivel de "rango" que solo desbloquea trajes y episodios de vínculo, nunca stats. Los repetidos de bastidor se desguazan por chatarra. Toda Falconess y todo bastidor entran a un pool permanente dos banners después de su estreno.

**Invariantes anti pay-to-win (tests en `packages/sim/tests/economy.test.ts`):**

1. Ninguna `Part` ni `Quirk` aparece en `gacha.json`.
2. Para cada Falconess con alas firma, la tasa de victoria del bastidor genérico de su estilo contra el firma, en cada pista y con stats iguales, está entre 0,85 y 0,90 del firma (simulador por lotes, 2000 carreras).
3. Ningún objeto comprable modifica `FalconessStats`, `growth` ni `aptitudes`.
4. El rango de repetidos no aparece en ninguna fórmula de `packages/sim`.
5. Existe la liga `scrap-class`: todas las entradas se re-simulan con el bastidor `mule` o `kite` según estilo, sin piezas ni peculiaridades.

**Economía de referencia para el lote:** una temporada completa rinde entre 1.200 y 2.000 plumas según `grade`; una tirada cuesta 150; el jugador que completa dos temporadas por semana llega al pity de un banner cada 4 semanas sin pagar. Estos números se ajustan con telemetría, no con opinión.

## 10. Preparación para multiplayer asíncrono

El multiplayer no se construye en v0, pero cinco decisiones tomadas hoy hacen que llegue sin reescribir: simulación pura, inputs en vez de estados, `rulesetVersion` en todo, `Build` exportable y firmada, y presentación que solo lee logs. Con eso, el servidor es `packages/sim` ejecutándose en una Edge Function de Deno.

**Formato de intercambio:** `Build` (sección 4) es el único objeto que viaja entre jugadores. `hash` = SHA-256 del JSON canónico (claves ordenadas, sin espacios); `signature` la pone el servidor tras reproducir la crianza desde `seed` + `inputs` y comprobar que `finalStats` coincide. Una `Build` sin firma válida no entra a ninguna liga.

**Esquema de Supabase (fase 2, `supabase/migrations/`):**

| Tabla            | Columnas clave                                                                 | RLS                                                      |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `profiles`       | `id` (auth.uid), `handle`, `created_at`                                        | Lectura pública de `handle`; escritura propia            |
| `saves`          | `user_id`, `slot`, `ruleset_version`, `payload jsonb`, `updated_at`            | Solo el dueño                                            |
| `black_boxes`    | `id`, `owner_id`, `build jsonb`, `hash`, `signature`, `public bool`            | Lectura si `public`; escritura solo vía Edge Function    |
| `leagues`        | `id`, `season`, `class` (`open`/`scrap-class`), `seed`, `starts_at`, `ends_at` | Lectura pública                                          |
| `league_entries` | `league_id`, `user_id`, `build_hash`, `submitted_at`                           | Inserción solo vía Edge Function; una por usuario y liga |
| `race_results`   | `league_id`, `heat`, `log_url`, `placings jsonb`, `computed_at`                | Lectura pública                                          |
| `telemetry`      | `user_id`, `event`, `props jsonb`, `at`                                        | Inserción propia; lectura ninguna                        |

**Edge Functions:** `sign-build` (reproduce la crianza y firma), `submit-entry` (valida firma, versión y cuota), `run-league` (programada: agrupa entradas en series de 8, simula con `league.seed`, guarda logs en Storage y resultados en `race_results`). Las tres importan `@falconess/sim` compilado como ESM; es la razón de que `packages/sim` no tenga dependencias de Node.

**Anti-cheat básico:** el cliente nunca envía stats, envía `seed` + `inputs`; el servidor recalcula. Las semillas de liga son del servidor y se publican al cerrar la liga para que cualquiera verifique los resultados con el cliente. Cuota: 1 entrada por liga y usuario; 20 firmas por día.

**Fantasmas y Escuadrón:** una carrera contra fantasmas es `simulateRace` con `entries` tomadas de `black_boxes` públicas; se ejecuta en el cliente porque no afecta a nada compartido. Las ligas se ejecutan en el servidor porque sí.

**Lo que este stack no cubre:** tiempo real y servidor autoritativo con estado por tick. No se diseña para eso; si alguna vez hace falta, es otro producto.

## 11. Pipeline de contenido con agentes y validación

El contenido se genera con agentes de Claude que emiten JSON validado por los mismos esquemas zod del juego, se revisa en PR como cualquier código y nunca entra sin pasar `content:validate`, el simulador por lotes y, para texto de personaje, la evaluación de voz. Las escenas clave se escriben a mano.

**Generadores (`tools/generators/`):** un script por tipo (`skills`, `events`, `parts`, `quirks`, `courses`). Cada uno:

1. Carga la biblia del mundo (`docs/world.md`), la biblia del personaje si aplica (`docs/characters/<id>.md`), el esquema zod convertido a JSON Schema y un lote de ejemplos aprobados.
2. Llama a la API con salidas estructuradas (el modelo de mejor relación costo/calidad del momento; verificar nombres y precios vigentes antes de fijarlos), pidiendo N candidatos.
3. Valida cada candidato con zod; descarta y registra los que fallan.
4. Aplica reglas de rango (`tools/generators/rules.ts`): efectos de habilidades dentro de cotas, pesos de eventos entre 1 y 20, ningún `textKey` duplicado.
5. Escribe los sobrevivientes en `content/<tipo>/_candidates/` para revisión humana; `pnpm content:promote <id>` los mueve al directorio final y genera las claves en `text/es.json`.

**Prompts versionados (`tools/prompts/<tipo>.md`):** cada prompt tiene encabezado con `version`, `model`, `temperature` y `lastEvalPassRate`. Un cambio de prompt es un commit y se mide.

**Biblia de voz por Falconess (`docs/characters/<id>.md`):** registro, léxico permitido y prohibido, valores, cómo reacciona a ganar, perder y lesionarse, tres frases de ejemplo y tres frases que nunca diría. Es el insumo de los generadores de eventos y del juez de voz.

**Evaluación de voz (`tools/evals/voice/`):** por Falconess, entre 30 y 50 situaciones golden (`situations/<id>.json`) con el texto de referencia y la rúbrica (léxico, valores, registro, prohibiciones). `pnpm evals:voice <id>` genera texto nuevo para cada situación, lo juzga con un modelo económico como juez con la rúbrica y reporta `passRate`. Umbral de merge: 0,85. La calibración se hace con 20 situaciones juzgadas también a mano; si el juez y el humano discrepan más del 15 %, se ajusta la rúbrica antes de confiar en el número.

**Lo que los generadores nunca tocan:** archivos con `handwritten: true`, `docs/characters/`, `tests/golden/`, `rulesets/`. Un hook de Claude Code lo impide (sección 13).

**Costos de referencia:** usar Batch API para lotes de más de 50 candidatos; el presupuesto mensual de generación y evaluación durante el MVP se fija en 50 USD y se controla con un contador en `tools/.usage.json`.

## 12. Estrategia de pruebas y simulador por lotes

Seis capas de prueba, y las cuatro primeras corren en cada commit: unitarias, propiedades, golden, determinismo; el lote de balance corre en cada PR que toque `sim` o `content`; la E2E corre en `main`. Claude propone cambios de balance, pero solo el lote los aprueba.

| Capa         | Herramienta                          | Qué verifica                                                                                                                     | Umbral                                                                      |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Unitarias    | Vitest                               | Fórmulas aisladas, reglas de fabricante, herencia                                                                                | 100 % de las funciones públicas de `sim`                                    |
| Propiedades  | fast-check                           | Monotonía (más `agility` nunca da peor tiempo en `flat`), cotas (ningún recurso negativo), simetría (dos builds iguales empatan) | 500 casos por propiedad                                                     |
| Golden       | `tests/golden/<ruleset>/<seed>.json` | El log de 12 semillas fijas es idéntico byte a byte                                                                              | Cualquier diferencia falla; se regenera solo con `--update-golden` y un ADR |
| Determinismo | Script                               | Mismo `seed` + `inputs` en Node y en Deno producen el mismo `hash`                                                               | Igualdad exacta                                                             |
| Balance      | `pnpm sim:batch`                     | Métricas de la tabla siguiente                                                                                                   | Rangos objetivo                                                             |
| E2E          | Playwright                           | Crear crianza, 48 turnos con acciones fijas, ver carrera, exportar `Build`                                                       | Sin errores de consola                                                      |

**Métricas del lote (`out/balance.json`, 10.000 carreras en menos de 60 s en una máquina de desarrollo):**

| Métrica                                                               | Objetivo inicial                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| Tasa de victoria por estilo, con stats iguales (media de las pistas)  | Cada estilo entre 15 % y 35 %                          |
| Tasa de victoria por fabricante en sus pistas casa frente a los otros | Casa: 30–45 %; pista débil: ≤ 15 %                     |
| Genérico frente a firma (misma Falconess, misma pista)                | 0,85–0,90                                              |
| Ablación "leave-one-out" por habilidad: ganancia media en metros      | Ninguna habilidad > 8 m ni < 0,5 m                     |
| Ablación por pieza                                                    | Ninguna pieza > 3 % de tasa de victoria                |
| Dispersión de tiempos con semillas distintas y misma build            | Desviación estándar entre 0,8 % y 2 % del tiempo medio |
| Resultado de temporada con política fija "entrenar la stat más baja"  | `grade` B en el 60 % de los casos                      |

Desde el ruleset v2 (ADR-0006 «Métrica 7»), la temporada de la última fila se juega con la política cuidadosa (sigue entrenando la stat más baja, pero descansa o sale antes de que suba el fallo y sale con ánimo bajo +1): sin descanso forzado, la que nunca sale ya no representa a un jugador; en v1 sigue la de la stat más baja. El reporte incluye un diff contra la línea base de `main`; una métrica fuera de rango bloquea el merge salvo que el PR adjunte un ADR que mueva el objetivo. Las políticas de entrenamiento de referencia (`tools/policies/`) son agentes deterministas simples que juegan temporadas completas sin interfaz; sirven para medir la economía y la curva de stats.

**Rendimiento:** el motor debe simular una carrera de 8 corredoras y 3.000 m en menos de 5 ms; si no, el lote no cabe en CI. Se mide con un benchmark en `packages/sim/bench/` y se registra en cada PR.

## 13. CLAUDE.md inicial, hooks, subagentes y flujo de trabajo

El `CLAUDE.md` de abajo se copia tal cual a la raíz del repositorio; los hooks y los subagentes van en `.claude/`. La sintaxis exacta de hooks, subagentes y skills debe contrastarse con la documentación vigente de Claude Code antes del primer commit, porque cambia con frecuencia.

```markdown
# Falconess (nombre provisional)

Simulador de crianza estilo Umamusume: corredoras adultas con alas mecánicas, carreras todoterreno
deterministas, gacha sin pay-to-win. Fuente de verdad del diseño: docs/BRIEF.md. Leerlo antes de
cualquier tarea de diseño o de balance.

## Arquitectura (no negociable)

- packages/sim es TypeScript puro: sin DOM, sin Date, sin Math.random, sin Math.pow/sin/cos, sin imports
  de React/Phaser/Supabase. Aleatoriedad solo con rng.next(stream). Aritmética de carrera en enteros.
- packages/schema es la única definición de datos. Tipos con z.infer; nunca interfaces paralelas.
- Contenido en packages/content como JSON validado. El código no contiene prosa de juego.
- apps/web y Phaser solo leen estado y logs. Si falta un dato en el log, se amplía el log.
- Todo estado y contenido lleva rulesetVersion. Los rulesets viejos no se borran.

## Flujo de trabajo

1. Plan primero: para cualquier cambio en sim, schema o rulesets, presentar el plan y esperar aprobación.
2. Test que falla → implementación → `pnpm typecheck && pnpm test` → commit pequeño con mensaje imperativo.
3. Cambios de balance: modificar constantes en rulesets/v1/constants.ts, correr `pnpm sim:batch`,
   pegar el diff de métricas en el PR. Nunca ajustar números sin el reporte.
4. Preguntar antes de decidir cuando la especificación no cubra el caso; no inventar reglas.

## Prohibido sin aprobación explícita

- Editar tests/golden/, docs/characters/, rulesets/, o archivos con "handwritten": true.
- Agregar dependencias a packages/sim.
- Cambiar nombres de campos de esquemas (requiere ADR en docs/decisions/).
- Usar `any`, `as unknown as`, `// @ts-ignore`.

## Convenciones

- Identificadores en inglés; texto de juego en packages/content/text/<lang>.json con claves.
- Ids de contenido en kebab-case. Un archivo JSON por entidad.
- Fórmulas documentadas en docs/formulas.md con intención y rango esperado antes de implementarlas.
- Commits: feat/fix/balance/content/docs + alcance (`balance(race): reduce k_boost to 2.8`).

## Comandos

pnpm typecheck · pnpm test · pnpm test:golden · pnpm content:validate · pnpm sim -- --seed 42
pnpm sim:batch -- --runs 10000 · pnpm evals:voice <id> · pnpm dev

## Lecciones aprendidas

(Al cerrar cada tarea, agregar aquí en una línea lo que conviene recordar. No borrar entradas.)
```

**Hooks (`.claude/settings.json`, forma esperada):**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/guard-protected-paths.mjs" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/related-tests.mjs" }]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "pnpm -s typecheck && pnpm -s test --run --reporter=dot" }
        ]
      }
    ]
  }
}
```

`guard-protected-paths.mjs` lee la ruta del archivo desde la entrada del hook y devuelve código de salida 2 (bloqueo) si coincide con `tests/golden/`, `docs/characters/`, `packages/sim/rulesets/` o un JSON con `"handwritten": true`, salvo que exista `.claude/allow-protected` creado a mano para esa sesión. `related-tests.mjs` ejecuta `vitest related <archivo> --run` si el archivo está bajo `packages/`.

**Subagentes (`.claude/agents/`):**

| Archivo                | Rol                                                                                            | Herramientas                        | Instrucción clave                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------- |
| `balance-analyst.md`   | Corre el lote, lee `out/balance.json`, propone hasta 3 cambios de constantes con justificación | Bash (solo `pnpm sim:batch`), Read  | Nunca edita archivos; entrega un plan |
| `content-generator.md` | Ejecuta `pnpm content:gen <tipo>` y resume candidatos válidos e inválidos                      | Bash, Read, Write en `_candidates/` | No promueve contenido                 |
| `voice-reviewer.md`    | Corre `pnpm evals:voice` y señala los fallos con la regla de la biblia que violan              | Bash, Read                          | No reescribe texto; propone           |
| `sim-reviewer.md`      | Revisa PRs de `packages/sim` buscando no determinismo, flotantes y dependencias                | Read, Grep                          | Lista de hallazgos con línea          |

**Skills y comandos (`.claude/skills/` o `.claude/commands/`):** `/new-skill <id>` (plantilla JSON + test + entrada en `formulas.md`), `/new-event <fabricante>` (plantilla con `textKey` reservado), `/balance-report` (lote + diff + resumen), `/golden-update <motivo>` (regenera golden y crea el ADR). Instalar además las skills oficiales de Phaser 4 desde su repositorio para `apps/web`.

**Flujo diario recomendado:** sesión de planificación corta (`plan` sobre una sola tarea), implementación con el hook de tests activo, `/balance-report` si tocó balance, commit, y una línea en "Lecciones aprendidas". Una tarea por sesión; el contexto de Claude Code rinde mejor con un subsistema a la vez.

## 14. Hitos de 30 días y criterios de aceptación

Cuatro semanas, una por capa, cada una con un criterio verificable por comando. No se pasa a la siguiente semana sin cumplir el criterio de la anterior; la interfaz no empieza hasta que el motor es determinista y rápido.

| Semana                    | Entregables                                                                                                                                                                                                                                       | Criterio de aceptación                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: núcleo                 | Monorepo con `sim`, `schema`, `rng`, `cli`; CLAUDE.md, hooks y subagentes; PRNG con streams y punto fijo; `FalconessStats`, aptitudes, ánimo; `advanceSeason` con las 8 acciones y fatiga; 3 Falconess y 1 bastidor Boneyard en JSON              | `pnpm sim -- --seed 42 --falconess peregrina` imprime una temporada idéntica en dos ejecuciones; `pnpm test` verde con ≥ 40 tests; `content:validate` pasa                          |
| 2: carrera y lote         | Motor por ticks con fases, segmentos, boost, calor, saltos, sprint final, activación de habilidades; 5 reglas de fabricante; 10 bastidores y 8 piezas; 15 habilidades; `RaceLog` muestreado; `sim:batch` con las 7 métricas y diff; 12 golden     | 10.000 carreras en < 60 s; todas las métricas dentro de rango o con ADR; determinismo Node = Deno verificado; benchmark < 5 ms por carrera                                          |
| 3: contenido y voz        | Generadores de `skills`, `events`, `quirks` con salidas estructuradas; 40 eventos (10 escritos a mano); biblias de 3 Falconess; evaluación de voz con 30 situaciones cada una; política de entrenamiento de referencia; caja negra y herencia     | `content:gen events` produce ≥ 80 % de candidatos válidos; `evals:voice` ≥ 0,85 en las 3; la política de referencia logra `grade` B en el 60 % de las temporadas                    |
| 4: interfaz y publicación | `apps/web`: calendario, panel de stats, hangar, taller con re-sorteo, pre-carrera, escena Phaser leyendo el log, curvas uPlot post-carrera, exportación de `Build` como JSON y como imagen; guardado local con `schemaVersion`; página en itch.io | E2E de Playwright pasa; una temporada completa jugable en navegador en < 45 min; build publicada en itch.io con arte provisional; 10 testers externos juegan al menos una temporada |

**Hito de decisión (día 30):** si al menos 6 de los 10 testers quieren jugar una segunda temporada sin que se les pida, se encarga la prueba de arte (Peregrina en tres estados y su bastidor firma) y se abre la página de Steam. Si no, se revisa el loop antes de gastar en arte.

**Lo que no entra en los 30 días:** audio, localización (solo claves), Supabase, gacha con dinero real, build de escritorio, Falconess 4 a 6. Biomas: fuera hasta nuevo aviso (ADR-0007).

## 15. Decisiones abiertas y glosario

Siete decisiones siguen abiertas; ninguna bloquea las semanas 1 y 2, y cada una se cierra con un ADR en `docs/decisions/` cuando llegue su momento.

- [ ] Nombre comercial del juego y verificación de marca ("Falconess" es provisional; el código no depende del nombre).
- [ ] Vista de carrera: lateral (mejor para saltos) o cenital (mejor para el pelotón). Decidir antes de la semana 4 con dos bocetos.
- [ ] Avatar del jugador: entrenador/a con presencia narrativa o "el taller" sin rostro. Afecta el tono de los eventos de vínculo.
- [ ] Escritorio: Tauri o Electron; depende de si Steamworks puede integrarse desde el webview elegido.
- [ ] Carriles y bloqueos en carrera (v1): activar solo si el lote muestra que el pelotón unidimensional hace indistinguibles a `hover` y `glide`.
- [ ] Live service o temporadas por DLC: condiciona el ritmo de banners y la carga de contenido mensual.
- [ ] Dinero real: cuándo activar `premiumEnabled` y en qué tiendas; requiere revisión legal por país antes de encenderlo.

**Riesgos técnicos a vigilar desde la semana 1:** determinismo entre Node y Deno (probar temprano), rendimiento del lote (si una carrera supera 5 ms, la CI deja de ser útil), y legibilidad de la simulación (si un tester no puede explicar por qué perdió mirando las curvas, el motor es demasiado opaco).

**Glosario:**

| Término                 | Significado                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Falconess               | Corredora adulta con alas mecánicas; personaje jugable del gacha                                       |
| Bastidor (`Frame`)      | Unidad de alas completa con regla de fabricante, stats y pasivo                                        |
| Pieza (`Part`)          | Componente instalable: turbina, batería, estabilizadores, firmware                                     |
| Peculiaridad (`Quirk`)  | Modificador sorteable de los bastidores Boneyard, re-sorteable con chatarra                            |
| Hangar                  | Conjunto de hasta 4 bastidores elegidos para una temporada; sus cuadrillas actúan en el entrenamiento  |
| Cuadrilla (`Crew`)      | Personal del fabricante; equivalente de las support cards                                              |
| Alas firma              | Bastidor hecho por el patrocinador de una Falconess con el pasivo que cierra su kit                    |
| Caja negra (`BlackBox`) | Registro de herencia de una temporada: factores azul, rojo y verde más afinidad de fabricante          |
| Estilo (`Style`)        | Física de las alas: `dive`, `hover`, `glide`, `ground` (ADR-0008)                                      |
| Posición (`Position`)   | Cómo administra la energía en carrera, elegida antes de largar: `lead`, `pack`, `stalk`, `closer`      |
| Ráfaga (pulso)          | Boost discreto de Kōryū: 12 ticks de empuje, 30 de enfriamiento                                        |
| `RunInput`              | Decisión del jugador registrada para reproducir una temporada                                          |
| `RaceLog`               | Salida muestreada de una carrera; única fuente de la reproducción y de las curvas                      |
| `Build`                 | Falconess final + bastidor + piezas + habilidades, con hash y firma; formato de intercambio y de ligas |
| Clase Chatarra          | Liga donde todas las entradas corren con bastidores Boneyard sin piezas                                |
| `rulesetVersion`        | Versión de reglas y constantes que acompaña a todo contenido, estado y log                             |
