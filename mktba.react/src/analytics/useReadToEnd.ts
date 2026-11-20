import { useEffect, type RefObject } from 'react';

/**
 * Calls `onReached` once when the element marking the end of a text comes into view: the reader has
 * scrolled to the end (N-01, #51). A new `onReached` observes again, so pass a memoized callback that
 * changes only with the text (the article id): a re-render or a change of mazhab then counts nothing
 * twice. `enabled: false` observes nothing (a stub has no text to read).
 */
export const useReadToEnd = (endRef: RefObject<Element | null>, enabled: boolean, onReached: () => void): void => {
  useEffect(() => {
    const target = endRef.current;
    if (!enabled || !target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        onReached();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [endRef, enabled, onReached]);
};
