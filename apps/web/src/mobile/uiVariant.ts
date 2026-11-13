/**
 * Mockup switches (owner 2026-11-13: «armá las interfaces y mostrámelas»): the training screen's
 * candidate layouts, chosen from the browser (`localStorage["falconess.ui.crews"]` 1-3,
 * `["falconess.ui.result"]` 4-5). Unset, the game is as it was. Temporary: the chosen ones stay
 * as the only layout and this module goes.
 */
function read(key: string): number {
  try {
    return Number(globalThis.localStorage?.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 0: one portrait and «+N»; 1: a column of all; 2: avatars on the buttons; 3: a strip over the stats. */
export function crewsVariant(): number {
  return read("falconess.ui.crews");
}

/** 0: as it is; 4: the stats slide to the bottom; 5: and the crews come in. */
export function resultVariant(): number {
  return read("falconess.ui.result");
}
