/**
 * Hash routes of the tester page. Plain names only (`#temporada`), never `#/path`: the published
 * Artifact passes nothing else between its link and `location.hash`.
 */
export const ROUTES = ["inicio", "temporada", "carrera", "carrera-libre", "fin"] as const;
export type Route = (typeof ROUTES)[number];
export const START_ROUTE: Route = "inicio";

export function isRoute(name: string): name is Route {
  return (ROUTES as readonly string[]).includes(name);
}

/** The route of a `location.hash`; the start view for an empty or unknown hash. */
export function parseHash(hash: string): Route {
  const name = hash.startsWith("#") ? hash.slice(1) : hash;
  return isRoute(name) ? name : START_ROUTE;
}

/** The `href` of a route. */
export function routeHref(route: Route): `#${Route}` {
  return `#${route}`;
}
