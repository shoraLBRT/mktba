import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { useLoaderData } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import { APP_CONSTANTS } from '../constants/AppConstants';
import MainLayout from '../layouts/MainLayout';
import { serverApi } from '../server/api.server';

type PublicLayoutData = {
  /**
   * The navigation tree for the sidebar and the canonical schools for the header's mazhab picker and
   * the pages below; missing when the API could not be reached (the browser retries).
   */
  dehydratedState?: DehydratedState;
};

/**
 * On the server: the article tree, so the sidebar is in the HTML, and the canonical schools. The
 * schools are loaded here and not by the pages because the header's picker reads them first: a
 * query that exists before a page's HydrationBoundary gets that boundary's data only in an effect,
 * which is too late for the server HTML and the first client render.
 */
export async function loader(): Promise<PublicLayoutData> {
  const queryClient = createServerQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: [APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE],
      queryFn: serverApi.getNavigationTree,
    }),
    queryClient.prefetchQuery({
      queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
      queryFn: serverApi.getSystemSchools,
    }),
  ]);

  return { dehydratedState: dehydrate(queryClient) };
}

/** In the browser, after the first page: React Query fetches and caches the tree itself. */
export const clientLoader = (): PublicLayoutData => ({});

export default function PublicLayoutRoute() {
  const { dehydratedState } = useLoaderData<typeof loader>();

  return (
    <HydrationBoundary state={dehydratedState}>
      <MainLayout />
    </HydrationBoundary>
  );
}
