import { useSiteUrl } from '../app/siteUrl';
import { useLocale } from '../localization/hooks';
import {
  articleNode,
  breadcrumbListNode,
  organizationNode,
  serializeJsonLd,
  structuredDataGraph,
  webSiteNode,
  type ArticleFacts,
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

/** An article page's structured data: `Organization`, `WebSite`, `Article` and its `BreadcrumbList`. */
export const ArticleStructuredData = ({ article, breadcrumbs }: ArticleStructuredDataProps) => {
  const site = useSiteFacts();
  return (
    <StructuredData
      graph={structuredDataGraph([
        organizationNode(site),
        webSiteNode(site),
        articleNode(site, article),
        breadcrumbListNode(site.siteUrl, article.path, breadcrumbs),
      ])}
    />
  );
};
