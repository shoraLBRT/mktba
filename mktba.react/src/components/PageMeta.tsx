import { useSiteUrl } from '../app/siteUrl';
import { useLocale } from '../localization/hooks';
import {
  DEFAULT_SOCIAL_IMAGE_PATH,
  documentTitle,
  OG_LOCALE,
  ROBOTS_NOINDEX,
  ROBOTS_NOINDEX_NOFOLLOW,
  siteUrlFor,
} from '../shared/siteMeta';

export type PageMetaProps = {
  /** The page's own title; the document title becomes "{title} — {site}". Omitted: the site's title. */
  title?: string;
  /** Omitted: the site's description; `null`: no description tags. */
  description?: string | null;
  /** Site path of the canonical URL (and og:url); omitted for a page that has none (404, admin). */
  path?: string;
  /** Social image, absolute or site-relative. Omitted: the site's default image; `null`: none. */
  image?: string | null;
  type?: 'website' | 'article';
  /** Keep the page out of search results. */
  noIndex?: boolean;
  /** With `noIndex`: do not follow its links either (admin, sign-in). */
  noFollow?: boolean;
  /** ISO dates of an article (`article:published_time` / `article:modified_time`). */
  publishedTime?: string | null;
  modifiedTime?: string | null;
};

/**
 * Every page's document metadata: title, description, canonical, robots, Open Graph and Twitter Card.
 * React 19 hoists these elements into `<head>` (also in the server HTML) and removes them when the
 * page unmounts, so exactly one `PageMeta` must be mounted at a time — the root renders a generic one
 * unless the matched route declares `handle.ownsMeta`.
 */
export const PageMeta = ({
  title,
  description,
  path,
  image,
  type = 'website',
  noIndex = false,
  noFollow = false,
  publishedTime,
  modifiedTime,
}: PageMetaProps) => {
  const { brand } = useLocale();
  const siteUrl = useSiteUrl();
  const shownTitle = title ?? brand.documentTitle;
  const shownDescription = description === undefined ? brand.description : description;
  const canonical = path === undefined ? null : siteUrlFor(path, siteUrl);
  const imagePath = image === undefined ? DEFAULT_SOCIAL_IMAGE_PATH : image;
  const imageUrl = imagePath ? siteUrlFor(imagePath, siteUrl) : null;
  const robots = noIndex ? (noFollow ? ROBOTS_NOINDEX_NOFOLLOW : ROBOTS_NOINDEX) : null;

  return (
    <>
      <title>{documentTitle(title, brand.name, brand.documentTitle)}</title>
      {shownDescription ? <meta name="description" content={shownDescription} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {robots ? <meta name="robots" content={robots} /> : null}
      <meta property="og:site_name" content={brand.name} />
      <meta property="og:locale" content={OG_LOCALE} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={shownTitle} />
      {shownDescription ? <meta property="og:description" content={shownDescription} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      {imageUrl ? <meta property="og:image" content={imageUrl} /> : null}
      {publishedTime ? <meta property="article:published_time" content={publishedTime} /> : null}
      {modifiedTime ? <meta property="article:modified_time" content={modifiedTime} /> : null}
      <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={shownTitle} />
      {shownDescription ? <meta name="twitter:description" content={shownDescription} /> : null}
      {imageUrl ? <meta name="twitter:image" content={imageUrl} /> : null}
    </>
  );
};

/** The 404 (or, with `status` 410, the removed article) page's metadata: its own title, not indexed, no canonical. */
export const NotFoundMeta = ({ status = 404 }: { status?: 404 | 410 }) => {
  const locale = useLocale();
  const texts = status === 410 ? locale.goneArticlePage : locale.notFoundPage;
  return <PageMeta title={texts.title} description={texts.message} noIndex />;
};
