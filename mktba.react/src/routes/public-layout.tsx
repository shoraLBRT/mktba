import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { useLoaderData } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import { APP_CONSTANTS } from '../constants/AppConstants';
import MainLayout from '../layouts/MainLayout';
import { serverApi } from '../server/api.server';

type PublicLayoutData = {
  /** The navigation tree for the sidebar; missing when the API could not be reached (the browser retries). */
  dehydratedState?: DehydratedState;
};

/** On the server: the article tree, so the sidebar is in the HTML. */
export async function loader(): Promise<PublicLayoutData> {
  const queryClient = createServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE],
    queryFn: serverApi.getNavigationTree,
  });

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
