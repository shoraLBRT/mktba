import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { LANGUAGES } from '../../localization/language';
import { getArticleContentById } from '../../services/Article/articleService';
import type { ArticleTranslationDto } from '../../shared/types/ApiTypes';

/** The languages an article has no version in yet (I-06, #110): what it can still be translated into. */
export const missingTranslationLocales = (articleLocale: string, translations: readonly ArticleTranslationDto[]): string[] =>
  LANGUAGES.filter((language) => language !== articleLocale && !translations.some((translation) => translation.locale === language));

/** The editor's address for a new translation of `sourceId` into `locale`. */
export const newTranslationPath = (sourceId: number, locale: string): string =>
  `/admin/articles/new?${new URLSearchParams({ translationOf: String(sourceId), locale })}`;

export { languageName } from '../../localization/language';

/** The article a translation is made from, as the editor loads it (shared with the edit page's cache). */
export const useTranslationSource = (sourceId: number | null) =>
  useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, sourceId],
    queryFn: () => getArticleContentById(sourceId!),
    enabled: sourceId !== null,
  });
