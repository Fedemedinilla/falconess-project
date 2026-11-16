import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import type { Layer } from "./flow/types";

/** No layer is in front or leaving: a notice may show. */
const LayersIdle = createContext(true);

const keep = (id: string): string | undefined => id;

/**
 * The one full-screen layer in front of the game (plan §1.9): the week's effects, the inheritance
 * card, a story scene, the emblem or the event dialog, rendered from the flow's `layer` by
 * `render`, inside a wrapper that names its phase for the frame probe (`data-layer-phase`). Its
 * `children` (the notices) sit after it and learn whether the layers are idle.
 *
 * v0 (4.1): the host is instant. A layer is in front while it is the flow's and leaves the page
 * with it, so at most one is ever there and its ids are always its own. 6.1 keeps a leaving layer
 * mounted, without its ids, until its exit ends, without changing this API.
 */
export function LayerHost({
  top,
  render,
  children,
}: {
  readonly top: Layer | undefined;
  readonly render: (layer: Layer) => ReactElement;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <LayersIdle value={top === undefined}>
      {top && (
        // keyed by the beat: a new beat is a new instance, the same one keeps playing
        <div
          key={top.key}
          style={{ display: "contents" }}
          data-layer={top.kind}
          data-layer-phase="in"
        >
          {render(top)}
        </div>
      )}
      {children}
    </LayersIdle>
  );
}

/** A layer's ids, only while it is in front (v0: a layer is always in front while it is there). */
export function useLid(): (id: string) => string | undefined {
  return keep;
}

/** No layer is in front or leaving: a notice waits for this. */
export function useLayersIdle(): boolean {
  return useContext(LayersIdle);
}
