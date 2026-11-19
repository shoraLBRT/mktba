// Node's `process`; the app's TypeScript config has browser types only.
declare const process: { env: Record<string, string | undefined> };

/**
 * The public address canonical links and Open Graph URLs are built on: `PUBLIC_SITE_URL` at runtime
 * (the address readers use, e.g. `https://mktba.ru`, when the server sits behind a proxy), else the
 * origin of the request itself (local development).
 */
export const resolveSiteUrl = (request: Request): string =>
  process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || new URL(request.url).origin;
