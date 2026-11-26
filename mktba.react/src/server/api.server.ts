import { API_BASE_URL } from '../config';
import { articleLocaleParams, articleLocaleQuery, type Language } from '../localization/language';
import { ApiError } from '../shared/api-client/apiError';
import { AUTHOR_PAGE_PARAM } from '../shared/author';
import { SEARCH_PAGE_PARAM, SEARCH_QUERY_PARAM, type SearchRequest } from '../shared/search';
import { TAG_PAGE_PARAM } from '../shared/tag';
import type {
  ArticleContentDto,
  ArticleVerificationDto,
  IndexNowKeyDto,
  AuthorArticlesDto,
  NavigationArticleDto,
  PopularArticlesDto,
  PublicProfileDto,
  RecentArticlesDto,
  SchoolDto,
  SearchResultsDto,
  SitemapArticleDto,
  TagPageDto,
} from '../shared/types/ApiTypes';

// Node's `process`; the app's TypeScript config has browser types only.
declare const process: { env: Record<string, string | undefined> };

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Where the SSR server reaches the API: `API_INTERNAL_URL` at runtime (an address inside the
 * deployment), else the browser's base URL (`VITE_API_BASE_URL`, baked in at build time).
 */
const apiBaseUrl = (): string => (process.env.API_INTERNAL_URL?.trim() || API_BASE_URL).replace(/\/+$/, '');

/** How long a crawler is asked to wait before retrying a page the API could not serve. */
const RETRY_AFTER_SECONDS = 120;

/**
 * What a loader throws when the API is down, timed out or failed (5xx): a 503 the route error
 * boundary renders, so the page is not served as 200 and crawlers retry instead of dropping it.
 */
const apiUnavailable = () =>
  new Response(null, { status: 503, headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) } });

/**
 * An anonymous GET against the API; follows redirects. A 4xx answer throws `ApiError` with the
 * status; no answer or a 5xx throws a 503 `Response`.
 */
const getJson = async <T>(path: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw apiUnavailable();
  }

  if (response.status >= 500) {
    throw apiUnavailable();
  }

  if (!response.ok) {
    throw new ApiError(`GET ${path} answered ${response.status}`, response.status);
  }

  return (await response.json()) as T;
};

/** The API calls the server loaders make; anonymous, so they see published content only. */
export const serverApi = {
  /** The reader's tree: only the language's articles (I-06, #110). */
  getNavigationTree: (language: Language) => getJson<NavigationArticleDto[]>(`/navigationTree/tree?locale=${language}`),
  getArticleContentById: (id: number) => getJson<ArticleContentDto>(`/articles/${id}/content`),
  getArticleVerification: (id: number) => getJson<ArticleVerificationDto>(`/articles/${id}/verification`),
  getArticleContentBySlug: (slug: string, language: Language) =>
    getJson<ArticleContentDto>(`/articles/by-slug/${encodeURIComponent(slug)}/content${articleLocaleQuery(language)}`),
  getSitemapArticles: () => getJson<SitemapArticleDto[]>('/articles/sitemap'),
  getIndexNowKey: () => getJson<IndexNowKeyDto>('/seo/indexnow-key'),
  getRecentArticles: (language: Language) => getJson<RecentArticlesDto>(`/articles/recent${articleLocaleQuery(language)}`),
  getPopularArticles: (language: Language) => getJson<PopularArticlesDto>(`/articles/popular${articleLocaleQuery(language)}`),
  searchArticles: ({ query, page }: SearchRequest, language: Language) =>
    getJson<SearchResultsDto>(
      `/search?${new URLSearchParams({ [SEARCH_QUERY_PARAM]: query, [SEARCH_PAGE_PARAM]: String(page), ...articleLocaleParams(language) }).toString()}`,
    ),
  getAuthor: (slug: string) => getJson<PublicProfileDto>(`/authors/${encodeURIComponent(slug)}`),
  getAuthorArticles: (slug: string, page: number, language: Language) =>
    getJson<AuthorArticlesDto>(
      `/authors/${encodeURIComponent(slug)}/articles?${new URLSearchParams({ [AUTHOR_PAGE_PARAM]: String(page), ...articleLocaleParams(language) }).toString()}`,
    ),
  getTagPage: (slug: string, page: number, language: Language) =>
    getJson<TagPageDto>(
      `/tags/${encodeURIComponent(slug)}?${new URLSearchParams({ [TAG_PAGE_PARAM]: String(page), ...articleLocaleParams(language) }).toString()}`,
    ),
  getSystemSchools: (language: Language) => getJson<SchoolDto[]>(`/schools/system${articleLocaleQuery(language)}`),
  getSchoolsByArticleId: (articleId: number) => getJson<SchoolDto[]>(`/schools/article/${articleId}`),
};
