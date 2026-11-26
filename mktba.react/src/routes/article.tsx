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
import { languageFromRequest } from '../localization/language';
import { resolveMissingTranslation } from '../server/missingTranslation.server';
import { ApiError } from '../shared/api-client/apiError';
import { articleUrlTarget, fetchArticleForUrl } from '../shared/missingTranslation';

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
 * An old `/article/{slug-or-id}` URL, an id or an old slug is redirected (301, the query kept) to the
 * current `/{slug}` (`/en/{slug}` for an English article); an unknown one answers 404 and a removed one 410. An API that fails answers
 * 503 (see `serverApi`). A slug of another language's article (the language switcher, I-08 #112)
 * redirects (302) to its published translation, else shows the original or, with
 * `MISSING_TRANSLATION=hide`, redirects (302) to the language's home ({@link articleUrlTarget}).
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  const requestedSlug = params.slug ?? '';
  // `/en/{slug}` is the English article with that slug (D6, #21): a slug is unique within a language.
  const language = languageFromRequest(request);
  const legacyArticleId = parseLegacyArticleId(requestedSlug);

  let content;
  try {
    content = legacyArticleId !== null
      ? await serverApi.getArticleContentById(legacyArticleId)
      : await fetchArticleForUrl(requestedSlug, language, serverApi.getArticleContentBySlug);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
      return data<ArticleRouteData>({ missing: error.status }, { status: error.status });
    }

    throw error;
  }

  const url = new URL(request.url);
  const target = articleUrlTarget(content, {
    language,
    pathname: url.pathname,
    legacyLink: legacyArticleId !== null,
    mode: resolveMissingTranslation(),
  });
  if (target) {
    throw redirect(`${target.path}${url.search}`, target.permanent ? 301 : 302);
  }

  const queryClient = createServerQueryClient();
  queryClient.setQueryData(articleContentQueryKey(requestedSlug, language), content);
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
