import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import type { RouteHandle } from '../app/routeHandle';
import { NotFoundMeta } from '../components/PageMeta';
import { languageFromRequest } from '../localization/language';
import AuthorPage from '../pages/AuthorPage';
import NotFoundPage from '../pages/NotFoundPage';
import { serverApi } from '../server/api.server';
import { ApiError } from '../shared/api-client/apiError';
import { authorArticlesQueryKey, authorQueryKey, readAuthorPage } from '../shared/author';

type AuthorRouteData = {
  /** True when the API has no public author at this address: the server answered 404. */
  missing: boolean;
  /** The profile and the list page from the server; missing after a client-side navigation. */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsMeta: true };

/**
 * On the server: the author's public profile and the requested page of their articles, so both are
 * in the HTML. An unknown author, or one readers may not see, answers 404; an API that fails
 * answers 503 (see `serverApi`). A list that could not be read is fetched again by the browser.
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';
  const page = readAuthorPage(new URL(request.url).searchParams);
  const language = languageFromRequest(request);

  let profile;
  try {
    profile = await serverApi.getAuthor(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return data<AuthorRouteData>({ missing: true }, { status: 404 });
    }

    throw error;
  }

  const queryClient = createServerQueryClient();
  queryClient.setQueryData(authorQueryKey(slug), profile);
  await queryClient.prefetchQuery({
    queryKey: authorArticlesQueryKey(slug, page, language),
    queryFn: () => serverApi.getAuthorArticles(slug, page, language),
  });

  return data<AuthorRouteData>({ missing: false, dehydratedState: dehydrate(queryClient) });
}

/** In the browser, after the first page: the page fetches through React Query and shows its own 404. */
export const clientLoader = () => data<AuthorRouteData>({ missing: false });

export default function AuthorRoute() {
  const { missing, dehydratedState } = useLoaderData<typeof loader>();

  if (missing) {
    return (
      <>
        <NotFoundMeta />
        <NotFoundPage />
      </>
    );
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <AuthorPage />
    </HydrationBoundary>
  );
}
