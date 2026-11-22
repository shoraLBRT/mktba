import { APP_CONSTANTS } from '../../constants/AppConstants';
import type { Language } from '../../localization/language';

/** `/article/{id}` links from before slugs: the id, or null for a slug. */
export const parseLegacyArticleId = (requestedSlug: string): number | null =>
  /^\d+$/.test(requestedSlug) ? Number(requestedSlug) : null;

/**
 * The React Query key of the article content an `/article/{slug-or-id}` URL shows. A slug is unique
 * within a language only, so its key carries the language of the URL (I-01, #105).
 */
export const articleContentQueryKey = (requestedSlug: string, language: Language) => {
  const legacyArticleId = parseLegacyArticleId(requestedSlug);
  return legacyArticleId !== null
    ? [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, legacyArticleId]
    : [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', language, requestedSlug];
};
