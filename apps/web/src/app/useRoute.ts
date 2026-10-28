import { useSyncExternalStore } from "react";
import { parseHash, type Route, routeHref } from "./route";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;
const serverHash = () => "";

/** The route in `location.hash`, re-rendering on `hashchange`. */
export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, readHash, serverHash));
}

/** Go to a route (a history entry, so Back works). */
export function navigate(route: Route): void {
  if (window.location.hash !== routeHref(route)) window.location.hash = route;
}

/** Go to a route replacing the current history entry (redirects). */
export function redirect(route: Route): void {
  if (window.location.hash !== routeHref(route)) window.location.replace(routeHref(route));
}
