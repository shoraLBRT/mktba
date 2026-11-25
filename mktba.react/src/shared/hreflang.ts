/**
 * hreflang between the language versions of an article (O-08, #104): which versions an article
 * page links, by the same rule as the sitemap.
 */
import { LANGUAGES, localizedPath } from '../localization/language';
import { hreflangAlternates, SERVED_LOCALES, type SitemapAlternate } from './sitemap';
import { siteUrlFor } from './siteMeta';
import { articleHref } from './slug';
import type { ArticleTranslationDto } from './types/ApiTypes';

export type HreflangArticle = {
  locale: string;
  slug: string;
  noIndex: boolean;
  translations: readonly ArticleTranslationDto[];
};

const languageOrder = (locale: string): number => {
  const index = (LANGUAGES as readonly string[]).indexOf(locale);
  return index === -1 ? LANGUAGES.length : index;
};

/**
 * The hreflang links of an article page (O-08, #104), by the sitemap's rule: the article itself and
 * each translation that is Published, not noindex and in a served locale, plus `x-default` at the
 * Russian version ({@link hreflangAlternates}). None for a noindex article, an article outside the
 * served locales, or one without such a translation. The page itself needs no status check: the
 * server reads anonymously, so the HTML search engines get is only ever a Published article's; a
 * signed-in editor's translations may include drafts, which are left out here.
 */
export const articleAlternates = (article: HreflangArticle, siteUrl: string): SitemapAlternate[] => {
  if (article.noIndex || !SERVED_LOCALES.includes(article.locale)) return [];

  const versions = [
    { locale: article.locale, slug: article.slug },
    ...article.translations.filter((translation) =>
      translation.status === 'Published'
      && !translation.noIndex
      && translation.locale !== article.locale
      && SERVED_LOCALES.includes(translation.locale)),
  ].sort((a, b) => languageOrder(a.locale) - languageOrder(b.locale));

  return hreflangAlternates(versions.map((version) => ({
    locale: version.locale,
    url: siteUrlFor(localizedPath(version.locale, articleHref(version.slug)), siteUrl),
  })));
};
