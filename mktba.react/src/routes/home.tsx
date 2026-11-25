import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { useLoaderData } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import type { RouteHandle } from '../app/routeHandle';
import { PageMeta } from '../components/PageMeta';
import { SiteStructuredData } from '../components/StructuredData';
import { APP_CONSTANTS } from '../constants/AppConstants';
import HomePage from '../pages/HomePage';
import { serverApi } from '../server/api.server';

type HomeRouteData = {
  /**
   * The new, updated and popular articles from the server; missing after a client-side navigation and when
   * the API could not be reached (the browser retries).
   */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsMeta: true };

/**
 * On the server: the lists of new, updated and popular articles, so they are in the HTML. The sections read
 * the navigation tree the public layout's loader already fetched; the search field leads to /search.
 */
export async function loader(): Promise<HomeRouteData> {
  const queryClient = createServerQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: [APP_CONSTANTS.QUERY_KEYS.RECENT_ARTICLES],
      queryFn: serverApi.getRecentArticles,
    }),
    queryClient.prefetchQuery({
      queryKey: [APP_CONSTANTS.QUERY_KEYS.POPULAR_ARTICLES],
      queryFn: serverApi.getPopularArticles,
    }),
  ]);

  return { dehydratedState: dehydrate(queryClient) };
}

/** In the browser, after the first page: React Query fetches and caches the lists itself. */
export const clientLoader = (): HomeRouteData => ({});

/** The home page: the site's own title, description, default social image and structured data. */
export default function HomeRoute() {
  const { dehydratedState } = useLoaderData<typeof loader>();

  return (
    <>
      <PageMeta path="/" />
      <SiteStructuredData />
      <HydrationBoundary state={dehydratedState}>
        <HomePage />
      </HydrationBoundary>
    </>
  );
}
