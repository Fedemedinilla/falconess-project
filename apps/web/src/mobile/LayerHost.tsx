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
import { startFlowTimer } from "../ui/flowTimer";
import { onSheetClosed } from "../ui/modals";
import { visibleNow } from "../ui/visibility";
import { expire, type Presence, presenceStep } from "./flow/presence";
import type { Layer } from "./flow/types";
import { outMs } from "./motion";

type Phase = "in" | "out";

const LayerPhase = createContext<Phase>("in");
/** No layer is in front or leaving: a notice may show. */
const LayersIdle = createContext(true);
/** The kind of the layer leaving last, if one is. */
const Leaving = createContext<Layer["kind"] | undefined>(undefined);

/** A wrapper with no box: the phase is for the frame probe and the layer's own hooks. */
const IN: CSSProperties = { display: "contents" };
/** A leaving layer takes no tap: what is under it does (it is inert too). */
const OUT: CSSProperties = { display: "contents", pointerEvents: "none" };

const keep = (id: string): string | undefined => id;
const drop = (): string | undefined => undefined;

/**
 * The one full-screen layer in front of the game (plan §1.9): the week's effects, the inheritance
 * card, a story scene, the emblem or the event dialog, rendered from the flow's `layer` by
 * `render`. When the flow moves on, the layer stays a moment on its way out (`outMs` of its kind:
 * the effects and the card 240 ms, a scene 800, the emblem 280; the event's dialog and every layer
 * under reduced motion go at once): the same instance
 * (nothing of it starts again), rendered from the last data it had in front, inside an inert
 * wrapper that takes no tap, without its ids (`useLid`), its timers stopped (`useLayerPhase`), so
 * it never ends a beat or plays a sound; its own timer, armed here, removes it, never an
 * animation's end (a flow timer: a hidden tab holds it with the fade, 6.11). A new layer comes in
 * after it in the page. Each wrapper names its phase for the frame probe (`data-layer-phase`): one
 * «in» at most. What the layers come in front of (`under`:
 * the HUD and the screen, before them in the page) learns which layer is leaving (the race's
 * result waits for a scene's black to clear); its `children` (the notices, after them) learn
 * whether the layers are idle: nothing in front and nothing leaving.
 */
export function LayerHost({
  top,
  render,
  reduced,
  under,
  children,
}: {
  readonly top: Layer | undefined;
  readonly render: (layer: Layer) => ReactElement;
  /** Reduced motion, as the flow reads it: the layers leave at once. */
  readonly reduced: boolean;
  /** What the layers come in front of: the HUD and the screen. */
  readonly under?: ReactNode;
  readonly children?: ReactNode;
}): ReactElement {
  const [seen, setSeen] = useState(top);
  // times on the clock that stands still while the tab is hidden (6.11), as its fade does
  const [list, setList] = useState<readonly Presence[]>(() =>
    presenceStep([], top, visibleNow(), (l) => outMs(l.kind, reduced)),
  );
  // the flow's layer changed (interned: only when it really did): the list follows it
  if (top !== seen) {
    setSeen(top);
    setList(presenceStep(list, top, visibleNow(), (l) => outMs(l.kind, reduced)));
  }
  // each leaving layer goes when its time is up, counted from when it started leaving: a flow
  // timer, so a hidden tab holds the copy where its fade stands
  useEffect(() => {
    const now = visibleNow();
    const stops = list
      .filter((e) => e.phase === "out")
      .map((e) =>
        startFlowTimer(Math.max(0, e.since + outMs(e.layer.kind, reduced) - now), () =>
          setList((l) => expire(l, e.key, e.gen)),
        ),
      );
    return () => {
      for (const stop of stops) stop();
    };
  }, [list, reduced]);
  const leaving = list.filter((e) => e.phase === "out").at(-1)?.layer.kind;
  return (
    <LayersIdle value={list.length === 0}>
      <Leaving value={leaving}>
        {under}
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

/**
 * The kind of a layer on its way out, if any: what LayerHost's `under` reads in the same commit
 * as the leave's start (a scene's exit onto the race's result).
 */
export function useLeaving(): Layer["kind"] | undefined {
  return useContext(Leaving);
}

/**
 * The layer's primary control takes the focus while it is in front (L7), without scrolling: at its
 * mount (a restored week too), or once `ready` (the inheritance card's «Continuar» once revealed).
 * A layer that comes in under a sheet on its way out (an outing's pick, a scene from «Historia»:
 * the sheet is still modal, 6.9) takes it once the sheet has closed, if the focus it gave back to
 * what opened it found nothing live.
 */
export function useLayerFocus(ref: RefObject<HTMLElement | null>, ready = true): void {
  const phase = useLayerPhase();
  useLayoutEffect(() => {
    if (phase !== "in" || !ready) return;
    const focus = () => ref.current?.focus({ preventScroll: true });
    focus();
    return onSheetClosed(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active.closest("[inert]")) focus();
    });
  }, [phase, ready, ref]);
}
