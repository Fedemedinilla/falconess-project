/** A fresh seed for a new season: up to six digits, like `pnpm play` picks one. */
export function randomSeed(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === "function") {
    const draw = new Uint32Array(1);
    crypto.getRandomValues(draw);
    return String((draw[0] ?? 0) % 1_000_000);
  }
  return String(Math.floor(Math.random() * 1_000_000));
}
