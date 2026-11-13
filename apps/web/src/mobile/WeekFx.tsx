import { useEffect } from "react";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph, type GlyphName } from "./Glyph";
import { playSound } from "./sfx";
import f from "./WeekFx.module.css";
import type { WeekFx, WeekFxKind } from "./weekFx";

/**
 * Each effect's time on screen (owner 2026-11-13: long enough to read, never a blink), and how
 * long the last one stays: more when more happened at once.
 */
export const FX_MS = 1800;
export function fxTotalMs(n: number): number {
  return n * FX_MS + 800 + 400 * n;
}

const GLYPH: Record<WeekFxKind, GlyphName> = {
  "mood-up": "heart",
  "mood-down": "heart",
  injury: "cross",
  "sleep-great": "bed",
  "sleep-normal": "bed",
  "sleep-poor": "bed",
};

/**
 * The week's effects shown, not told (owner 2026-11-13): one after the other, a stamp like a
 * training's «¡ÉXITO!» with chevrons, gold and rising for good news, blue and falling for bad.
 * A tap ends them; «Lo que pasó» waits for them.
 */
export function WeekFxOverlay({ fx, onDone }: { fx: readonly WeekFx[]; onDone: () => void }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per mount (keyed by the step)
  useEffect(() => {
    const timers = fx.map((e, i) =>
      setTimeout(() => playSound(e.good ? "success" : "fail"), i * FX_MS),
    );
    timers.push(setTimeout(onDone, fxTotalMs(fx.length)));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);
  return (
    <button
      type="button"
      className={f.layer}
      id="m-efectos"
      aria-label={fx.map((e) => ui(`ui.m.fx.${e.kind}`)).join(" · ")}
      onClick={onDone}
    >
      {fx.map((e, i) => (
        <span
          key={e.kind}
          className={cx(f.fx, e.good ? f.good : f.bad, i === fx.length - 1 && f.last)}
          data-fx={e.kind}
          style={{
            animationDelay: `${i * FX_MS}ms`,
            animationDuration: `${i === fx.length - 1 ? fxTotalMs(fx.length) - i * FX_MS : FX_MS}ms`,
          }}
        >
          <span className={f.icon} style={{ animationDelay: `${i * FX_MS}ms` }}>
            <Glyph name={GLYPH[e.kind]} size={44} weight={2.4} />
            <span className={f.arrows} aria-hidden="true">
              {[0, 1, 2].map((k) => (
                <svg
                  key={k}
                  className={f.chev}
                  viewBox="0 0 24 12"
                  aria-hidden="true"
                  style={{ animationDelay: `${i * FX_MS + 200 + k * 140}ms` }}
                >
                  <polyline className={f.edge} points="3,10 12,3 21,10" />
                  <polyline points="3,10 12,3 21,10" />
                </svg>
              ))}
            </span>
          </span>
          <span className={f.stamp} style={{ animationDelay: `${i * FX_MS + 120}ms` }}>
            {ui(`ui.m.fx.${e.kind}`)}
          </span>
        </span>
      ))}
    </button>
  );
}
