/**
 * The public tag page (M-06, #70), `/tags/{slug}?page=…`: its addresses, query key and the rules
 * the page and its route share.
 */
import { APP_CONSTANTS } from '../constants/AppConstants';
import type { Language } from '../localization/language';
import { tagHref } from './slug';

export { tagHref };

/** URL parameter with the page of the article list; page 1 has none. */
export const TAG_PAGE_PARAM = 'page';

/** A page of the tag's article list; the first one is the tag page itself. */
export const tagPageHref = (slug: string, page: number): string =>
  page > 1 ? `${tagHref(slug)}?${TAG_PAGE_PARAM}=${page}` : tagHref(slug);

/** The list page a URL asks for: a whole number from 1, anything else is page 1. */
export const readTagPage = (params: URLSearchParams): number => {
  const page = Number(params.get(TAG_PAGE_PARAM));
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
};

/** How many pages the list has; at least one. */
export const tagPageCount = (total: number, pageSize: number): number =>
  Math.max(Math.ceil(total / Math.max(pageSize, 1)), 1);

/** A tag's page in a language: a tag belongs to one language (M-06), so its slug is looked up in the page's. */
export const tagPageQueryKey = (slug: string, page: number, language: Language) =>
  [APP_CONSTANTS.QUERY_KEYS.TAG_PAGE, language, slug, page] as const;
