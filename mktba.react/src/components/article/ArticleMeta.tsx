import { articleHref } from '../../shared/slug';
import { toAbsoluteUrl } from '../../shared/seo';
import type { ArticleMetaDto } from '../../shared/types/ApiTypes';

type ArticleMetaProps = {
  meta: ArticleMetaDto;
  slug: string;
  /** Origin the canonical link and a site-relative og:image are resolved against. */
  origin?: string;
};

/**
 * The article's document metadata: title, description, Open Graph, robots and canonical.
 * React 19 hoists these elements into `<head>`. A client-side stopgap: crawlers that do not run
 * JavaScript see them only once the public pages are rendered on the server (O-01, #52).
 */
export const ArticleMeta = ({ meta, slug, origin = window.location.origin }: ArticleMetaProps) => {
  const canonical = toAbsoluteUrl(articleHref(slug), origin);
  const image = meta.socialImageUrl ? toAbsoluteUrl(meta.socialImageUrl, origin) : null;

  return (
    <>
      <title>{meta.title}</title>
      {meta.description ? <meta name="description" content={meta.description} /> : null}
      <link rel="canonical" href={canonical} />
      {meta.noIndex ? <meta name="robots" content="noindex" /> : null}
      <meta property="og:type" content="article" />
      <meta property="og:title" content={meta.title} />
      {meta.description ? <meta property="og:description" content={meta.description} /> : null}
      <meta property="og:url" content={canonical} />
      {image ? <meta property="og:image" content={image} /> : null}
    </>
  );
};
