/**
 * The site search (R-10, #46): the results page's URL and the limits the API puts on a query
 * (`ArticleSearchService` on the server — keep the numbers the same).
 */
import { APP_CONSTANTS } from '../constants/AppConstants';
import type { Language } from '../localization/language';
import { paragraphAnchorId } from './articleOutline';
import { articleHref } from './slug';
import type { SearchResultDto } from './types/ApiTypes';

export const SEARCH_PATH = '/search';
export const SEARCH_QUERY_PARAM = 'q';
export const SEARCH_PAGE_PARAM = 'page';
/** «Только проверенные» (V-08, #124): `verified=1` in the page's URL, `verified=true` to the API. */
export const SEARCH_VERIFIED_PARAM = 'verified';
export const SEARCH_VERIFIED_VALUE = '1';

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_MAX_QUERY_LENGTH = 200;
export const SEARCH_MAX_PAGE = 100;

/** What a results URL asks for. */
export type SearchRequest = {
  /** Trimmed, whitespace collapsed; may be empty. */
  query: string;
  /** From 1. */
  page: number;
  /** Only the articles verified by scholars (V-08, #124). */
  verified: boolean;
};

export const normalizeSearchQuery = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

/** Whether the API accepts the (normalized) query; otherwise the page asks the reader for one. */
export const isSearchableQuery = (query: string): boolean =>
  query.length >= SEARCH_MIN_QUERY_LENGTH && query.length <= SEARCH_MAX_QUERY_LENGTH;

/** The request in a results URL's query string; a missing or broken page number is page 1. */
export const readSearchRequest = (params: URLSearchParams): SearchRequest => {
  const page = Number(params.get(SEARCH_PAGE_PARAM));
  return {
    query: normalizeSearchQuery(params.get(SEARCH_QUERY_PARAM)),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, SEARCH_MAX_PAGE) : 1,
    verified: params.get(SEARCH_VERIFIED_PARAM) === SEARCH_VERIFIED_VALUE,
  };
};

/**
 * The results page for a query: `/search?q=…`, with `page` from the second page on and
 * `verified=1` when only verified articles are asked for.
 */
export const searchHref = (query: string, page = 1, verified = false): string => {
  const params = new URLSearchParams({ [SEARCH_QUERY_PARAM]: normalizeSearchQuery(query) });
  if (page > 1) {
    params.set(SEARCH_PAGE_PARAM, String(page));
  }
  if (verified) {
    params.set(SEARCH_VERIFIED_PARAM, SEARCH_VERIFIED_VALUE);
  }
  return `${SEARCH_PATH}?${params.toString()}`;
};

/** The results of a query in a language: the page's, each language searches its own articles (I-10, #114). */
export const searchQueryKey = ({ query, page, verified }: SearchRequest, language: Language) =>
  [APP_CONSTANTS.QUERY_KEYS.SEARCH, language, query, page, verified] as const;

/** The API's query string for a request; `verified` only when asked for. */
export const searchApiParams = ({ query, page, verified }: SearchRequest): Record<string, string> => ({
  [SEARCH_QUERY_PARAM]: query,
  [SEARCH_PAGE_PARAM]: String(page),
  ...(verified ? { [SEARCH_VERIFIED_PARAM]: 'true' } : {}),
});

/** Where a result leads: the article, at the paragraph the snippet comes from when there is one. */
export const searchResultHref = (result: Pick<SearchResultDto, 'slug' | 'paragraphId'>): string =>
  result.paragraphId == null ? articleHref(result.slug) : `${articleHref(result.slug)}#${paragraphAnchorId(result.paragraphId)}`;

/** The number of pages a reader can open for `total` results. */
export const searchPageCount = (total: number, pageSize: number): number =>
  Math.min(Math.ceil(total / Math.max(pageSize, 1)), SEARCH_MAX_PAGE);
