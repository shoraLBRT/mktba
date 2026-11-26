import { useSiteUrl } from '../app/siteUrl';
import { useLocale } from '../localization/hooks';
import {
  articleNode,
  breadcrumbListNode,
  organizationNode,
  personNode,
  profilePageNode,
  serializeJsonLd,
  structuredDataGraph,
  webPageNode,
  webSiteNode,
  type ArticleFacts,
  type AuthorFacts,
  type BreadcrumbStep,
  type SiteFacts,
  type StructuredDataGraph,
} from '../shared/structuredData';

const JSON_LD_TYPE = 'application/ld+json';

/** A JSON-LD graph as an inline script; it is part of the server HTML and is not executed. */
export const StructuredData = ({ graph }: { graph: StructuredDataGraph }) => (
  <script type={JSON_LD_TYPE} dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }} />
);

const useSiteFacts = (): SiteFacts => {
  const { brand } = useLocale();
  return { siteUrl: useSiteUrl(), name: brand.name, description: brand.description };
};

/** The home page's structured data: the site's `Organization` and `WebSite`. */
export const SiteStructuredData = () => {
  const site = useSiteFacts();
  return <StructuredData graph={structuredDataGraph([organizationNode(site), webSiteNode(site)])} />;
};

type ArticleStructuredDataProps = {
  article: ArticleFacts;
  /** The page's breadcrumb trail, the article itself last. */
  breadcrumbs: BreadcrumbStep[];
};

/**
 * An article page's structured data: `Organization`, `WebSite`, `Article`, its `BreadcrumbList`, a
 * `Person` for each author and each reviewer with a public page, and, while scholars confirmed it, the
 * `WebPage` with `reviewedBy` (V-08, #124).
 */
export const ArticleStructuredData = ({ article, breadcrumbs }: ArticleStructuredDataProps) => {
  const site = useSiteFacts();
  return (
    <StructuredData
      graph={structuredDataGraph([
        organizationNode(site),
        webSiteNode(site),
        articleNode(site, article),
        webPageNode(site, article),
        breadcrumbListNode(site.siteUrl, article.path, breadcrumbs),
        ...(article.authors ?? []).map((author) => personNode(site, author)),
        ...(article.reviewers ?? [])
          .filter((reviewer) => reviewer.path && !article.authors?.some((author) => author.path === reviewer.path))
          .map((reviewer) => personNode(site, { name: reviewer.name, path: reviewer.path! })),
      ])}
    />
  );
};

/** An author page's structured data: `Organization`, `WebSite`, the `ProfilePage` and its `Person`. */
export const AuthorStructuredData = ({ author }: { author: AuthorFacts }) => {
  const site = useSiteFacts();
  return (
    <StructuredData
      graph={structuredDataGraph([
        organizationNode(site),
        webSiteNode(site),
        profilePageNode(site, author),
        personNode(site, author),
      ])}
    />
  );
};
