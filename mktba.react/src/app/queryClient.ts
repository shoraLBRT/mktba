import { QueryClient } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { ApiError } from '../shared/api-client/apiError';

/** How many times a failed query is retried, unless the API refused it outright. */
export const QUERY_MAX_RETRIES = 3;

/**
 * A 4xx answer (unknown article, missing auth) will not change on retry, so it is shown at once;
 * network and 5xx failures are retried up to {@link QUERY_MAX_RETRIES} times.
 */
export const shouldRetryQuery = (failureCount: number, error: unknown) => {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }

  return failureCount < QUERY_MAX_RETRIES;
};

/** How long fetched data counts as fresh: a remount or a route change within it is served from cache. */
export const QUERY_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * The app-wide query client. Content changes only through the admin panel, and every admin
 * mutation invalidates the queries it affects, so data stays fresh for {@link QUERY_STALE_TIME_MS}
 * and is not refetched when the window regains focus.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
    },
  });

/**
 * Marks every query that shows article data as stale after an article is created, edited or
 * deleted: the navigation tree, the admin article list, article content and revision history. Mounted queries
 * refetch at once; the others refetch on their next mount.
 */
export const invalidateArticleQueries = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE] }),
    queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES] }),
    queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT] }),
    queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS] }),
  ]);
