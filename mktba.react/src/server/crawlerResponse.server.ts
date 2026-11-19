/** How long crawlers and proxies may reuse a sitemap or robots.txt, in seconds. */
export const CRAWLER_FILE_MAX_AGE = 3600;

const cacheControl = `public, max-age=${CRAWLER_FILE_MAX_AGE}`;

/** A sitemap file as the server sends it. */
export const xmlResponse = (xml: string): Response =>
  new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': cacheControl } });

/** robots.txt as the server sends it. */
export const textResponse = (text: string): Response =>
  new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cacheControl } });
