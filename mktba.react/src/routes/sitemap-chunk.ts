import type { LoaderFunctionArgs } from 'react-router';
import { serverApi } from '../server/api.server';
import { resolveSiteUrl } from '../server/siteUrl.server';
import { parseSitemapChunkName, sitemapChunkXml, sitemapEntries } from '../shared/sitemap';
import { xmlResponse } from '../server/crawlerResponse.server';

/** `/sitemaps/articles-{n}.xml` (O-06, #57): one file of a sitemap too long for one; 404 otherwise. */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const page = parseSitemapChunkName(params.file ?? '');
  if (page === null) return new Response(null, { status: 404 });

  const siteUrl = resolveSiteUrl(request);
  const xml = sitemapChunkXml(sitemapEntries(await serverApi.getSitemapArticles(), siteUrl), page);
  return xml === null ? new Response(null, { status: 404 }) : xmlResponse(xml);
}
