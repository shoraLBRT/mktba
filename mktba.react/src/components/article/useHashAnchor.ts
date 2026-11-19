import { useEffect, useRef } from 'react';

const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

const hashTarget = (): HTMLElement | null => {
  const hash = window.location.hash.slice(1);
  if (hash.length === 0) return null;
  try {
    return document.getElementById(decodeURIComponent(hash));
  } catch {
    // A malformed escape: look the raw value up.
    return document.getElementById(hash);
  }
};

/**
 * Brings the element named by the URL's `#anchor` into view once the article is on the page, and
 * again whenever `layoutKey` changes or the web fonts arrive — until the reader touches the page.
 *
 * The browser jumps to the anchor on its own only in the server HTML. It does not when the article
 * is fetched in the browser, and it ends up in the wrong place when the text moves afterwards: the
 * reader's mazhab (saved, or from a `?mazhab=` link) swaps opinions of another height or with other
 * headings after hydration, and a late font re-wraps the lines above.
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
    if (!ready) return;
    let cancelled = false;
    const align = () => {
      if (!cancelled && !touchedRef.current) hashTarget()?.scrollIntoView();
    };
    align();
    void document.fonts?.ready.then(align);
    return () => {
      cancelled = true;
    };
  }, [ready, layoutKey]);
};
