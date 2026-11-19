import { articleHref } from '../../shared/slug';
import type { ArticleMetaDto } from '../../shared/types/ApiTypes';
import { PageMeta } from '../PageMeta';

type ArticleMetaProps = {
  meta: ArticleMetaDto;
  slug: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

/**
 * An article's document metadata (M-10 SEO fields, O-04 site tags): the effective title and
 * description, the canonical article URL, the social image (the site's default when the article has
 * none), robots noindex and the publication dates.
 */
export const ArticleMeta = ({ meta, slug, publishedAt, updatedAt }: ArticleMetaProps) => (
  <PageMeta
    title={meta.title}
    description={meta.description || undefined}
    path={articleHref(slug)}
    image={meta.socialImageUrl || undefined}
    type="article"
    noIndex={meta.noIndex}
    publishedTime={publishedAt}
    modifiedTime={updatedAt}
  />
);
