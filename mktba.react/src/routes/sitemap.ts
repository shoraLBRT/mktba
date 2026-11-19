import type { LoaderFunctionArgs } from 'react-router';
import { serverApi } from '../server/api.server';
import { resolveSiteUrl } from '../server/siteUrl.server';
import { sitemapEntries, sitemapXml } from '../shared/sitemap';
import { xmlResponse } from '../server/crawlerResponse.server';

/** `/sitemap.xml` (O-06, #57): every public, indexable URL, or an index of the split files. */
export async function loader({ request }: LoaderFunctionArgs) {
  const siteUrl = resolveSiteUrl(request);
  const entries = sitemapEntries(await serverApi.getSitemapArticles(), siteUrl);
  return xmlResponse(sitemapXml(entries, siteUrl));
}
