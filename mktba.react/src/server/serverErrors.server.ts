/**
 * Errors of the web server (X-05, #159): a loader, an action or the render failed. One JSON line on
 * stderr per error — the container's log, like the API's JSON console — with the request's method
 * and path only: no query string, no headers, no address (D9). A request the visitor aborted is
 * not an error.
 */
export const serverErrorLine = (error: unknown, request: Request, now: Date = new Date()): string | null => {
  if (request.signal.aborted) return null;

  const err = error instanceof Error ? error : null;
  return JSON.stringify({
    Timestamp: now.toISOString(),
    LogLevel: 'Error',
    Category: 'Mktba.Web.Ssr',
    Message: err ? `${err.name}: ${err.message}` : String(error),
    Method: request.method,
    Path: new URL(request.url).pathname,
    Stack: err?.stack,
  });
};

export const logServerError = (error: unknown, request: Request): void => {
  const line = serverErrorLine(error, request);
  if (line) console.error(line);
};
