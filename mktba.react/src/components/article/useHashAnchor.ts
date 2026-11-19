import { useEffect, useRef } from 'react';

const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Brings the element named by the URL's `#anchor` into view once the article is on the page, and
 * again whenever `layoutKey` changes before the reader has touched the page.
 *
 * The browser jumps to the anchor on its own only in the server HTML. It does not when the article
 * is fetched in the browser, and it lands in the wrong place when the reader's mazhab (saved, or
 * from a `?mazhab=` link) swaps opinions of another height or with other headings after hydration.
 */
export const useHashAnchor = (ready: boolean, layoutKey: string): void => {
  const touchedRef = useRef(false);

  useEffect(() => {
    const markTouched = () => {
      touchedRef.current = true;
    };
    USER_INPUT_EVENTS.forEach((type) => window.addEventListener(type, markTouched, { passive: true }));
    return () => USER_INPUT_EVENTS.forEach((type) => window.removeEventListener(type, markTouched));
  }, []);

  useEffect(() => {
    if (!ready || touchedRef.current) return;
    const hash = window.location.hash.slice(1);
    if (hash.length === 0) return;
    let id = hash;
    try {
      id = decodeURIComponent(hash);
    } catch {
      // A malformed escape: look the raw value up.
    }
    document.getElementById(id)?.scrollIntoView();
  }, [ready, layoutKey]);
};
