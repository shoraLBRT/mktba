/**
 * Schema.org structured data (O-05, #56): typed builders for the JSON-LD `@graph` a public page
 * carries, and its safe serialization into a `<script type="application/ld+json">`.
 *
 * Authorship: the article DTO carries no author yet, so an article's author and publisher are the
 * site's `Organization`. An author page (P-01, #89) describes its `Person` (`personId` is the node
 * an article's `author` will point at, P-06 #94).
 * `WebSite` names the site search (`SearchAction`, R-10 #46): the results page takes the query in its URL.
 */
import { SEARCH_PATH, SEARCH_QUERY_PARAM } from './search';
import { DEFAULT_SOCIAL_IMAGE_PATH, siteUrlFor } from './siteMeta';
import { LOGO_ICON_PATH } from './siteIcons';

/** Language of every page (`inLanguage`): the UI is Russian only. */
export const SITE_LANGUAGE = 'ru';

type NodeRef = { '@id': string };

type ImageObject = { '@type': 'ImageObject'; url: string };

export type OrganizationNode = NodeRef & {
  '@type': 'Organization';
  name: string;
  url: string;
  logo: ImageObject;
};

/** How a search engine can send a query to the site's own search. */
type SearchAction = {
  '@type': 'SearchAction';
  target: { '@type': 'EntryPoint'; urlTemplate: string };
  'query-input': string;
};

export type WebSiteNode = NodeRef & {
  '@type': 'WebSite';
  name: string;
  description?: string;
  url: string;
  inLanguage: string;
  publisher: NodeRef;
  potentialAction: SearchAction;
};

export type ArticleNode = NodeRef & {
  '@type': 'Article';
  headline: string;
  description?: string;
  url: string;
  mainEntityOfPage: string;
  image: string[];
  inLanguage: string;
  datePublished?: string;
  dateModified?: string;
  author: NodeRef;
  publisher: NodeRef;
  isPartOf: NodeRef;
};

type ListItem = { '@type': 'ListItem'; position: number; name: string; item: string };

export type BreadcrumbListNode = NodeRef & {
  '@type': 'BreadcrumbList';
  itemListElement: ListItem[];
};

export type PersonNode = NodeRef & {
  '@type': 'Person';
  name: string;
  url: string;
  description?: string;
  image?: string;
  sameAs?: string[];
};

export type ProfilePageNode = NodeRef & {
  '@type': 'ProfilePage';
  name: string;
  url: string;
  inLanguage: string;
  isPartOf: NodeRef;
  mainEntity: NodeRef;
};

export type StructuredDataNode =
  | OrganizationNode
  | WebSiteNode
  | ArticleNode
  | BreadcrumbListNode
  | PersonNode
  | ProfilePageNode;

export type StructuredDataGraph = {
  '@context': 'https://schema.org';
  '@graph': StructuredDataNode[];
};

/** The site's own facts every graph is built on. */
export type SiteFacts = {
  siteUrl: string;
  name: string;
  description?: string;
};

/** The placeholder a search engine replaces with the query in `SearchAction`'s URL template. */
const SEARCH_TERM = 'search_term_string';

const siteRoot = (siteUrl: string) => siteUrlFor('/', siteUrl);
const organizationId = (siteUrl: string) => `${siteRoot(siteUrl)}#organization`;
const webSiteId = (siteUrl: string) => `${siteRoot(siteUrl)}#website`;

export const organizationNode = ({ siteUrl, name }: SiteFacts): OrganizationNode => ({
  '@id': organizationId(siteUrl),
  '@type': 'Organization',
  name,
  url: siteRoot(siteUrl),
  logo: { '@type': 'ImageObject', url: siteUrlFor(LOGO_ICON_PATH, siteUrl) },
});

