import { createContext, useContext } from 'react';

/**
 * The public address of the site (`PUBLIC_SITE_URL`, else the origin of the first request), which
 * canonical links, og:url and site-relative images are built on. Set once by the root route.
 */
export const SiteUrlContext = createContext<string | null>(null);

/** The site address; outside a provider (tests, a page without the root) the browser's own origin. */
export const useSiteUrl = (): string =>
  useContext(SiteUrlContext) ?? (typeof window === 'undefined' ? '' : window.location.origin);
