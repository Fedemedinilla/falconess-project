import {
  type CSSProperties,
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { expire, type Presence, presenceStep } from "./flow/presence";
import type { Layer } from "./flow/types";
import { outMs } from "./motion";

type Phase = "in" | "out";

const LayerPhase = createContext<Phase>("in");
/** No layer is in front or leaving: a notice may show. */
const LayersIdle = createContext(true);
/** The kind of the layer leaving last, if one is. */
const Leaving = createContext<Layer["kind"] | undefined>(undefined);

/**
 * The layers whose way out LayerHost plays so far. A scene still leaves on its own (its 0.8 s
 * fade, then its `onDone`) until 6.2, and the emblem inside its 1.25 s until 6.4: they go at once.
 */
const LEAVES: ReadonlySet<Layer["kind"]> = new Set(["fx", "inspiration"]);

/** How long `layer` takes to leave (0: it goes at once). */
function leaveMs(layer: Layer, reduced: boolean): number {
  return LEAVES.has(layer.kind) ? outMs(layer.kind, reduced) : 0;
}

/** A wrapper with no box: the phase is for the frame probe and the layer's own hooks. */
const IN: CSSProperties = { display: "contents" };
/** A leaving layer takes no tap: what is under it does (it is inert too). */
const OUT: CSSProperties = { display: "contents", pointerEvents: "none" };

const keep = (id: string): string | undefined => id;
const drop = (): string | undefined => undefined;

/**
 * The one full-screen layer in front of the game (plan §1.9): the week's effects, the inheritance
 * card, a story scene, the emblem or the event dialog, rendered from the flow's `layer` by
 * `render`. When the flow moves on, the layer stays a moment on its way out: the same instance
 * (nothing of it starts again), rendered from the last data it had in front, inside an inert
 * wrapper that takes no tap, without its ids (`useLid`), its timers stopped (`useLayerPhase`), so
 * it never ends a beat or plays a sound; its own timer, armed here, removes it, never an
 * animation's end. A new layer comes in after it in the page. Each wrapper names its phase for the
 * frame probe (`data-layer-phase`): one «in» at most. Its `children` (the notices) learn whether
 * the layers are idle: nothing in front and nothing leaving.
 */
export function LayerHost({
  top,
  render,
  reduced,
  children,
}: {
  readonly top: Layer | undefined;
  readonly render: (layer: Layer) => ReactElement;
  /** Reduced motion, as the flow reads it: the layers leave at once. */
  readonly reduced: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  const [seen, setSeen] = useState(top);
  const [list, setList] = useState<readonly Presence[]>(() =>
    presenceStep([], top, performance.now(), (l) => leaveMs(l, reduced)),
  );
  // the flow's layer changed (interned: only when it really did): the list follows it
  if (top !== seen) {
    setSeen(top);
    setList(presenceStep(list, top, performance.now(), (l) => leaveMs(l, reduced)));
  }
  // each leaving layer goes when its time is up, counted from when it started leaving
  useEffect(() => {
    const now = performance.now();
    const timers = list
      .filter((e) => e.phase === "out")
      .map((e) =>
        setTimeout(
          () => setList((l) => expire(l, e.key, e.gen)),
          Math.max(0, e.since + leaveMs(e.layer, reduced) - now),
        ),
      );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [list, reduced]);
  const leaving = list.filter((e) => e.phase === "out").at(-1)?.layer.kind;
  return (
    <LayersIdle value={list.length === 0}>
      <Leaving value={leaving}>
        {list.map((e) => {
          const out = e.phase === "out";
          return (
            <LayerPhase key={`${e.key}#${e.gen}`} value={e.phase}>
              <div
                style={out ? OUT : IN}
                inert={out || undefined}
                aria-hidden={out || undefined}
                data-layer={e.layer.kind}
                data-layer-phase={e.phase}
              >
                {render(e.layer)}
              </div>
            </LayerPhase>
          );
        })}
        {children}
      </Leaving>
    </LayersIdle>
  );
}

/** Whether this layer is in front or on its way out (outside a layer: in front). */
export function useLayerPhase(): Phase {
  return useContext(LayerPhase);
}

/** A layer's ids, only while it is in front: a leaving copy has none (one element per id). */
export function useLid(): (id: string) => string | undefined {
  return useLayerPhase() === "in" ? keep : drop;
}

/** No layer is in front or leaving: a notice waits for this. */
export function useLayersIdle(): boolean {
  return useContext(LayersIdle);
}

/** The kind of a layer on its way out, if any. */
export function useLeaving(): Layer["kind"] | undefined {
  return useContext(Leaving);
}

/**
 * The layer's primary control takes the focus while it is in front (L7), without scrolling: at its
 * mount (a restored week too), or once `ready` (the inheritance card's «Continuar» once revealed).
 */
export function useLayerFocus(ref: RefObject<HTMLElement | null>, ready = true): void {
  const phase = useLayerPhase();
  useLayoutEffect(() => {
    if (phase === "in" && ready) ref.current?.focus({ preventScroll: true });
  }, [phase, ready, ref]);
}
