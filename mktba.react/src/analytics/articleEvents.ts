import { useEffect, type RefObject } from 'react';

/** The shares of the text, in percent, a reader is counted for passing (N-02, #96). */
export const SCROLL_DEPTHS = [25, 50, 75, 100] as const;

/**
 * Calls `onDepth` once for each of {@link SCROLL_DEPTHS} the bottom of the window passes in the
 * text element, in order (a jump to the end reports every depth before it). A new `onDepth`
 * starts counting again, so pass one memoized on the article id. `enabled: false` measures nothing.
 */
export const useScrollDepth = (
  textRef: RefObject<Element | null>,
  enabled: boolean,
  onDepth: (depth: number) => void,
): void => {
  useEffect(() => {
    const target = textRef.current;
    if (!enabled || !target) return;

    let reached = 0;
    let frame = 0;
    let pending = false;
    const measure = () => {
      pending = false;
      const rect = target.getBoundingClientRect();
      if (rect.height <= 0) return;
      const passed = ((window.innerHeight - rect.top) / rect.height) * 100;
      for (const depth of SCROLL_DEPTHS) {
        if (depth > reached && passed >= depth) {
          reached = depth;
          onDepth(depth);
        }
      }
      if (reached === 100) window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (pending) cancelAnimationFrame(frame);
    };
  }, [textRef, enabled, onDepth]);
};

/**
 * Calls `onShown` with the id of each paragraph marked `data-paragraph-id` inside the container
 * the first time it comes into view. Observing starts again only when `paragraphKey` or `onShown`
 * changes — pass the ids of the paragraphs and a callback memoized on the article — so a change of
 * mazhab or opinion reports nothing twice. An empty `paragraphKey` observes nothing.
 */
export const useOpinionImpressions = (
  containerRef: RefObject<Element | null>,
  paragraphKey: string,
  onShown: (paragraphId: number) => void,
): void => {
  useEffect(() => {
    const container = containerRef.current;
    if (!paragraphKey || !container || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        onShown(Number((entry.target as HTMLElement).dataset.paragraphId));
      }
    });
    container.querySelectorAll('[data-paragraph-id]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [containerRef, paragraphKey, onShown]);
};

/**
 * Calls `onFollow` with the path of a link clicked inside the element when it leads to another
 * page of this site: another origin, and the anchors of the page itself, are not counted.
 */
export const useInternalLinkClicks = (
  rootRef: RefObject<Element | null>,
  enabled: boolean,
  onFollow: (path: string) => void,
): void => {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    const handleClick = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      onFollow(url.pathname);
    };
    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [rootRef, enabled, onFollow]);
};
