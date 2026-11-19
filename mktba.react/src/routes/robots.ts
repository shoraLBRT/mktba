import type { LoaderFunctionArgs } from 'react-router';
import { resolveSiteUrl } from '../server/siteUrl.server';
import { robotsTxt } from '../shared/sitemap';
import { textResponse } from '../server/crawlerResponse.server';

/** `/robots.txt` (O-06, #57): built per request, since it names the absolute sitemap URL. */
export const loader = ({ request }: LoaderFunctionArgs) => textResponse(robotsTxt(resolveSiteUrl(request)));
