import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import type { RouteHandle } from '../app/routeHandle';
import { PageMeta } from '../components/PageMeta';
import { useLocale } from '../localization/hooks';
import { languageFromRequest } from '../localization/language';
import SearchPage from '../pages/SearchPage';
import { serverApi } from '../server/api.server';
import { isSearchableQuery, readSearchRequest, searchQueryKey } from '../shared/search';

type SearchRouteData = {
  /**
   * The results from the server; missing when the URL has no usable query, after a client-side
   * navigation, and when the API could not be reached (the browser asks again).
   */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsMeta: true };

/** On the server: the results of the query in the URL, so they are in the HTML. */
export async function loader({ request }: LoaderFunctionArgs): Promise<SearchRouteData> {
  const searchRequest = readSearchRequest(new URL(request.url).searchParams);
  if (!isSearchableQuery(searchRequest.query)) {
    return {};
  }

  const language = languageFromRequest(request);
  const queryClient = createServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: searchQueryKey(searchRequest, language),
    queryFn: () => serverApi.searchArticles(searchRequest, language),
  });

  return { dehydratedState: dehydrate(queryClient) };
}

/** In the browser, after the first page: React Query fetches and caches the results itself. */
export const clientLoader = (): SearchRouteData => ({});

/** The search results page. Results pages are not for search engines: `noindex`, no canonical. */
export default function SearchRoute() {
  const { dehydratedState } = useLoaderData<typeof loader>();
  const t = useLocale().search;
  const [searchParams] = useSearchParams();
  const { query } = readSearchRequest(searchParams);

  return (
    <>
      <PageMeta
        title={isSearchableQuery(query) ? t.documentTitle.replace('{query}', query) : t.title}
        description={null}
        image={null}
        noIndex
      />
      <HydrationBoundary state={dehydratedState}>
        <SearchPage />
      </HydrationBoundary>
    </>
  );
}
