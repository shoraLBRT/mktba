import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False while the server renders and while the browser hydrates that HTML, true afterwards.
 * Values kept in `localStorage` are read only once it is true, so the first client render matches
 * the server's and the stored choice appears right after hydration.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(subscribe, () => true, () => false);
