# ADR-0002: Fijar TypeScript 5.9, Vitest 5, zod 4, Biome 2

- Estado: aceptado
- Fecha: 2026-10-27
- Alcance: proceso

## Contexto

A la fecha, `typescript@latest` es 7.0.2 (compilador nuevo). BRIEF §3 pide TypeScript 5.x estricto.

## Decisión

TypeScript 5.9.3 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), zod 4.6.7,
Vitest 5.0.5 con fast-check 4.10, Biome 2.6.3, tsx 4.23, Node 22 LTS, pnpm 10.

## Consecuencias

Migrar a TypeScript 7 es un ADR aparte cuando el ecosistema (Vitest, tsx) lo soporte sin fricción.
Las versiones se fijan exactas en `package.json`; se actualizan con PR dedicado.
