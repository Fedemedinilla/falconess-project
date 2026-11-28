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

const FROM_FRAME = { fromFrame: true } as const;

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
 * it never ends a beat or plays a sound; its own timer, armed here from the frame its fade starts
 * on, removes it once the fade has played, never an animation's end (a flow timer: a hidden tab
 * holds it with the fade, 6.11). A new layer comes in
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
  // when each leaving copy's fade began (`key#gen` → the time in sight): the first frame after the
  // commit that made it leave, where its CSS fade starts, a slow commit or a late frame after `since`
  const [fadeFrom] = useState(() => new Map<string, number>());
  // each leaving layer goes once its fade has played (final review P1: counted from `since` it went
  // 4-36 ms early and was cut half-faded): its time counts from the frame after that one, as the
  // browser may set a CSS animation's start a frame after the frame that styled it; a flow timer,
  // so a hidden tab holds the copy where its fade stands
  useEffect(() => {
    const stops: (() => void)[] = [];
    const ids = new Set<string>();
    for (const e of list) {
      if (e.phase !== "out") continue;
      const id = `${e.key}#${e.gen}`;
      ids.add(id);
      const ms = outMs(e.layer.kind, reduced);
      const remove = () => setList((l) => expire(l, e.key, e.gen));
      const began = fadeFrom.get(id);
      if (began !== undefined)
        stops.push(startFlowTimer(Math.max(0, began + ms - visibleNow()), remove, FROM_FRAME));
      else
        stops.push(
          startFlowTimer(
            0,
            () => {
              fadeFrom.set(id, visibleNow());
              stops.push(startFlowTimer(ms, remove, FROM_FRAME));
            },
            FROM_FRAME,
          ),
        );
    }
    for (const id of fadeFrom.keys()) if (!ids.has(id)) fadeFrom.delete(id);
    return () => {
      for (const stop of stops) stop();
    };
  }, [list, reduced, fadeFrom]);
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
 * A layer that comes in with a sheet's close request (an outing's pick, a scene from «Historia»:
 * the sheet is still modal while the layer mounts, in the same commit) takes it once the sheet has
 * closed, which is at that request (6.9, ADR-0017 open decision 2), if the focus it gave back to
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
