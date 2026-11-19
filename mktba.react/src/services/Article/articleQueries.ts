import { APP_CONSTANTS } from '../../constants/AppConstants';

/** `/article/{id}` links from before slugs: the id, or null for a slug. */
export const parseLegacyArticleId = (requestedSlug: string): number | null =>
  /^\d+$/.test(requestedSlug) ? Number(requestedSlug) : null;

/** The React Query key of the article content an `/article/{slug-or-id}` URL shows. */
export const articleContentQueryKey = (requestedSlug: string) => {
  const legacyArticleId = parseLegacyArticleId(requestedSlug);
  return legacyArticleId !== null
    ? [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, legacyArticleId]
    : [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', requestedSlug];
};
