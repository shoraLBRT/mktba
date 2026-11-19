import { dehydrate, HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { data, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { createServerQueryClient } from '../app/queryClient';
import type { RouteHandle } from '../app/routeHandle';
import { DefaultDocumentTitle } from '../components/DefaultDocumentTitle';
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
  /** Origin the canonical link and og:url are built on. */
  origin: string;
  /** The article and its schools from the server; missing after a client-side navigation. */
  dehydratedState?: DehydratedState;
};

export const handle: RouteHandle = { ownsTitle: true };

/**
 * On the server: the article with its schools, so the HTML carries the title and every paragraph.
 * An id link or an old slug is redirected to the current slug URL; an unknown one answers 404.
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  const requestedSlug = params.slug ?? '';
  const legacyArticleId = parseLegacyArticleId(requestedSlug);
  const origin = new URL(request.url).origin;

  let content;
  try {
    content = legacyArticleId !== null
      ? await serverApi.getArticleContentById(legacyArticleId)
      : await serverApi.getArticleContentBySlug(requestedSlug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return data<ArticleRouteData>({ notFound: true, origin }, { status: 404 });
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

  return data<ArticleRouteData>({ notFound: false, origin, dehydratedState: dehydrate(queryClient) });
}

/** In the browser, after the first page: the page fetches through React Query as before. */
export const clientLoader = () => data<ArticleRouteData>({ notFound: false, origin: window.location.origin });

export default function ArticleRoute() {
  const { notFound, origin, dehydratedState } = useLoaderData<typeof loader>();
  // The server reads anonymously: a draft is a 404 there, but a signed-in editor may open it. The
  // page asks the API again once the session is restored, so that request carries the token.
  const signedIn = useSession().accessToken !== null;

  if (notFound && !signedIn) {
    return (
      <>
        <DefaultDocumentTitle />
        <NotFoundPage />
      </>
    );
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <ArticlePage origin={origin} />
    </HydrationBoundary>
  );
}
