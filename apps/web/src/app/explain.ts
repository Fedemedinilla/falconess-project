import { useCallback, useSyncExternalStore } from "react";
import { browserStore, EXPLAIN_KEY, type KeyValueStore, readKey, writeKey } from "../game/storage";
import type { Detail } from "../text/brief";

/**
 * How much the cards explain: one default for the page ("Explicaciones" in the top bar,
 * remembered in this browser when storage works; brief when nothing is known), and each card's own
 * "Breve | Completo", which overrides the default for that card until the default changes again.
 */
export type DetailState = {
  /** The page's default. */
  readonly global: Detail;
  /** The cards switched by hand since the default last changed, by their stable id. */
  readonly cards: ReadonlyMap<string, Detail>;
};

export const DEFAULT_DETAIL: Detail = "brief";

/** A stored value as a detail: anything unknown is the default. */
export function parseDetail(value: string | undefined): Detail {
  return value === "full" || value === "brief" ? value : DEFAULT_DETAIL;
}

/** What a card shows: its own choice, else the page's default. */
export function detailOf(state: DetailState, cardId: string): Detail {
  return state.cards.get(cardId) ?? state.global;
}

export type DetailStore = {
  getSnapshot: () => DetailState;
  subscribe: (onChange: () => void) => () => void;
  /** A new default for every card; it is remembered, and the cards' own choices are dropped. */
  setGlobal: (detail: Detail) => void;
  /** One card's own choice. */
  setCard: (cardId: string, detail: Detail) => void;
};

/**
 * The store over a key-value storage that may be missing or throw (`storage.ts` guards every
 * access); `store` is asked for lazily, the first time the default is read or written.
 */
export function createDetailStore(store: () => KeyValueStore | undefined): DetailStore {
  let kv: { store: KeyValueStore | undefined } | undefined;
  const storage = () => {
    kv ??= { store: store() };
    return kv.store;
  };
  let state: DetailState | undefined;
  const listeners = new Set<() => void>();
  const current = (): DetailState => {
    state ??= { global: parseDetail(readKey(storage(), EXPLAIN_KEY)), cards: new Map() };
    return state;
  };
  const publish = (next: DetailState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: current,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    setGlobal: (detail) => {
      writeKey(storage(), EXPLAIN_KEY, detail);
      publish({ global: detail, cards: new Map() });
    },
    setCard: (cardId, detail) => {
      const { global, cards } = current();
      if (cards.get(cardId) === detail) return;
      publish({ global, cards: new Map(cards).set(cardId, detail) });
    },
  };
}

/** The page's store: `localStorage` when the browser lets the page use it. */
const pageStore = createDetailStore(browserStore);

function useDetailState(): DetailState {
  return useSyncExternalStore(pageStore.subscribe, pageStore.getSnapshot, pageStore.getSnapshot);
}

/** The page's default and its setter (the top bar's "Explicaciones"). */
export function useGlobalDetail(): [Detail, (detail: Detail) => void] {
  return [useDetailState().global, pageStore.setGlobal];
}

/** A card's detail and its setter, by the card's stable id. */
export function useDetail(cardId: string): [Detail, (detail: Detail) => void] {
  const detail = detailOf(useDetailState(), cardId);
  const set = useCallback((d: Detail) => pageStore.setCard(cardId, d), [cardId]);
  return [detail, set];
}
