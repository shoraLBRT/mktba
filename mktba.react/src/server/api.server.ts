import { API_BASE_URL } from '../config';
import { ApiError } from '../shared/api-client/apiError';
import type { ArticleContentDto, NavigationArticleDto, SchoolDto } from '../shared/types/ApiTypes';

// Node's `process`; the app's TypeScript config has browser types only.
declare const process: { env: Record<string, string | undefined> };

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Where the SSR server reaches the API: `API_INTERNAL_URL` at runtime (an address inside the
 * deployment), else the browser's base URL (`VITE_API_BASE_URL`, baked in at build time).
 */
const apiBaseUrl = (): string => (process.env.API_INTERNAL_URL?.trim() || API_BASE_URL).replace(/\/+$/, '');

/** An anonymous GET against the API; follows redirects, throws `ApiError` with the status otherwise. */
const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ApiError(`GET ${path} answered ${response.status}`, response.status);
  }

  return (await response.json()) as T;
};

/** The API calls the server loaders make; anonymous, so they see published content only. */
export const serverApi = {
  getNavigationTree: () => getJson<NavigationArticleDto[]>('/navigationTree/tree'),
  getArticleContentById: (id: number) => getJson<ArticleContentDto>(`/articles/${id}/content`),
  getArticleContentBySlug: (slug: string) =>
    getJson<ArticleContentDto>(`/articles/by-slug/${encodeURIComponent(slug)}/content`),
  getSystemSchools: () => getJson<SchoolDto[]>('/schools/system'),
  getSchoolsByArticleId: (articleId: number) => getJson<SchoolDto[]>(`/schools/article/${articleId}`),
};
