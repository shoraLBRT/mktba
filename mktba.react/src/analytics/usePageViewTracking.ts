import { useEffect, useRef } from 'react';
import { createPath, useLocation, type Location } from 'react-router';
import { MAZHAB_LINK_PARAM } from '../context/mazhabContext';
import { trackPageView } from './metrika';

/**
 * What makes a location a new page view: the path and the query, without the hash (an anchor or a
 * table-of-contents jump stays on the page) and without `?mazhab=` (dropping it after a choice of
 * mazhab replaces the URL, it does not open a page).
 */
export const pageViewKey = (location: Pick<Location, 'pathname' | 'search'>): string => {
  const params = new URLSearchParams(location.search);
  params.delete(MAZHAB_LINK_PARAM);
  const query = params.toString();
  return query ? `${location.pathname}?${query}` : location.pathname;
};

/**
 * Sends a Metrika hit on every client-side navigation to another page (N-01, #51). The page the visit
 * starts on is not sent: the counter's `init` has counted it already. Mounted once, in the root.
 */
export const usePageViewTracking = (): void => {
  const location = useLocation();
  const key = pageViewKey(location);
  const path = createPath(location);
  const previous = useRef<{ key: string; url: string } | null>(null);

  useEffect(() => {
    const url = new URL(path, window.location.origin).href;
    const last = previous.current;
    if (last && last.key !== key) {
      trackPageView(url, last.url, document.title);
    }
    if (!last || last.key !== key) {
      previous.current = { key, url };
    }
  }, [key, path]);
};
