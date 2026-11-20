import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import type { RouteHandle } from '../app/routeHandle';
import { NotFoundMeta } from '../components/PageMeta';
import NotFoundPage from '../pages/NotFoundPage';
import TagPage from '../pages/TagPage';
import { serverApi } from '../server/api.server';
import { ApiError } from '../shared/api-client/apiError';
import { readTagPage, tagPageQueryKey } from '../shared/tag';

type TagRouteData = {
  /** True when the API has no tag page at this address: the server answered 404. */
  missing: boolean;
  /** The tag and its list page from the server; missing after a client-side navigation. */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsMeta: true };

/**
 * On the server: the tag and the requested page of its articles, so both are in the HTML. A tag
 * that does not exist, or that no article a reader can open carries, answers 404; an API that
 * fails answers 503 (see `serverApi`).
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';
  const page = readTagPage(new URL(request.url).searchParams);

  let tagPage;
  try {
    tagPage = await serverApi.getTagPage(slug, page);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return data<TagRouteData>({ missing: true }, { status: 404 });
    }

    throw error;
  }

  const queryClient = createServerQueryClient();
  queryClient.setQueryData(tagPageQueryKey(slug, page), tagPage);
  return data<TagRouteData>({ missing: false, dehydratedState: dehydrate(queryClient) });
}

/** In the browser, after the first page: the page fetches through React Query and shows its own 404. */
export const clientLoader = () => data<TagRouteData>({ missing: false });

export default function TagRoute() {
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
      <TagPage />
    </HydrationBoundary>
  );
}
