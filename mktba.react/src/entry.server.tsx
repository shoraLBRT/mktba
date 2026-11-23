// The server entry (X-06, #160): React Router's default rendering, on web streams (no Node types in the
// app's tsconfig), plus the site's security headers.
import type { EntryContext, HandleErrorFunction } from 'react-router';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { applySecurityHeaders } from './server/securityHeaders.server';
import { logServerError } from './server/serverErrors.server';
import { loadLanguage } from './localization';
import { DEFAULT_LANGUAGE, languageFromRequest } from './localization/language';

export const streamTimeout = 5_000;

/** Loader, action and render errors as JSON lines in the container's log (X-05, #159). */
export const handleError: HandleErrorFunction = (error, { request }) => logServerError(error, request);

/** `.data` requests (client-side navigations) get the same headers as pages. Resource routes do not pass here. */
export function handleDataRequest(response: Response): Response {
  applySecurityHeaders(response.headers);
  return response;
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  applySecurityHeaders(responseHeaders);

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  // The page's dictionary (every language's is a lazy chunk, I-05 #109, I-02 #106), and the default
  // one, which `readerLocale()` reads on the server; loaded once per process, then this resolves at once.
  await Promise.all([loadLanguage(languageFromRequest(request)), loadLanguage(DEFAULT_LANGUAGE)]);

  let shellRendered = false;
  // Abort after streamTimeout, leaving time to flush the rejected boundaries.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), streamTimeout + 1000);

  const body = await renderToReadableStream(<ServerRouter context={routerContext} url={request.url} />, {
    signal: controller.signal,
    onError(error: unknown) {
      responseStatusCode = 500;
      // Errors in the shell reject and are logged by React Router; log only the streamed ones.
      if (shellRendered) {
        console.error(error);
      }
    },
  }).catch((error: unknown) => {
    clearTimeout(timeoutId);
    throw error;
  });
  shellRendered = true;
  const clear = () => clearTimeout(timeoutId);
  body.allReady.then(clear, clear);

  // Crawlers and SPA mode wait for all content before the response starts.
  const userAgent = request.headers.get('user-agent');
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady.catch(() => undefined);
  }

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}
