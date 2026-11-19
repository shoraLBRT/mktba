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
  /** The API has no published article at this URL. */
  notFound: boolean;
  /** The article and its schools from the server; missing after a client-side navigation. */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsMeta: true };

/**
 * On the server: the article with its schools, so the HTML carries the title and every paragraph.
 * An id link or an old slug is redirected to the current slug URL; an unknown one answers 404.
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
    if (error instanceof ApiError && error.status === 404) {
      return data<ArticleRouteData>({ notFound: true }, { status: 404 });
    }

    throw error;
  }

  if (content.slug && content.slug !== requestedSlug) {
    throw redirect(articleHref(content.slug), 301);
  }

  const queryClient = createServerQueryClient();
  queryClient.setQueryData(articleContentQueryKey(requestedSlug), content);
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
      queryFn: serverApi.getSystemSchools,
    }),
    queryClient.prefetchQuery({
      queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, content.id],
      queryFn: () => serverApi.getSchoolsByArticleId(content.id),
    }),
  ]);

  return data<ArticleRouteData>({ notFound: false, dehydratedState: dehydrate(queryClient) });
}

/** In the browser, after the first page: the page fetches through React Query as before. */
export const clientLoader = () => data<ArticleRouteData>({ notFound: false });

export default function ArticleRoute() {
  const { notFound, dehydratedState } = useLoaderData<typeof loader>();
  // The server reads anonymously: a draft is a 404 there, but a signed-in editor may open it. The
  // page asks the API again once the session is restored, so that request carries the token.
  const signedIn = useSession().accessToken !== null;

  if (notFound && !signedIn) {
    return (
      <>
        <NotFoundMeta />
        <NotFoundPage />
      </>
    );
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <ArticlePage />
    </HydrationBoundary>
  );
}
