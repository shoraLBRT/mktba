import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { data, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import type { RouteHandle } from '../app/routeHandle';
import { NotFoundMeta } from '../components/PageMeta';
import { APP_CONSTANTS } from '../constants/AppConstants';
import ArticlePage from '../pages/ArticlePage';
import NotFoundPage from '../pages/NotFoundPage';
import { serverApi } from '../server/api.server';
import { useSession } from '../services/session';
import { articleContentQueryKey, parseLegacyArticleId } from '../services/Article/articleQueries';
import { ApiError } from '../shared/api-client/apiError';
import { articleHref } from '../shared/slug';

type ArticleRouteData = {
  /**
   * Why the API has no published article at this URL: 404 never was (or not public), 410 removed
   * on purpose (deleted or archived after publication). Null when the article is here.
   */
  missing: 404 | 410 | null;
  /** The article and its schools from the server; missing after a client-side navigation. */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsMeta: true };

/**
 * On the server: the article with its schools, so the HTML carries the title and every paragraph.
 * An id link or an old slug is redirected to the current slug URL; an unknown one answers 404 and
 * a removed one 410. An API that fails answers 503 (see `serverApi`).
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const requestedSlug = params.slug ?? '';
  const legacyArticleId = parseLegacyArticleId(requestedSlug);

  let content;
  try {
    content = legacyArticleId !== null
      ? await serverApi.getArticleContentById(legacyArticleId)
      : await serverApi.getArticleContentBySlug(requestedSlug);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
      return data<ArticleRouteData>({ missing: error.status }, { status: error.status });
    }

    throw error;
  }

  if (content.slug && content.slug !== requestedSlug) {
    throw redirect(articleHref(content.slug), 301);
  }

  const queryClient = createServerQueryClient();
  queryClient.setQueryData(articleContentQueryKey(requestedSlug), content);
  // The canonical schools come from the public layout's loader.
  await queryClient.prefetchQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, content.id],
    queryFn: () => serverApi.getSchoolsByArticleId(content.id),
  });

  return data<ArticleRouteData>({ missing: null, dehydratedState: dehydrate(queryClient) });
}

/** In the browser, after the first page: the page fetches through React Query as before. */
export const clientLoader = () => data<ArticleRouteData>({ missing: null });

export default function ArticleRoute() {
  const { missing, dehydratedState } = useLoaderData<typeof loader>();
  // The server reads anonymously: a draft is a 404 there (an archived article a 410), but a
  // signed-in editor may open it. The page asks the API again once the session is restored, so
  // that request carries the token.
  const signedIn = useSession().accessToken !== null;

  if (missing !== null && !signedIn) {
    return (
      <>
        <NotFoundMeta status={missing} />
        <NotFoundPage status={missing} />
      </>
    );
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <ArticlePage />
    </HydrationBoundary>
  );
}