export const webSiteNode = ({ siteUrl, name, description }: SiteFacts): WebSiteNode => ({
  '@id': webSiteId(siteUrl),
  '@type': 'WebSite',
  name,
  ...(description ? { description } : {}),
  url: siteRoot(siteUrl),
  inLanguage: SITE_LANGUAGE,
  publisher: { '@id': organizationId(siteUrl) },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${siteUrlFor(SEARCH_PATH, siteUrl)}?${SEARCH_QUERY_PARAM}={${SEARCH_TERM}}`,
    },
    'query-input': `required name=${SEARCH_TERM}`,
  },
});

export type ArticleFacts = {
  /** Site path of the article's canonical URL. */
  path: string;
  headline: string;
  description?: string | null;
  /** Absolute or site-relative; omitted: the site's default image. */
  image?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

export const articleNode = (site: SiteFacts, article: ArticleFacts): ArticleNode => {
  const url = siteUrlFor(article.path, site.siteUrl);
  return {
    '@id': `${url}#article`,
    '@type': 'Article',
    headline: article.headline,
    ...(article.description ? { description: article.description } : {}),
    url,
    mainEntityOfPage: url,
    image: [siteUrlFor(article.image || DEFAULT_SOCIAL_IMAGE_PATH, site.siteUrl)],
    inLanguage: SITE_LANGUAGE,
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    author: { '@id': organizationId(site.siteUrl) },
    publisher: { '@id': organizationId(site.siteUrl) },
    isPartOf: { '@id': webSiteId(site.siteUrl) },
  };
};

export type AuthorFacts = {
  /** Site path of the author page. */
  path: string;
  name: string;
  /** The author's own text about themselves. */
  description?: string | null;
  /** Avatar, absolute or site-relative. */
  image?: string | null;
  /** The author's own pages elsewhere (absolute URLs). */
  links?: string[];
};

/** `@id` of the `Person` an author page describes; the same on every page that names the author. */
export const personId = (siteUrl: string, authorPath: string): string => `${siteUrlFor(authorPath, siteUrl)}#person`;

/**
 * The author as a `Person`: the name and what the author published about themselves. The degree
 * and the institution are left out: they are self-declared until verification exists (V-01 #117).
 */
export const personNode = (site: SiteFacts, author: AuthorFacts): PersonNode => ({
  '@id': personId(site.siteUrl, author.path),
  '@type': 'Person',
  name: author.name,
  url: siteUrlFor(author.path, site.siteUrl),
  ...(author.description ? { description: author.description } : {}),
  ...(author.image ? { image: siteUrlFor(author.image, site.siteUrl) } : {}),
  ...(author.links && author.links.length > 0 ? { sameAs: author.links } : {}),
});

/** The author page itself: a `ProfilePage` whose main entity is the `Person`. */
export const profilePageNode = (site: SiteFacts, author: AuthorFacts): ProfilePageNode => {
  const url = siteUrlFor(author.path, site.siteUrl);
  return {
    '@id': `${url}#profilepage`,
    '@type': 'ProfilePage',
    name: author.name,
    url,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { '@id': webSiteId(site.siteUrl) },
    mainEntity: { '@id': personId(site.siteUrl, author.path) },
  };
};

/** One step of a breadcrumb trail: a title and the site path it links to. */
export type BreadcrumbStep = { name: string; path: string };

/** The trail as a `BreadcrumbList`; `null` for an empty trail. */
export const breadcrumbListNode = (
  siteUrl: string,
  pagePath: string,
  steps: BreadcrumbStep[],
): BreadcrumbListNode | null =>
  steps.length === 0
    ? null
    : {
      '@id': `${siteUrlFor(pagePath, siteUrl)}#breadcrumb`,
      '@type': 'BreadcrumbList',
      itemListElement: steps.map((step, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: step.name,
        item: siteUrlFor(step.path, siteUrl),
      })),
    };

export const structuredDataGraph = (nodes: (StructuredDataNode | null)[]): StructuredDataGraph => ({
  '@context': 'https://schema.org',
  '@graph': nodes.filter((node): node is StructuredDataNode => node !== null),
});

/**
 * JSON for an inline `<script>`: `<`, `>` and `&` are escaped as `<`, `>`, `&`, so a
 * title containing `</script>` or `<!--` cannot end the script; U+2028/U+2029 are escaped for old
 * parsers. The result is still the same JSON value.
 */
export const serializeJsonLd = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
