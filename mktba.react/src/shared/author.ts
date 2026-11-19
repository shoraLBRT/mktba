/**
 * The public author page (P-01, #89), `/authors/{slug}?page=…`: its addresses, query keys and the
 * few rules the page and its route share.
 */
import { APP_CONSTANTS } from '../constants/AppConstants';
import { SEO_DESCRIPTION_MAX_LENGTH } from './seo';

/** URL parameter with the page of the article list; page 1 has none. */
export const AUTHOR_PAGE_PARAM = 'page';

/** The public page of the author whose profile slug is `slug`. */
export const authorHref = (slug: string): string => `/authors/${encodeURIComponent(slug)}`;

/** A page of the author's article list; the first one is the author page itself. */
export const authorPageHref = (slug: string, page: number): string =>
  page > 1 ? `${authorHref(slug)}?${AUTHOR_PAGE_PARAM}=${page}` : authorHref(slug);

/** The list page a URL asks for: a whole number from 1, anything else is page 1. */
export const readAuthorPage = (params: URLSearchParams): number => {
  const page = Number(params.get(AUTHOR_PAGE_PARAM));
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
};

/** How many pages the list has; at least one, so an empty list is still «page 1». */
export const authorPageCount = (total: number, pageSize: number): number =>
  Math.max(Math.ceil(total / Math.max(pageSize, 1)), 1);

export const authorQueryKey = (slug: string) => [APP_CONSTANTS.QUERY_KEYS.AUTHOR, slug] as const;

export const authorArticlesQueryKey = (slug: string, page: number) =>
  [APP_CONSTANTS.QUERY_KEYS.AUTHOR_ARTICLES, slug, page] as const;

/** The letter shown in place of a missing or broken avatar. */
export const authorInitial = (displayName: string): string =>
  Array.from(displayName.trim())[0]?.toLocaleUpperCase('ru-RU') ?? '';

/**
 * The page's meta description: the author's own text on one line, cut on a word boundary, or
 * `fallback` when the profile has none.
 */
export const authorMetaDescription = (bio: string | null | undefined, fallback: string): string => {
  const text = (bio ?? '').replace(/\s+/g, ' ').trim();
  if (text.length === 0) return fallback;
  if (text.length <= SEO_DESCRIPTION_MAX_LENGTH) return text;

  const cut = text.slice(0, SEO_DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?—–-]+$/u, '')}…`;
};
