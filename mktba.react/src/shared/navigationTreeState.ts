import { useSyncExternalStore } from 'react';

/**
 * Which sections of the navigation tree the reader has collapsed, kept in `localStorage` and shared
 * by every tree on the page (the sidebar, its mobile drawer, the admin tree) and by other tabs.
 *
 * Only collapsed ids are stored: a section nobody touched is expanded, so the server HTML — which
 * knows nothing of this state — holds every link of the tree, and a new article is visible at once.
 */
export const NAVIGATION_TREE_COLLAPSED_STORAGE_KEY = 'mktba.navTree.collapsed';

let collapsedIds: Set<number> | null = null;
const listeners = new Set<() => void>();

const readStored = (): Set<number> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : []);
  } catch {
    return new Set();
  }
};

const current = (): Set<number> => (collapsedIds ??= readStored());

const notify = () => listeners.forEach((listener) => listener());

const commit = (next: Set<number>) => {
  collapsedIds = next;
  try {
    localStorage.setItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Storage blocked: the state lasts until the page is reloaded.
  }
  notify();
};

const onStorage = (event: StorageEvent) => {
  if (event.key !== null && event.key !== NAVIGATION_TREE_COLLAPSED_STORAGE_KEY) return;
  collapsedIds = null;
  notify();
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
};

/** Collapses or expands one section and saves the choice. */
export const setSectionCollapsed = (articleId: number, collapsed: boolean) => {
  if (current().has(articleId) === collapsed) return;
  const next = new Set(current());
  if (collapsed) next.add(articleId);
  else next.delete(articleId);
  commit(next);
};

/** Expands every listed section that is collapsed (the ancestors of the article being read). */
export const expandSections = (articleIds: number[]) => {
  if (!articleIds.some((id) => current().has(id))) return;
  const next = new Set(current());
  articleIds.forEach((id) => next.delete(id));
  commit(next);
};

/**
 * Whether the reader collapsed the section. The server and the hydrating render answer `false`
 * (everything expanded); the saved state applies right after hydration, without a mismatch.
 */
export const useSectionCollapsed = (articleId: number): boolean =>
  useSyncExternalStore(
    subscribe,
    () => current().has(articleId),
    () => false,
  );

const NOTHING_COLLAPSED: ReadonlySet<number> = new Set();

/**
 * The whole set of collapsed sections, for a tree that lays its rows out itself (the windowed mode
 * of `NavigationTree`). Like `useSectionCollapsed`, it is empty on the server and while hydrating.
 */
export const useCollapsedSections = (): ReadonlySet<number> =>
  useSyncExternalStore(subscribe, current, () => NOTHING_COLLAPSED);

/** Test hook: forgets the in-memory copy so the next read comes from `localStorage`. */
export const resetNavigationTreeStateForTests = () => {
  collapsedIds = null;
};
