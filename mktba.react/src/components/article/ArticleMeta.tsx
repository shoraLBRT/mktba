import { useSiteUrl } from '../../app/siteUrl';
import { DEFAULT_LANGUAGE } from '../../localization/language';
import { articleAlternates } from '../../shared/hreflang';
import { articleHref } from '../../shared/slug';
import type { ArticleMetaDto, ArticleTranslationDto } from '../../shared/types/ApiTypes';
import { PageMeta } from '../PageMeta';

type ArticleMetaProps = {
  meta: ArticleMetaDto;
  slug: string;
  /** The article's language (D6, #21); omitted: the default one. */
  locale?: string | null;
  /** Its other language versions the reader may see (I-06, #110): the hreflang links (O-08, #104). */
  translations?: readonly ArticleTranslationDto[] | null;
  /**
   * The article is another language's original shown at a URL in the reader's language (I-08, #112):
   * its canonical is the original's URL and the page is noindex, so the text is indexed once.
   */
  shownOriginal?: boolean;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

/**
 * An article's document metadata (M-10 SEO fields, O-04 site tags): the effective title and
 * description, the canonical article URL, the social image (the site's default when the article has
 * none), robots noindex, the publication dates and the hreflang links to its translations (O-08).
 */
export const ArticleMeta = ({ meta, slug, locale, translations, shownOriginal = false, publishedAt, updatedAt }: ArticleMetaProps) => {
  const siteUrl = useSiteUrl();
  const alternates = articleAlternates(
    { locale: locale ?? DEFAULT_LANGUAGE, slug, noIndex: meta.noIndex, translations: translations ?? [] },
    siteUrl,
  );

  return (
    <PageMeta
      title={meta.title}
      description={meta.description || undefined}
      path={articleHref(slug)}
      pathLanguage={shownOriginal ? (locale ?? DEFAULT_LANGUAGE) : undefined}
      image={meta.socialImageUrl || undefined}
      type="article"
      noIndex={meta.noIndex || shownOriginal}
      publishedTime={publishedAt}
      modifiedTime={updatedAt}
      alternates={alternates}
    />
  );
};
