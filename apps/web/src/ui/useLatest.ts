import { useLayoutEffect, useRef } from "react";

/**
 * A ref that always holds the latest `value`, for callbacks a timer or an animation calls later:
 * the effect that arms the timer then depends on nothing that changes identity on each render
 * (an inline arrow), so a parent's re-render never restarts it (critic (c)5).
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
