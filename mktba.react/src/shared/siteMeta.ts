/**
 * Site-wide document metadata rules (O-04, #55): one place for the title template, the default
 * social image and the URLs every page's tags are built on.
 */
import { toAbsoluteUrl } from './seo';

/** The default social image (1200×630), served from `public/`. */
export const DEFAULT_SOCIAL_IMAGE_PATH = '/og-default.png';
/** `og:locale` of every page: the UI is Russian only. */
export const OG_LOCALE = 'ru_RU';

/** Robots directives: a page kept out of the index, and one whose links are not followed either. */
export const ROBOTS_NOINDEX = 'noindex';
export const ROBOTS_NOINDEX_NOFOLLOW = 'noindex, nofollow';

const TITLE_SEPARATOR = ' — ';

/** `<title>` of a page: "{page} — {site}", or the site's own title for a page without one. */
export const documentTitle = (page: string | undefined, siteName: string, siteTitle: string): string =>
  page ? `${page}${TITLE_SEPARATOR}${siteName}` : siteTitle;

/** An absolute URL on the site; the single place canonical links and og:url are made. */
export const siteUrlFor = (pathOrUrl: string, siteUrl: string): string => toAbsoluteUrl(pathOrUrl, siteUrl);
