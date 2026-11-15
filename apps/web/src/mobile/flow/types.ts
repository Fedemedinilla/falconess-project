/**
 * The types of the phone's flow (plan §1.3), pure and text-free like everything in `mobile/flow/`:
 * the native `web-flow` project runs these modules without Vite (flow/imports.test.ts).
 */

/** The workshop's two tabs: learn skills, swap the wings. */
export type WorkshopTab = "skills" | "wings";

/**
 * «Ritmo» Rápido / Directo (owner 2026-11-14, as Umamusume skips): not the whole scene but a
 * digest, about a third of its lines (the first and the last always) passing by on their own,
 * whole at once, `ms` each. Seen in full from «Historia» or «Ver».
 */
export type Digest = { readonly ms: number };
